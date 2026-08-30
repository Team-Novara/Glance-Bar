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
