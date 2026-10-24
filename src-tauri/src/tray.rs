// ---------------------------------------------------------------------------
// Tray module
// ---------------------------------------------------------------------------
// Builds the system tray icon and its context menu. The tray menu IDs
// (TRAY_MENU_SHOW_STATUS_CENTER, TRAY_MENU_OPEN_SETTINGS, TRAY_MENU_QUIT)
// are exported so lib.rs can route tray-menu events through the same
// handle_status_center_menu_event switch. `attach_tray` is the setup entry
// point and takes the left-click callback from the caller.
//
// Menu labels follow the in-app language preference: both the en and zh-CN
// label sets live in the bounded table below (no locale files cross into
// Rust), and English is the fallback for missing/unknown values. The menu
// is rebuilt in place via `rebuild_tray_menu` when the preference changes.

use crate::types::AppLanguage;
use tauri::menu::{Menu, MenuBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::AppHandle;

pub(crate) const TRAY_ID: &str = "status-center-tray";
pub(crate) const TRAY_MENU_SHOW_STATUS_CENTER: &str = "tray-show-status-center";
pub(crate) const TRAY_MENU_OPEN_SETTINGS: &str = "tray-open-settings";
pub(crate) const TRAY_MENU_QUIT: &str = "quit";

/// Bounded tray label set for one language. The tooltip is the product name
/// and stays identical across languages.
pub(crate) struct TrayMenuLabels {
    pub show_status_center: &'static str,
    pub open_settings: &'static str,
    pub quit: &'static str,
}

/// Label table keyed by [`AppLanguage`]. Kept small and explicit on purpose:
/// the tray surface is three rows, and both language sets live in Rust so
/// the shell never depends on frontend locale files.
pub(crate) fn tray_menu_labels(language: AppLanguage) -> TrayMenuLabels {
    match language {
        AppLanguage::En => TrayMenuLabels {
            show_status_center: "Show / Recall Status Center",
            open_settings: "Open Settings",
            quit: "Quit",
        },
        // Simplified Chinese: show/recall status center, open settings, quit.
        AppLanguage::ZhCn => TrayMenuLabels {
            show_status_center:
                "\u{663E}\u{793A} / \u{53EC}\u{56DE}\u{72B6}\u{6001}\u{4E2D}\u{5FC3}",
            open_settings: "\u{6253}\u{5F00}\u{8BBE}\u{7F6E}",
            quit: "\u{9000}\u{51FA}",
        },
    }
}

pub(crate) fn create_tray_menu<R: tauri::Runtime>(
    app: &AppHandle<R>,
    language: AppLanguage,
) -> Result<Menu<R>, tauri::Error> {
    let labels = tray_menu_labels(language);
    MenuBuilder::new(app)
        .text(TRAY_MENU_SHOW_STATUS_CENTER, labels.show_status_center)
        .text(TRAY_MENU_OPEN_SETTINGS, labels.open_settings)
        .separator()
        .text(TRAY_MENU_QUIT, labels.quit)
        .build()
}

/// Rebuilds the tray menu after the language preference changes, using the
/// same propagation path as every other preference change (the
/// `set_status_center_preferences` command) — no dedicated IPC channel. A
/// rebuild failure leaves the previous menu in place, so the tray keeps a
/// usable menu in the prior language instead of losing it.
pub(crate) fn rebuild_tray_menu<R: tauri::Runtime>(app: &AppHandle<R>, language: AppLanguage) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };
    if let Ok(menu) = create_tray_menu(app, language) {
        let _ = tray.set_menu(Some(menu));
    }
}

/// Builds the language-aware tray menu and attaches the tray icon in one
/// step, so the lib.rs setup closure stays small. The initial labels come
/// from the persisted language preference.
pub(crate) fn attach_tray<R, F>(
    app: &AppHandle<R>,
    preferences: &crate::types::DesktopStatusPreferences,
    on_left_click: F,
) -> Result<(), tauri::Error>
where
    R: tauri::Runtime,
    F: Fn(&AppHandle<R>) + Send + Sync + 'static,
{
    let tray_menu = create_tray_menu(
        app,
        AppLanguage::from_stored(preferences.language.as_deref()),
    )?;
    let _tray = build_tray_icon(app, &tray_menu, on_left_click)?;
    Ok(())
}

fn build_tray_icon<R, F>(
    app: &AppHandle<R>,
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
        .tooltip("Glance Bar")
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

    let tray = tray_builder.build(app)?;
    let _ = tray.set_show_menu_on_left_click(false);
    Ok(tray)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::AppLanguage;

    #[test]
    fn english_language_selects_english_labels() {
        let labels = tray_menu_labels(AppLanguage::En);

        assert_eq!(labels.show_status_center, "Show / Recall Status Center");
        assert_eq!(labels.open_settings, "Open Settings");
        assert_eq!(labels.quit, "Quit");
    }

    #[test]
    fn zh_cn_language_selects_chinese_labels() {
        let labels = tray_menu_labels(AppLanguage::ZhCn);

        assert_eq!(
            labels.show_status_center,
            "\u{663E}\u{793A} / \u{53EC}\u{56DE}\u{72B6}\u{6001}\u{4E2D}\u{5FC3}"
        );
        assert_eq!(labels.open_settings, "\u{6253}\u{5F00}\u{8BBE}\u{7F6E}");
        assert_eq!(labels.quit, "\u{9000}\u{51FA}");
    }

    #[test]
    fn label_sets_differ_per_language_for_every_row() {
        let en = tray_menu_labels(AppLanguage::En);
        let zh = tray_menu_labels(AppLanguage::ZhCn);

        assert_ne!(en.show_status_center, zh.show_status_center);
        assert_ne!(en.open_settings, zh.open_settings);
        assert_ne!(en.quit, zh.quit);
    }

    #[test]
    fn missing_or_unknown_language_falls_back_to_english() {
        assert_eq!(AppLanguage::from_stored(None), AppLanguage::En);
        assert_eq!(AppLanguage::from_stored(Some("fr")), AppLanguage::En);
        assert_eq!(AppLanguage::from_stored(Some("")), AppLanguage::En);
        assert_eq!(
            AppLanguage::from_stored(Some("ZH_CN")),
            AppLanguage::En,
            "only the exact zh-CN tag is recognized"
        );
    }

    #[test]
    fn known_language_codes_round_trip_through_as_str() {
        assert_eq!(AppLanguage::from_stored(Some("en")), AppLanguage::En);
        assert_eq!(AppLanguage::from_stored(Some("zh-CN")), AppLanguage::ZhCn);
        assert_eq!(AppLanguage::En.as_str(), "en");
        assert_eq!(AppLanguage::ZhCn.as_str(), "zh-CN");
    }
}
