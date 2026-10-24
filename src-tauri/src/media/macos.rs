// ---------------------------------------------------------------------------
// macOS Media Session stub — MediaPlayer.framework NowPlaying (Stage 6).
// ---------------------------------------------------------------------------

use super::PlatformMediaProvider;
use crate::types::MediaSessionStatus;

/// Read the current media session status. macOS is not yet supported; returns
/// an `unsupported` status.
fn read_media_session_status_at(checked_at: u64) -> MediaSessionStatus {
    MediaSessionStatus {
        available: false,
        playback_status: "unsupported",
        progress: 0,
        position_ms: None,
        duration_ms: None,
        title: String::new(),
        artist: String::new(),
        code: "unsupported",
        checked_at,
    }
}

/// Concrete macOS implementor of [`PlatformMediaProvider`].
pub struct MacosMediaProvider;

impl PlatformMediaProvider for MacosMediaProvider {
    type Cache = ();

    fn read_status(_cache: &mut Option<Self::Cache>, checked_at: u64) -> MediaSessionStatus {
        read_media_session_status_at(checked_at)
    }
}

/// Command-layer entry point: read the current media session through the
/// macOS provider. Mirrors `media::linux::read_current_status` so the
/// non-Windows command layer (`commands::media::get_media_session_status`)
/// always routes through the platform provider, keeping this module the
/// single source of the macOS payload as the capability grows.
pub fn read_current_status() -> MediaSessionStatus {
    let mut cache = None;
    MacosMediaProvider::read_status(&mut cache, crate::unix_time_ms())
}
