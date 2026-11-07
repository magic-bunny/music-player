use crate::model::{parse_lrc, Lyric, Origin, Track};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    io::Read,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    time::Duration,
};

const BASE: &str = "https://music.163.com";
pub const AUDIO_LIMIT: u64 = 32 * 1024 * 1024;
pub type Result<T> = std::result::Result<T, String>;

#[derive(Clone)]
pub struct Api {
    agent: ureq::Agent,
}

pub struct Loaded {
    pub bytes: Arc<[u8]>,
    pub lyrics: Vec<Lyric>,
}

#[derive(Deserialize)]
struct Artist {
    name: String,
}
#[derive(Deserialize)]
struct Album {
    name: String,
}
#[derive(Deserialize)]
struct Song {
    id: u64,
    name: String,
    artists: Vec<Artist>,
    album: Album,
    #[serde(default)]
    duration: f64,
}

#[derive(Clone, Serialize)]
pub struct Collection {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub track_count: u64,
    pub followers: u64,
    #[serde(skip_serializing)]
    pub cover_url: Option<String>,
}

impl Api {
    pub fn new() -> Self {
        let config = ureq::Agent::config_builder()
            .timeout_global(Some(Duration::from_secs(35)))
            .timeout_connect(Some(Duration::from_secs(8)))
            .user_agent("RustMusicDemo/0.1")
            .build();
        Self {
            agent: config.into(),
        }
    }

    fn post(&self, path: &str, fields: &[(&str, &str)]) -> Result<Value> {
        let mut response = self
            .agent
            .post(&format!("{BASE}{path}"))
            .config()
            .timeout_global(Some(Duration::from_secs(10)))
            .build()
            .header("Referer", "https://music.163.com/")
            .send_form(fields.iter().copied())
            .map_err(|e| format!("Network request failed: {e}"))?;
        let value: Value = response
            .body_mut()
            .read_json()
            .map_err(|e| format!("Invalid API response: {e}"))?;
        if value["code"].as_i64() != Some(200) {
            return Err(format!(
                "NetEase is unavailable (code {}). Try again later.",
                value["code"]
            ));
        }
        Ok(value)
    }

    pub fn search(&self, query: &str) -> Result<Vec<Track>> {
        let data = self.post(
            "/api/search/get/web",
            &[
                ("s", query),
                ("type", "1"),
                ("limit", "40"),
                ("offset", "0"),
            ],
        )?;
        self.available_tracks(parse_search(data)?)
    }

    fn available_tracks(&self, tracks: Vec<Track>) -> Result<Vec<Track>> {
        if tracks.is_empty() {
            return Ok(tracks);
        }
        let mut result = Vec::new();
        for batch in tracks.chunks(80) {
            let ids: Vec<u64> = batch
                .iter()
                .filter_map(|t| match t.origin {
                    Origin::Netease(id) => Some(id),
                    _ => None,
                })
                .collect();
            let ids = serde_json::to_string(&ids).map_err(|e| e.to_string())?;
            let availability = self.post(
                "/api/song/enhance/player/url",
                &[("ids", &ids), ("br", "128000")],
            )?;
            result.extend(filter_playable(batch.to_vec(), &availability)?);
        }
        Ok(result)
    }

    pub fn collections(&self, query: &str, offset: u32) -> Result<Vec<Collection>> {
        let query = if query.trim().is_empty() {
            "欧美流行"
        } else {
            query.trim()
        };
        let limit = if offset == 0 { "10" } else { "30" };
        let data = self.post(
            "/api/search/get/web",
            &[
                ("s", query),
                ("type", "1000"),
                ("limit", limit),
                ("offset", &offset.to_string()),
            ],
        )?;
        if data["result"]["playlistCount"].as_u64() == Some(0) {
            return Ok(Vec::new());
        }
        data["result"]["playlists"]
            .as_array()
            .ok_or("Playlist response is invalid")?
            .iter()
            .map(parse_collection)
            .collect()
    }

    pub fn collection_tracks(&self, id: &str) -> Result<(Vec<Track>, bool)> {
        let id = id
            .strip_prefix("playlist:")
            .and_then(|s| s.parse::<u64>().ok())
            .ok_or("Unknown playlist")?;
        let detail = self.post(
            "/api/v6/playlist/detail",
            &[("id", &id.to_string()), ("n", "100000"), ("s", "0")],
        )?;
        let ids = playlist_track_ids(&detail)?;
        if ids.len() > 5000 {
            return Err("This playlist exceeds the 5,000-track limit.".into());
        }
        let mut tracks = Vec::new();
        for batch in ids.chunks(80) {
            let details = self.artwork_info(batch)?;
            let songs = details["songs"]
                .as_array()
                .ok_or("Track details are unavailable")?;
            let parsed = parse_search(
                serde_json::json!({"result":{"songs":songs,"songCount":songs.len()}}),
            )?;
            let mut by_id: std::collections::HashMap<u64, Track> = parsed
                .into_iter()
                .filter_map(|track| match track.origin {
                    Origin::Netease(id) => Some((id, track)),
                    _ => None,
                })
                .collect();
            tracks.extend(batch.iter().filter_map(|id| by_id.remove(id)));
        }
        self.available_tracks(tracks).map(|tracks| (tracks, false))
    }

    fn get_json(&self, path: &str, query: &[(&str, &str)]) -> Result<Value> {
        let mut response = self
            .agent
            .get(&format!("{BASE}{path}"))
            .query_pairs(query.iter().copied())
            .config()
            .timeout_global(Some(Duration::from_secs(8)))
            .build()
            .header("Referer", "https://music.163.com/")
            .call()
            .map_err(|e| e.to_string())?;
        let value: Value = response.body_mut().read_json().map_err(|e| e.to_string())?;
        if value["code"].as_i64() != Some(200) {
            return Err(format!(
                "NetEase request unavailable (code {}). The endpoint may require login.",
                value["code"]
            ));
        }
        Ok(value)
    }
    pub fn artwork_info(&self, ids: &[u64]) -> Result<Value> {
        self.get_json(
            "/api/song/detail/",
            &[(
                "ids",
                &serde_json::to_string(ids).map_err(|e| e.to_string())?,
            )],
        )
    }
    pub fn artist_portrait(&self, id: u64) -> Result<String> {
        let value = self.get_json(&format!("/api/artist/{id}"), &[])?;
        value["artist"]["img1v1Url"]
            .as_str()
            .map(str::to_string)
            .ok_or_else(|| "Artist portrait unavailable".into())
    }
    pub fn artwork_bytes(&self, url: &str) -> Result<Vec<u8>> {
        let url = url.replacen("http://", "https://", 1);
        let response = self
            .agent
            .get(&url)
            .query("param", "280y280")
            .config()
            .timeout_global(Some(Duration::from_secs(8)))
            .build()
            .call()
            .map_err(|e| e.to_string())?;
        read_bounded(response.into_body().into_reader(), 2 * 1024 * 1024, || true)
    }

    fn lyrics(&self, id: u64) -> Vec<Lyric> {
        self.post(
            "/api/song/lyric",
            &[
                ("id", &id.to_string()),
                ("lv", "1"),
                ("kv", "-1"),
                ("tv", "-1"),
            ],
        )
        .ok()
        .and_then(|v| v["lrc"]["lyric"].as_str().map(parse_lrc))
        .unwrap_or_default()
    }

    pub fn load(&self, track: &Track, generation: &AtomicU64, request: u64) -> Result<Loaded> {
        let current = || generation.load(Ordering::Relaxed) == request;
        if !current() {
            return Err("Cancelled".into());
        }
        match &track.origin {
            Origin::Audius { .. } => Err("Use the Audius music provider".into()),
            Origin::Radio { .. } => Err("Radio requires streaming playback".into()),
            Origin::Local(path) => {
                let file =
                    std::fs::File::open(path).map_err(|e| format!("Unable to read file: {e}"))?;
                let bytes = read_bounded(file, AUDIO_LIMIT, current)?;
                let lyrics = std::fs::File::open(path.with_extension("lrc"))
                    .ok()
                    .and_then(|f| read_bounded(f, 1024 * 1024, current).ok())
                    .and_then(|b| String::from_utf8(b).ok())
                    .map(|text| parse_lrc(&text))
                    .unwrap_or_default();
                Ok(Loaded {
                    bytes: bytes.into(),
                    lyrics,
                })
            }
            Origin::Netease(id) => {
                let data = self.post(
                    "/api/song/enhance/player/url",
                    &[("ids", &format!("[{id}]")), ("br", "128000")],
                )?;
                let url = parse_playback(&data)?;
                if !current() {
                    return Err("Cancelled".into());
                }
                let response = self
                    .agent
                    .get(&url)
                    .call()
                    .map_err(|e| format!("Unable to fetch audio: {e}"))?;
                let bytes = read_bounded(response.into_body().into_reader(), AUDIO_LIMIT, current)?;
                if !current() {
                    return Err("Cancelled".into());
                }
                let lyrics = self.lyrics(*id);
                Ok(Loaded {
                    bytes: bytes.into(),
                    lyrics,
                })
            }
        }
    }
}

fn playlist_track_ids(data: &Value) -> Result<Vec<u64>> {
    let ids = data["playlist"]["trackIds"]
        .as_array()
        .ok_or("Full playlist track IDs are unavailable")?;
    let mut seen = std::collections::HashSet::new();
    ids.iter()
        .map(|v| {
            v["id"]
                .as_u64()
                .ok_or_else(|| "Invalid playlist track ID".to_string())
        })
        .collect::<Result<Vec<_>>>()
        .map(|ids| ids.into_iter().filter(|id| seen.insert(*id)).collect())
}
fn parse_collection(value: &Value) -> Result<Collection> {
    Ok(Collection {
        id: format!(
            "playlist:{}",
            value["id"].as_u64().ok_or("Playlist ID is missing")?
        ),
        title: value["name"]
            .as_str()
            .ok_or("Playlist title is missing")?
            .into(),
        artist: value["creator"]["nickname"]
            .as_str()
            .unwrap_or("NetEase playlist")
            .into(),
        track_count: value["trackCount"].as_u64().unwrap_or(0),
        followers: value["subscribedCount"].as_u64().unwrap_or(0),
        cover_url: value["coverImgUrl"].as_str().map(str::to_string),
    })
}

fn parse_search(value: Value) -> Result<Vec<Track>> {
    let Some(songs) = value["result"].get("songs") else {
        return if value["result"]["songCount"].as_u64() == Some(0) {
            Ok(Vec::new())
        } else {
            Err("Search returned no track list. Try again.".into())
        };
    };
    if songs.is_null() && value["result"]["songCount"].as_u64() == Some(0) {
        return Ok(Vec::new());
    }
    let songs: Vec<Song> = serde_json::from_value(songs.clone())
        .map_err(|_| "The search response format changed. Update the player.".to_string())?;
    Ok(songs
        .into_iter()
        .map(|s| Track {
            title: s.name,
            artist: s
                .artists
                .into_iter()
                .map(|a| a.name)
                .collect::<Vec<_>>()
                .join(" / "),
            album: s.album.name,
            seconds: s.duration / 1000.0,
            origin: Origin::Netease(s.id),
        })
        .collect())
}

fn anonymous_full_url(entry: &Value) -> Option<&str> {
    if entry["code"].as_i64() != Some(200)
        || matches!(entry["fee"].as_u64(), Some(1 | 4))
        || !entry["freeTrialInfo"].is_null()
        || entry["freeTimeTrialPrivilege"]["type"]
            .as_u64()
            .unwrap_or(0)
            != 0
    {
        return None;
    }
    entry["url"]
        .as_str()
        .filter(|url| url.starts_with("https://") || url.starts_with("http://"))
}

fn filter_playable(tracks: Vec<Track>, response: &Value) -> Result<Vec<Track>> {
    let entries = response["data"]
        .as_array()
        .ok_or("Unable to verify playback access. Try again.")?;
    let playable: std::collections::HashSet<u64> = entries
        .iter()
        .filter(|entry| anonymous_full_url(entry).is_some())
        .filter_map(|entry| entry["id"].as_u64())
        .collect();
    // Match by ID, preserving search order even if availability results are reordered.
    Ok(tracks
        .into_iter()
        .filter(|t| match t.origin {
            Origin::Netease(id) => playable.contains(&id),
            _ => false,
        })
        .collect())
}

fn parse_playback(data: &Value) -> Result<String> {
    let url = anonymous_full_url(&data["data"][0]).ok_or(
        "Full-length playback is no longer available. Search again or choose another track.",
    )?;
    // Recheck full-length access at playback time; never fall back to a preview.
    Ok(url.replacen("http://", "https://", 1))
}

pub(crate) fn read_bounded(
    mut reader: impl Read,
    limit: u64,
    current: impl Fn() -> bool,
) -> Result<Vec<u8>> {
    let mut bytes = Vec::new();
    let mut buffer = [0; 64 * 1024];
    loop {
        if !current() {
            return Err("Cancelled".into());
        }
        let n = reader
            .read(&mut buffer)
            .map_err(|e| format!("Unable to read audio: {e}"))?;
        if n == 0 {
            break;
        }
        if bytes.len() as u64 + n as u64 > limit {
            return Err(format!(
                "File exceeds the {} MiB buffer limit",
                limit / 1024 / 1024
            ));
        }
        bytes.extend_from_slice(&buffer[..n]);
    }
    if bytes.is_empty() {
        return Err("The returned file is empty".into());
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn playlist_ids_use_full_list_preserve_order_and_remove_duplicates() {
        let value = json!({"playlist":{"tracks":[{"id":1}],"trackIds":[{"id":3},{"id":1},{"id":3},{"id":2}]}});
        assert_eq!(playlist_track_ids(&value).unwrap(), vec![3, 1, 2]);
        assert!(playlist_track_ids(&json!({"playlist":{"tracks":[]}})).is_err());
        assert!(playlist_track_ids(&json!({"playlist":{"trackIds":[]}}))
            .unwrap()
            .is_empty());
    }
    #[test]
    fn playlist_metadata_comes_from_the_source() {
        let p=parse_collection(&json!({"id":42,"name":"Pop mix","creator":{"nickname":"Curator"},"trackCount":25,"subscribedCount":1234,"coverImgUrl":"https://example.com/cover.jpg"})).unwrap();
        assert_eq!(p.id, "playlist:42");
        assert_eq!(p.title, "Pop mix");
        assert_eq!(p.artist, "Curator");
        assert_eq!(p.track_count, 25);
        assert_eq!(p.followers, 1234);
        assert_eq!(
            p.cover_url.as_deref(),
            Some("https://example.com/cover.jpg")
        );
    }
    #[test]
    fn restricted_tracks_do_not_produce_playback_urls() {
        assert!(parse_playback(&json!({"data":[{"url":null,"code":-110}]})).is_err());
        assert!(parse_playback(&json!({"data":[]})).is_err());
        assert!(parse_playback(&json!({"data":[{"code":200,"url":"http://example.com/a.mp3","freeTrialInfo":{"start":0,"end":30}}]})).is_err());
        assert_eq!(parse_playback(&json!({"data":[{"code":200,"fee":8,"url":"http://example.com/a.mp3","freeTrialInfo":null}]})).unwrap(), "https://example.com/a.mp3");
    }

    #[test]
    fn anonymous_filter_matches_ids_and_rejects_paid_trial_and_missing_entries() {
        let tracks: Vec<Track> = (1..=7)
            .map(|id| {
                let mut track = Track::local(std::path::PathBuf::from("test.mp3"));
                track.origin = Origin::Netease(id);
                track
            })
            .collect();
        let response = json!({"data":[
            {"id":5,"code":200,"fee":8,"url":"https://example.com/5.mp3"},
            {"id":4,"code":200,"url":"https://example.com/4.mp3","freeTrialInfo":{"start":0,"end":30}},
            {"id":3,"code":200,"fee":1,"url":"https://example.com/3.mp3"},
            {"id":2,"code":-110,"url":null},
            {"id":1,"code":200,"fee":0,"url":"https://example.com/1.mp3"},
            {"id":6,"code":200,"url":"https://example.com/6.mp3","freeTimeTrialPrivilege":{"type":1}}
        ]});
        let filtered = filter_playable(tracks.clone(), &response).unwrap();
        assert_eq!(
            filtered
                .iter()
                .map(|t| t.origin.clone())
                .collect::<Vec<_>>(),
            vec![Origin::Netease(1), Origin::Netease(5)]
        );
        assert!(filter_playable(tracks.clone(), &json!({})).is_err());
        assert!(filter_playable(tracks, &json!({"data":[]}))
            .unwrap()
            .is_empty());
    }

    #[test]
    fn empty_search_is_not_a_protocol_error() {
        assert!(parse_search(json!({"result":{"songCount":0}}))
            .unwrap()
            .is_empty());
        assert!(parse_search(json!({"result":{}})).is_err());
    }

    #[test]
    fn buffers_enforce_limits_and_cancellation() {
        assert_eq!(read_bounded(&b"abc"[..], 3, || true).unwrap(), b"abc");
        assert!(read_bounded(&b"abcd"[..], 3, || true).is_err());
        assert!(read_bounded(&b"abc"[..], 3, || false).is_err());
        assert!(read_bounded(&b""[..], 3, || true).is_err());
    }
}
