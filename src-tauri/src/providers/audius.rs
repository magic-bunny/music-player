use super::*;
use crate::api::{read_bounded, AUDIO_LIMIT};
use serde_json::Value;
use std::{sync::atomic::Ordering, time::Duration};

const BASE: &str = "https://api.audius.co/v1";
pub struct AudiusProvider {
    agent: ureq::Agent,
}
impl AudiusProvider {
    pub fn new() -> Self {
        Self {
            agent: ureq::Agent::config_builder()
                .timeout_global(Some(Duration::from_secs(30)))
                .timeout_connect(Some(Duration::from_secs(8)))
                .user_agent("MusicPlayer/0.1")
                .build()
                .into(),
        }
    }
    fn get(&self, path: &str, query: &[(&str, String)]) -> Result<Vec<Value>> {
        let mut request = self
            .agent
            .get(&format!("{BASE}{path}"))
            .query("app_name", "MusicPlayer");
        for (key, value) in query {
            request = request.query(key, value);
        }
        let data: Value = request
            .call()
            .map_err(|e| format!("Audius request failed: {e}"))?
            .body_mut()
            .read_json()
            .map_err(|e| e.to_string())?;
        response_items(data)
    }
}
fn response_items(data: Value) -> Result<Vec<Value>> {
    match data.get("data") {
        Some(Value::Array(items)) => Ok(items.clone()),
        Some(value @ Value::Object(_)) if value["id"].is_string() => Ok(vec![value.clone()]),
        _ => Err("Invalid Audius response".into()),
    }
}
fn valid_id(id: &str) -> Result<&str> {
    if !id.is_empty() && id.len() <= 64 && id.bytes().all(|c| c.is_ascii_alphanumeric()) {
        Ok(id)
    } else {
        Err("Invalid Audius ID".into())
    }
}
fn cover(value: &Value) -> Option<String> {
    ["480x480", "1000x1000", "150x150"].iter().find_map(|key| {
        value["artwork"][key]
            .as_str()
            .filter(|url| url.starts_with("https://"))
            .map(str::to_string)
    })
}
fn playable(value: &Value) -> bool {
    value["is_streamable"] == true
        && value["is_stream_gated"] != true
        && value["is_available"] != false
        && value["is_delete"] != true
        && value["access"]["stream"] != false
}
fn track(value: &Value) -> Option<Track> {
    if !playable(value) {
        return None;
    }
    let id = valid_id(value["id"].as_str()?).ok()?.to_string();
    Some(Track {
        title: value["title"].as_str()?.into(),
        artist: value["user"]["name"].as_str().unwrap_or("Audius").into(),
        album: value["album_backlink"]["playlist_name"]
            .as_str()
            .unwrap_or("Audius")
            .into(),
        seconds: value["duration"].as_f64().unwrap_or(0.0),
        origin: Origin::Audius {
            id,
            cover_url: cover(value),
        },
    })
}
impl MusicProvider for AudiusProvider {
    fn id(&self) -> &'static str {
        "audius"
    }
    fn name(&self) -> &'static str {
        "Audius"
    }
    fn search(&self, query: &str) -> Result<Vec<Track>> {
        Ok(self
            .get(
                "/tracks/search",
                &[("query", query.into()), ("limit", "40".into())],
            )?
            .iter()
            .filter_map(track)
            .collect())
    }
    fn collections(&self, query: &str, offset: u32) -> Result<Vec<Collection>> {
        let mut params = vec![
            ("offset", offset.to_string()),
            ("limit", if offset == 0 { "10" } else { "30" }.into()),
        ];
        let path = if query.trim().is_empty() {
            "/playlists/trending"
        } else {
            params.push(("query", query.into()));
            "/playlists/search"
        };
        Ok(self
            .get(path, &params)?
            .iter()
            .filter(|v| {
                v["is_private"] != true && v["is_delete"] != true && v["is_stream_gated"] != true
            })
            .filter_map(|v| {
                Some(Collection {
                    id: format!("audius-playlist:{}", valid_id(v["id"].as_str()?).ok()?),
                    title: v["playlist_name"].as_str()?.into(),
                    artist: v["user"]["name"].as_str().unwrap_or("Audius").into(),
                    track_count: v["track_count"]
                        .as_u64()
                        .or_else(|| v["tracks"].as_array().map(|a| a.len() as u64))
                        .unwrap_or(0),
                    followers: v["favorite_count"].as_u64().unwrap_or(0),
                    cover_url: cover(v),
                })
            })
            .collect())
    }
    fn collection_tracks(&self, id: &str) -> Result<(Vec<Track>, bool)> {
        let id = valid_id(
            id.strip_prefix("audius-playlist:")
                .ok_or("Unknown Audius playlist")?,
        )?;
        let mut result = Vec::new();
        for offset in (0..5000).step_by(100) {
            let page = self.get(
                &format!("/playlists/{id}/tracks"),
                &[("offset", offset.to_string()), ("limit", "100".into())],
            )?;
            result.extend(page.iter().filter_map(track));
            if page.len() < 100 {
                return Ok((result, false));
            }
        }
        Err("This playlist exceeds the 5,000-track limit.".into())
    }
    fn artwork(&self, tracks: &[Track]) -> Result<HashMap<String, String>> {
        Ok(tracks
            .iter()
            .filter_map(|t| match &t.origin {
                Origin::Audius {
                    id,
                    cover_url: Some(url),
                } => Some((format!("audius:{id}"), url.clone())),
                _ => None,
            })
            .collect())
    }
    fn load(&self, track: &Track, generation: &AtomicU64, request: u64) -> Result<Loaded> {
        let Origin::Audius { id, .. } = &track.origin else {
            return Err("Not an Audius track".into());
        };
        let id = valid_id(id)?;
        let current = || generation.load(Ordering::Relaxed) == request;
        if !current() {
            return Err("Cancelled".into());
        }
        // Recheck access before playback, including saved tracks whose permissions may change.
        let info = self.get(&format!("/tracks/{id}"), &[])?;
        if !info.first().is_some_and(playable) {
            return Err("This Audius track requires access or is unavailable.".into());
        }
        if !current() {
            return Err("Cancelled".into());
        }
        let response = self
            .agent
            .get(&format!("{BASE}/tracks/{id}/stream"))
            .query("app_name", "MusicPlayer")
            .call()
            .map_err(|e| format!("Unable to fetch Audius audio: {e}"))?;
        let bytes = read_bounded(response.into_body().into_reader(), AUDIO_LIMIT, current)?;
        Ok(Loaded {
            bytes: bytes.into(),
            lyrics: Vec::new(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn detail_is_an_object_but_lists_are_arrays() {
        let item = serde_json::json!({"id":"r70GlbZ","title":"Track"});
        assert_eq!(
            response_items(serde_json::json!({"data":item})).unwrap(),
            vec![item.clone()]
        );
        assert_eq!(
            response_items(serde_json::json!({"data":[item]})).unwrap(),
            vec![item]
        );
        assert!(response_items(serde_json::json!({"error":"unavailable"})).is_err());
    }
    #[test]
    fn only_public_playable_tracks_are_exposed_and_ids_survive_storage() {
        let mut data = serde_json::json!({"id":"abc12","title":"Track","user":{"name":"Artist"},"duration":42,"is_streamable":true,"is_stream_gated":false,"access":{"stream":true},"artwork":{"480x480":"https://example.com/cover.jpg"}});
        let parsed = track(&data).unwrap();
        let saved = serde_json::to_string(&parsed).unwrap();
        let restored: Track = serde_json::from_str(&saved).unwrap();
        assert_eq!(crate::engine::Song::from(&restored).id, "audius:abc12");
        assert!(crate::engine::Song::from(&restored).stream.is_none());
        for (key, value) in [
            ("is_stream_gated", true),
            ("is_available", false),
            ("is_streamable", false),
        ] {
            let mut restricted = data.clone();
            restricted[key] = value.into();
            assert!(track(&restricted).is_none());
        }
        data["id"] = "../bad".into();
        assert!(track(&data).is_none());
    }
}
