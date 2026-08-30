// ---------------------------------------------------------------------------
// Preferences module
// ---------------------------------------------------------------------------
// All JSON-on-disk persistence for desktop status center preferences.
// `lib.rs` calls load / persist; this module owns the file path, IO, and
// serde_json encoding.

use crate::types::{DesktopStatusPreferences, StatusCenterMenuItems};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

pub(crate) const PREFERENCES_FILE_NAME: &str = "status-center-preferences.json";

pub(crate) fn status_center_preferences_path<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<PathBuf, String> {
    let mut path = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("failed to resolve app config dir: {error}"))?;
    path.push(PREFERENCES_FILE_NAME);
    Ok(path)
}

pub(crate) fn load_status_center_preferences<R: tauri::Runtime>(
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

pub(crate) fn persist_status_center_preferences<R: tauri::Runtime>(
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

pub(crate) fn apply_preference_menu_state<R: tauri::Runtime>(
    menu_items: &StatusCenterMenuItems<R>,
    preferences: &DesktopStatusPreferences,
) {
    let _ = menu_items
        .always_float
        .set_checked(preferences.always_float);
    let _ = menu_items
        .avoid_fullscreen
        .set_checked(preferences.avoid_fullscreen);
    let _ = menu_items
        .lock_position
        .set_checked(preferences.lock_position);
}
