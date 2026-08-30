// ---------------------------------------------------------------------------
// Media provider module — WinRT/GSMTC media session handling.
// ---------------------------------------------------------------------------
// Owns the MTA media thread and the platform trait. The actual
// #[tauri::command] handlers live in crate::commands::media; the per-platform
// impls live in the windows/macos/linux sub-modules.

pub mod linux;
pub mod macos;
// `windows.rs` is pure WinRT/GSMTC code and the `windows` crate is a
// cfg(windows)-only dependency — compiling the file on other platforms
// fails on every `windows::*` path. Gate the module itself: non-Windows
// builds get their trait impls from macos.rs / linux.rs instead.
#[cfg(windows)]
pub mod windows;

use crate::types::*;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use std::time::Duration;

pub(super) const MEDIA_SESSION_EVENT: &str = "status-center://media-session-changed";
pub(super) const MEDIA_REFRESH_INTERVAL: Duration = Duration::from_secs(20);
pub(super) const MEDIA_POLL_INTERVAL: Duration = Duration::from_secs(1);

/// Platform media provider trait. Each OS back-end implements this to expose
/// the current media session status. The Windows impl caches the WinRT
/// `SessionManager` across calls; non-Windows impls return `unsupported`.
pub trait PlatformMediaProvider {
    /// Opaque per-platform cache (WinRT `SessionManager` on Windows, () elsewhere).
    type Cache;

    /// Read the current media session status, using `cache` to avoid
    /// redundant WinRT async ops on Windows.
    fn read_status(cache: &mut Option<Self::Cache>, checked_at: u64) -> MediaSessionStatus;
}

/// Spawn the WinRT MTA media thread. The thread owns the MTA apartment, polls
/// the current GSMTC session every [`MEDIA_POLL_INTERVAL`], re-emits on
/// meaningful changes or every [`MEDIA_REFRESH_INTERVAL`] while playing, and
/// routes `MediaRequest::Action` messages to
/// `crate::commands::media::execute_media_action`.
#[cfg(windows)]
pub fn start_mta_media_thread(
    app_handle: tauri::AppHandle,
    shutdown: Arc<AtomicBool>,
) -> Option<MediaRequestSender> {
    use std::sync::atomic::Ordering;
    use std::sync::mpsc as std_mpsc;
    use std::sync::Mutex;
    use tauri::Emitter;
    // Leading `::` disambiguates the external `windows` crate from our local
    // `media::windows` submodule.
    use ::windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};
    use windows_sys::Win32::System::Com::CoInitializeEx;
    use windows_sys::Win32::System::Com::COINIT_MULTITHREADED;

    let (request_tx, request_rx) = std_mpsc::channel::<MediaRequest>();
    let sender: MediaRequestSender = Arc::new(Mutex::new(request_tx));
    let sender_clone = Arc::clone(&sender);

    std::thread::Builder::new()
        .name("winrt-mta".into())
        .spawn(move || {
            unsafe {
                // SAFETY: runs on a dedicated STA/MTA thread; both calls are
                // idempotent and must happen before any WinRT calls.
                let _ = CoInitializeEx(std::ptr::null_mut(), COINIT_MULTITHREADED as u32);
                match RoInitialize(RO_INIT_MULTITHREADED) {
                    Ok(()) => windows::append_media_log("[media-thread] RoInitialize MTA OK"),
                    Err(e) => {
                        windows::append_media_log(&format!(
                            "[media-thread] RoInitialize MTA FAILED: {e}"
                        ));
                    }
                }
            }

            let mut last_available = false;
            let mut last_playback_status = String::new();
            let mut last_progress: u8 = 255;
            let mut last_title = String::new();
            let mut last_artist = String::new();
            let mut last_refresh_at: u64 = 0;
            let mut cache: Option<<windows::WindowsMediaProvider as PlatformMediaProvider>::Cache> =
                None;

            loop {
                while let Ok(MediaRequest::Action(action, reply_tx)) = request_rx.try_recv() {
                    let result = crate::commands::media::execute_media_action(&action);
                    let _ = reply_tx.send(result);
                }

                let status =
                    windows::WindowsMediaProvider::read_status(&mut cache, crate::unix_time_ms());

                let now_ms = crate::unix_time_ms();
                if status.available
                    && status.playback_status == "playing"
                    && now_ms.saturating_sub(last_refresh_at)
                        >= MEDIA_REFRESH_INTERVAL.as_millis() as u64
                {
                    last_refresh_at = now_ms;
                    let _ = app_handle.emit(MEDIA_SESSION_EVENT, &status);
                    windows::append_media_log("[refresh] re-emitted playing session");
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

/// Non-Windows stub — no media thread.
#[cfg(not(windows))]
pub fn start_mta_media_thread(
    _app_handle: tauri::AppHandle,
    _shutdown: Arc<AtomicBool>,
) -> Option<MediaRequestSender> {
    None
}
