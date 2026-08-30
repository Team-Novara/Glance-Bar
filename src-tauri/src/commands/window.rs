// ---------------------------------------------------------------------------
// Window-management commands + position-correction helpers.
// ---------------------------------------------------------------------------
// The #[tauri::command] handlers live here. Platform-specific unsafe work
// (DWM shadow suppression, z-order, tool-window styling, fullscreen detection)
// is delegated to the active PlatformWindowPolicy selected below.

use crate::types::{SharedDesktopProductState, WindowPositionCorrection};
use tauri::{Manager, PhysicalPosition, State, WebviewWindow};

#[cfg(target_os = "linux")]
use crate::window::linux::LinuxPolicy as ActivePolicy;
#[cfg(target_os = "macos")]
use crate::window::macos::MacPolicy as ActivePolicy;
#[cfg(windows)]
use crate::window::windows::WindowsPolicy as ActivePolicy;

// Bring PlatformWindowPolicy into scope so trait methods are callable on the
// selected ActivePolicy via path-style dispatch (ActivePolicy::method).
use crate::window::PlatformWindowPolicy;

pub(crate) const STATUS_WINDOW_EDGE_MARGIN: i32 = 8;

// ---------------------------------------------------------------------------
// Commands.
// ---------------------------------------------------------------------------
#[tauri::command]
pub fn set_status_window_floating(window: WebviewWindow, floating: bool) -> Result<(), String> {
    ActivePolicy::apply_tool_style(&window)?;

    if floating {
        ActivePolicy::set_z_order(&window, true)?;
    } else {
        ActivePolicy::set_z_order(&window, false)?;
    }

    Ok(())
}

#[tauri::command]
pub fn correct_status_window_position(
    window: WebviewWindow,
) -> Result<WindowPositionCorrection, String> {
    correct_status_window_position_for_window(&window)
}

/// Called from lib.rs (global-shortcut reveal path) and the command above.
pub(crate) fn correct_status_window_position_for_window<R: tauri::Runtime>(
    window: &WebviewWindow<R>,
) -> Result<WindowPositionCorrection, String> {
    let position = window.outer_position().map_err(|error| error.to_string())?;
    let size = window.outer_size().map_err(|error| error.to_string())?;
    let monitors = window
        .available_monitors()
        .map_err(|error| error.to_string())?;
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

/// Called from lib.rs setup — delegates shadow suppression to the active policy.
pub(crate) fn disable_dwm_window_shadow(
    window: &WebviewWindow,
    shutdown: std::sync::Arc<std::sync::atomic::AtomicBool>,
) {
    ActivePolicy::disable_shadow(window, shutdown);
}

/// Called from commands/system.rs overlay-policy computation.
pub fn foreground_window_is_fullscreen() -> bool {
    ActivePolicy::foreground_is_fullscreen()
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
// Tests — pure-function position math only.
// ---------------------------------------------------------------------------
// `clamp_window_axis` and the empty-monitor fast path inside
// `corrected_window_position` have no side effects and are safe to cover in
// unit tests. The `tauri::Monitor` struct's fields are `pub(crate)` in
// Tauri 2, so we cannot construct non-empty monitor slices from a unit test
// — that branch is exercised by the real-desktop integration flow.

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clamp_window_axis_clamps_within_bounds() {
        let result = clamp_window_axis(0, 100, 0, 1000);
        assert_eq!(result, 0);
    }

    #[test]
    fn clamp_window_axis_clamps_to_max() {
        // max_position = area_start + area_size - window_size - margin
        //              = 0 + 1000 - 100 - 8 = 892
        let result = clamp_window_axis(5000, 100, 0, 1000);
        assert_eq!(result, 892);
    }

    #[test]
    fn clamp_window_axis_returns_start_when_window_too_large() {
        // max_position = 0 + 100 - 5000 - 8 < 0, so the guard returns area_start
        let result = clamp_window_axis(500, 5000, 0, 100);
        assert_eq!(result, 0);
    }

    #[test]
    fn clamp_window_axis_respects_nonzero_area_start() {
        // area starts at x=100; max_position = 100 + 500 - 50 - 8 = 542
        let in_bounds = clamp_window_axis(100, 50, 100, 500);
        assert_eq!(in_bounds, 100);

        let over_max = clamp_window_axis(9999, 50, 100, 500);
        assert_eq!(over_max, 542);
    }

    #[test]
    fn corrected_window_position_returns_unchanged_with_no_monitors() {
        let monitors: &[tauri::window::Monitor] = &[];
        let (x, y) = corrected_window_position(100, 200, 300, 64, monitors);
        assert_eq!((x, y), (100, 200));
    }
}
