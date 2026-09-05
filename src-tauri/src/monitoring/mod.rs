// ---------------------------------------------------------------------------
// Background monitors — clipboard (800ms) + focus assist (2s) polls.
// ---------------------------------------------------------------------------
// Owns the polling threads that emit status-center events. lib.rs calls
// these from its `setup` closure, passing the shared `Arc<AtomicBool>`
// shutdown flag.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::Emitter;

use crate::types::{
    ClipboardContent, DownloadFolderStatus, FocusAssistStatePayload, NotificationSummaryPayload,
};

const STATUS_CENTER_CLIPBOARD_EVENT: &str = "status-center://clipboard-changed";
const STATUS_CENTER_FOCUS_ASSIST_EVENT: &str = "status-center://focus-assist-changed";
const STATUS_CENTER_NOTIFICATION_EVENT: &str = "status-center://notifications-changed";
const FOCUS_ASSIST_MONITOR_INTERVAL: std::time::Duration = std::time::Duration::from_secs(2);
const CLIPBOARD_POLL_INTERVAL: std::time::Duration = std::time::Duration::from_millis(800);
/// Spawns the clipboard polling thread. Every 800ms it reads the system
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
        let mut last_focus_code = "";
        let mut last_focus_controllable = false;
        let mut last_notif_active = false;
        loop {
            std::thread::sleep(FOCUS_ASSIST_MONITOR_INTERVAL);
            if shutdown.load(Ordering::Relaxed) {
                break;
            }
            let focus_state: FocusAssistStatePayload =
                crate::commands::focus::read_focus_assist_state();
            if focus_state.active != last_focus_active
                || focus_state.profile != last_profile
                || focus_state.code != last_focus_code
                || focus_state.controllable != last_focus_controllable
            {
                last_focus_active = focus_state.active;
                last_profile = focus_state.profile.clone();
                last_focus_code = focus_state.code;
                last_focus_controllable = focus_state.controllable;
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

// ---------------------------------------------------------------------------
// Download folder monitor (Windows only).
// ---------------------------------------------------------------------------
// Polls the user's Downloads folder and emits a privacy-safe
// `STATUS_CENTER_DOWNLOAD_CHANGED` event when the set of in-progress
// downloads changes. "In-progress" = files with a browser temp extension
// (.part, .crdownload, .tmp, .download, .opdownload). Progress is a coarse,
// self-adapting estimate — no byte-level accuracy, and no file paths or names
// ever leave the native boundary.

const STATUS_CENTER_DOWNLOAD_CHANGED: &str = "status-center://download-changed";
const DOWNLOAD_MONITOR_INTERVAL: std::time::Duration = std::time::Duration::from_millis(1000);
const TEMP_DOWNLOAD_EXTENSIONS: &[&str] =
    &[".part", ".crdownload", ".tmp", ".download", ".opdownload"];

/// Resolve the user's Downloads folder. On Windows we use %USERPROFILE%;
/// falling back to the home dir keeps the helper robust to profile redirects.
pub(crate) fn downloads_dir() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        if let Some(profile) = std::env::var_os("USERPROFILE") {
            return Some(PathBuf::from(profile).join("Downloads"));
        }
    }
    #[allow(deprecated)]
    std::env::home_dir().map(|home| home.join("Downloads"))
}

pub(crate) fn is_temp_download(name: &str) -> bool {
    let lower = name.to_lowercase();
    TEMP_DOWNLOAD_EXTENSIONS
        .iter()
        .any(|ext| lower.ends_with(ext))
}

fn scan_error_code(error: &std::io::Error) -> &'static str {
    if error.kind() == std::io::ErrorKind::PermissionDenied {
        "permission-denied"
    } else {
        "error"
    }
}

/// Snapshot the Downloads folder. File names and sizes remain native-only;
/// callers use the result to derive only a bounded active count and status.
pub(crate) fn scan_downloads(
    dir: &PathBuf,
) -> Result<(HashMap<String, u64>, u64, u32), &'static str> {
    let mut temps = HashMap::new();
    let mut largest_temp: u64 = 0;

    let entries = std::fs::read_dir(dir).map_err(|error| scan_error_code(&error))?;
    for entry in entries {
        let entry = entry.map_err(|error| scan_error_code(&error))?;
        let name = entry.file_name().to_string_lossy().to_string();
        if !is_temp_download(&name) {
            continue;
        }
        let size = entry
            .metadata()
            .map_err(|error| scan_error_code(&error))?
            .len();
        if size > largest_temp {
            largest_temp = size;
        }
        temps.insert(name, size);
    }

    let count = temps.len() as u32;
    Ok((temps, largest_temp, count))
}

/// Classifies a folder snapshot without inspecting or exposing any file name.
/// A temporary-file set disappearing is deliberately not called completion:
/// the filesystem alone cannot prove whether a browser finished, cancelled, or
/// failed the transfer.
pub(crate) fn classify_download_status(previous_active: bool, active_count: u32) -> &'static str {
    if previous_active && active_count == 0 {
        "ended_unknown"
    } else if active_count > 0 {
        "active"
    } else {
        "idle"
    }
}

/// Spawns the download-folder polling thread (Windows only). Emits a
/// `STATUS_CENTER_DOWNLOAD_CHANGED` event when the download state changes:
/// going idle -> active, the active count changing, or a download ending. The
/// folder observer cannot distinguish successful completion from cancellation
/// or failure, so an emptied temporary-file set is reported as `ended_unknown`.
#[cfg(windows)]
pub fn start_download_monitor(app_handle: tauri::AppHandle, shutdown: Arc<AtomicBool>) {
    std::thread::spawn(move || {
        let dir = match downloads_dir() {
            Some(dir) => dir,
            None => return,
        };

        let mut prev_status: &str = "idle";
        let mut prev_count: u32 = 0;
        let mut prev_temps: HashMap<String, u64> = HashMap::new();

        loop {
            if shutdown.load(Ordering::Relaxed) {
                break;
            }

            let scan = scan_downloads(&dir);
            let now = crate::unix_time_ms();

            let (temps, _largest_temp, count) = match scan {
                Ok(snapshot) => snapshot,
                Err(code) => {
                    if prev_status != "error" {
                        let event = DownloadFolderStatus {
                            status: "error",
                            active_downloads: 0,
                            progress: None,
                            progress_accuracy: "none",
                            controllable: false,
                            code,
                            checked_at: now,
                        };
                        let _ = app_handle.emit(STATUS_CENTER_DOWNLOAD_CHANGED, &event);
                        prev_status = "error";
                        prev_count = 0;
                        prev_temps = HashMap::new();
                    }
                    std::thread::sleep(DOWNLOAD_MONITOR_INTERVAL);
                    continue;
                }
            };

            let status = classify_download_status(!prev_temps.is_empty(), count);
            let ended = status == "ended_unknown";

            let status_changed = status != prev_status;
            let count_changed = count != prev_count;

            if status_changed || count_changed {
                let event = if ended {
                    // Emit a one-shot terminal observation, then reset tracking so
                    // the next poll returns to idle without re-emitting it.
                    DownloadFolderStatus {
                        status,
                        active_downloads: 0,
                        progress: None,
                        progress_accuracy: "none",
                        controllable: false,
                        code: "available",
                        checked_at: now,
                    }
                } else {
                    DownloadFolderStatus {
                        status,
                        active_downloads: count,
                        progress: None,
                        progress_accuracy: "none",
                        controllable: false,
                        code: "available",
                        checked_at: now,
                    }
                };
                let _ = app_handle.emit(STATUS_CENTER_DOWNLOAD_CHANGED, &event);

                prev_status = status;
                prev_count = count;
            }

            if ended {
                // Reset terminal tracking for the next download cycle.
                prev_temps = HashMap::new();
            } else {
                prev_temps = temps;
            }

            std::thread::sleep(DOWNLOAD_MONITOR_INTERVAL);
        }
    });
}

/// Non-Windows stub — download folder monitoring is unsupported off Windows.
#[cfg(not(windows))]
pub fn start_download_monitor(_app_handle: tauri::AppHandle, _shutdown: Arc<AtomicBool>) {}

#[cfg(test)]
mod tests {
    use super::{classify_download_status, is_temp_download, scan_downloads};
    use std::fs::{self, File};
    use std::path::PathBuf;

    #[test]
    fn classifies_download_lifecycle_conservatively() {
        assert_eq!(classify_download_status(false, 0), "idle");
        assert_eq!(classify_download_status(false, 2), "active");
        assert_eq!(classify_download_status(true, 1), "active");
        assert_eq!(classify_download_status(true, 0), "ended_unknown");
    }

    #[test]
    fn recognizes_browser_temporary_extensions_case_insensitively() {
        assert!(is_temp_download("video.CRDOWNLOAD"));
        assert!(is_temp_download("archive.part"));
        assert!(is_temp_download("payload.opdownload"));
        assert!(!is_temp_download("payload.zip"));
    }

    #[test]
    fn scans_only_temporary_downloads() {
        let path: PathBuf = std::env::temp_dir().join(format!(
            "glance-bar-download-monitor-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).expect("create temporary download folder");
        File::create(path.join("video.crdownload")).expect("create temporary download");
        File::create(path.join("finished.zip")).expect("create completed file");

        let (temps, _largest, count) =
            scan_downloads(&path).expect("scan temporary download folder");
        assert_eq!(count, 1);
        assert!(temps.contains_key("video.crdownload"));
        assert!(!temps.contains_key("finished.zip"));

        fs::remove_dir_all(path).expect("remove temporary download folder");
    }

    #[test]
    fn reports_an_unreadable_download_folder_instead_of_idle() {
        let path = std::env::temp_dir().join(format!(
            "glance-bar-download-monitor-missing-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&path);

        assert_eq!(scan_downloads(&path), Err("error"));
    }
}
