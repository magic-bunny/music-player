use crate::api::{Loaded, Result};
use rodio::{Decoder, OutputStream, OutputStreamBuilder, Sink, Source};
use std::{io::Cursor, time::Duration};

pub struct Player {
    // Keep the output stream alive for the entire playback session.
    stream: OutputStream,
    pub sink: Option<Sink>,
    pub duration: f64,
    volume: f32,
}

impl Player {
    pub fn new() -> Result<Self> {
        let mut stream = OutputStreamBuilder::open_default_stream()
            .map_err(|e| format!("Unable to open audio device: {e}"))?;
        stream.log_on_drop(false);
        Ok(Self {
            stream,
            sink: None,
            duration: 0.0,
            volume: 0.45,
        })
    }

    pub fn play(&mut self, loaded: &Loaded) -> Result<()> {
        let decoder = Decoder::try_from(Cursor::new(loaded.bytes.clone()))
            .map_err(|e| format!("Unable to decode audio: {e}"))?;
        let duration = decoder
            .total_duration()
            .map(|d| d.as_secs_f64())
            .unwrap_or(0.0);
        self.stop();
        let sink = Sink::connect_new(self.stream.mixer());
        sink.set_volume(self.volume);
        sink.append(decoder);
        self.sink = Some(sink);
        self.duration = duration;
        Ok(())
    }

    pub fn stop(&mut self) {
        if let Some(sink) = self.sink.take() {
            sink.stop();
        }
        self.duration = 0.0;
    }

    pub fn toggle(&self) {
        if let Some(sink) = &self.sink {
            if sink.is_paused() {
                sink.play();
            } else {
                sink.pause();
            }
        }
    }

    pub fn volume(&mut self, value: f64) {
        self.volume = value.clamp(0.0, 1.0) as f32;
        if let Some(sink) = &self.sink {
            sink.set_volume(self.volume);
        }
    }

    pub fn seek(&self, seconds: f64) -> Result<()> {
        if let Some(sink) = &self.sink {
            sink.try_seek(Duration::from_secs_f64(seconds.clamp(0.0, self.duration)))
                .map_err(|e| format!("Seeking is unavailable for this audio: {e}"))?;
        }
        Ok(())
    }

    pub fn position(&self) -> f64 {
        self.sink
            .as_ref()
            .map(|s| s.get_pos().as_secs_f64())
            .unwrap_or(0.0)
    }

    pub fn paused(&self) -> bool {
        self.sink.as_ref().is_none_or(|s| s.is_paused())
    }

    pub fn ended(&self) -> bool {
        self.sink.as_ref().is_some_and(|s| s.empty())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_local_pcm_wav_and_rejects_non_audio() {
        // 100 ms, 8 kHz mono 16-bit PCM; no audio device required.
        let samples = 800_u32;
        let mut bytes = Vec::new();
        bytes.extend_from_slice(b"RIFF");
        bytes.extend_from_slice(&(36 + samples * 2).to_le_bytes());
        bytes.extend_from_slice(b"WAVEfmt ");
        bytes.extend_from_slice(&16_u32.to_le_bytes());
        bytes.extend_from_slice(&1_u16.to_le_bytes());
        bytes.extend_from_slice(&1_u16.to_le_bytes());
        bytes.extend_from_slice(&8000_u32.to_le_bytes());
        bytes.extend_from_slice(&16000_u32.to_le_bytes());
        bytes.extend_from_slice(&2_u16.to_le_bytes());
        bytes.extend_from_slice(&16_u16.to_le_bytes());
        bytes.extend_from_slice(b"data");
        bytes.extend_from_slice(&(samples * 2).to_le_bytes());
        bytes.resize(bytes.len() + samples as usize * 2, 0);
        let decoder = Decoder::try_from(Cursor::new(bytes)).unwrap();
        assert_eq!(decoder.total_duration(), Some(Duration::from_millis(100)));
        assert_eq!(decoder.count(), samples as usize);
        assert!(Decoder::try_from(Cursor::new(b"not audio".to_vec())).is_err());
    }
}
