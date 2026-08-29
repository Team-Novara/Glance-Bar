// ---------------------------------------------------------------------------
// Tray module
// ---------------------------------------------------------------------------
// Builds the system tray icon and its context menu. The tray menu IDs
// (TRAY_MENU_SHOW_STATUS_CENTER, TRAY_MENU_OPEN_SETTINGS, TRAY_MENU_QUIT)
// are exported so lib.rs can route tray-menu events through the same
// handle_status_center_menu_event switch. Tray-icon construction is exposed
// as `build_tray_icon` so the caller can supply the left-click callback.

use tauri::menu::{Menu, MenuBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::AppHandle;

pub(crate) const TRAY_ID: &str = "status-center-tray";
pub(crate) const TRAY_MENU_SHOW_STATUS_CENTER: &str = "tray-show-status-center";
pub(crate) const TRAY_MENU_OPEN_SETTINGS: &str = "tray-open-settings";
pub(crate) const TRAY_MENU_QUIT: &str = "quit";

pub(crate) fn create_tray_menu<R: tauri::Runtime>(
    app: &AppHandle<R>,
) -> Result<Menu<R>, tauri::Error> {
    MenuBuilder::new(app)
        .text(
            TRAY_MENU_SHOW_STATUS_CENTER,
            "\u{663E}\u{793A}\u{0020}/\u{0020}\u{53EC}\u{56DE}\u{72B6}\u{6001}\u{4E2D}\u{5FC3}",
        )
        .text(TRAY_MENU_OPEN_SETTINGS, "\u{6253}\u{5F00}\u{8BBE}\u{7F6E}")
        .separator()
        .text(TRAY_MENU_QUIT, "\u{9000}\u{51FA}")
        .build()
}

pub(crate) fn build_tray_icon<R, F>(
    app: AppHandle<R>,
    tray_menu: &Menu<R>,
    on_left_click: F,
) -> Result<tauri::tray::TrayIcon<R>, tauri::Error>
where
    R: tauri::Runtime,
    F: Fn(&AppHandle<R>) + Send + Sync + 'static,
{
    let mut tray_builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(tray_menu)
        .show_menu_on_left_click(false)
        .tooltip("Cober Windows Bar")
        .on_tray_icon_event(move |tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                on_left_click(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        tray_builder = tray_builder.icon(icon);
    }

    let tray = tray_builder.build(&app)?;
    let _ = tray.set_show_menu_on_left_click(false);
    Ok(tray)
}
