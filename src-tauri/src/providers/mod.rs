mod audius;
mod netease;

use crate::{
    api::{Api, Collection, Loaded, Result},
    model::{Origin, Track},
};
use serde::Serialize;
use std::{collections::HashMap, sync::atomic::AtomicU64};

/// Provider-neutral contract. IDs retain their source across queues and saved favorites.
pub trait MusicProvider: Send + Sync {
    fn id(&self) -> &'static str;
    fn name(&self) -> &'static str;
    fn search(&self, query: &str) -> Result<Vec<Track>>;
    fn collections(&self, query: &str, offset: u32) -> Result<Vec<Collection>>;
    fn collection_tracks(&self, id: &str) -> Result<(Vec<Track>, bool)>;
    fn artwork(&self, tracks: &[Track]) -> Result<HashMap<String, String>>;
    fn load(&self, track: &Track, generation: &AtomicU64, request: u64) -> Result<Loaded>;
}

#[derive(Serialize)]
pub struct ProviderInfo {
    pub id: &'static str,
    pub name: &'static str,
}

pub struct Providers {
    entries: Vec<Box<dyn MusicProvider>>,
    files: Api,
}
impl Providers {
    pub fn new() -> Self {
        Self {
            entries: vec![
                Box::new(netease::NeteaseProvider::new()),
                Box::new(audius::AudiusProvider::new()),
            ],
            files: Api::new(),
        }
    }
    pub fn list(&self) -> Vec<ProviderInfo> {
        self.entries
            .iter()
            .map(|p| ProviderInfo {
                id: p.id(),
                name: p.name(),
            })
            .collect()
    }
    pub fn get(&self, id: &str) -> Result<&dyn MusicProvider> {
        self.entries
            .iter()
            .find(|p| p.id() == id)
            .map(|p| p.as_ref())
            .ok_or_else(|| format!("Unknown music source: {id}"))
    }
    pub fn collection_provider(&self, id: &str) -> Result<&dyn MusicProvider> {
        if id.starts_with("playlist:") {
            self.get("netease")
        } else if id.starts_with("audius-playlist:") {
            self.get("audius")
        } else {
            Err("Unknown playlist".into())
        }
    }
    pub fn load(&self, track: &Track, generation: &AtomicU64, request: u64) -> Result<Loaded> {
        match &track.origin {
            Origin::Netease(_) => self.get("netease")?.load(track, generation, request),
            Origin::Audius { .. } => self.get("audius")?.load(track, generation, request),
            _ => self.files.load(track, generation, request),
        }
    }
    pub fn artwork(&self, tracks: &[Track]) -> Result<HashMap<String, String>> {
        let mut result = HashMap::new();
        for provider in &self.entries {
            result.extend(provider.artwork(tracks)?);
        }
        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn routing_is_source_qualified_and_rejects_unknown_sources() {
        let providers = Providers::new();
        assert_eq!(
            providers.collection_provider("playlist:42").unwrap().id(),
            "netease"
        );
        assert_eq!(
            providers
                .collection_provider("audius-playlist:42")
                .unwrap()
                .id(),
            "audius"
        );
        assert!(providers.get("missing").is_err());
        assert!(providers.collection_provider("42").is_err());
    }
}
