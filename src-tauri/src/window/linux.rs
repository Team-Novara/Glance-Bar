// TODO Stage6: X11 EWMH + Wayland layer-shell
// ---------------------------------------------------------------------------
// Linux platform window policy — stub until Stage6.
// ---------------------------------------------------------------------------

use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::WebviewWindow;

use crate::window::PlatformWindowPolicy;

pub struct LinuxPolicy;

#[cfg(target_os = "linux")]
impl PlatformWindowPolicy for LinuxPolicy {
    fn disable_shadow(_window: &WebviewWindow, _shutdown: Arc<AtomicBool>) {
        // TODO Stage6: compositor-specific shadow disabling (picom/kwin rules or _NET_WM_STATE)
    }

    fn apply_tool_style(_window: &WebviewWindow) -> Result<(), String> {
        // TODO Stage6: _NET_WM_WINDOW_TYPE_UTILITY via xlib/xcb
        Ok(())
    }

    fn set_z_order(_window: &WebviewWindow, _floating: bool) -> Result<(), String> {
        // TODO Stage6: _NET_WM_STATE_ABOVE vs _NET_WM_STATE_BELOW (EWMH)
        Ok(())
    }

    fn foreground_is_fullscreen() -> bool {
        // TODO Stage6: _NET_WM_STATE_FULLSCREEN on the active window
        false
    }
}

/// No-op impl so the struct compiles on non-linux targets.
#[cfg(not(target_os = "linux"))]
impl PlatformWindowPolicy for LinuxPolicy {
    fn disable_shadow(_window: &WebviewWindow, _shutdown: Arc<AtomicBool>) {}

    fn apply_tool_style(_window: &WebviewWindow) -> Result<(), String> {
        Ok(())
    }

    fn set_z_order(_window: &WebviewWindow, _floating: bool) -> Result<(), String> {
        Ok(())
    }

    fn foreground_is_fullscreen() -> bool {
        false
    }
}
