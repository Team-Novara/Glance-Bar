// ---------------------------------------------------------------------------
// Background monitors — clipboard (800ms) + focus assist (2s) polls.
// ---------------------------------------------------------------------------
// Owns the two polling threads that emit status-center events. lib.rs calls
// these from its `setup` closure, passing the shared `Arc<AtomicBool>`
// shutdown flag.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::Emitter;

use crate::types::{ClipboardContent, FocusAssistStatePayload, NotificationSummaryPayload};

const STATUS_CENTER_CLIPBOARD_EVENT: &str = "status-center://clipboard-changed";
const STATUS_CENTER_FOCUS_ASSIST_EVENT: &str = "status-center://focus-assist-changed";
const STATUS_CENTER_NOTIFICATION_EVENT: &str = "status-center://notifications-changed";
const FOCUS_ASSIST_MONITOR_INTERVAL: std::time::Duration = std::time::Duration::from_secs(2);
const CLIPBOARD_POLL_INTERVAL: std::time::Duration = std::time::Duration::from_millis(800);/// Spawns the clipboard polling thread. Every 800ms it reads the system
/// clipboard via `arboard` and emits a [`STATUS_CENTER_CLIPBOARD_EVENT`] when
/// non-empty text is detected. Exits its loop when `shutdown` is set.
pub fn start_clipboard_monitor(app_handle: tauri::AppHandle, shutdown: Arc<AtomicBool>) {
    std::thread::spawn(move || {
        let mut clipboard = match arboard::Clipboard::new() {
            Ok(c) => c,
            Err(_) => return,
        };
        loop {
            std::thread::sleep(CLIPBOARD_POLL_INTERVAL);
            if shutdown.load(Ordering::Relaxed) {
                break;
            }
            if let Ok(text) = clipboard.get_text() {
                if !text.is_empty() {
                    let payload = ClipboardContent {
                        text,
                        source_app: String::new(),
                        copied_at: crate::unix_time_ms(),
                    };
                    let _ = app_handle.emit(STATUS_CENTER_CLIPBOARD_EVENT, &payload);
                }
            }
        }
    });
}

/// Spawns the focus-assist polling thread. Every 2s it reads the Windows
/// QuietHours registry state and emits [`STATUS_CENTER_FOCUS_ASSIST_EVENT`]
/// when active/profile changes, plus [`STATUS_CENTER_NOTIFICATION_EVENT`]
/// when the active flag toggles. Exits its loop when `shutdown` is set.
pub fn start_focus_monitor(app_handle: tauri::AppHandle, shutdown: Arc<AtomicBool>) {
    std::thread::spawn(move || {
        let mut last_focus_active = false;
        let mut last_profile = String::new();
        let mut last_notif_active = false;
        loop {
            std::thread::sleep(FOCUS_ASSIST_MONITOR_INTERVAL);
            if shutdown.load(Ordering::Relaxed) {
                break;
            }
            let focus_state: FocusAssistStatePayload = crate::commands::focus::read_focus_assist_state();
            if focus_state.active != last_focus_active || focus_state.profile != last_profile {
                last_focus_active = focus_state.active;
                last_profile = focus_state.profile.clone();
                let _ = app_handle.emit(STATUS_CENTER_FOCUS_ASSIST_EVENT, &focus_state);
            }
            if focus_state.active != last_notif_active {
                last_notif_active = focus_state.active;
                let summary = NotificationSummaryPayload {
                    focus_assist_active: focus_state.active,
                    checked_at: crate::unix_time_ms(),
                };
                let _ = app_handle.emit(STATUS_CENTER_NOTIFICATION_EVENT, &summary);
            }
        }
    });
}

/// Spawns the WinRT MTA media thread (Windows only) and registers its request
/// channel in Tauri state so `commands::media` handlers can route IPC requests
/// to it. No-op on other platforms.
#[cfg(windows)]
pub fn start_media_monitor(app_handle: &tauri::AppHandle, shutdown: Arc<AtomicBool>) {
    use tauri::Manager;

    if let Some(media_sender) = crate::media::start_mta_media_thread(app_handle.clone(), shutdown) {
        app_handle.manage(media_sender);
    }
}

/// Non-Windows stub — no media thread available.
#[cfg(not(windows))]
pub fn start_media_monitor(_app_handle: &tauri::AppHandle, _shutdown: Arc<AtomicBool>) {}
