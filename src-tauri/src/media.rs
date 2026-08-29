// ---------------------------------------------------------------------------
// Media provider module — WinRT/GSMTC media session handling.
// ---------------------------------------------------------------------------
// Owns the MTA media thread and all WinRT async helpers. The actual
// #[tauri::command] handlers live in crate::commands::media.

use crate::types::*;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::Emitter;

#[cfg(windows)]
use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSessionManager,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus,
};

pub(super) const MEDIA_SESSION_EVENT: &str = "status-center://media-session-changed";
pub(super) const MEDIA_REFRESH_INTERVAL: Duration = Duration::from_secs(20);
pub(super) const MEDIA_POLL_INTERVAL: Duration = Duration::from_secs(1);

#[cfg(windows)]
pub fn start_mta_media_thread(
    app_handle: tauri::AppHandle,
    shutdown: Arc<AtomicBool>,
) -> Option<MediaRequestSender> {
    use std::sync::mpsc as std_mpsc;
    use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};
    use windows_sys::Win32::System::Com::CoInitializeEx;
    use windows_sys::Win32::System::Com::COINIT_MULTITHREADED;

    let (request_tx, request_rx) = std_mpsc::channel::<MediaRequest>();
    let sender: MediaRequestSender = Arc::new(Mutex::new(request_tx));
    let sender_clone = Arc::clone(&sender);

    std::thread::Builder::new()
        .name("winrt-mta".into())
        .spawn(move || {
            unsafe {
                let _ = CoInitializeEx(std::ptr::null_mut(), COINIT_MULTITHREADED as u32);
                match RoInitialize(RO_INIT_MULTITHREADED) {
                    Ok(()) => append_media_log("[media-thread] RoInitialize MTA OK"),
                    Err(e) => {
                        append_media_log(&format!("[media-thread] RoInitialize MTA FAILED: {e}"))
                    }
                }
            }

            let mut last_available = false;
            let mut last_playback_status = String::new();
            let mut last_progress: u8 = 255;
            let mut last_title = String::new();
            let mut last_artist = String::new();
            let mut last_refresh_at: u64 = 0;
            let mut cached_manager: Option<GlobalSystemMediaTransportControlsSessionManager> = None;

            loop {
                while let Ok(MediaRequest::Action(action, reply_tx)) = request_rx.try_recv() {
                    let result = crate::commands::media::execute_media_action(&action);
                    let _ = reply_tx.send(result);
                }

                let status = read_media_session_status_with_cache(&mut cached_manager);

                let now_ms = crate::unix_time_ms();
                if status.available
                    && status.playback_status == "playing"
                    && now_ms.saturating_sub(last_refresh_at) >= MEDIA_REFRESH_INTERVAL.as_millis() as u64
                {
                    last_refresh_at = now_ms;
                    let _ = app_handle.emit(MEDIA_SESSION_EVENT, &status);
                    append_media_log("[refresh] re-emitted playing session");
                }

                let changed = status.available != last_available
                    || status.playback_status != last_playback_status
                    || status.progress.abs_diff(last_progress) > 1
                    || status.title != last_title
                    || status.artist != last_artist;

                if changed {
                    last_available = status.available;
                    last_playback_status = status.playback_status.to_string();
                    last_progress = status.progress;
                    last_title = status.title.clone();
                    last_artist = status.artist.clone();
                    let _ = app_handle.emit(MEDIA_SESSION_EVENT, &status);
                }

                while let Ok(MediaRequest::Read(reply_tx)) = request_rx.try_recv() {
                    let _ = reply_tx.send(status.clone());
                }

                if shutdown.load(Ordering::Relaxed) {
                    break;
                }

                std::thread::sleep(MEDIA_POLL_INTERVAL);
            }
        })
        .expect("failed to spawn WinRT media thread");

    Some(sender_clone)
}

#[cfg(not(windows))]
pub fn start_mta_media_thread(
    _app_handle: tauri::AppHandle,
    _shutdown: Arc<AtomicBool>,
) -> Option<MediaRequestSender> {
    None
}

#[cfg(windows)]
fn read_media_session_status_with_cache(
    cache: &mut Option<GlobalSystemMediaTransportControlsSessionManager>,
) -> MediaSessionStatus {
    read_media_session_status_at_cached(crate::unix_time_ms(), cache)
}

#[cfg(windows)]
fn read_media_session_status_at_cached(
    checked_at: u64,
    cache: &mut Option<GlobalSystemMediaTransportControlsSessionManager>,
) -> MediaSessionStatus {
    let timeout = std::time::Duration::from_secs(5);

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

    let position_ms = timeline.Position().ok().and_then(|t| duration_100ns_to_ms(t.Duration));
    let duration_ms = timeline.EndTime().ok().and_then(|t| duration_100ns_to_ms(t.Duration));
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

#[cfg(not(windows))]
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

#[cfg(windows)]
fn playback_status_label(
    status: GlobalSystemMediaTransportControlsSessionPlaybackStatus,
) -> &'static str {
    if status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing {
        "playing"
    } else {
        "paused"
    }
}

#[cfg(windows)]
pub fn mta_wait_async<T>(
    async_op: windows::Foundation::IAsyncOperation<T>,
    timeout: std::time::Duration,
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
            return Err(windows::core::Error::from(windows::core::HRESULT(0x800705B4u32 as i32)));
        }
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
}

#[cfg(windows)]
fn append_media_log(msg: &str) {
    use std::io::Write;
    let path = r"C:\Users\jay\Desktop\media-debug.log";
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
    {
        let _ = writeln!(f, "{msg}");
    }
}

#[cfg(windows)]
fn duration_100ns_to_ms(value: i64) -> Option<u64> {
    if value <= 0 {
        return None;
    }

    Some((value as u64) / 10_000)
}
