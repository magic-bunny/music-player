use crate::model::{Origin, Track};
use serde_json::Value;
use std::{collections::HashSet, time::Duration};

pub struct Station {
    pub track: Track,
    pub favicon: Option<String>,
    pub followers: u64,
}

pub fn search_with_metadata(query: &str) -> Result<Vec<Station>, String> {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(12)))
        .user_agent("MusicPlayer/0.1 (desktop radio player)")
        .build()
        .into();
    let mut last_error = String::new();
    for host in ["de1.api.radio-browser.info", "nl1.api.radio-browser.info"] {
        let response = agent
            .get(&format!("https://{host}/json/stations/search"))
            .query(
                "name",
                if query.trim().is_empty() {
                    "SomaFM"
                } else {
                    query.trim()
                },
            )
            .query("hidebroken", "true")
            .query("limit", "60")
            .query("order", "clickcount")
            .query("reverse", "true")
            .query("codec", "MP3")
            .call();
        match response {
            Ok(mut response) => match response.body_mut().read_json::<Vec<Value>>() {
                Ok(stations) => return Ok(parse_stations(stations)),
                Err(e) => last_error = e.to_string(),
            },
            Err(e) => last_error = e.to_string(),
        }
    }
    Err(format!("Radio directory unavailable: {last_error}"))
}
fn parse_stations(stations: Vec<Value>) -> Vec<Station> {
    let mut names = HashSet::new();
    stations
        .into_iter()
        .filter_map(|s| {
            let (Some(id), Some(name), Some(url)) = (
                s["stationuuid"].as_str(),
                s["name"].as_str(),
                s["url_resolved"].as_str(),
            ) else {
                return None;
            };
            if !url.starts_with("https://") || s["lastcheckok"] != 1 || s["hls"] != 0 {
                return None;
            }
            if !names.insert(name.trim().to_lowercase()) {
                return None;
            }
            Some(Station {
                track: Track {
                    title: name.trim().into(),
                    artist: s["country"].as_str().unwrap_or("Internet Radio").into(),
                    album: "Internet Radio".into(),
                    seconds: 0.0,
                    origin: Origin::Radio {
                        id: id.into(),
                        url: url.into(),
                    },
                },
                favicon: s["favicon"]
                    .as_str()
                    .filter(|url| url.starts_with("http://") || url.starts_with("https://"))
                    .map(str::to_string),
                followers: s["clickcount"].as_u64().unwrap_or(0),
            })
        })
        .take(18)
        .collect()
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_offline_insecure_and_hls_stations() {
        let station = serde_json::json!({"stationuuid":"a","name":"Radio","url_resolved":"https://radio.example/live","lastcheckok":1,"hls":0,"favicon":"https://radio.example/logo.png","clickcount":321});
        let mut insecure = station.clone();
        insecure["url_resolved"] = "http://radio.example/live".into();
        let mut offline = station.clone();
        offline["lastcheckok"] = 0.into();
        let mut hls = station.clone();
        hls["hls"] = 1.into();
        let parsed = parse_stations(vec![insecure, offline, hls, station.clone(), station]);
        assert_eq!(parsed.len(), 1);
        assert_eq!(
            parsed[0].favicon.as_deref(),
            Some("https://radio.example/logo.png")
        );
        assert_eq!(parsed[0].followers, 321);
    }
}
