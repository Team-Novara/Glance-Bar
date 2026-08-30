// ---------------------------------------------------------------------------
// Windows platform window policy — real Win32 implementation.
// ---------------------------------------------------------------------------
// Owns all the unsafe Win32 interop: DWM shadow suppression, fullscreen
// detection, z-order control, and tool-window styling. On non-windows targets
// this file still compiles (the no-op impl below keeps the crate cross-platform),
// but callers select this struct only via #[cfg(windows)].

use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::WebviewWindow;

use crate::window::PlatformWindowPolicy;

// windows-sys is a cfg(windows)-only dependency — gate the whole import block.
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

// DWMWA_SYSTEMBACKDROP_TYPE — disables Mica/Acrylic backdrop (Win11 22H2+)
#[cfg(windows)]
const DWMWA_SYSTEMBACKDROP_TYPE: u32 = 38;
#[cfg(windows)]
const DWMSBT_NONE: i32 = 1;
#[cfg(windows)]
const EDGE_TOLERANCE: i32 = 2;

pub struct WindowsPolicy;

#[cfg(windows)]
impl PlatformWindowPolicy for WindowsPolicy {
    fn disable_shadow(window: &WebviewWindow, shutdown: Arc<AtomicBool>) {
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
                if shutdown.load(std::sync::atomic::Ordering::Relaxed) {
                    return;
                }
                apply_shadow_suppression(hwnd_raw as HWND);
                std::thread::sleep(std::time::Duration::from_millis(1500));
                if shutdown.load(std::sync::atomic::Ordering::Relaxed) {
                    return;
                }
                apply_shadow_suppression(hwnd_raw as HWND);
            });
        }
    }

    fn apply_tool_style(window: &WebviewWindow) -> Result<(), String> {
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

    fn set_z_order(window: &WebviewWindow, floating: bool) -> Result<(), String> {
        let hwnd = status_window_hwnd(window)?;
        let insert_after = if floating { HWND_TOPMOST } else { HWND_BOTTOM };
        let visibility_flag = if floating {
            SWP_SHOWWINDOW
        } else {
            Default::default()
        };

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

    fn foreground_is_fullscreen() -> bool {
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
}

#[cfg(not(windows))]
impl PlatformWindowPolicy for WindowsPolicy {
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
            &backdrop as *const i32 as *const _,
            std::mem::size_of::<i32>() as u32,
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
