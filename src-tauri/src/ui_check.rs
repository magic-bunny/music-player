use crate::model::Track;
use std::path::Path;

pub fn media(root: &Path) -> Result<Vec<Track>, String> {
    std::fs::create_dir_all(root).map_err(|e| e.to_string())?;
    // Forty seconds of mono PCM silence: native decoding without network/audio noise.
    let data_len = 8000u32 * 40 * 2;
    let mut bytes = Vec::with_capacity(data_len as usize + 44);
    bytes.extend_from_slice(b"RIFF");
    bytes.extend_from_slice(&(data_len + 36).to_le_bytes());
    bytes.extend_from_slice(b"WAVEfmt ");
    bytes.extend_from_slice(&16u32.to_le_bytes());
    bytes.extend_from_slice(&1u16.to_le_bytes());
    bytes.extend_from_slice(&1u16.to_le_bytes());
    bytes.extend_from_slice(&8000u32.to_le_bytes());
    bytes.extend_from_slice(&16000u32.to_le_bytes());
    bytes.extend_from_slice(&2u16.to_le_bytes());
    bytes.extend_from_slice(&16u16.to_le_bytes());
    bytes.extend_from_slice(b"data");
    bytes.extend_from_slice(&data_len.to_le_bytes());
    bytes.resize(data_len as usize + 44, 0);
    (1..=2)
        .map(|index| {
            let path = root.join(format!("hardware-silence-{index}.wav"));
            std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
            let mut track = Track::local(path);
            track.seconds = 40.0;
            Ok(track)
        })
        .collect()
}
