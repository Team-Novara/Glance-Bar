// ---------------------------------------------------------------------------
// Window-management commands + position-correction helpers.
// ---------------------------------------------------------------------------
// The #[tauri::command] handlers live here. Platform-specific unsafe work
// (DWM shadow suppression, z-order, tool-window styling, fullscreen detection)
// is delegated to the active PlatformWindowPolicy selected below.

use crate::types::{
    SharedDesktopProductState, StatusCenterSettingsPayload, StatusWindowPosition,
    WindowPositionCorrection,
};
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

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct WorkAreaGeometry {
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    scale_factor_milli: u16,
}

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

/// Restore a saved logical position, or place a first-run window at the
/// bottom-right of the first available work area. The final correction keeps
/// the window visible if monitors or DPI changed since the last run.
pub(crate) fn restore_status_window_position_for_window<R: tauri::Runtime>(
    window: &WebviewWindow<R>,
    saved: Option<&StatusWindowPosition>,
) -> Result<WindowPositionCorrection, String> {
    let monitors = window
        .available_monitors()
        .map_err(|error| error.to_string())?;
    let size = window.outer_size().map_err(|error| error.to_string())?;
    let width = size.width.min(i32::MAX as u32) as i32;
    let height = size.height.min(i32::MAX as u32) as i32;

    if let Some(saved) = saved {
        if let Some(target) = find_restore_work_area(saved, &monitors) {
            let (x, y) = logical_window_position(saved, target);
            window
                .set_position(PhysicalPosition::new(x, y))
                .map_err(|error| error.to_string())?;
        }
    } else if let Some(monitor) = monitors.first() {
        let geometry = work_area_geometry(monitor);
        let (x, y) = default_window_position(width, height, geometry);
        window
            .set_position(PhysicalPosition::new(x, y))
            .map_err(|error| error.to_string())?;
    }

    correct_status_window_position_for_window(window)
}

fn capture_status_window_position<R: tauri::Runtime>(
    window: &WebviewWindow<R>,
) -> Result<StatusWindowPosition, String> {
    let position = window.outer_position().map_err(|error| error.to_string())?;
    let monitors = window
        .available_monitors()
        .map_err(|error| error.to_string())?;
    let geometry = monitors
        .iter()
        .find(|monitor| {
            let geometry = work_area_geometry(monitor);
            point_inside_work_area(position.x, position.y, geometry)
        })
        .or_else(|| monitors.first())
        .map(work_area_geometry)
        .ok_or_else(|| "no monitor available for window position".to_string())?;

    Ok(StatusWindowPosition {
        x: position.x,
        y: position.y,
        work_area_x: geometry.x,
        work_area_y: geometry.y,
        work_area_width: geometry.width.max(1) as u32,
        work_area_height: geometry.height.max(1) as u32,
        scale_factor_milli: geometry.scale_factor_milli,
    })
}

fn work_area_geometry(monitor: &tauri::window::Monitor) -> WorkAreaGeometry {
    let work_area = monitor.work_area();
    WorkAreaGeometry {
        x: work_area.position.x,
        y: work_area.position.y,
        width: work_area.size.width.min(i32::MAX as u32) as i32,
        height: work_area.size.height.min(i32::MAX as u32) as i32,
        scale_factor_milli: scale_factor_milli(monitor.scale_factor()),
    }
}

fn scale_factor_milli(value: f64) -> u16 {
    if !value.is_finite() || value <= 0.0 {
        return 1_000;
    }

    (value * 1_000.0).round().clamp(1.0, 65_535.0) as u16
}

fn point_inside_work_area(x: i32, y: i32, area: WorkAreaGeometry) -> bool {
    let right = i64::from(area.x) + i64::from(area.width);
    let bottom = i64::from(area.y) + i64::from(area.height);
    i64::from(x) >= i64::from(area.x)
        && i64::from(x) < right
        && i64::from(y) >= i64::from(area.y)
        && i64::from(y) < bottom
}

fn find_restore_work_area(
    saved: &StatusWindowPosition,
    monitors: &[tauri::window::Monitor],
) -> Option<WorkAreaGeometry> {
    let areas = monitors.iter().map(work_area_geometry).collect::<Vec<_>>();
    areas
        .iter()
        .copied()
        .find(|area| area.x == saved.work_area_x && area.y == saved.work_area_y)
        .or_else(|| {
            let saved_center_x =
                i64::from(saved.work_area_x) + i64::from(saved.work_area_width.max(1)) / 2;
            let saved_center_y =
                i64::from(saved.work_area_y) + i64::from(saved.work_area_height.max(1)) / 2;
            areas.into_iter().min_by_key(|area| {
                let center_x = i64::from(area.x) + i64::from(area.width.max(1)) / 2;
                let center_y = i64::from(area.y) + i64::from(area.height.max(1)) / 2;
                let dx = center_x - saved_center_x;
                let dy = center_y - saved_center_y;
                dx.saturating_mul(dx).saturating_add(dy.saturating_mul(dy))
            })
        })
}

fn logical_window_position(saved: &StatusWindowPosition, target: WorkAreaGeometry) -> (i32, i32) {
    let saved_scale = i64::from(saved.scale_factor_milli.max(1));
    let target_scale = i64::from(target.scale_factor_milli.max(1));
    let offset_x = i64::from(saved.x) - i64::from(saved.work_area_x);
    let offset_y = i64::from(saved.y) - i64::from(saved.work_area_y);
    let x = i64::from(target.x) + offset_x.saturating_mul(target_scale) / saved_scale;
    let y = i64::from(target.y) + offset_y.saturating_mul(target_scale) / saved_scale;
    (saturating_i32(x), saturating_i32(y))
}

fn default_window_position(width: i32, height: i32, area: WorkAreaGeometry) -> (i32, i32) {
    let x = i64::from(area.x) + i64::from(area.width)
        - i64::from(width)
        - i64::from(STATUS_WINDOW_EDGE_MARGIN);
    let y = i64::from(area.y) + i64::from(area.height)
        - i64::from(height)
        - i64::from(STATUS_WINDOW_EDGE_MARGIN);
    (saturating_i32(x), saturating_i32(y))
}

fn saturating_i32(value: i64) -> i32 {
    value.clamp(i64::from(i32::MIN), i64::from(i32::MAX)) as i32
}

fn ensure_window_drag_unlocked(locked: bool) -> Result<(), String> {
    if locked {
        return Err("status center position is locked".to_string());
    }

    Ok(())
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
pub fn start_window_drag(
    state: State<'_, SharedDesktopProductState<tauri::Wry>>,
    window: WebviewWindow,
) -> Result<(), String> {
    let locked = state
        .lock()
        .map_err(|_| "status center state lock poisoned".to_string())?
        .preferences
        .lock_position;
    ensure_window_drag_unlocked(locked)?;

    window.start_dragging().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn persist_status_window_position(
    app: tauri::AppHandle,
    state: State<'_, SharedDesktopProductState<tauri::Wry>>,
    window: WebviewWindow,
) -> Result<StatusCenterSettingsPayload, String> {
    persist_status_window_position_for_window(&app, state.inner(), &window)
}

pub(crate) fn persist_status_window_position_for_window<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    state: &SharedDesktopProductState<R>,
    window: &WebviewWindow<R>,
) -> Result<StatusCenterSettingsPayload, String> {
    correct_status_window_position_for_window(window)?;
    let position = capture_status_window_position(window)?;
    let preferences = {
        let mut state = state
            .lock()
            .map_err(|_| "status center state lock poisoned".to_string())?;
        state.preferences.window_position = Some(position);
        state.preferences.clone()
    };

    crate::preferences::persist_status_center_preferences(app, &preferences)?;
    crate::emit_status_center_settings(app, &preferences);

    Ok(StatusCenterSettingsPayload { preferences })
}

#[tauri::command]
pub fn reset_status_window_position(
    app: tauri::AppHandle,
    state: State<'_, SharedDesktopProductState<tauri::Wry>>,
    window: WebviewWindow,
) -> Result<StatusCenterSettingsPayload, String> {
    reset_status_window_position_for_window(&app, state.inner(), &window)
}

pub(crate) fn reset_status_window_position_for_window<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    state: &SharedDesktopProductState<R>,
    window: &WebviewWindow<R>,
) -> Result<StatusCenterSettingsPayload, String> {
    let monitors = window
        .available_monitors()
        .map_err(|error| error.to_string())?;
    let size = window.outer_size().map_err(|error| error.to_string())?;
    if let Some(monitor) = monitors.first() {
        let geometry = work_area_geometry(monitor);
        let width = size.width.min(i32::MAX as u32) as i32;
        let height = size.height.min(i32::MAX as u32) as i32;
        let (x, y) = default_window_position(width, height, geometry);
        window
            .set_position(PhysicalPosition::new(x, y))
            .map_err(|error| error.to_string())?;
    }

    let preferences = {
        let mut state = state
            .lock()
            .map_err(|_| "status center state lock poisoned".to_string())?;
        state.preferences.window_position = None;
        state.preferences.clone()
    };

    crate::preferences::persist_status_center_preferences(app, &preferences)?;
    crate::emit_status_center_settings(app, &preferences);

    Ok(StatusCenterSettingsPayload { preferences })
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

    #[test]
    fn logical_position_scales_with_dpi_changes() {
        let saved = StatusWindowPosition {
            x: 400,
            y: 300,
            work_area_x: 0,
            work_area_y: 0,
            work_area_width: 1_920,
            work_area_height: 1_040,
            scale_factor_milli: 1_000,
        };
        let target = WorkAreaGeometry {
            x: 100,
            y: 200,
            width: 2_560,
            height: 1_440,
            scale_factor_milli: 1_250,
        };

        assert_eq!(logical_window_position(&saved, target), (600, 575));
    }

    #[test]
    fn logical_position_handles_invalid_saved_scale_safely() {
        let saved = StatusWindowPosition {
            x: i32::MAX,
            y: i32::MIN,
            work_area_x: 0,
            work_area_y: 0,
            work_area_width: 1,
            work_area_height: 1,
            scale_factor_milli: 0,
        };
        let target = WorkAreaGeometry {
            x: 10,
            y: 20,
            width: 100,
            height: 100,
            scale_factor_milli: 1_000,
        };

        let (x, y) = logical_window_position(&saved, target);
        assert_eq!(x, i32::MAX);
        assert_eq!(y, i32::MIN);
    }

    #[test]
    fn default_position_uses_work_area_edges_and_margin() {
        let area = WorkAreaGeometry {
            x: -1_920,
            y: 0,
            width: 1_920,
            height: 1_040,
            scale_factor_milli: 1_000,
        };

        assert_eq!(default_window_position(303, 64, area), (-311, 968));
    }

    #[test]
    fn locked_window_rejects_native_drag_start() {
        assert!(ensure_window_drag_unlocked(true).is_err());
        assert!(ensure_window_drag_unlocked(false).is_ok());
    }
}
