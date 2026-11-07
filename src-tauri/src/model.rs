use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Origin {
    Netease(u64),
    Audius {
        id: String,
        cover_url: Option<String>,
    },
    Radio {
        id: String,
        url: String,
    },
    Local(PathBuf),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Track {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub seconds: f64,
    pub origin: Origin,
}

impl Track {
    pub fn local(path: PathBuf) -> Self {
        Self {
            title: path
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned(),
            artist: "Local file".into(),
            album: path
                .extension()
                .unwrap_or_default()
                .to_string_lossy()
                .to_uppercase(),
            seconds: 0.0,
            origin: Origin::Local(path),
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Lyric {
    pub seconds: f64,
    pub text: String,
}

/// Supports LRC timestamps, repeated timestamps and a global millisecond offset.
pub fn parse_lrc(raw: &str) -> Vec<Lyric> {
    let offset = raw
        .lines()
        .find_map(|line| {
            line.trim()
                .strip_prefix("[offset:")?
                .strip_suffix(']')?
                .parse::<f64>()
                .ok()
        })
        .filter(|n| n.is_finite())
        .unwrap_or(0.0)
        / 1000.0;
    let mut result = Vec::new();
    for line in raw.lines() {
        let mut rest = line.trim();
        let mut times = Vec::new();
        while let Some(tag) = rest.strip_prefix('[') {
            let Some((stamp, tail)) = tag.split_once(']') else {
                break;
            };
            if let Some((minutes, seconds)) = stamp.split_once(':') {
                if let (Ok(m), Ok(s)) = (minutes.parse::<u32>(), seconds.parse::<f64>()) {
                    if s.is_finite() && (0.0..60.0).contains(&s) {
                        times.push((m as f64 * 60.0 + s + offset).max(0.0));
                    }
                }
            }
            rest = tail;
        }
        if !rest.trim().is_empty() {
            for seconds in times {
                result.push(Lyric {
                    seconds,
                    text: rest.trim().into(),
                });
            }
        }
    }
    result.sort_by(|a, b| a.seconds.total_cmp(&b.seconds));
    result
}

pub fn lyric_index(lines: &[Lyric], seconds: f64) -> Option<usize> {
    lines
        .partition_point(|line| line.seconds <= seconds)
        .checked_sub(1)
}

pub fn clock(seconds: f64) -> String {
    let seconds = seconds.max(0.0) as u64;
    format!("{:02}:{:02}", seconds / 60, seconds % 60)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lyrics_support_repeated_stamps_offset_and_malformed_input() {
        let lines = parse_lrc("[ar:Artist]\n[offset:-500]\n[00:02.20][00:05.200]hello\n[00:01]first\n[00:NaN]bad\n[00:61]bad\n[bad");
        assert_eq!(lines.len(), 3);
        assert_eq!(
            lines[0],
            Lyric {
                seconds: 0.5,
                text: "first".into()
            }
        );
        assert!((lines[1].seconds - 1.7).abs() < 0.001);
        assert_eq!(lyric_index(&lines, 0.0), None);
        assert_eq!(lyric_index(&lines, lines[1].seconds), Some(1));
        assert_eq!(lyric_index(&lines, 1.71), Some(1));
        assert_eq!(lyric_index(&lines, 5.0), Some(2));
        assert_eq!(lyric_index(&[], 5.0), None);
    }
}
