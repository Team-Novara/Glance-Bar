// Media provider module -- extracted from lib.rs.
// All WinRT/GSMTC media session handling lives here.

use crate::types::*;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{Emitter, State};

#[cfg(windows)]
use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSessionManager,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus,
};

#[cfg(windows)]
pub(super) const MEDIA_SESSION_EVENT: &str = "status-center://media-session-changed";

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

            loop {
                while let Ok(MediaRequest::Action(action, reply_tx)) = request_rx.try_recv() {
                    let result = execute_media_action(&action);
                    let _ = reply_tx.send(result);
                    // After a successful action, give GSMTC a brief moment
                    // to settle the new playbackStatus, then re-read and
                    // emit so the frontend's play/pause icon flips within
                    // ~150ms instead of waiting for the next change tick.
                    if result.is_ok() {
                        std::thread::sleep(Duration::from_millis(150));
                        let post_status = read_media_session_status();
                        last_available = post_status.available;
                        last_playback_status = post_status.playback_status.clone();
                        last_progress = post_status.progress;
                        last_title = post_status.title.clone();
                        last_artist = post_status.artist.clone();
                        let _ = app_handle.emit(MEDIA_SESSION_EVENT, &post_status);
                        append_media_log("[action] force-emit post-action status");
                    }
                }

                let status = read_media_session_status();

                let now_ms = super::unix_time_ms();
                if status.available
                    && status.playback_status == "playing"
                    && now_ms.saturating_sub(last_refresh_at)
                        >= MEDIA_REFRESH_INTERVAL.as_millis() as u64
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
                    last_playback_status = status.playback_status.clone();
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

                // 1s poll cadence — the cached SessionManager makes this
                // essentially free, and 1s resolution is plenty for the
                // 30s display window.
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
pub fn execute_media_action(action: &str) -> Result<MediaControlResult, String> {
    let timeout = std::time::Duration::from_secs(5);

    let async_op = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
        .map_err(|e| format!("media manager request failed: {e}"))?;
    let manager =
        mta_wait_async(async_op, timeout).map_err(|e| format!("media manager get failed: {e}"))?;

    let session = manager
        .GetCurrentSession()
        .map_err(|e| format!("no active media session: {e}"))?;

    let success = match action {
        "play-pause" => {
            let playback_info = session
                .GetPlaybackInfo()
                .map_err(|e| format!("playback info failed: {e}"))?;
            let is_playing = playback_info
                .PlaybackStatus()
                .map(|s| s == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing)
                .unwrap_or(false);

            if is_playing {
                let op = session
                    .TryPauseAsync()
                    .map_err(|e| format!("pause dispatch failed: {e}"))?;
                mta_wait_async(op, timeout).map_err(|e| format!("pause failed: {e}"))?
            } else {
                let op = session
                    .TryPlayAsync()
                    .map_err(|e| format!("play dispatch failed: {e}"))?;
                mta_wait_async(op, timeout).map_err(|e| format!("play failed: {e}"))?
            }
        }
        "next" => {
            let op = session
                .TrySkipNextAsync()
                .map_err(|e| format!("skip next dispatch failed: {e}"))?;
            mta_wait_async(op, timeout).map_err(|e| format!("skip next failed: {e}"))?
        }
        "previous" => {
            let op = session
                .TrySkipPreviousAsync()
                .map_err(|e| format!("skip previous dispatch failed: {e}"))?;
            mta_wait_async(op, timeout).map_err(|e| format!("skip previous failed: {e}"))?
        }
        _ => return Err(format!("unknown media action: {action}")),
    };

    Ok(MediaControlResult { success })
}

#[cfg(windows)]
#[tauri::command]
pub async fn get_media_session_status(
    sender: State<'_, MediaRequestSender>,
) -> Result<MediaSessionStatus, String> {
    let sender_clone: MediaRequestSender = sender.inner().clone();

    let result = tokio::time::timeout(
        Duration::from_secs(5),
        tauri::async_runtime::spawn_blocking(move || {
            use std::sync::mpsc as std_mpsc;
            let (reply_tx, reply_rx) = std_mpsc::channel();
            let tx = sender_clone
                .lock()
                .map_err(|_| "media sender lock poisoned".to_string())?;
            tx.send(MediaRequest::Read(reply_tx))
                .map_err(|_| "media thread channel closed".to_string())?;
            drop(tx);
            Ok::<MediaSessionStatus, String>(
                reply_rx
                    .recv_timeout(Duration::from_secs(5))
                    .unwrap_or_else(|_| MediaSessionStatus {
                        available: false,
                        playback_status: "unavailable",
                        progress: 0,
                        position_ms: None,
                        duration_ms: None,
                        title: String::new(),
                        artist: String::new(),
                        code: "sta-timeout",
                        checked_at: super::unix_time_ms(),
                    }),
            )
        }),
    )
    .await;

    match result {
        Ok(Ok(status)) => status,
        Ok(Err(e)) => Err(e.to_string()),
        Err(_) => Ok(MediaSessionStatus {
            available: false,
            playback_status: "unavailable",
            progress: 0,
            position_ms: None,
            duration_ms: None,
            title: String::new(),
            artist: String::new(),
            code: "async-timeout",
            checked_at: super::unix_time_ms(),
        }),
    }
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn get_media_session_status() -> Result<MediaSessionStatus, String> {
    Ok(MediaSessionStatus {
        available: false,
        playback_status: "unsupported",
        progress: 0,
        position_ms: None,
        duration_ms: None,
        title: String::new(),
        artist: String::new(),
        code: "unsupported",
        checked_at: super::unix_time_ms(),
    })
}

#[cfg(windows)]
#[tauri::command]
pub async fn media_control(
    action: String,
    sender: State<'_, MediaRequestSender>,
) -> Result<MediaControlResult, String> {
    let sender_clone: MediaRequestSender = sender.inner().clone();

    let result = tokio::time::timeout(
        Duration::from_secs(3),
        tauri::async_runtime::spawn_blocking(move || {
            use std::sync::mpsc as std_mpsc;
            let (reply_tx, reply_rx) = std_mpsc::channel();
            let tx = sender_clone
                .lock()
                .map_err(|_| "media sender lock poisoned".to_string())?;
            tx.send(MediaRequest::Action(action, reply_tx))
                .map_err(|_| "media thread channel closed".to_string())?;
            drop(tx);
            reply_rx
                .recv_timeout(Duration::from_secs(3))
                .map_err(|_| "media thread timed out".to_string())?
        }),
    )
    .await;

    match result {
        Ok(Ok(result)) => result,
        Ok(Err(e)) => Err(format!("media control spawn blocked: {e}")),
        Err(_) => Err("media control async timeout".to_string()),
    }
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn media_control(action: String) -> Result<MediaControlResult, String> {
    Err("media control is only supported on Windows".into())
}

fn read_media_session_status() -> MediaSessionStatus {
    read_media_session_status_at(super::unix_time_ms())
}

#[cfg(windows)]
fn read_media_session_status_at(checked_at: u64) -> MediaSessionStatus {
    match read_windows_media_session_status(checked_at) {
        Ok(status) => status,
        Err(e) => {
            append_media_log(&format!(
                "[result] read_windows_media_session_status FAILED: {e}"
            ));
            MediaSessionStatus {
                available: false,
                playback_status: "unavailable",
                progress: 0,
                position_ms: None,
                duration_ms: None,
                title: String::new(),
                artist: String::new(),
                code: "provider-failed",
                checked_at,
            }
        }
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
fn mta_wait_async<T>(
    async_op: windows::Foundation::IAsyncOperation<T>,
    timeout: std::time::Duration,
) -> windows::core::Result<T>
where
    T: windows::core::RuntimeType + Clone + Send + 'static,
{
    use std::sync::mpsc as std_mpsc;
    let (tx, rx) = std_mpsc::channel::<windows::core::Result<T>>();
    std::thread::Builder::new()
        .name("winrt-await".into())
        .spawn(move || {
            let result = async_op.GetResults();
            let _ = tx.send(result);
        })
        .expect("failed to spawn WinRT await worker");
    match rx.recv_timeout(timeout) {
        Ok(result) => result,
        Err(_) => {
            append_media_log("[wait] TIMEOUT");
            Err(windows::core::Error::from(windows::core::HRESULT(
                0x800705B4u32 as i32,
            )))
        }
    }
}

#[cfg(windows)]
#[allow(dead_code)]
fn pump_sta_messages(ms: u32) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        DispatchMessageW, PeekMessageW, TranslateMessage, MSG, PM_REMOVE, WM_QUIT,
    };

    let deadline = std::time::Instant::now() + std::time::Duration::from_millis(ms as u64);
    let mut msg: MSG = unsafe { std::mem::zeroed() };

    loop {
        if std::time::Instant::now() >= deadline {
            break;
        }

        let got = unsafe { PeekMessageW(&mut msg, std::ptr::null_mut(), 0, 0, PM_REMOVE) };

        if got != 0 {
            if msg.message == WM_QUIT {
                break;
            }
            unsafe {
                TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        } else {
            unsafe {
                windows_sys::Win32::System::Threading::SleepEx(
                    1,
                    windows_sys::Win32::Foundation::TRUE,
                );
            }
        }
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
fn read_windows_media_session_status(checked_at: u64) -> windows::core::Result<MediaSessionStatus> {
    let timeout = std::time::Duration::from_secs(5);

    append_media_log("[step] RequestAsync start");
    let async_op =
        GlobalSystemMediaTransportControlsSessionManager::RequestAsync().map_err(|e| {
            append_media_log(&format!("[step] RequestAsync FAILED: HRESULT={e}"));
            e
        })?;
    append_media_log(&format!(
        "[step] RequestAsync OK, op ptr={:?}",
        &async_op as *const _ as *const ()
    ));
    append_media_log("[step] sta_wait_async for manager");
    let manager = mta_wait_async(async_op, timeout).map_err(|e| {
        append_media_log(&format!("[step] sta_wait_async(manager) FAILED: {e}"));
        e
    })?;
    append_media_log("[step] GetCurrentSession start");
    let session = match manager.GetCurrentSession() {
        Ok(s) => {
            append_media_log("[step] GetCurrentSession OK");
            s
        }
        Err(e) => {
            append_media_log(&format!("[step] GetCurrentSession FAILED: HRESULT={e}"));
            return Err(e);
        }
    };
    append_media_log("[step] GetPlaybackInfo start");
    let playback_info = session.GetPlaybackInfo().map_err(|e| {
        append_media_log(&format!("[step] GetPlaybackInfo FAILED: HRESULT={e}"));
        e
    })?;
    let playback_status = playback_info.PlaybackStatus().map_err(|e| {
        append_media_log(&format!("[step] PlaybackStatus FAILED: HRESULT={e}"));
        e
    })?;
    append_media_log("[step] GetTimelineProperties start");
    let timeline = session.GetTimelineProperties().map_err(|e| {
        append_media_log(&format!("[step] GetTimelineProperties FAILED: HRESULT={e}"));
        e
    })?;
    let position_ms = duration_100ns_to_ms(
        timeline
            .Position()
            .map_err(|e| {
                append_media_log(&format!("[step] Position FAILED: HRESULT={e}"));
                e
            })?
            .Duration,
    );
    let duration_ms = duration_100ns_to_ms(
        timeline
            .EndTime()
            .map_err(|e| {
                append_media_log(&format!("[step] EndTime FAILED: HRESULT={e}"));
                e
            })?
            .Duration,
    );
    let progress = match (position_ms, duration_ms) {
        (Some(position), Some(duration)) if duration > 0 => {
            super::clamp_percent((position as f64 / duration as f64) * 100.0)
        }
        _ => 0,
    };
    let playback_status_label =
        if playback_status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing {
            "playing"
        } else {
            "paused"
        };

    let (title, artist) = match session.TryGetMediaPropertiesAsync() {
        Ok(async_op) => match mta_wait_async(async_op, timeout) {
            Ok(props) => {
                let t = props.Title().unwrap_or_default().to_string();
                let a = props.Artist().unwrap_or_default().to_string();
                (t, a)
            }
            Err(_) => (String::new(), String::new()),
        },
        Err(_) => (String::new(), String::new()),
    };

    append_media_log(&format!("[step] OK title='{title}' artist='{artist}' playback='{playback_status_label}' progress={progress}"));

    Ok(MediaSessionStatus {
        available: true,
        playback_status: playback_status_label,
        progress,
        position_ms,
        duration_ms,
        title,
        artist,
        code: "available",
        checked_at,
    })
}

#[cfg(windows)]
fn duration_100ns_to_ms(value: i64) -> Option<u64> {
    if value <= 0 {
        return None;
    }

    Some((value as u64) / 10_000)
}
