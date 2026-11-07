use crate::{api::Collection, engine::Song, model::Track};
use std::{
    collections::{hash_map::DefaultHasher, HashMap},
    hash::{Hash, Hasher},
    path::{Path, PathBuf},
};

pub struct ScannedPlaylist {
    pub collection: Collection,
    pub tracks: Vec<Track>,
    pub cover_files: HashMap<String, PathBuf>,
}

pub fn scan(folder: &Path) -> Result<ScannedPlaylist, String> {
    if !folder.is_dir() {
        return Err("The selected playlist folder is unavailable.".into());
    }
    let folder = folder.canonicalize().map_err(|e| e.to_string())?;
    let title = folder
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .ok_or("The selected folder has no usable name.")?
        .to_string();
    let id = playlist_id(&folder);
    let mut audio = Vec::new();
    let mut images = HashMap::new();
    for entry in std::fs::read_dir(&folder).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        if !path.is_file() {
            continue;
        }
        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();
        if matches!(
            extension.as_str(),
            "mp3" | "m4a" | "aac" | "flac" | "wav" | "ogg"
        ) {
            audio.push(path);
        } else if matches!(extension.as_str(), "jpg" | "jpeg" | "png" | "webp") {
            if let Some(stem) = path.file_stem().and_then(|value| value.to_str()) {
                images.entry(stem.to_lowercase()).or_insert(path);
            }
        }
    }
    audio.sort_by_key(|path| {
        path.file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase()
    });
    if audio.is_empty() {
        return Err("The selected folder contains no supported audio files.".into());
    }

    let mut cover_files = HashMap::new();
    if let Some(path) = images.get(&title.to_lowercase()) {
        cover_files.insert(id.clone(), path.clone());
    }
    let tracks = audio
        .into_iter()
        .map(|path| {
            let stem = path
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or_default()
                .to_lowercase();
            let mut track = Track::local(path);
            track.artist = "Local library".into();
            track.album = title.clone();
            if let Some(path) = images.get(&stem) {
                cover_files.insert(Song::from(&track).id, path.clone());
            }
            track
        })
        .collect::<Vec<_>>();

    Ok(ScannedPlaylist {
        collection: Collection {
            id,
            title,
            artist: "Local folder".into(),
            track_count: tracks.len() as u64,
            followers: 0,
            cover_url: None,
        },
        tracks,
        cover_files,
    })
}

fn playlist_id(folder: &Path) -> String {
    let mut hasher = DefaultHasher::new();
    folder.hash(&mut hasher);
    format!("local-playlist:{:016x}", hasher.finish())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folder_and_song_images_are_matched_by_stem() {
        let root = std::env::temp_dir().join(format!(
            "yuyin-playlist-{}-{}",
            std::process::id(),
            rand::random::<u64>()
        ));
        let folder = root.join("Night Drive");
        std::fs::create_dir_all(&folder).unwrap();
        std::fs::write(folder.join("Night Drive.png"), b"cover").unwrap();
        std::fs::write(folder.join("First Song.jpg"), b"song-cover").unwrap();
        std::fs::write(folder.join("First Song.mp3"), b"").unwrap();
        std::fs::write(folder.join("Second Song.flac"), b"").unwrap();

        let scanned = scan(&folder).unwrap();
        assert_eq!(scanned.collection.title, "Night Drive");
        assert_eq!(scanned.collection.track_count, 2);
        assert!(scanned.cover_files.contains_key(&scanned.collection.id));
        assert!(scanned
            .cover_files
            .contains_key(&Song::from(&scanned.tracks[0]).id));

        std::fs::remove_dir_all(root).unwrap();
    }
}
