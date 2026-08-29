mod types;
#[cfg(windows)]
#[allow(dead_code)] // Functions exposed for tests and Tauri command handlers; some are conditionally used.
mod window;
pub use crate::types::*;

use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use sysinfo::{Networks, System};
use tauri::menu::{CheckMenuItemBuilder, Menu, MenuBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager, PhysicalPosition, Position, State, WebviewWindow, WindowEvent};
#[cfg(not(any(target_os = "android", target_os = "ios")))]
use tauri_plugin_global_shortcut::ShortcutState;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
use tauri_plugin_autostart::MacosLauncher;

#[cfg(windows)]
use windows_sys::Win32::{
  Foundation::{HWND, RECT},
  Graphics::{
    Dwm::{
      DwmSetWindowAttribute, DWMWA_WINDOW_CORNER_PREFERENCE,
      DWMWCP_DONOTROUND,
    },
    Gdi::{
      GetMonitorInfoW, MonitorFromWindow, MONITORINFO,
      MONITOR_DEFAULTTONEAREST,
    },
  },
  UI::{
    WindowsAndMessaging::{
      GetClassNameW, GetDesktopWindow, GetForegroundWindow,
      GetShellWindow, GetWindowLongW, GetWindowRect, GetWindowThreadProcessId, IsWindowVisible,
      SetWindowLongW, SetWindowPos, GWL_EXSTYLE, HWND_BOTTOM, HWND_TOPMOST,
      SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW, WS_EX_APPWINDOW,
      WS_EX_TOOLWINDOW,
    },
  },
};

// DWMWA_SYSTEMBACKDROP_TYPE — disables Mica/Acrylic backdrop (Win11 22H2+)
#[cfg(windows)]
const DWMWA_SYSTEMBACKDROP_TYPE: u32 = 38;
#[cfg(windows)]
const DWMSBT_NONE: u32 = 1;

#[cfg(windows)]
use windows::Media::Control::{
  GlobalSystemMediaTransportControlsSessionManager,
  GlobalSystemMediaTransportControlsSessionPlaybackStatus,
};

#[cfg(windows)]
/// Spawns a dedicated MTA (Multi-Threaded Apartment) thread for WinRT media calls.
///
/// **Why MTA?**
/// C++/WinRT's standard pattern uses `init_apartment(multi_threaded)` which maps to
/// `RoInitialize(RO_INIT_MULTITHREADED)`. On an MTA thread, WinRT async operations
/// complete via thread pool callbacks WITHOUT requiring a Win32 message pump.
/// This is simpler and more reliable than STA approaches that need manual message pumping.
/// (STA dispatch goes to a per-thread GUI window — a fresh hidden window we create
/// per call will never receive those completions, which is why the previous STA
/// implementation always timed out at 5s with HRESULT 0x800705B4.)
///
/// Returns `Some(sender)` on Windows, `None` elsewhere.
#[cfg(windows)]
fn start_mta_media_thread(
  app_handle: tauri::AppHandle,
  shutdown: Arc<AtomicBool>,
) -> Option<MediaRequestSender> {
  use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};
  use windows_sys::Win32::System::Com::CoInitializeEx;
  use windows_sys::Win32::System::Com::COINIT_MULTITHREADED;
  use std::sync::mpsc as std_mpsc;

  let (request_tx, request_rx) = std_mpsc::channel::<MediaRequest>();
  let sender: MediaRequestSender = Arc::new(Mutex::new(request_tx));
  let sender_clone = Arc::clone(&sender);

  std::thread::Builder::new()
    .name("winrt-mta".into())
    .spawn(move || {
      // Initialize both COM and WinRT as Multi-Threaded Apartment. On MTA,
      // `IAsyncOperation::GetResults()` blocks on a kernel event that the
      // thread pool signals when the operation completes — no message pump.
      unsafe {
        let _ = CoInitializeEx(std::ptr::null_mut(), COINIT_MULTITHREADED as u32);
        match RoInitialize(RO_INIT_MULTITHREADED) {
          Ok(()) => append_media_log("[media-thread] RoInitialize MTA OK"),
          Err(e) => append_media_log(&format!("[media-thread] RoInitialize MTA FAILED: {e}")),
        }
      }

      // --- Monitor state for change detection ---
      let mut last_available = false;
      let mut last_playback_status = String::new();
      let mut last_progress: u8 = 255;
      let mut last_title = String::new();
      let mut last_artist = String::new();

      // Refresh timer state: tracks when we last re-emitted a playing session.
      let mut last_refresh_at: u64 = 0;

      // Cache the SessionManager across iterations — RequestAsync is
      // the most expensive call in the read cycle (~50-200ms), so we
      // avoid re-creating it every 50ms. We only re-create when the
      // cached manager fails or when no session is available.
      let mut cached_manager: Option<
        windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager,
      > = None;

      loop {
        // 1. Handle pending requests: actions first, then refreshes.
        while let Ok(MediaRequest::Action(action, reply_tx)) = request_rx.try_recv() {
          let result = execute_media_action(&action);
          let _ = reply_tx.send(result);
        }

        // 2. Read status once per cycle, reusing the cached manager.
        let status = read_media_session_status_with_cache(&mut cached_manager);

        // 2a. Periodic refresh: when a session is playing and the refresh interval
        // has elapsed, re-emit the status so the frontend expiry window resets.
        let now_ms = unix_time_ms();
        if status.available && status.playback_status == "playing"
          && now_ms.saturating_sub(last_refresh_at) >= MEDIA_REFRESH_INTERVAL.as_millis() as u64
        {
          last_refresh_at = now_ms;
          let _ = app_handle.emit(STATUS_CENTER_MEDIA_SESSION_EVENT, &status);
          append_media_log("[refresh] re-emitted playing session");
        }

        append_media_log(&format!(
          "[iter] avail={} status='{}' title='{}' code='{}'",
          status.available, status.playback_status, status.title, status.code
        ));

        let changed = status.available != last_available
          || status.playback_status != last_playback_status
          || status.progress.abs_diff(last_progress) > 0
          || status.title != last_title
          || status.artist != last_artist;

        if changed {
          last_available = status.available;
          last_playback_status = status.playback_status.to_string();
          last_progress = status.progress;
          last_title = status.title.clone();
          last_artist = status.artist.clone();
          let _ = app_handle.emit(STATUS_CENTER_MEDIA_SESSION_EVENT, &status);
        }

        // 3. Drain all pending Read requests, replying with the status we just read.
        while let Ok(MediaRequest::Read(reply_tx)) = request_rx.try_recv() {
          let _ = reply_tx.send(status.clone());
        }

        // 4. Shutdown check.
        if shutdown.load(Ordering::Relaxed) {
          break;
        }

        // 5. Sleep briefly to yield CPU. Tighter than before so the
        // frontend sees pause / track-change within ~100-200ms instead
        // of the previous ~500ms+.
        std::thread::sleep(Duration::from_millis(20));
      }
    })
    .expect("failed to spawn WinRT media thread");

  Some(sender_clone)
}

#[cfg(not(windows))]
fn start_mta_media_thread(
  _app_handle: tauri::AppHandle,
  _shutdown: Arc<AtomicBool>,
) -> Option<Arc<Mutex<std::sync::mpsc::Sender<()>>>> {
  None
}

/// Execute a media-control action on the STA thread using SetCompleted+message pump.
#[cfg(windows)]
fn execute_media_action(action: &str) -> Result<MediaControlResult, String> {
  let timeout = std::time::Duration::from_secs(5);

  let async_op = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
    .map_err(|e| format!("media manager request failed: {e}"))?;
  let manager = mta_wait_async(async_op, timeout)
    .map_err(|e| format!("media manager get failed: {e}"))?;

  let session = manager
    .GetCurrentSession()
    .map_err(|e| format!("no active media session: {e}"))?;

  let success = match action {
    "play-pause" => {
      let playback_info = session.GetPlaybackInfo()
        .map_err(|e| format!("playback info failed: {e}"))?;
      let is_playing = playback_info.PlaybackStatus()
        .map(|s| s == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing)
        .unwrap_or(false);

      if is_playing {
        let op = session.TryPauseAsync()
          .map_err(|e| format!("pause dispatch failed: {e}"))?;
        sta_wait_async(op, timeout)
          .map_err(|e| format!("pause failed: {e}"))?
      } else {
        let op = session.TryPlayAsync()
          .map_err(|e| format!("play dispatch failed: {e}"))?;
        sta_wait_async(op, timeout)
          .map_err(|e| format!("play failed: {e}"))?
      }
    }
    "next" => {
      let op = session.TrySkipNextAsync()
        .map_err(|e| format!("skip next dispatch failed: {e}"))?;
      sta_wait_async(op, timeout)
        .map_err(|e| format!("skip next failed: {e}"))?
    }
    "previous" => {
      let op = session.TrySkipPreviousAsync()
        .map_err(|e| format!("skip previous dispatch failed: {e}"))?;
      sta_wait_async(op, timeout)
        .map_err(|e| format!("skip previous failed: {e}"))?
    }
    _ => return Err(format!("unknown media action: {action}")),
  };

  Ok(MediaControlResult { success })
}

const STATUS_WINDOW_EDGE_MARGIN: i32 = 8;
const STATUS_WINDOW_LABEL: &str = "main";
const STATUS_CENTER_MENU_ACTION_EVENT: &str = "status-center://menu-action";
const STATUS_CENTER_SETTINGS_EVENT: &str = "status-center://settings";
const STATUS_CENTER_OPEN_SETTINGS_EVENT: &str = "status-center://open-settings";
const STATUS_CENTER_CLIPBOARD_EVENT: &str = "status-center://clipboard-changed";
const STATUS_CENTER_FOCUS_ASSIST_EVENT: &str = "status-center://focus-assist-changed";
const STATUS_CENTER_NOTIFICATION_EVENT: &str = "status-center://notifications-changed";
const STATUS_CENTER_MEDIA_SESSION_EVENT: &str = "status-center://media-session-changed";
const FOCUS_ASSIST_MONITOR_INTERVAL: Duration = Duration::from_secs(2);
const TRAY_ID: &str = "status-center-tray";
const PREFERENCES_FILE_NAME: &str = "status-center-preferences.json";
const MENU_REFRESH_DATA: &str = "refresh-data";
const MENU_ALWAYS_FLOAT: &str = "always-float";
const MENU_AVOID_FULLSCREEN: &str = "avoid-fullscreen";
const MENU_LOCK_POSITION: &str = "lock-position";
const MENU_RESET_POSITION: &str = "reset-position";
const MENU_OPEN_SETTINGS: &str = "open-settings";
const MENU_QUIT: &str = "quit";
const TRAY_MENU_SHOW_STATUS_CENTER: &str = "tray-show-status-center";
const TRAY_MENU_OPEN_SETTINGS: &str = "tray-open-settings";
const GLOBAL_SHORTCUT_RECALL: &str = "Alt+Shift+Space";


#[cfg(windows)]
#[tauri::command]
async fn get_media_session_status(
  sender: State<'_, MediaRequestSender>,
) -> Result<MediaSessionStatus, String> {
  // Clone the Arc out of State synchronously so we don't borrow across the async boundary.
use std::sync::mpsc as std_mpsc;
  let sender_clone: MediaRequestSender = sender.inner().clone();
  let (reply_tx, reply_rx) = std_mpsc::channel();
  let tx = sender_clone
    .lock()
    .map_err(|_| "media sender lock poisoned".to_string())?;
  tx.send(MediaRequest::Read(reply_tx))
    .map_err(|_| "STA media thread channel closed".to_string())?;
  drop(tx); // release lock before blocking
  Ok(
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
        checked_at: unix_time_ms(),
      }),
  )
}

#[cfg(not(windows))]
#[tauri::command]
async fn get_media_session_status() -> Result<MediaSessionStatus, String> {
  Ok(MediaSessionStatus {
    available: false,
    playback_status: "unsupported",
    progress: 0,
    position_ms: None,
    duration_ms: None,
    title: String::new(),
    artist: String::new(),
    code: "unsupported",
    checked_at: unix_time_ms(),
  })
}

#[tauri::command]
fn open_url_in_browser(url: String) -> Result<(), String> {
  // Validate that the URL uses http or https scheme
  if !url.starts_with("http://") && !url.starts_with("https://") {
    return Err("only http/https URLs are allowed".into());
  }
  // Use explorer.exe — the most reliable way to open URLs on Windows.
  // It delegates to the registered default browser handler.
  std::process::Command::new("explorer")
    .arg(&url)
    .spawn()
    .map_err(|e| format!("failed to open URL: {e}"))?;
  Ok(())
}

#[tauri::command]
fn get_clipboard_content() -> Result<ClipboardContent, String> {
  let mut clipboard = arboard::Clipboard::new().map_err(|e| format!("clipboard init failed: {e}"))?;
  let text = clipboard.get_text().map_err(|e| format!("clipboard read failed: {e}"))?;
  let source_app = String::new(); // arboard does not expose source app

  Ok(ClipboardContent {
    text,
    source_app,
    copied_at: unix_time_ms(),
  })
}

#[tauri::command]
fn set_clipboard_content(text: String) -> Result<(), String> {
  let mut clipboard = arboard::Clipboard::new().map_err(|e| format!("clipboard init failed: {e}"))?;
  clipboard.set_text(&text).map_err(|e| format!("clipboard write failed: {e}"))?;
  Ok(())
}

#[cfg(windows)]
#[tauri::command]
async fn media_control(
  action: String,
  sender: State<'_, MediaRequestSender>,
) -> Result<MediaControlResult, String> {
  // Clone the Arc out of State synchronously so we don't borrow across the async boundary.
use std::sync::mpsc as std_mpsc;
  let sender_clone: MediaRequestSender = sender.inner().clone();
  let (reply_tx, reply_rx) = std_mpsc::channel();
  let tx = sender_clone
    .lock()
    .map_err(|_| "media sender lock poisoned".to_string())?;
  tx.send(MediaRequest::Action(action, reply_tx))
    .map_err(|_| "STA media thread channel closed".to_string())?;
  drop(tx); // release lock before blocking
  let result: MediaControlResult = reply_rx
    .recv_timeout(Duration::from_secs(5))
    .map_err(|_| "STA media thread timed out".to_string())?
    .map_err(|e| format!("media action failed: {e}"))?;

  // The media thread itself now force-emits a post-action snapshot inside
  // its action handler (see media.rs start_mta_media_thread). That emit
  // happens on the media thread, so we don't need a second emit here —
  // doing two would race the next 1s poll and can drop the user's
  // optimistic click.
  Ok(result)
}

#[cfg(not(windows))]
#[tauri::command]
async fn media_control(action: String) -> Result<MediaControlResult, String> {
  Err("media control is only supported on Windows".into())
}

// ---------- Focus Assist Detection (Windows Registry) ----------

#[cfg(windows)]
fn read_focus_assist_state() -> FocusAssistStatePayload {
  use winreg::enums::{HKEY_CURRENT_USER, KEY_READ};
  use winreg::RegKey;

  let active = RegKey::predef(HKEY_CURRENT_USER)
    .open_subkey_with_flags(r"Software\Microsoft\Windows\CurrentVersion\QuietHours", KEY_READ)
    .and_then(|key| key.get_value::<u32, _>("NFPEnabled"))
    .map(|v| v == 1)
    .unwrap_or(false);

  let profile = RegKey::predef(HKEY_CURRENT_USER)
    .open_subkey_with_flags(r"Software\Microsoft\Windows\CurrentVersion\QuietHours", KEY_READ)
    .and_then(|key| key.get_value::<String, _>("Profile"))
    .unwrap_or_default();

  FocusAssistStatePayload {
    active,
    profile,
    checked_at: unix_time_ms(),
  }
}

#[cfg(not(windows))]
fn read_focus_assist_state() -> FocusAssistStatePayload {
  FocusAssistStatePayload {
    active: false,
    profile: String::new(),
    checked_at: unix_time_ms(),
  }
}

#[tauri::command]
fn get_focus_assist_state() -> FocusAssistStatePayload {
  read_focus_assist_state()
}

#[cfg(windows)]
fn write_focus_assist_enabled(enabled: bool) -> Result<(), String> {
  use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_SET_VALUE};
  use winreg::RegKey;
  let hkcu = RegKey::predef(HKEY_CURRENT_USER);
  let (key, _) = hkcu
    .create_subkey_with_flags(
      r"Software\Microsoft\Windows\CurrentVersion\QuietHours",
      KEY_READ | KEY_SET_VALUE,
    )
    .map_err(|e| format!("failed to open QuietHours key: {e}"))?;
  let value: u32 = if enabled { 1 } else { 0 };
  key.set_value("NFPEnabled", &value)
    .map_err(|e| format!("failed to write NFPEnabled: {e}"))?;
  Ok(())
}

#[cfg(not(windows))]
fn write_focus_assist_enabled(_enabled: bool) -> Result<(), String> {
  Err("focus assist control is only supported on Windows".into())
}

#[tauri::command]
fn stop_focus_session() -> Result<MediaControlResult, String> {
  write_focus_assist_enabled(false)?;
  Ok(MediaControlResult { success: true })
}

#[tauri::command]
fn pause_download() -> Result<DownloadControlResult, String> {
  // TODO not-implemented: real provider pending (code: not-implemented)
  Ok(DownloadControlResult { success: false })
}

#[tauri::command]
fn resume_download() -> Result<DownloadControlResult, String> {
  // TODO not-implemented: real provider pending (code: not-implemented)
  Ok(DownloadControlResult { success: false })
}

#[tauri::command]
fn cancel_download() -> Result<DownloadControlResult, String> {
  // TODO not-implemented: real provider pending (code: not-implemented)
  Ok(DownloadControlResult { success: false })
}

#[tauri::command]
fn install_update() -> Result<DownloadControlResult, String> {
  // TODO not-implemented: real provider pending (code: not-implemented)
  Ok(DownloadControlResult { success: false })
}

#[tauri::command]
fn dismiss_notification() -> Result<DownloadControlResult, String> {
  // TODO not-implemented: real provider pending (code: not-implemented)
  Ok(DownloadControlResult { success: false })
}

// ---------- Notification Summary (Windows Registry) ----------

#[cfg(windows)]
fn read_notification_summary() -> NotificationSummaryPayload {
  let focus = read_focus_assist_state();

  NotificationSummaryPayload {
    focus_assist_active: focus.active,
    checked_at: unix_time_ms(),
  }
}

#[cfg(not(windows))]
fn read_notification_summary() -> NotificationSummaryPayload {
  NotificationSummaryPayload {
    focus_assist_active: false,
    checked_at: unix_time_ms(),
  }
}

#[tauri::command]
fn get_notification_summary() -> NotificationSummaryPayload {
  read_notification_summary()
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
fn get_autostart_enabled(
  autostart: tauri::State<'_, tauri_plugin_autostart::AutoLaunchManager>,
) -> bool {
  autostart.is_enabled().unwrap_or(false)
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
fn set_autostart_enabled(
  autostart: tauri::State<'_, tauri_plugin_autostart::AutoLaunchManager>,
  enabled: bool,
) -> Result<(), String> {
  if enabled {
    autostart.enable().map_err(|e| format!("enable autostart failed: {e}"))?;
  } else {
    autostart.disable().map_err(|e| format!("disable autostart failed: {e}"))?;
  }
  Ok(())
}

#[tauri::command]
async fn get_system_performance(
  state: tauri::State<'_, SharedDesktopProductState<tauri::Wry>>,
) -> Result<SystemPerformanceSnapshot, String> {
  let (cpu, memory) = tauri::async_runtime::spawn_blocking(|| {
    let mut system = System::new_all();

    system.refresh_cpu();
    std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
    system.refresh_cpu();
    system.refresh_memory();

    let cpu = clamp_percent(system.global_cpu_info().cpu_usage() as f64);
    let memory = if system.total_memory() == 0 {
      0
    } else {
      clamp_percent((system.used_memory() as f64 / system.total_memory() as f64) * 100.0)
    };

    (cpu, memory)
  })
  .await
  .map_err(|e| format!("spawn_blocking failed: {e}"))?;

  let (download_speed, upload_speed) = sample_network_speeds(&state);

  Ok(SystemPerformanceSnapshot { cpu, memory, download_speed, upload_speed })
}

#[tauri::command]
fn get_overlay_policy(state: tauri::State<'_, SharedDesktopProductState<tauri::Wry>>) -> OverlayPolicy {
  let foreground_fullscreen = foreground_window_is_fullscreen();
  let avoid_fullscreen = state
    .lock()
    .map(|state| state.preferences.avoid_fullscreen)
    .unwrap_or(true);
  let should_float = if avoid_fullscreen {
    !foreground_fullscreen
  } else {
    true
  };

  OverlayPolicy {
    foreground_fullscreen,
    should_float,
  }
}

#[tauri::command]
fn set_status_window_floating(window: WebviewWindow, floating: bool) -> Result<(), String> {
  apply_status_window_tool_style(&window)?;

  if floating {
    #[cfg(not(windows))]
    window.show().map_err(|error| error.to_string())?;

    #[cfg(not(windows))]
    window
      .set_always_on_top(true)
      .map_err(|error| error.to_string())?;

    set_status_window_z_order(&window, true)?;
  } else {
    set_status_window_z_order(&window, false)?;

    #[cfg(not(windows))]
    window
      .set_always_on_top(false)
      .map_err(|error| error.to_string())?;

    #[cfg(not(windows))]
    window.hide().map_err(|error| error.to_string())?;
  }

  Ok(())
}

#[tauri::command]
fn correct_status_window_position(window: WebviewWindow) -> Result<WindowPositionCorrection, String> {
  correct_status_window_position_for_window(&window)
}

fn correct_status_window_position_for_window<R: tauri::Runtime>(
  window: &WebviewWindow<R>,
) -> Result<WindowPositionCorrection, String> {
  let position = window.outer_position().map_err(|error| error.to_string())?;
  let size = window.outer_size().map_err(|error| error.to_string())?;
  let monitors = window.available_monitors().map_err(|error| error.to_string())?;
  let width = size.width.min(i32::MAX as u32) as i32;
  let height = size.height.min(i32::MAX as u32) as i32;
  let (x, y) = corrected_window_position(position.x, position.y, width, height, &monitors);
  let corrected = x != position.x || y != position.y;

  if corrected {
    window
      .set_position(PhysicalPosition::new(x, y))
      .map_err(|error| error.to_string())?;
  }

  Ok(WindowPositionCorrection { corrected, x, y })
}

#[tauri::command]
fn start_window_drag(window: WebviewWindow) -> Result<(), String> {
  window.start_dragging().map_err(|error| error.to_string())
}

#[tauri::command]
fn show_status_center_context_menu(
  app: tauri::AppHandle,
  x: f64,
  y: f64,
) -> Result<(), String> {
  let window = app
    .get_webview_window(STATUS_WINDOW_LABEL)
    .ok_or_else(|| "status center window not found".to_string())?;
  let state = app.state::<SharedDesktopProductState<tauri::Wry>>();
  let state = state
    .lock()
    .map_err(|_| "status center state lock poisoned".to_string())?;
  let menu = state
    .menu_items
    .as_ref()
    .ok_or_else(|| "status center menu not initialized".to_string())?;

  window
    .popup_menu_at(
      &menu.menu,
      Position::Physical(PhysicalPosition::new(x as i32, y as i32)),
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
fn get_status_center_settings(
  state: tauri::State<'_, SharedDesktopProductState<tauri::Wry>>,
) -> Result<StatusCenterSettingsPayload, String> {
  let preferences = state
    .lock()
    .map_err(|_| "status center state lock poisoned".to_string())?
    .preferences
    .clone();

  Ok(StatusCenterSettingsPayload { preferences })
}

#[tauri::command]
fn set_status_center_preferences(
  app: tauri::AppHandle,
  state: tauri::State<'_, SharedDesktopProductState<tauri::Wry>>,
  preferences: DesktopStatusPreferences,
) -> Result<StatusCenterSettingsPayload, String> {
  {
    let mut state = state
      .lock()
      .map_err(|_| "status center state lock poisoned".to_string())?;

    state.preferences = preferences.clone();
    if let Some(menu_items) = &state.menu_items {
      apply_preference_menu_state(menu_items, &state.preferences);
    }
  }

  persist_status_center_preferences(&app, &preferences)?;
  emit_status_center_settings(&app, &preferences);

  Ok(StatusCenterSettingsPayload { preferences })
}

#[tauri::command]
fn show_status_center_window(app: tauri::AppHandle) -> Result<(), String> {
  toggle_status_center_window(&app);
  Ok(())
}

#[tauri::command]
fn open_status_center_settings(app: tauri::AppHandle) -> Result<(), String> {
  request_open_settings(&app, "invoke");
  Ok(())
}

#[tauri::command]
fn quit_status_center(
  app: tauri::AppHandle,
  shutdown: tauri::State<'_, Arc<AtomicBool>>,
) -> Result<(), String> {
  shutdown.store(true, Ordering::SeqCst);
  app.exit(0);
  Ok(())
}

/// Calculates download and upload speeds in bytes per second using delta-based
/// rate measurement between invocations. Reuses the same Networks instance
/// across calls so that cumulative counter deltas are meaningful.
fn sample_network_speeds(state: &SharedDesktopProductState<tauri::Wry>) -> (u64, u64) {
  let now = std::time::Instant::now();
  let mut download_bps: u64 = 0;
  let mut upload_bps: u64 = 0;

  if let Ok(mut guard) = state.lock() {
    let cache = &mut guard.perf_cache;

    // Lazily initialize the Networks instance on first call
    let networks = cache.networks.get_or_insert_with(Networks::new_with_refreshed_list);
    networks.refresh();

    let received_bytes: u64 = networks.values().map(|data| data.received()).sum();
    let transmitted_bytes: u64 = networks.values().map(|data| data.transmitted()).sum();

    if let Some(prev) = &cache.network_sample {
      let elapsed = now.duration_since(prev.sampled_at).as_secs_f64();

      if elapsed > 0.05 {
        let delta_rx = received_bytes.saturating_sub(prev.received_bytes);
        let delta_tx = transmitted_bytes.saturating_sub(prev.transmitted_bytes);
        download_bps = (delta_rx as f64 / elapsed) as u64;
        upload_bps = (delta_tx as f64 / elapsed) as u64;
      }
    }

    cache.network_sample = Some(NetworkSample {
      received_bytes,
      transmitted_bytes,
      sampled_at: now,
    });
  }

  (download_bps, upload_bps)
}

fn read_media_session_status() -> MediaSessionStatus {
  read_media_session_status_at(unix_time_ms())
}

#[cfg(windows)]
fn read_media_session_status_with_cache(
  cache: &mut Option<
    windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager,
  >,
) -> MediaSessionStatus {
  read_media_session_status_at_cached(unix_time_ms(), cache)
}

#[cfg(windows)]
fn read_media_session_status_at(checked_at: u64) -> MediaSessionStatus {
  let mut cache = None;
  read_media_session_status_at_cached(checked_at, &mut cache)
}

#[cfg(windows)]
fn read_media_session_status_at_cached(
  checked_at: u64,
  cache: &mut Option<
    windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager,
  >,
) -> MediaSessionStatus {
  let timeout = std::time::Duration::from_secs(5);

  // Reuse the cached manager if present; otherwise request a fresh
  // one. Caching avoids paying the RequestAsync cost on every poll.
  let manager: Option<
    windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager,
  > = if let Some(manager) = cache.as_ref() {
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
    // Clear cache on failure so next iteration retries from scratch.
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
      // Session went away — drop the cached manager so the next cycle
      // re-discovers.
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
      clamp_percent((position as f64 / duration as f64) * 100.0)
    }
    _ => 0,
  };
  let label = playback_status_label(playback_status);

  // Title / artist come from a separate async call. Best-effort — if
  // it stalls or fails, we still report a valid session with empty
  // title / artist.
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

#[cfg(windows)]
fn playback_status_label(
  status: windows::Media::Control::GlobalSystemMediaTransportControlsSessionPlaybackStatus,
) -> &'static str {
  if status == windows::Media::Control::GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing
  {
    "playing"
  } else {
    "paused"
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
  use windows::core::Interface;
  use windows::Foundation::{AsyncStatus, IAsyncInfo};

  let info: IAsyncInfo = async_op.cast().map_err(|e| {
    append_media_log(&format!("[wait] cast to IAsyncInfo FAILED: {e}"));
    windows::core::Error::from(e.code())
  })?;

  // Poll for completion directly on this thread instead of spawning a
  // worker — GetResults() MUST be called from the same apartment that
  // initiated the async operation.
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

/// STA-based fallback for waiting on WinRT async operations.
///
/// **Use `mta_wait_async` instead.** STA is a legacy path kept only for
/// reference; the active media thread runs on MTA, so the STA path is never
/// invoked at runtime. The body remains in the source as a documented
/// archive so future maintainers can see why MTA was chosen.
#[cfg(windows)]
#[allow(dead_code)]
fn sta_wait_async<T>(
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

  // Check if already completed.
  if let Ok(AsyncStatus::Completed) = info.Status() {
    append_media_log("[wait] already completed");
    return async_op.GetResults();
  }

  // Create a real hidden top-level window (NOT HWND_MESSAGE) so WinRT callbacks arrive.
  let hwnd = unsafe {
    let class_name: Vec<u16> = "CoberMediaWait\0".encode_utf16().collect();
    let wc = windows_sys::Win32::UI::WindowsAndMessaging::WNDCLASSW {
      style: 0,
      lpfnWndProc: Some(windows_sys::Win32::UI::WindowsAndMessaging::DefWindowProcW),
      cbClsExtra: 0,
      cbWndExtra: 0,
      hInstance: windows_sys::Win32::System::LibraryLoader::GetModuleHandleW(std::ptr::null()),
      hIcon: std::ptr::null_mut(),
      hCursor: std::ptr::null_mut(),
      hbrBackground: std::ptr::null_mut(),
      lpszMenuName: std::ptr::null(),
      lpszClassName: class_name.as_ptr(),
    };
    windows_sys::Win32::UI::WindowsAndMessaging::RegisterClassW(&wc);

    windows_sys::Win32::UI::WindowsAndMessaging::CreateWindowExW(
      0,
      class_name.as_ptr(),
      class_name.as_ptr(),
      windows_sys::Win32::UI::WindowsAndMessaging::WS_POPUP,
      0, 0, 0, 0,
      windows_sys::Win32::UI::WindowsAndMessaging::HWND_MESSAGE, // start as message-only
      std::ptr::null_mut(),
      std::ptr::null_mut(),
      std::ptr::null_mut(),
    )
  };

  // Upgrade to a real top-level hidden window by removing HWND_MESSAGE parent.
  // Actually, let's just create a real WS_POPUP window off-screen.
  unsafe { windows_sys::Win32::UI::WindowsAndMessaging::DestroyWindow(hwnd); }
  let hwnd = unsafe {
    let class_name: Vec<u16> = "CoberMediaWait\0".encode_utf16().collect();
    windows_sys::Win32::UI::WindowsAndMessaging::CreateWindowExW(
      0,
      class_name.as_ptr(),
      class_name.as_ptr(),
      windows_sys::Win32::UI::WindowsAndMessaging::WS_POPUP,
      -32000, -32000, 1, 1,  // off-screen
      std::ptr::null_mut(),   // no parent = top-level
      std::ptr::null_mut(),
      std::ptr::null_mut(),
      std::ptr::null(),
    )
  };

  if hwnd.is_null() {
    append_media_log("[wait] FAILED to create hidden window, falling back to sleep");
    // Fallback: just poll with sleep (won't work but won't crash).
    let deadline = std::time::Instant::now() + timeout;
    loop {
      if let Ok(AsyncStatus::Completed) = info.Status() {
        return async_op.GetResults();
      }
      if std::time::Instant::now() >= deadline {
        return Err(windows::core::Error::from(windows::core::HRESULT(0x800705B4u32 as i32)));
      }
      std::thread::sleep(std::time::Duration::from_millis(10));
    }
  }

  append_media_log(&format!("[wait] hidden HWND={hwnd:?} created, pumping messages"));

  let deadline = std::time::Instant::now() + timeout;
  let mut msg: windows_sys::Win32::UI::WindowsAndMessaging::MSG = unsafe { std::mem::zeroed() };

  loop {
    if std::time::Instant::now() >= deadline {
      unsafe { windows_sys::Win32::UI::WindowsAndMessaging::DestroyWindow(hwnd); }
      append_media_log("[wait] TIMEOUT");
      return Err(windows::core::Error::from(windows::core::HRESULT(0x800705B4u32 as i32)));
    }

    // Use MsgWaitForMultipleObjectsEx to wait for messages with timeout.
    // This is the proper STA message pump pattern — it blocks until a message
    // arrives or the timeout expires.
    let remaining = deadline.saturating_duration_since(std::time::Instant::now());
    let wait_ms = remaining.as_millis().min(u32::MAX as u128) as u32;

    let wait_result = unsafe {
      windows_sys::Win32::UI::WindowsAndMessaging::MsgWaitForMultipleObjectsEx(
        0,
        std::ptr::null(),
        wait_ms,
        windows_sys::Win32::UI::WindowsAndMessaging::QS_ALLINPUT,
        windows_sys::Win32::UI::WindowsAndMessaging::MWMO_ALERTABLE,
      )
    };

    // WAIT_OBJECT_0 (0) = messages available; WAIT_TIMEOUT (0x102) = no messages.
    // With QS_ALLINPUT we always get a chance to drain posted WinRT completions.
    if wait_result != 0 && wait_result != 0x00000102u32 {
      // Unexpected result — treat as signal to re-check completion.
    }

    // Drain all pending messages from our hidden window.
    loop {
      let got = unsafe {
        windows_sys::Win32::UI::WindowsAndMessaging::PeekMessageW(
          &mut msg, hwnd, 0, 0,
          windows_sys::Win32::UI::WindowsAndMessaging::PM_REMOVE,
        )
      };
      if got == 0 {
        break;
      }
      unsafe {
        windows_sys::Win32::UI::WindowsAndMessaging::TranslateMessage(&msg);
        windows_sys::Win32::UI::WindowsAndMessaging::DispatchMessageW(&msg);
      }
    }

    // Also drain thread-wide messages (WinRT completions may arrive here).
    loop {
      let got = unsafe {
        windows_sys::Win32::UI::WindowsAndMessaging::PeekMessageW(
          &mut msg, std::ptr::null_mut(), 0, 0,
          windows_sys::Win32::UI::WindowsAndMessaging::PM_REMOVE,
        )
      };
      if got == 0 {
        break;
      }
      unsafe {
        windows_sys::Win32::UI::WindowsAndMessaging::TranslateMessage(&msg);
        windows_sys::Win32::UI::WindowsAndMessaging::DispatchMessageW(&msg);
      }
    }
  }
}


#[cfg(windows)]
fn append_media_log(msg: &str) {
  use std::io::Write;
  let path = "C:\\Users\\jay\\Desktop\\media-debug.log";
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
  let async_op = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
    .map_err(|e| { append_media_log(&format!("[step] RequestAsync FAILED: HRESULT={e}")); e })?;
  append_media_log(&format!("[step] RequestAsync OK, op ptr={:?}", &async_op as *const _ as *const ()));
  append_media_log("[step] mta_wait_async for manager");
  let manager = mta_wait_async(async_op, timeout)
    .map_err(|e| { append_media_log(&format!("[step] mta_wait_async(manager) FAILED: {e}")); e })?;
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
  let playback_info = session.GetPlaybackInfo().map_err(|e| { append_media_log(&format!("[step] GetPlaybackInfo FAILED: HRESULT={e}")); e })?;
  let playback_status = playback_info.PlaybackStatus().map_err(|e| { append_media_log(&format!("[step] PlaybackStatus FAILED: HRESULT={e}")); e })?;
  append_media_log("[step] GetTimelineProperties start");
  let timeline = session.GetTimelineProperties().map_err(|e| { append_media_log(&format!("[step] GetTimelineProperties FAILED: HRESULT={e}")); e })?;
  let position_ms = duration_100ns_to_ms(timeline.Position().map_err(|e| { append_media_log(&format!("[step] Position FAILED: HRESULT={e}")); e })?.Duration);
  let duration_ms = duration_100ns_to_ms(timeline.EndTime().map_err(|e| { append_media_log(&format!("[step] EndTime FAILED: HRESULT={e}")); e })?.Duration);
  let progress = match (position_ms, duration_ms) {
    (Some(position), Some(duration)) if duration > 0 => {
      clamp_percent((position as f64 / duration as f64) * 100.0)
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


fn unix_time_ms() -> u64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_millis().min(u128::from(u64::MAX)) as u64)
    .unwrap_or(0)
}

fn clamp_percent(value: f64) -> u8 {
  if !value.is_finite() {
    return 0;
  }

  value.round().clamp(0.0, 100.0) as u8
}

fn corrected_window_position(
  left: i32,
  top: i32,
  width: i32,
  height: i32,
  monitors: &[tauri::window::Monitor],
) -> (i32, i32) {
  let mut best: Option<(i32, i32, i64)> = None;

  for monitor in monitors {
    let work_area = monitor.work_area();
    let area_left = work_area.position.x + STATUS_WINDOW_EDGE_MARGIN;
    let area_top = work_area.position.y + STATUS_WINDOW_EDGE_MARGIN;
    let area_width = work_area.size.width.min(i32::MAX as u32) as i32;
    let area_height = work_area.size.height.min(i32::MAX as u32) as i32;
    let candidate_x = clamp_window_axis(left, width, area_left, area_width);
    let candidate_y = clamp_window_axis(top, height, area_top, area_height);

    if candidate_x == left && candidate_y == top {
      return (left, top);
    }

    let cost = i64::from((candidate_x - left).abs()) + i64::from((candidate_y - top).abs());
    if best.map_or(true, |(_, _, best_cost)| cost < best_cost) {
      best = Some((candidate_x, candidate_y, cost));
    }
  }

  best.map(|(x, y, _)| (x, y)).unwrap_or((left, top))
}

fn clamp_window_axis(position: i32, window_size: i32, area_start: i32, area_size: i32) -> i32 {
  let max_position = area_start + area_size - window_size - STATUS_WINDOW_EDGE_MARGIN;

  if max_position <= area_start {
    return area_start;
  }

  position.clamp(area_start, max_position)
}

#[cfg(windows)]
fn foreground_window_is_fullscreen() -> bool {
  const EDGE_TOLERANCE: i32 = 2;

  unsafe {
    let hwnd = GetForegroundWindow();
    if hwnd.is_null() || IsWindowVisible(hwnd) == 0 {
      return false;
    }

    if hwnd == GetDesktopWindow() || hwnd == GetShellWindow() {
      return false;
    }

    let mut class_name = [0u16; 256];
    let class_len = GetClassNameW(hwnd, class_name.as_mut_ptr(), class_name.len() as i32);
    if class_len > 0 {
      let class_name = String::from_utf16_lossy(&class_name[..class_len as usize]);
      if class_name == "WorkerW" || class_name == "Progman" {
        return false;
      }
    }

    let mut foreground_pid = 0u32;
    GetWindowThreadProcessId(hwnd, &mut foreground_pid);
    if foreground_pid == std::process::id() {
      return false;
    }

    let mut window_rect = RECT {
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
    };
    if GetWindowRect(hwnd, &mut window_rect) == 0 {
      return false;
    }

    let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
    if monitor.is_null() {
      return false;
    }

    let mut monitor_info = MONITORINFO {
      cbSize: std::mem::size_of::<MONITORINFO>() as u32,
      rcMonitor: RECT {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
      },
      rcWork: RECT {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
      },
      dwFlags: 0,
    };

    if GetMonitorInfoW(monitor, &mut monitor_info) == 0 {
      return false;
    }

    window_rect.left <= monitor_info.rcMonitor.left + EDGE_TOLERANCE
      && window_rect.top <= monitor_info.rcMonitor.top + EDGE_TOLERANCE
      && window_rect.right >= monitor_info.rcMonitor.right - EDGE_TOLERANCE
      && window_rect.bottom >= monitor_info.rcMonitor.bottom - EDGE_TOLERANCE
  }
}

#[cfg(windows)]
fn apply_status_window_tool_style(window: &WebviewWindow) -> Result<(), String> {
  let hwnd = status_window_hwnd(window)?;

  unsafe {
    let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
    let next_style = (ex_style | WS_EX_TOOLWINDOW) & !WS_EX_APPWINDOW;

    if next_style != ex_style {
      SetWindowLongW(hwnd, GWL_EXSTYLE, next_style as i32);
      SetWindowPos(
        hwnd,
        std::ptr::null_mut(),
        0,
        0,
        0,
        0,
        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
      );
    }
  }

  Ok(())
}

#[cfg(not(windows))]
fn apply_status_window_tool_style(_window: &WebviewWindow) -> Result<(), String> {
  Ok(())
}

#[cfg(windows)]
fn set_status_window_z_order(window: &WebviewWindow, floating: bool) -> Result<(), String> {
  let hwnd = status_window_hwnd(window)?;
  let insert_after = if floating { HWND_TOPMOST } else { HWND_BOTTOM };
  let visibility_flag = if floating { SWP_SHOWWINDOW } else { Default::default() };

  unsafe {
    if SetWindowPos(
      hwnd,
      insert_after,
      0,
      0,
      0,
      0,
      SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | visibility_flag,
    ) == 0
    {
      return Err("failed to update status window z-order".into());
    }
  }

  Ok(())
}

#[cfg(not(windows))]
fn set_status_window_z_order(_window: &WebviewWindow, _floating: bool) -> Result<(), String> {
  Ok(())
}

#[cfg(windows)]
fn status_window_hwnd(window: &WebviewWindow) -> Result<HWND, String> {
  window
    .hwnd()
    .map(|hwnd| hwnd.0 as HWND)
    .map_err(|error| error.to_string())
}

/// Core logic to strip all DWM shadow artifacts from the transparent borderless window.
/// Called both immediately at startup and again after a delay to catch late resets
/// by WebView2/DWM during window initialization.
#[cfg(windows)]
fn apply_shadow_suppression(hwnd: HWND) {
  unsafe {
    // NOTE: We deliberately do NOT set DWMWA_NCRENDERING_POLICY = DWMNCRP_DISABLED.
    // That attribute FORCIBLY DISABLES DWM non-client rendering for the window,
    // which makes Windows fall back to the *classic* (non-DWM) window frame —
    // producing the black border lines and the Win7-style classic title-bar
    // close button. The window is already borderless/transparent via Tauri
    // (decorations:false, transparent:true, shadow:false); no NC suppression is
    // needed or wanted.

    // 1. Disable Win11 rounded corners so DWM does not add its own corner shadow.
    let corner_pref = DWMWCP_DONOTROUND;
    let _ = DwmSetWindowAttribute(
      hwnd,
      DWMWA_WINDOW_CORNER_PREFERENCE as u32,
      &corner_pref as *const i32 as *const _,
      std::mem::size_of::<i32>() as u32,
    );

    // 2. Disable system backdrop type (Mica/Acrylic) that can cause shadow
    let backdrop = DWMSBT_NONE;
    let _ = DwmSetWindowAttribute(
      hwnd,
      DWMWA_SYSTEMBACKDROP_TYPE,
      &backdrop as *const u32 as *const _,
      std::mem::size_of::<u32>() as u32,
    );

    // NOTE: We deliberately do NOT call SetWindowCompositionAttribute with an
    // ACCENT_* policy here. The accent policy applies over the full *rectangular*
    // window, including the four corners that sit OUTSIDE the pill's CSS
    // border-radius. With a transparent gradient color (alpha = 0), many Windows
    // builds render those corner areas as opaque WHITE instead of transparent —
    // which is exactly the residual white blocks seen at the four corners.
    // Letting WebView2's transparent surface + anti-aliased CSS border-radius
    // composite the corners via DirectComposition yields true transparency.
  }
}

#[cfg(windows)]
fn disable_dwm_window_shadow(window: &WebviewWindow, shutdown: Arc<AtomicBool>) {
  if let Ok(hwnd) = status_window_hwnd(window) {
    // The window is sized 303x64 to exactly match the pill. The rounded pill
    // shape is drawn by the WebView2 transparent surface with anti-aliased CSS
    // border-radius — DirectComposition composites the corners to true
    // transparency. We must NOT use SetWindowRgn here: a GDI region clip has
    // hard (aliased) corners that do not coincide with the smooth CSS corners,
    // leaving 1-2px residual artifacts at the four corners.
    apply_shadow_suppression(hwnd);

    // Reapply after delays to catch WebView2/DWM late initialization resets.
    let hwnd_raw = hwnd as isize;
    std::thread::spawn(move || {
      std::thread::sleep(std::time::Duration::from_millis(500));
      if shutdown.load(Ordering::Relaxed) { return; }
      apply_shadow_suppression(hwnd_raw as HWND);
      std::thread::sleep(std::time::Duration::from_millis(1500));
      if shutdown.load(Ordering::Relaxed) { return; }
      apply_shadow_suppression(hwnd_raw as HWND);
    });
  }
}

#[cfg(not(windows))]
fn disable_dwm_window_shadow(_window: &WebviewWindow, _shutdown: Arc<AtomicBool>) {}

#[cfg(not(windows))]
fn foreground_window_is_fullscreen() -> bool {
  false
}

fn create_status_center_menu<R: tauri::Runtime>(
  app: &tauri::AppHandle<R>,
  preferences: &DesktopStatusPreferences,
) -> Result<StatusCenterMenuItems<R>, tauri::Error> {
  let always_float =
    CheckMenuItemBuilder::with_id(MENU_ALWAYS_FLOAT, "\u{603B}\u{662F}\u{60AC}\u{6D6E}")
    .checked(preferences.always_float)
    .build(app)?;
  let avoid_fullscreen =
    CheckMenuItemBuilder::with_id(
      MENU_AVOID_FULLSCREEN,
      "\u{5168}\u{5C4F}\u{65F6}\u{907F}\u{8BA9}",
    )
      .checked(preferences.avoid_fullscreen)
      .build(app)?;
  let lock_position =
    CheckMenuItemBuilder::with_id(MENU_LOCK_POSITION, "\u{9501}\u{5B9A}\u{4F4D}\u{7F6E}")
      .checked(preferences.lock_position)
      .build(app)?;

  let menu = MenuBuilder::new(app)
    .text(
      MENU_REFRESH_DATA,
      "\u{5237}\u{65B0}\u{6570}\u{636E}",
    )
    .item(&always_float)
    .item(&avoid_fullscreen)
    .item(&lock_position)
    .separator()
    .text(
      MENU_RESET_POSITION,
      "\u{91CD}\u{7F6E}\u{4F4D}\u{7F6E}",
    )
    .text(
      MENU_OPEN_SETTINGS,
      "\u{6253}\u{5F00}\u{8BBE}\u{7F6E}",
    )
    .separator()
    .text(MENU_QUIT, "\u{9000}\u{51FA}")
    .build()?;

  Ok(StatusCenterMenuItems {
    menu,
    always_float,
    avoid_fullscreen,
    lock_position,
  })
}

fn create_tray_menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<Menu<R>, tauri::Error> {
  MenuBuilder::new(app)
    .text(
      TRAY_MENU_SHOW_STATUS_CENTER,
      "\u{663E}\u{793A}\u{0020}/\u{0020}\u{53EC}\u{56DE}\u{72B6}\u{6001}\u{4E2D}\u{5FC3}",
    )
    .text(
      TRAY_MENU_OPEN_SETTINGS,
      "\u{6253}\u{5F00}\u{8BBE}\u{7F6E}",
    )
    .separator()
    .text(MENU_QUIT, "\u{9000}\u{51FA}")
    .build()
}

fn emit_status_center_settings<R: tauri::Runtime>(
  app: &tauri::AppHandle<R>,
  preferences: &DesktopStatusPreferences,
) {
  let _ = app.emit_to(
    STATUS_WINDOW_LABEL,
    STATUS_CENTER_SETTINGS_EVENT,
    StatusCenterSettingsPayload {
      preferences: preferences.clone(),
    },
  );
}


fn emit_open_settings_requested<R: tauri::Runtime>(app: &tauri::AppHandle<R>, source: &'static str) {
  let _ = app.emit_to(
    STATUS_WINDOW_LABEL,
    STATUS_CENTER_OPEN_SETTINGS_EVENT,
    StatusCenterOpenSettingsPayload { source },
  );
}

fn emit_status_center_action<R: tauri::Runtime>(
  app: &tauri::AppHandle<R>,
  action: &'static str,
  checked: Option<bool>,
) {
  let _ = app.emit_to(
    STATUS_WINDOW_LABEL,
    STATUS_CENTER_MENU_ACTION_EVENT,
    StatusCenterMenuActionPayload { action, checked },
  );
}

fn status_center_preferences_path<R: tauri::Runtime>(
  app: &tauri::AppHandle<R>,
) -> Result<PathBuf, String> {
  let mut path = app
    .path()
    .app_config_dir()
    .map_err(|error| format!("failed to resolve app config dir: {error}"))?;
  path.push(PREFERENCES_FILE_NAME);
  Ok(path)
}

fn load_status_center_preferences<R: tauri::Runtime>(
  app: &tauri::AppHandle<R>,
) -> DesktopStatusPreferences {
  let Ok(path) = status_center_preferences_path(app) else {
    return DesktopStatusPreferences::default();
  };

  let Ok(contents) = fs::read_to_string(path) else {
    return DesktopStatusPreferences::default();
  };

  serde_json::from_str::<DesktopStatusPreferences>(&contents).unwrap_or_default()
}

fn persist_status_center_preferences<R: tauri::Runtime>(
  app: &tauri::AppHandle<R>,
  preferences: &DesktopStatusPreferences,
) -> Result<(), String> {
  let path = status_center_preferences_path(app)?;
  let parent = path
    .parent()
    .ok_or_else(|| "preferences path missing parent directory".to_string())?;
  fs::create_dir_all(parent).map_err(|error| {
    format!(
      "failed to create preferences directory {}: {error}",
      parent.display()
    )
  })?;

  let payload = serde_json::to_vec_pretty(preferences)
    .map_err(|error| format!("failed to serialize preferences: {error}"))?;
  fs::write(&path, payload)
    .map_err(|error| format!("failed to write preferences {}: {error}", path.display()))
}

fn apply_preference_menu_state<R: tauri::Runtime>(
  menu_items: &StatusCenterMenuItems<R>,
  preferences: &DesktopStatusPreferences,
) {
  let _ = menu_items.always_float.set_checked(preferences.always_float);
  let _ = menu_items
    .avoid_fullscreen
    .set_checked(preferences.avoid_fullscreen);
  let _ = menu_items.lock_position.set_checked(preferences.lock_position);
}

fn request_open_settings<R: tauri::Runtime>(app: &tauri::AppHandle<R>, source: &'static str) {
  reveal_status_center_window(app);
  emit_open_settings_requested(app, source);
  emit_status_center_action(app, "open-settings", None);
}

fn handle_status_center_menu_event<R: tauri::Runtime>(
  app: &tauri::AppHandle<R>,
  state: &SharedDesktopProductState<R>,
  id: &str,
) {
  let Ok(mut state) = state.lock() else {
    return;
  };
  let mut preferences_changed = false;

  match id {
    TRAY_MENU_SHOW_STATUS_CENTER => reveal_status_center_window(app),
    TRAY_MENU_OPEN_SETTINGS => request_open_settings(app, "tray"),
    MENU_REFRESH_DATA => emit_status_center_action(app, "refresh-data", None),
    MENU_ALWAYS_FLOAT => {
      state.preferences.always_float = !state.preferences.always_float;
      preferences_changed = true;
      if let Some(menu_items) = &state.menu_items {
        apply_preference_menu_state(menu_items, &state.preferences);
      }
      emit_status_center_settings(app, &state.preferences);
      emit_status_center_action(app, "toggle-always-float", Some(state.preferences.always_float));
    }
    MENU_AVOID_FULLSCREEN => {
      state.preferences.avoid_fullscreen = !state.preferences.avoid_fullscreen;
      preferences_changed = true;
      if let Some(menu_items) = &state.menu_items {
        apply_preference_menu_state(menu_items, &state.preferences);
      }
      emit_status_center_settings(app, &state.preferences);
      emit_status_center_action(
        app,
        "toggle-avoid-fullscreen",
        Some(state.preferences.avoid_fullscreen),
      );
    }
    MENU_LOCK_POSITION => {
      state.preferences.lock_position = !state.preferences.lock_position;
      preferences_changed = true;
      if let Some(menu_items) = &state.menu_items {
        apply_preference_menu_state(menu_items, &state.preferences);
      }
      emit_status_center_settings(app, &state.preferences);
      emit_status_center_action(app, "toggle-lock-position", Some(state.preferences.lock_position));
    }
    MENU_RESET_POSITION => emit_status_center_action(app, "reset-position", None),
    MENU_OPEN_SETTINGS => request_open_settings(app, "menu"),
    MENU_QUIT => {
      emit_status_center_action(app, "quit", None);
      if let Some(shutdown) = app.try_state::<Arc<AtomicBool>>() {
        shutdown.store(true, Ordering::SeqCst);
      }
      app.exit(0);
    }
    _ => {}
  }

  if preferences_changed {
    let _ = persist_status_center_preferences(app, &state.preferences);
  }
}

fn reveal_status_center_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
  if let Some(window) = app.get_webview_window(STATUS_WINDOW_LABEL) {
    let _ = window.unminimize();
    let _ = window.show();
    let _ = correct_status_window_position_for_window(&window);
    let _ = window.set_focus();
  }
}

fn hide_status_center_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
  if let Some(window) = app.get_webview_window(STATUS_WINDOW_LABEL) {
    let _ = window.hide();
  }
}

fn toggle_status_center_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
  if let Some(window) = app.get_webview_window(STATUS_WINDOW_LABEL) {
    let is_visible = window.is_visible().unwrap_or(false);
    let is_minimized = window.is_minimized().unwrap_or(false);

    if is_visible && !is_minimized {
      let _ = window.hide();
      return;
    }
  }

  reveal_status_center_window(app);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let desktop_product_state: SharedDesktopProductState<tauri::Wry> =
    Arc::new(Mutex::new(DesktopProductState::default()));
  let setup_state = Arc::clone(&desktop_product_state);
  let app_shutdown: Arc<AtomicBool> = Arc::new(AtomicBool::new(false));
  let shadow_shutdown = Arc::clone(&app_shutdown);

  tauri::Builder::default()
    .manage(desktop_product_state.clone())
    .manage(app_shutdown.clone())
    .setup(move |app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      app.handle().plugin(tauri_plugin_opener::init())?;

      #[cfg(not(any(target_os = "android", target_os = "ios")))]
      app.handle().plugin(
        tauri_plugin_global_shortcut::Builder::new()
          .with_shortcut(GLOBAL_SHORTCUT_RECALL)?
          .with_handler(|app, shortcut, event| {
            if event.state == ShortcutState::Pressed
              && shortcut.to_string().eq_ignore_ascii_case(GLOBAL_SHORTCUT_RECALL)
            {
              reveal_status_center_window(app);
            }
          })
          .build(),
      )?;

      #[cfg(not(any(target_os = "android", target_os = "ios")))]
      app.handle().plugin(
        tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--minimized"])),
      )?;

      let preferences = load_status_center_preferences(app.handle());
      let menu_items = create_status_center_menu(app.handle(), &preferences)?;
      let tray_menu = create_tray_menu(app.handle())?;

      let mut tray_builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&tray_menu)
        .show_menu_on_left_click(false)
        .tooltip("Cober Windows Bar")
        .on_tray_icon_event(|tray, event| {
          if let TrayIconEvent::Click {
            button: MouseButton::Left,
            button_state: MouseButtonState::Up,
            ..
          } = event
          {
            toggle_status_center_window(tray.app_handle());
          }
        });

      if let Some(icon) = app.default_window_icon().cloned() {
        tray_builder = tray_builder.icon(icon);
      }

      let tray = tray_builder.build(app)?;

      let _ = tray.set_show_menu_on_left_click(false);

      if let Ok(mut state) = setup_state.lock() {
        state.preferences = preferences.clone();
        state.menu_items = Some(menu_items);
      }

      if let Some(window) = app.get_webview_window(STATUS_WINDOW_LABEL) {
        // Suppress Windows DWM shadow on the transparent borderless window
        disable_dwm_window_shadow(&window, shadow_shutdown);

        // Position window at bottom-right of primary monitor work area
        if let Ok(monitors) = window.available_monitors() {
          if let Some(monitor) = monitors.first() {
            let work_area = monitor.work_area();
            let scale = monitor.scale_factor();
            let window_width = (303.0 * scale) as i32;
            let window_height = (64.0 * scale) as i32;
            let margin = (STATUS_WINDOW_EDGE_MARGIN as f64 * scale) as i32;
            let x = work_area.position.x + work_area.size.width as i32 - window_width - margin;
            let y = work_area.position.y + work_area.size.height as i32 - window_height - margin;
            let _ = window.set_position(PhysicalPosition::new(x, y));
          }
        }

        let app_handle = app.handle().clone();
        window.on_window_event(move |event| {
          if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            hide_status_center_window(&app_handle);
          }
        });
      }

      emit_status_center_settings(app.handle(), &preferences);

      // Shared shutdown flag for background monitor threads (from managed state)
      let app_shutdown = app.handle().state::<Arc<AtomicBool>>().inner().clone();

      // Start clipboard change monitor (reuses Clipboard instance, checks shutdown flag)
      {
        let clipboard_app_handle = app.handle().clone();
        let clipboard_shutdown = Arc::clone(&app_shutdown);
        std::thread::spawn(move || {
          let mut clipboard = match arboard::Clipboard::new() {
            Ok(c) => c,
            Err(_) => return,
          };
          loop {
            std::thread::sleep(Duration::from_millis(800));
            if clipboard_shutdown.load(Ordering::Relaxed) {
              break;
            }
            // Emit on every non-empty clipboard read — each read generates a
            // fresh copiedAt timestamp so the frontend can detect new copy
            // operations (even when the same text is copied again).
            if let Ok(text) = clipboard.get_text() {
              if !text.is_empty() {
                let payload = ClipboardContent {
                  text,
                  source_app: String::new(),
                  copied_at: unix_time_ms(),
                };
                let _ = clipboard_app_handle.emit(STATUS_CENTER_CLIPBOARD_EVENT, &payload);
              }
            }
          }
        });
      }

      // Start Focus Assist + Notification unified monitor (eliminates redundant registry polling)
      {
        let monitor_app_handle = app.handle().clone();
        let monitor_shutdown = Arc::clone(&app_shutdown);
        std::thread::spawn(move || {
          let mut last_focus_active = false;
          let mut last_profile = String::new();
          let mut last_notif_active = false;
          loop {
            std::thread::sleep(FOCUS_ASSIST_MONITOR_INTERVAL);
            if monitor_shutdown.load(Ordering::Relaxed) {
              break;
            }
            let focus_state = read_focus_assist_state();
            if focus_state.active != last_focus_active || focus_state.profile != last_profile {
              last_focus_active = focus_state.active;
              last_profile = focus_state.profile.clone();
              let _ = monitor_app_handle.emit(STATUS_CENTER_FOCUS_ASSIST_EVENT, &focus_state);
            }
            // Derive notification summary from the same focus state (no redundant registry read)
            if focus_state.active != last_notif_active {
              last_notif_active = focus_state.active;
              let summary = NotificationSummaryPayload {
                focus_assist_active: focus_state.active,
                checked_at: unix_time_ms(),
              };
              let _ = monitor_app_handle.emit(STATUS_CENTER_NOTIFICATION_EVENT, &summary);
            }
          }
        });
      }

      // Start MTA media thread — handles ALL WinRT media calls (reads + actions)
      // using RoInitialize(RO_INIT_MULTITHREADED) for proper async operation support.
      #[cfg(windows)]
      if let Some(media_sender) = start_mta_media_thread(app.handle().clone(), Arc::clone(&app_shutdown)) {
        app.manage(media_sender);
      }

      Ok(())
    })
    .on_menu_event({
      let desktop_product_state = desktop_product_state.clone();
      move |app, event| {
        handle_status_center_menu_event(app, &desktop_product_state, event.id().as_ref());
      }
    })
    .invoke_handler(tauri::generate_handler![
      get_media_session_status,
      get_system_performance,
      get_overlay_policy,
      set_status_window_floating,
      correct_status_window_position,
      start_window_drag,
      show_status_center_context_menu,
      get_status_center_settings,
      set_status_center_preferences,
      show_status_center_window,
      open_status_center_settings,
      quit_status_center,
      open_url_in_browser,
      get_clipboard_content,
      set_clipboard_content,
      media_control,
      get_focus_assist_state,
      get_notification_summary,
      stop_focus_session,
      pause_download,
      resume_download,
      cancel_download,
      install_update,
      dismiss_notification,
      get_autostart_enabled,
      set_autostart_enabled
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
