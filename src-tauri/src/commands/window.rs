// ---------------------------------------------------------------------------
// Window-management commands + Win32 helpers.
// ---------------------------------------------------------------------------

use crate::types::{SharedDesktopProductState, WindowPositionCorrection};
use tauri::{PhysicalPosition, State, WebviewWindow, Manager};

// DWMWA_SYSTEMBACKDROP_TYPE — disables Mica/Acrylic backdrop (Win11 22H2+)
#[cfg(windows)]
const DWMWA_SYSTEMBACKDROP_TYPE: u32 = 38;
#[cfg(windows)]
const DWMSBT_NONE: u32 = 1;

const STATUS_WINDOW_EDGE_MARGIN: i32 = 8;

#[cfg(windows)]
use windows_sys::Win32::{
    Foundation::{HWND, RECT},
    Graphics::{
        Dwm::{DwmSetWindowAttribute, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DONOTROUND},
        Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST},
    },
    UI::WindowsAndMessaging::{
        GetClassNameW, GetDesktopWindow, GetForegroundWindow, GetShellWindow, GetWindowLongW,
        GetWindowRect, GetWindowThreadProcessId, IsWindowVisible, SetWindowLongW, SetWindowPos,
        GWL_EXSTYLE, HWND_BOTTOM, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
        SWP_SHOWWINDOW, WS_EX_APPWINDOW, WS_EX_TOOLWINDOW,
    },
};

#[tauri::command]
pub fn set_status_window_floating(window: WebviewWindow, floating: bool) -> Result<(), String> {
    apply_status_window_tool_style(&window)?;

    if floating {
        set_status_window_z_order(&window, true)?;
    } else {
        set_status_window_z_order(&window, false)?;
    }

    Ok(())
}

#[tauri::command]
pub fn correct_status_window_position(window: WebviewWindow) -> Result<WindowPositionCorrection, String> {
    correct_status_window_position_for_window(&window)
}

pub(crate) fn correct_status_window_position_for_window<R: tauri::Runtime>(    window: &WebviewWindow<R>,
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
pub fn start_window_drag(window: WebviewWindow) -> Result<(), String> {
    window.start_dragging().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn show_status_center_context_menu(
    app: tauri::AppHandle,
    x: f64,
    y: f64,
) -> Result<(), String> {
    let window = app
        .get_webview_window(crate::STATUS_WINDOW_LABEL)
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
            tauri::Position::Physical(PhysicalPosition::new(x as i32, y as i32)),
        )
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_status_center_settings(
    state: State<'_, SharedDesktopProductState<tauri::Wry>>,
) -> Result<crate::types::StatusCenterSettingsPayload, String> {
    let preferences = state
        .lock()
        .map_err(|_| "status center state lock poisoned".to_string())?
        .preferences
        .clone();

    Ok(crate::types::StatusCenterSettingsPayload { preferences })
}

#[tauri::command]
pub fn set_status_center_preferences(
    app: tauri::AppHandle,
    state: State<'_, SharedDesktopProductState<tauri::Wry>>,
    preferences: crate::types::DesktopStatusPreferences,
) -> Result<crate::types::StatusCenterSettingsPayload, String> {
    {
        let mut state = state
            .lock()
            .map_err(|_| "status center state lock poisoned".to_string())?;

        state.preferences = preferences.clone();
        if let Some(menu_items) = &state.menu_items {
            crate::preferences::apply_preference_menu_state(menu_items, &state.preferences);
        }
    }

    crate::preferences::persist_status_center_preferences(&app, &preferences)?;
    crate::emit_status_center_settings(&app, &preferences);

    Ok(crate::types::StatusCenterSettingsPayload { preferences })
}

#[tauri::command]
pub fn show_status_center_window(app: tauri::AppHandle) -> Result<(), String> {
    crate::toggle_status_center_window(&app);
    Ok(())
}

#[tauri::command]
pub fn open_status_center_settings(app: tauri::AppHandle) -> Result<(), String> {
    crate::request_open_settings(&app, "invoke");
    Ok(())
}

#[tauri::command]
pub fn quit_status_center(
    app: tauri::AppHandle,
    shutdown: State<'_, std::sync::Arc<std::sync::atomic::AtomicBool>>,
) -> Result<(), String> {
    shutdown.store(true, std::sync::atomic::Ordering::SeqCst);
    app.exit(0);
    Ok(())
}

// ---------------------------------------------------------------------------
// Position correction helpers (platform-agnostic core).
// ---------------------------------------------------------------------------
pub fn corrected_window_position(
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

// ---------------------------------------------------------------------------
// Win32 helpers.
// ---------------------------------------------------------------------------
#[cfg(windows)]
pub fn foreground_window_is_fullscreen() -> bool {
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

        let mut window_rect = RECT { left: 0, top: 0, right: 0, bottom: 0 };
        if GetWindowRect(hwnd, &mut window_rect) == 0 {
            return false;
        }

        let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        if monitor.is_null() {
            return false;
        }

        let mut monitor_info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            rcMonitor: RECT { left: 0, top: 0, right: 0, bottom: 0 },
            rcWork: RECT { left: 0, top: 0, right: 0, bottom: 0 },
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

#[cfg(not(windows))]
pub fn foreground_window_is_fullscreen() -> bool {
    false
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
                0, 0, 0, 0,
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
            0, 0, 0, 0,
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

#[cfg(windows)]
fn apply_shadow_suppression(hwnd: HWND) {
    unsafe {
        let corner_pref = DWMWCP_DONOTROUND;
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_WINDOW_CORNER_PREFERENCE as u32,
            &corner_pref as *const i32 as *const _,
            std::mem::size_of::<i32>() as u32,
        );

        let backdrop = DWMSBT_NONE;
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_SYSTEMBACKDROP_TYPE,
            &backdrop as *const u32 as *const _,
            std::mem::size_of::<u32>() as u32,
        );
    }
}

#[cfg(windows)]
pub(crate) fn disable_dwm_window_shadow(window: &WebviewWindow, shutdown: std::sync::Arc<std::sync::atomic::AtomicBool>) {
    if let Ok(hwnd) = status_window_hwnd(window) {
        apply_shadow_suppression(hwnd);

        let hwnd_raw = hwnd as isize;
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(500));
            if shutdown.load(std::sync::atomic::Ordering::Relaxed) { return; }
            apply_shadow_suppression(hwnd_raw as HWND);
            std::thread::sleep(std::time::Duration::from_millis(1500));
            if shutdown.load(std::sync::atomic::Ordering::Relaxed) { return; }
            apply_shadow_suppression(hwnd_raw as HWND);
        });
    }
}

#[cfg(not(windows))]
pub(crate) fn disable_dwm_window_shadow(_window: &WebviewWindow, _shutdown: std::sync::Arc<std::sync::atomic::AtomicBool>) {}
