use super::*;

pub struct NeteaseProvider {
    api: Api,
}
impl NeteaseProvider {
    pub fn new() -> Self {
        Self { api: Api::new() }
    }
}
impl MusicProvider for NeteaseProvider {
    fn id(&self) -> &'static str {
        "netease"
    }
    fn name(&self) -> &'static str {
        "NetEase Music"
    }
    fn search(&self, query: &str) -> Result<Vec<Track>> {
        self.api.search(query)
    }
    fn collections(&self, query: &str, offset: u32) -> Result<Vec<Collection>> {
        self.api.collections(query, offset)
    }
    fn collection_tracks(&self, id: &str) -> Result<(Vec<Track>, bool)> {
        self.api.collection_tracks(id)
    }
    fn load(&self, track: &Track, generation: &AtomicU64, request: u64) -> Result<Loaded> {
        self.api.load(track, generation, request)
    }
    fn artwork(&self, tracks: &[Track]) -> Result<HashMap<String, String>> {
        let ids: Vec<_> = tracks
            .iter()
            .filter_map(|t| match t.origin {
                Origin::Netease(id) => Some(id),
                _ => None,
            })
            .collect();
        if ids.is_empty() {
            return Ok(HashMap::new());
        }
        let data = self.api.artwork_info(&ids)?;
        Ok(data["songs"]
            .as_array()
            .ok_or("Invalid artwork response")?
            .iter()
            .filter_map(|s| {
                Some((
                    format!("netease:{}", s["id"].as_u64()?),
                    s["album"]["picUrl"].as_str()?.to_string(),
                ))
            })
            .collect())
    }
}
