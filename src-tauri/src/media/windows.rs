// ---------------------------------------------------------------------------
// Windows Media Session (GSMTC) implementation — WinRT + MTA thread helpers.
// ---------------------------------------------------------------------------
// All GSMTC session-manager caching, async polling, and debug logging lives
// here so the shared thread spawner (../mod.rs) stays platform-agnostic.

use crate::types::*;
use std::time::Duration;

use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSessionManager,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus,
};

use super::PlatformMediaProvider;

/// Read the current media session status, caching the `SessionManager` across
/// calls so we do not re-request the WinRT async op on every poll tick.
fn read_media_session_status_at_cached(
    checked_at: u64,
    cache: &mut Option<GlobalSystemMediaTransportControlsSessionManager>,
) -> MediaSessionStatus {
    let timeout = Duration::from_secs(5);

    let manager: Option<GlobalSystemMediaTransportControlsSessionManager> =
        if let Some(manager) = cache.as_ref() {
            Some(manager.clone())
        } else {
            let fresh = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
                .ok()
                .and_then(|op| mta_wait_async(op, timeout).ok());
            if let Some(ref manager) = fresh {
                *cache = Some(manager.clone());
            }
            fresh
        };

    let Some(manager) = manager else {
        *cache = None;
        return MediaSessionStatus {
            available: false,
            playback_status: "unavailable",
            progress: 0,
            position_ms: None,
            duration_ms: None,
            title: String::new(),
            artist: String::new(),
            code: "provider-failed",
            checked_at,
        };
    };

    let session = match manager.GetCurrentSession() {
        Ok(s) => s,
        Err(_) => {
            *cache = None;
            return MediaSessionStatus {
                available: false,
                playback_status: "unavailable",
                progress: 0,
                position_ms: None,
                duration_ms: None,
                title: String::new(),
                artist: String::new(),
                code: "no-session",
                checked_at,
            };
        }
    };

    let playback_info = match session.GetPlaybackInfo() {
        Ok(i) => i,
        Err(_) => {
            return MediaSessionStatus {
                available: true,
                playback_status: "unavailable",
                progress: 0,
                position_ms: None,
                duration_ms: None,
                title: String::new(),
                artist: String::new(),
                code: "no-playback-info",
                checked_at,
            };
        }
    };

    let playback_status = match playback_info.PlaybackStatus() {
        Ok(s) => s,
        Err(_) => {
            return MediaSessionStatus {
                available: true,
                playback_status: "unavailable",
                progress: 0,
                position_ms: None,
                duration_ms: None,
                title: String::new(),
                artist: String::new(),
                code: "no-status",
                checked_at,
            };
        }
    };

    let timeline = match session.GetTimelineProperties() {
        Ok(t) => t,
        Err(_) => {
            return MediaSessionStatus {
                available: true,
                playback_status: playback_status_label(playback_status),
                progress: 0,
                position_ms: None,
                duration_ms: None,
                title: String::new(),
                artist: String::new(),
                code: "no-timeline",
                checked_at,
            };
        }
    };

    let position_ms = timeline
        .Position()
        .ok()
        .and_then(|t| duration_100ns_to_ms(t.Duration));
    let duration_ms = timeline
        .EndTime()
        .ok()
        .and_then(|t| duration_100ns_to_ms(t.Duration));
    let progress = match (position_ms, duration_ms) {
        (Some(position), Some(duration)) if duration > 0 => {
            crate::clamp_percent((position as f64 / duration as f64) * 100.0)
        }
        _ => 0,
    };
    let label = playback_status_label(playback_status);

    let (title, artist) = match session.TryGetMediaPropertiesAsync() {
        Ok(async_op) => match mta_wait_async(async_op, timeout) {
            Ok(props) => (
                props.Title().unwrap_or_default().to_string(),
                props.Artist().unwrap_or_default().to_string(),
            ),
            Err(_) => (String::new(), String::new()),
        },
        Err(_) => (String::new(), String::new()),
    };

    MediaSessionStatus {
        available: true,
        playback_status: label,
        progress,
        position_ms,
        duration_ms,
        title,
        artist,
        code: "available",
        checked_at,
    }
}

fn playback_status_label(
    status: GlobalSystemMediaTransportControlsSessionPlaybackStatus,
) -> &'static str {
    if status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing {
        "playing"
    } else {
        "paused"
    }
}

/// Poll a WinRT `IAsyncOperation` to completion on the MTA thread. The MTA
/// apartment lets the thread pool signal async completions without a dedicated
/// message pump.
pub fn mta_wait_async<T>(
    async_op: windows::Foundation::IAsyncOperation<T>,
    timeout: Duration,
) -> windows::core::Result<T>
where
    T: windows::core::RuntimeType + Clone + Send + 'static,
{
    use windows::core::Interface;
    use windows::Foundation::{AsyncStatus, IAsyncInfo};

    let info: IAsyncInfo = async_op.cast().map_err(|e| {
        append_media_log(&format!("[wait] cast to IAsyncInfo FAILED: {e}"));
        windows::core::Error::from(e.code())
    })?;

    let deadline = std::time::Instant::now() + timeout;
    loop {
        if let Ok(AsyncStatus::Completed) = info.Status() {
            return async_op.GetResults();
        }
        if std::time::Instant::now() >= deadline {
            append_media_log("[wait] TIMEOUT");
            return Err(windows::core::Error::from(windows::core::HRESULT(
                0x800705B4u32 as i32,
            )));
        }
        std::thread::sleep(Duration::from_millis(10));
    }
}

/// Append a line to the media debug log. Only writes in debug builds; in
/// release builds this is a no-op. Writes to the process temp dir (never a
/// hard-coded user path).
#[cfg(debug_assertions)]
pub(crate) fn append_media_log(msg: &str) {
    use std::io::Write;
    let path = std::env::temp_dir().join("glance-bar-media-debug.log");
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
    {
        let _ = writeln!(f, "{msg}");
    }
}

/// Release-build no-op counterpart of [`append_media_log`].
#[cfg(not(debug_assertions))]
pub(crate) fn append_media_log(_msg: &str) {}

/// Convert a 100-nanosecond interval to milliseconds. Returns `None` for
/// non-positive values.
fn duration_100ns_to_ms(value: i64) -> Option<u64> {
    if value <= 0 {
        return None;
    }
    Some((value as u64) / 10_000)
}

impl PlatformMediaProvider for WindowsMediaProvider {
    type Cache = GlobalSystemMediaTransportControlsSessionManager;

    fn read_status(cache: &mut Option<Self::Cache>, checked_at: u64) -> MediaSessionStatus {
        read_media_session_status_at_cached(checked_at, cache)
    }
}

/// Concrete Windows implementor of [`PlatformMediaProvider`].
pub struct WindowsMediaProvider;
