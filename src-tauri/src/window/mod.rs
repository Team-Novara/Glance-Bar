// ---------------------------------------------------------------------------
// Platform window-policy module.
// ---------------------------------------------------------------------------
// Each platform owns one file behind the PlatformWindowPolicy trait:
// windows.rs (real Win32 impl), macos.rs and linux.rs (stubs, TODO Stage6).
// commands/window.rs selects the active policy via #[cfg] and delegates the
// unsafe / platform-specific work here, so the command layer stays thin.

pub mod linux;
pub mod macos;
pub mod windows;

use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::WebviewWindow;

/// Operations that differ per-platform: DWM shadow suppression, z-order
/// control, tool-window styling, and fullscreen detection.
///
/// Implemented by `WindowsPolicy`, `MacPolicy`, and `LinuxPolicy`. The active
/// implementation is selected at `#[cfg]` time by `commands/window.rs`.
pub trait PlatformWindowPolicy {
    /// Strip DWM shadow / rounded-corner artifacts and reapply after the
    /// WebView2/DWM late-init resets (windows only; no-op elsewhere).
    fn disable_shadow(window: &WebviewWindow, shutdown: Arc<AtomicBool>);

    /// Apply WS_EX_TOOLWINDOW and drop WS_EX_APPWINDOW (windows only).
    fn apply_tool_style(window: &WebviewWindow) -> Result<(), String>;

    /// Pin the window topmost or send it to the bottom (windows only).
    fn set_z_order(window: &WebviewWindow, floating: bool) -> Result<(), String>;

    /// True if the foreground window covers the nearest monitor (windows only).
    fn foreground_is_fullscreen() -> bool;
}
