#[allow(dead_code)]
mod api;
mod engine;
mod local_playlists;
mod model;
mod player;
mod providers;
mod radio;
mod ui_check;
use api::Api;
use base64::Engine as _;
use engine::{Command, Engine, Snapshot, Song};
use model::Track;
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::Manager;
#[cfg(desktop)]
use tauri::{LogicalSize, PhysicalPosition, PhysicalSize};
#[cfg(desktop)]
use tauri_plugin_dialog::DialogExt;

const COVER_CACHE_LIMIT: usize = 256;

fn cache_cover(cache: &mut HashMap<String, String>, key: String, data: String) {
    if cache.len() >= COVER_CACHE_LIMIT && !cache.contains_key(&key) {
        let stale = cache
            .keys()
            .take(COVER_CACHE_LIMIT / 4)
            .cloned()
            .collect::<Vec<_>>();
        for id in stale {
            cache.remove(&id);
        }
    }
    cache.insert(key, data);
}

fn artwork_data_uri(bytes: Vec<u8>) -> String {
    let mime = if bytes.starts_with(b"\x89PNG") {
        "image/png"
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        "image/webp"
    } else if bytes.starts_with(b"GIF8") {
        "image/gif"
    } else {
        "image/jpeg"
    };
    format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    )
}

fn download_artwork(api: Api, urls: HashMap<String, String>) -> Vec<(String, String)> {
    let mut grouped = HashMap::<String, Vec<String>>::new();
    for (key, url) in urls {
        grouped.entry(url).or_default().push(key);
    }
    let workers = grouped.len().min(4);
    if workers == 0 {
        return Vec::new();
    }
    let mut buckets = vec![Vec::new(); workers];
    for (index, item) in grouped.into_iter().enumerate() {
        buckets[index % workers].push(item);
    }
    std::thread::scope(|scope| {
        let handles = buckets
            .into_iter()
            .map(|bucket| {
                let api = api.clone();
                scope.spawn(move || {
                    let mut result = Vec::new();
                    for (url, keys) in bucket {
                        let Ok(bytes) = api.artwork_bytes(&url) else {
                            continue;
                        };
                        let data = artwork_data_uri(bytes);
                        result.extend(keys.into_iter().map(|key| (key, data.clone())));
                    }
                    result
                })
            })
            .collect::<Vec<_>>();
        handles
            .into_iter()
            .flat_map(|handle| handle.join().unwrap_or_default())
            .collect()
    })
}

#[derive(Clone)]
struct Backend {
    api: Api,
    providers: Arc<providers::Providers>,
    collection_sources: Arc<Mutex<HashMap<String, String>>>,
    engine: Arc<Engine>,
    catalog: Arc<Mutex<HashMap<String, Track>>>,
    covers: Arc<Mutex<HashMap<String, String>>>,
    cover_files: Arc<Mutex<HashMap<String, PathBuf>>>,
    local_collections: Arc<Mutex<HashMap<String, Vec<Track>>>>,
}
impl Backend {
    fn new() -> Self {
        Self {
            api: Api::new(),
            providers: Arc::new(providers::Providers::new()),
            collection_sources: Arc::new(Mutex::new(HashMap::new())),
            engine: Arc::new(Engine::new()),
            catalog: Arc::new(Mutex::new(HashMap::new())),
            covers: Arc::new(Mutex::new(HashMap::new())),
            cover_files: Arc::new(Mutex::new(HashMap::new())),
            local_collections: Arc::new(Mutex::new(HashMap::new())),
        }
    }
    fn register(&self, tracks: Vec<Track>) -> Result<Vec<Song>, String> {
        let mut catalog = self.catalog.lock().map_err(|e| e.to_string())?;
        Ok(tracks
            .into_iter()
            .map(|track| {
                let song = Song::from(&track);
                catalog.insert(song.id.clone(), track);
                song
            })
            .collect())
    }
}
// Read old JSON once for the shared localStorage migration; never modify it.
#[tauri::command]
fn legacy_configuration(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let root = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let read = |name: &str| -> Result<Option<Vec<u8>>, String> {
        match std::fs::read(root.join(name)) {
            Ok(bytes) => Ok(Some(bytes)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    };
    let tracks: Vec<Track> = read("favorites.json")?
        .map(|bytes| serde_json::from_slice(&bytes))
        .transpose()
        .map_err(|e| e.to_string())?
        .unwrap_or_default();
    let folders: serde_json::Value = read("playlists.json")?
        .map(|bytes| serde_json::from_slice(&bytes))
        .transpose()
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| serde_json::json!({"folders":[]}));
    let playlists = folders["folders"]
        .as_array()
        .ok_or("Invalid legacy playlists")?
        .iter()
        .filter_map(|v| v.as_str())
        .map(|folder| serde_json::json!({"id":folder,"folder":folder}))
        .collect::<Vec<_>>();
    Ok(
        serde_json::json!({"favorites":tracks.iter().map(Song::from).collect::<Vec<_>>(),"playlists":playlists}),
    )
}

fn register_local_playlist(
    backend: &Backend,
    scanned: local_playlists::ScannedPlaylist,
) -> Result<api::Collection, String> {
    backend.register(scanned.tracks.clone())?;
    backend
        .local_collections
        .lock()
        .map_err(|e| e.to_string())?
        .insert(scanned.collection.id.clone(), scanned.tracks);
    backend
        .cover_files
        .lock()
        .map_err(|e| e.to_string())?
        .extend(scanned.cover_files);
    Ok(scanned.collection)
}

#[tauri::command]
async fn restore_library(
    tracks: Vec<Track>,
    folders: Vec<PathBuf>,
    backend: tauri::State<'_, Backend>,
) -> Result<Vec<serde_json::Value>, String> {
    if tracks.len() > 10000 || folders.len() > 1000 {
        return Err("Saved library is too large".into());
    }
    let backend = backend.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        backend.register(tracks)?;
        let mut result = Vec::new();
        for folder in folders {
            let Ok(scanned) = local_playlists::scan(&folder) else {
                continue;
            };
            let mut collection = serde_json::to_value(register_local_playlist(&backend, scanned)?)
                .map_err(|e| e.to_string())?;
            collection["folder"] = serde_json::json!(folder);
            result.push(collection);
        }
        Ok(result)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
fn resolve_track(id: String, backend: tauri::State<'_, Backend>) -> Result<Song, String> {
    let track = backend
        .catalog
        .lock()
        .map_err(|e| e.to_string())?
        .get(&id)
        .cloned()
        .ok_or("Track not found")?;
    Ok(Song::from(&track))
}
#[tauri::command]
async fn radio_search(
    query: String,
    backend: tauri::State<'_, Backend>,
) -> Result<Vec<Song>, String> {
    if query.len() > 256 {
        return Err("Station name is too long".into());
    }
    let backend = backend.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let stations = radio::search_with_metadata(&query)?;
        let tracks = stations
            .iter()
            .map(|station| station.track.clone())
            .collect();
        let mut songs = backend.register(tracks)?;
        let mut sources = backend
            .collection_sources
            .lock()
            .map_err(|e| e.to_string())?;
        for (station, song) in stations.iter().zip(songs.iter_mut()) {
            song.followers = Some(station.followers);
            if let Some(favicon) = &station.favicon {
                sources.insert(song.id.clone(), favicon.clone());
            }
        }
        Ok(songs)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn search(
    query: String,
    source: Option<String>,
    backend: tauri::State<'_, Backend>,
) -> Result<Vec<Song>, String> {
    let query = query.trim().to_string();
    if query.is_empty() || query.len() > 256 {
        return Err("Enter a song or artist (up to 256 bytes).".into());
    }
    let backend = backend.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        backend.register(
            backend
                .providers
                .get(source.as_deref().unwrap_or("netease"))?
                .search(&query)?,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn collections(
    query: String,
    offset: Option<u32>,
    source: Option<String>,
    backend: tauri::State<'_, Backend>,
) -> Result<Vec<api::Collection>, String> {
    if query.len() > 256 {
        return Err("Search query is too long".into());
    }
    let backend = backend.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let result = backend
            .providers
            .get(source.as_deref().unwrap_or("netease"))?
            .collections(&query, offset.unwrap_or(0))?;
        let mut sources = backend
            .collection_sources
            .lock()
            .map_err(|e| e.to_string())?;
        for c in &result {
            if let Some(url) = &c.cover_url {
                sources.insert(c.id.clone(), url.clone());
            }
        }
        Ok(result)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn collection_tracks(
    id: String,
    backend: tauri::State<'_, Backend>,
) -> Result<serde_json::Value, String> {
    let backend = backend.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        if let Some(tracks) = backend
            .local_collections
            .lock()
            .map_err(|e| e.to_string())?
            .get(&id)
            .cloned()
        {
            return Ok(serde_json::json!({"tracks":backend.register(tracks)?,"cached":true}));
        }
        let (tracks, cached) = backend
            .providers
            .collection_provider(&id)?
            .collection_tracks(&id)?;
        Ok(serde_json::json!({"tracks":backend.register(tracks)?,"cached":cached}))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn artwork(
    ids: Vec<String>,
    backend: tauri::State<'_, Backend>,
) -> Result<HashMap<String, String>, String> {
    if ids.len() > 40 {
        return Err("Too many artwork requests".into());
    }
    let backend = backend.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut result = HashMap::new();
        let mut needed = Vec::new();
        let mut urls = HashMap::<String, String>::new();
        let mut files = HashMap::<String, PathBuf>::new();
        {
            let cache = backend.covers.lock().map_err(|e| e.to_string())?;
            let catalog = backend.catalog.lock().map_err(|e| e.to_string())?;
            let collection_sources = backend
                .collection_sources
                .lock()
                .map_err(|e| e.to_string())?;
            let cover_files = backend.cover_files.lock().map_err(|e| e.to_string())?;
            for id in ids {
                if let Some(url) = cache.get(&id) {
                    result.insert(id, url.clone());
                } else if let Some(path) = cover_files.get(&id) {
                    files.insert(id, path.clone());
                } else if let Some(url) = collection_sources.get(&id) {
                    urls.insert(id, url.clone());
                } else if let Some(track) = catalog.get(&id) {
                    needed.push(track.clone());
                }
            }
        }
        for (key, path) in files {
            let Ok(bytes) = std::fs::read(&path) else {
                continue;
            };
            if bytes.len() > 8 * 1024 * 1024 {
                continue;
            }
            let mime = match path
                .extension()
                .and_then(|value| value.to_str())
                .unwrap_or_default()
                .to_ascii_lowercase()
                .as_str()
            {
                "png" => "image/png",
                "webp" => "image/webp",
                _ => "image/jpeg",
            };
            let data = format!(
                "data:{mime};base64,{}",
                base64::engine::general_purpose::STANDARD.encode(bytes)
            );
            let mut cache = backend.covers.lock().map_err(|e| e.to_string())?;
            cache_cover(&mut cache, key.clone(), data.clone());
            result.insert(key, data);
        }
        if !needed.is_empty() {
            urls.extend(backend.providers.artwork(&needed)?);
        }
        for (key, data) in download_artwork(backend.api.clone(), urls) {
            let mut cache = backend.covers.lock().map_err(|e| e.to_string())?;
            cache_cover(&mut cache, key.clone(), data.clone());
            result.insert(key, data);
        }
        Ok(result)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
fn play(
    queue: Vec<String>,
    index: usize,
    backend: tauri::State<'_, Backend>,
) -> Result<(), String> {
    if queue.is_empty() || queue.len() > 5000 || index >= queue.len() {
        return Err("Invalid play queue".into());
    }
    let catalog = backend.catalog.lock().map_err(|e| e.to_string())?;
    let tracks = queue
        .into_iter()
        .map(|id| {
            catalog
                .get(&id)
                .cloned()
                .ok_or("Track unavailable. Search again.".into())
        })
        .collect::<Result<Vec<_>, String>>()?;
    backend.engine.send(Command::Queue(tracks, index))
}
#[tauri::command]
fn control(
    action: String,
    value: Option<f64>,
    backend: tauri::State<'_, Backend>,
) -> Result<(), String> {
    let finite = || {
        value
            .filter(|n| n.is_finite())
            .ok_or_else(|| "Invalid value".to_string())
    };
    let command = match action.as_str() {
        "toggle" => Command::Toggle,
        "stop" => Command::Stop,
        "next" => Command::Step(true),
        "previous" => Command::Step(false),
        "repeat" => Command::Repeat,
        "shuffle" => Command::Shuffle,
        "volume" => Command::Volume(finite()?.clamp(0.0, 1.0)),
        "seek" => Command::Seek(finite()?.max(0.0)),
        _ => return Err("Unknown action".into()),
    };
    backend.engine.send(command)
}
#[tauri::command]
fn snapshot(backend: tauri::State<'_, Backend>) -> Result<Snapshot, String> {
    backend
        .engine
        .snapshot
        .lock()
        .map(|s| s.clone())
        .map_err(|e| e.to_string())
}
#[tauri::command]
#[cfg(desktop)]
async fn import_playlist(
    app: tauri::AppHandle,
    backend: tauri::State<'_, Backend>,
) -> Result<Option<serde_json::Value>, String> {
    let backend = backend.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let Some(folder) = app.dialog().file().blocking_pick_folder() else {
            return Ok(None);
        };
        let folder = folder
            .into_path()
            .map_err(|e| e.to_string())?
            .canonicalize()
            .map_err(|e| e.to_string())?;
        let scanned = local_playlists::scan(&folder)?;
        let mut collection = serde_json::to_value(register_local_playlist(&backend, scanned)?)
            .map_err(|e| e.to_string())?;
        collection["folder"] = serde_json::json!(folder);
        Ok(Some(collection))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
#[cfg(mobile)]
async fn import_playlist() -> Result<Option<serde_json::Value>, String> {
    Ok(None)
}

#[tauri::command]
#[cfg(desktop)]
fn window_action(action: String, window: tauri::WebviewWindow) -> Result<(), String> {
    match action.as_str() {
        "drag" => window.start_dragging(),
        "close" => {
            window.app_handle().exit(0);
            Ok(())
        }
        "skin-ipod" | "skin-walkman" | "skin-carthing" => {
            let mut saved = SKIN_WINDOW.lock().map_err(|e| e.to_string())?;
            if *saved {
                return Ok(());
            }
            let scale = window.scale_factor().map_err(|e| e.to_string())?;
            let (min_width, min_height, width, height) = (760.0, 520.0, 1240.0, 800.0);
            let (width, height) = window
                .current_monitor()
                .map_err(|e| e.to_string())?
                .map(|monitor| {
                    let work = monitor.work_area();
                    (
                        (work.size.width as f64 / scale - 24.0).clamp(min_width, width),
                        (work.size.height as f64 / scale - 24.0).clamp(min_height, height),
                    )
                })
                .unwrap_or((width, height));
            window
                .set_min_size(Some(LogicalSize::new(min_width, min_height)))
                .map_err(|e| e.to_string())?;
            window
                .set_size(LogicalSize::new(width, height))
                .map_err(|e| e.to_string())?;
            window.center().map_err(|e| e.to_string())?;
            *saved = true;
            Ok(())
        }
        "compact" => {
            let mut saved = COMPACT_WINDOW.lock().map_err(|e| e.to_string())?;
            if saved.is_none() {
                *saved = Some((
                    window.outer_size().map_err(|e| e.to_string())?,
                    window.outer_position().map_err(|e| e.to_string())?,
                ));
            }
            let monitor = window
                .current_monitor()
                .map_err(|e| e.to_string())?
                .ok_or("No monitor found")?;
            let work = monitor.work_area();
            let logical_size = LogicalSize::new(440.0, 88.0);
            let scale = window.scale_factor().map_err(|e| e.to_string())?;
            let physical_size: PhysicalSize<u32> = logical_size.to_physical(scale);
            let margin = (18.0 * scale).round() as i32;
            let x =
                work.position.x + (work.size.width as i32) - (physical_size.width as i32) - margin;
            let y = work.position.y + (work.size.height as i32)
                - (physical_size.height as i32)
                - margin;
            window.set_size(logical_size).map_err(|e| e.to_string())?;
            window
                .set_position(PhysicalPosition::new(x, y))
                .map_err(|e| e.to_string())?;
            Ok(())
        }
        "restore" => {
            let mut saved = COMPACT_WINDOW.lock().map_err(|e| e.to_string())?;
            if let Some((size, pos)) = saved.take() {
                window.set_size(size).map_err(|e| e.to_string())?;
                window.set_position(pos).map_err(|e| e.to_string())?;
            }
            Ok(())
        }
        _ => return Err("Unknown window action".into()),
    }
    .map_err(|e| e.to_string())
}

#[tauri::command]
#[cfg(mobile)]
fn window_action(action: String, window: tauri::WebviewWindow) -> Result<(), String> {
    if action == "close" {
        window.app_handle().exit(0);
    }
    Ok(())
}

#[tauri::command]
#[cfg(desktop)]
fn open_custom_skin_docs() -> Result<(), String> {
    const URL: &str = "https://github.com/magic-bunny/music-player/blob/main/docs/CUSTOM_SKINS.md";
    #[cfg(target_os = "macos")]
    let mut command = std::process::Command::new("open");
    #[cfg(target_os = "linux")]
    let mut command = std::process::Command::new("xdg-open");
    #[cfg(target_os = "windows")]
    let mut command = {
        use std::os::windows::process::CommandExt;
        let mut command = std::process::Command::new("cmd");
        command
            .creation_flags(0x08000000)
            .args(["/C", "start", "", URL]);
        command
    };
    #[cfg(not(target_os = "windows"))]
    command.arg(URL);
    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Unable to open the custom skin guide: {error}"))
}

#[tauri::command]
#[cfg(mobile)]
fn open_custom_skin_docs() -> Result<(), String> {
    Err("Open the custom skin guide at github.com/magic-bunny/music-player".into())
}

#[tauri::command]
#[cfg(desktop)]
fn window_state(window: tauri::WebviewWindow) -> Result<serde_json::Value, String> {
    Ok(
        serde_json::json!({"compact":COMPACT_WINDOW.lock().map(|state|state.is_some()).unwrap_or(false),"skinCheck":std::env::args().any(|a|a=="--check-ui-skin"),"hardwareCheck":std::env::args().any(|a|a=="--check-ui-hardware"||a=="--check-ui-exit"),"exitCheck":std::env::args().any(|a|a=="--check-ui-exit"),"decorated":window.is_decorated().map_err(|e|e.to_string())?,"resizable":window.is_resizable().map_err(|e|e.to_string())?,"minimized":window.is_minimized().map_err(|e|e.to_string())?}),
    )
}

#[tauri::command]
#[cfg(mobile)]
fn window_state() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "compact": false,
        "skinCheck": false,
        "hardwareCheck": false,
        "exitCheck": false,
        "decorated": false,
        "resizable": false,
        "minimized": false
    }))
}

#[cfg(desktop)]
static COMPACT_WINDOW: std::sync::Mutex<Option<(PhysicalSize<u32>, PhysicalPosition<i32>)>> =
    std::sync::Mutex::new(None);
#[cfg(desktop)]
static SKIN_WINDOW: std::sync::Mutex<bool> = std::sync::Mutex::new(false);
static CHECK_MODE: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
#[tauri::command]
fn check_mode() -> bool {
    CHECK_MODE.load(std::sync::atomic::Ordering::Relaxed)
}
#[tauri::command]
fn check_media(backend: tauri::State<'_, Backend>) -> Result<Vec<Song>, String> {
    if !check_mode() {
        return Err("Check mode is not enabled".into());
    }
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../artifacts/hardware-check");
    let tracks = ui_check::media(&root)?;
    for id in ["local-playlist:hardware-a", "local-playlist:hardware-b"] {
        backend
            .local_collections
            .lock()
            .map_err(|e| e.to_string())?
            .insert(id.into(), tracks.clone());
    }
    backend.register(tracks)
}
#[tauri::command]
fn music_sources(backend: tauri::State<'_, Backend>) -> Vec<providers::ProviderInfo> {
    backend.providers.list()
}
#[tauri::command]
fn check_progress(stage: String) {
    if check_mode() {
        println!("TAURI_UI_STAGE {stage}");
    }
}
#[tauri::command]
fn frontend_log(message: String) {
    eprintln!("TAURI_FRONTEND_LOG {message}");
}
#[tauri::command]
fn check_report(result: serde_json::Value, app: tauri::AppHandle) -> Result<(), String> {
    if !check_mode() {
        return Err("Check mode is not enabled".into());
    }
    println!("TAURI_UI_CHECK {}", result);
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../artifacts");
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    std::fs::write(
        path.join("native-check.json"),
        serde_json::to_vec_pretty(&result).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    let code = if result["ok"] == true { 0 } else { 1 };
    if code == 0 && std::env::args().any(|a| a == "--check-ui-keep-open" || a == "--check-ui-exit")
    {
        return Ok(());
    }
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(300));
        app.exit(code);
    });
    Ok(())
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    CHECK_MODE.store(
        std::env::args().any(|a| {
            a == "--check-ui"
                || a == "--check-ui-keep-open"
                || a == "--check-ui-skin"
                || a == "--check-ui-hardware"
                || a == "--check-ui-exit"
        }),
        std::sync::atomic::Ordering::Relaxed,
    );
    if std::env::args().any(|a| a == "--check-backend") {
        if let Err(e) = engine::check_backend() {
            eprintln!("{e}");
            std::process::exit(1);
        }
        return;
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Backend::new())
        .invoke_handler(tauri::generate_handler![
            music_sources,
            search,
            collections,
            collection_tracks,
            artwork,
            play,
            control,
            snapshot,
            import_playlist,
            restore_library,
            legacy_configuration,
            radio_search,
            resolve_track,
            window_action,
            open_custom_skin_docs,
            window_state,
            check_mode,
            check_media,
            check_progress,
            frontend_log,
            check_report
        ])
        .run(tauri::generate_context!())
        .expect("Unable to start Music Player");
}
