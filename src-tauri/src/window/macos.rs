// TODO Stage6: NSWindowLevelFloating + NSWindowStyleMaskBorderless
// ---------------------------------------------------------------------------
// macOS platform window policy — stub until Stage6.
// ---------------------------------------------------------------------------

use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::WebviewWindow;

use crate::window::PlatformWindowPolicy;

pub struct MacPolicy;

#[cfg(target_os = "macos")]
impl PlatformWindowPolicy for MacPolicy {
    fn disable_shadow(_window: &WebviewWindow, _shutdown: Arc<AtomicBool>) {
        // TODO Stage6: NSWindow shadow suppression via ignoresMouseEvents + transparent titlebar
    }

    fn apply_tool_style(_window: &WebviewWindow) -> Result<(), String> {
        // TODO Stage6: NSWindowStyleMaskBorderless + NSUtilityWindowMask
        Ok(())
    }

    fn set_z_order(_window: &WebviewWindow, _floating: bool) -> Result<(), String> {
        // TODO Stage6: NSWindowLevelFloating vs NSWindowLevelStatusBar
        Ok(())
    }

    fn foreground_is_fullscreen() -> bool {
        // TODO Stage6: NSScreen containing NSApp.keyWindow covers main screen
        false
    }
}

/// No-op impl so the struct compiles on non-macos targets.
#[cfg(not(target_os = "macos"))]
impl PlatformWindowPolicy for MacPolicy {
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
