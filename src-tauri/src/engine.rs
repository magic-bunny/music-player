use crate::{
    api::{Api, Loaded},
    model::{clock, lyric_index, Origin, Track},
    player::Player,
};
use serde::Serialize;
use std::{
    collections::hash_map::DefaultHasher,
    hash::{Hash, Hasher},
    sync::{
        atomic::{AtomicU64, Ordering},
        mpsc, Arc, Mutex,
    },
    thread,
    time::Duration,
};

#[derive(Clone, Debug, Serialize)]
pub struct Song {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub seconds: f64,
    pub local: bool,
    pub stream: Option<String>,
    pub followers: Option<u64>,
    pub origin: Origin,
}
impl From<&Track> for Song {
    fn from(t: &Track) -> Self {
        let id = match &t.origin {
            Origin::Netease(id) => format!("netease:{id}"),
            Origin::Audius { id, .. } => format!("audius:{id}"),
            Origin::Radio { id, .. } => format!("radio:{id}"),
            Origin::Local(path) => {
                let mut h = DefaultHasher::new();
                path.hash(&mut h);
                format!("local:{:x}", h.finish())
            }
        };
        Self {
            id,
            title: t.title.clone(),
            artist: t.artist.clone(),
            album: t.album.clone(),
            seconds: t.seconds,
            local: matches!(t.origin, Origin::Local(_)),
            stream: match &t.origin {
                Origin::Radio { url, .. } => Some(url.clone()),
                _ => None,
            },
            followers: None,
            origin: t.origin.clone(),
        }
    }
}
#[derive(Clone, Serialize)]
pub struct Snapshot {
    pub track: Option<Song>,
    pub position: f64,
    pub duration: f64,
    pub paused: bool,
    pub loading: bool,
    pub repeat: bool,
    pub shuffle: bool,
    pub volume: f64,
    pub lyric: String,
    pub next_lyric: String,
    pub error: Option<String>,
    pub revision: u64,
}
impl Default for Snapshot {
    fn default() -> Self {
        Self {
            track: None,
            position: 0.0,
            duration: 0.0,
            paused: true,
            loading: false,
            repeat: false,
            shuffle: false,
            volume: 0.45,
            lyric: String::new(),
            next_lyric: String::new(),
            error: None,
            revision: 0,
        }
    }
}
pub enum Command {
    Queue(Vec<Track>, usize),
    Toggle,
    Stop,
    Step(bool),
    Seek(f64),
    Volume(f64),
    Repeat,
    Shuffle,
    Ready(u64, Result<Loaded, String>),
}
pub struct Engine {
    pub sender: mpsc::Sender<Command>,
    pub snapshot: Arc<Mutex<Snapshot>>,
}
struct Playback {
    player: Option<Player>,
    loaded: Option<Loaded>,
    queue: Vec<Track>,
    index: usize,
    generation: Arc<AtomicU64>,
    state: Snapshot,
    loader: mpsc::Sender<(u64, Track)>,
    finished: bool,
    history: Vec<usize>,
}
impl Playback {
    fn start(&mut self, index: usize) {
        let Some(track) = self.queue.get(index).cloned() else {
            return;
        };
        let id = self.generation.fetch_add(1, Ordering::Relaxed) + 1;
        self.index = index;
        self.finished = false;
        self.loaded = None;
        if let Some(player) = &mut self.player {
            player.stop();
        }
        self.state.track = Some(Song::from(&track));
        self.state.position = 0.0;
        self.state.duration = 0.0;
        self.state.loading = true;
        self.state.paused = true;
        self.state.lyric = String::new();
        self.state.next_lyric = String::new();
        self.state.error = None;
        self.state.revision += 1;
        if self.loader.send((id, track)).is_err() {
            self.state.error = Some("The audio loading thread has stopped".into());
            self.state.loading = false;
        }
    }
    fn step(&mut self, next: bool) {
        if self.queue.is_empty() {
            return;
        }
        let index = if self.state.shuffle {
            if next {
                shuffled_next(self.queue.len(), self.index)
            } else {
                self.history.pop()
            }
        } else if next {
            self.index.checked_add(1).filter(|i| *i < self.queue.len())
        } else {
            self.index.checked_sub(1)
        };
        if let Some(index) = index {
            if next && self.state.shuffle {
                self.history.push(self.index);
            }
            self.start(index);
        } else {
            self.state.error = Some(
                if next {
                    "This is the last track."
                } else {
                    "This is the first track."
                }
                .into(),
            );
        }
    }
    fn ready(&mut self, id: u64, result: Result<Loaded, String>) {
        if id != self.generation.load(Ordering::Relaxed) {
            return;
        }
        self.state.loading = false;
        let result = result.and_then(|loaded| {
            if self.player.is_none() {
                self.player = Some(Player::new()?);
            }
            let player = self.player.as_mut().unwrap();
            player.volume(self.state.volume);
            player.play(&loaded)?;
            self.state.duration = player.duration;
            self.loaded = Some(loaded);
            self.state.paused = false;
            Ok(())
        });
        if let Err(error) = result {
            self.state.error = Some(error);
        }
    }
    fn tick(&mut self) {
        let Some(player) = &mut self.player else {
            return;
        };
        if self.state.loading || player.sink.is_none() {
            return;
        }
        self.state.position = player.position().min(player.duration);
        self.state.paused = player.paused() || player.ended();
        if let Some(loaded) = &self.loaded {
            if let Some(i) = lyric_index(&loaded.lyrics, self.state.position) {
                self.state.lyric = loaded.lyrics[i].text.clone();
                self.state.next_lyric = loaded
                    .lyrics
                    .get(i + 1)
                    .map(|l| l.text.clone())
                    .unwrap_or_default();
            } else {
                self.state.lyric = if loaded.lyrics.is_empty() {
                    "No lyrics available"
                } else {
                    "Intro…"
                }
                .into();
                self.state.next_lyric = loaded
                    .lyrics
                    .first()
                    .map(|l| l.text.clone())
                    .unwrap_or_default();
            }
        }
        if player.ended() && !self.finished {
            self.finished = true;
            if self.state.repeat {
                if let Some(loaded) = &self.loaded {
                    match player.play(loaded) {
                        Ok(()) => self.finished = false,
                        Err(e) => self.state.error = Some(e),
                    }
                }
            } else if self.state.shuffle && self.queue.len() > 1 {
                self.step(true);
            } else if self.index + 1 < self.queue.len() {
                self.start(self.index + 1);
            } else {
                self.state.position = player.duration;
            }
        }
    }
    fn command(&mut self, command: Command) {
        match command {
            Command::Stop => {
                self.generation.fetch_add(1, Ordering::Relaxed);
                if let Some(player) = &mut self.player {
                    player.stop();
                }
                self.loaded = None;
                self.queue.clear();
                self.state.track = None;
                self.state.loading = false;
                self.state.paused = true;
                self.state.position = 0.0;
                self.state.duration = 0.0;
                self.state.error = None;
            }
            Command::Queue(queue, index) => {
                self.queue = queue;
                self.history.clear();
                self.start(index);
            }
            Command::Ready(id, result) => self.ready(id, result),
            Command::Step(next) => self.step(next),
            Command::Shuffle => {
                self.state.shuffle = !self.state.shuffle;
                self.history.clear();
            }
            Command::Repeat => {
                self.state.repeat = !self.state.repeat;
            }
            Command::Volume(volume) => {
                self.state.volume = volume;
                if let Some(p) = &mut self.player {
                    p.volume(volume);
                }
            }
            Command::Seek(seconds) => {
                if let Some(p) = &self.player {
                    if let Err(e) = p.seek(seconds) {
                        self.state.error = Some(e);
                    }
                }
            }
            Command::Toggle => {
                self.state.error = None;
                if self.state.loading {
                    return;
                }
                if let Some(p) = &mut self.player {
                    if p.ended() {
                        if let Some(loaded) = &self.loaded {
                            match p.play(loaded) {
                                Ok(()) => self.finished = false,
                                Err(e) => self.state.error = Some(e),
                            }
                        }
                    } else if p.sink.is_some() {
                        p.toggle();
                    } else if !self.queue.is_empty() {
                        self.start(self.index);
                    }
                } else if !self.queue.is_empty() {
                    self.start(self.index);
                }
            }
        }
    }
}
fn shuffled_next(len: usize, current: usize) -> Option<usize> {
    if len < 2 {
        return None;
    }
    let index = rand::random_range(0..len - 1);
    Some(if index >= current { index + 1 } else { index })
}
impl Engine {
    pub fn new() -> Self {
        let (sender, rx) = mpsc::channel();
        let (loader, load_rx) = mpsc::channel::<(u64, Track)>();
        let snapshot = Arc::new(Mutex::new(Snapshot::default()));
        let generation = Arc::new(AtomicU64::new(0));
        let load_generation = generation.clone();
        let events = sender.clone();
        thread::spawn(move || {
            let api = crate::providers::Providers::new();
            while let Ok(mut request) = load_rx.recv() {
                while let Ok(newer) = load_rx.try_recv() {
                    request = newer;
                }
                let result = api.load(&request.1, &load_generation, request.0);
                if events.send(Command::Ready(request.0, result)).is_err() {
                    break;
                }
            }
        });
        let output = snapshot.clone();
        thread::spawn(move || {
            let mut playback = Playback {
                player: None,
                loaded: None,
                queue: Vec::new(),
                index: 0,
                generation,
                state: Snapshot::default(),
                loader,
                finished: false,
                history: Vec::new(),
            };
            loop {
                match rx.recv_timeout(Duration::from_millis(100)) {
                    Ok(command) => playback.command(command),
                    Err(mpsc::RecvTimeoutError::Timeout) => {}
                    Err(_) => break,
                }
                playback.tick();
                if let Ok(mut state) = output.lock() {
                    *state = playback.state.clone();
                }
            }
        });
        Self { sender, snapshot }
    }
    pub fn send(&self, command: Command) -> Result<(), String> {
        self.sender
            .send(command)
            .map_err(|_| "Audio thread unavailable".into())
    }
}

pub fn check_backend() -> Result<(), String> {
    let tracks = Api::new().search("许巍")?;
    let index = tracks
        .iter()
        .position(|t| t.origin == Origin::Netease(1960405637))
        .ok_or("Test track unavailable")?;
    let engine = Engine::new();
    engine.send(Command::Volume(0.0))?;
    engine.send(Command::Queue(tracks, index))?;
    let deadline = std::time::Instant::now() + Duration::from_secs(60);
    loop {
        let state = engine.snapshot.lock().unwrap().clone();
        if let Some(e) = state.error {
            return Err(e);
        }
        if state.position > 0.2 {
            break;
        }
        if std::time::Instant::now() > deadline {
            return Err("Playback timed out".into());
        }
        thread::sleep(Duration::from_millis(100));
    }
    engine.send(Command::Toggle)?;
    engine.send(Command::Seek(25.0))?;
    thread::sleep(Duration::from_millis(400));
    let state = engine.snapshot.lock().unwrap();
    if !state.paused || state.position < 24.0 {
        return Err("Pause or seek failed".into());
    }
    println!(
        "Backend check passed: {}, {}, muted playback, pause and seek",
        state.track.as_ref().unwrap().title,
        clock(state.duration)
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (Playback, mpsc::Receiver<(u64, Track)>) {
        let (loader, rx) = mpsc::channel();
        let queue = (1..=2)
            .map(|id| {
                let mut t = Track::local(format!("{id}.wav").into());
                t.origin = Origin::Netease(id);
                t
            })
            .collect();
        (
            Playback {
                player: None,
                loaded: None,
                queue,
                index: 0,
                generation: Arc::new(AtomicU64::new(0)),
                state: Snapshot::default(),
                loader,
                finished: false,
                history: Vec::new(),
            },
            rx,
        )
    }
    #[test]
    fn shuffle_never_repeats_current_and_back_uses_history() {
        for _ in 0..100 {
            let index = shuffled_next(4, 2).unwrap();
            assert!(index < 4 && index != 2);
        }
        assert_eq!(shuffled_next(1, 0), None);
        let (mut playback, rx) = fixture();
        playback.command(Command::Shuffle);
        playback.start(0);
        rx.recv().unwrap();
        playback.step(true);
        rx.recv().unwrap();
        assert_eq!(playback.index, 1);
        playback.step(false);
        rx.recv().unwrap();
        assert_eq!(playback.index, 0);
    }
    #[test]
    fn obsolete_load_response_cannot_replace_new_selection() {
        let (mut playback, rx) = fixture();
        playback.start(0);
        let old = rx.recv().unwrap().0;
        playback.start(1);
        let current = rx.recv().unwrap().0;
        playback.ready(old, Err("Stale request error".into()));
        assert!(playback.state.loading);
        assert!(playback.state.error.is_none());
        assert_eq!(playback.state.track.as_ref().unwrap().id, "netease:2");
        playback.ready(current, Err("Current request error".into()));
        assert!(!playback.state.loading);
        assert_eq!(
            playback.state.error.as_deref(),
            Some("Current request error")
        );
    }
    #[test]
    fn queue_navigation_respects_boundaries_and_preserves_controls() {
        let (mut playback, rx) = fixture();
        playback.command(Command::Volume(0.2));
        playback.command(Command::Repeat);
        playback.start(0);
        rx.recv().unwrap();
        playback.step(false);
        assert_eq!(playback.index, 0);
        assert!(rx.try_recv().is_err());
        playback.step(true);
        rx.recv().unwrap();
        assert_eq!(playback.index, 1);
        assert_eq!(playback.state.volume, 0.2);
        assert!(playback.state.repeat);
        playback.step(true);
        assert_eq!(playback.index, 1);
        assert!(rx.try_recv().is_err());
    }
}
