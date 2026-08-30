// ---------------------------------------------------------------------------
// Focus Assist, notification summary commands + their registry helpers.
// ---------------------------------------------------------------------------

use crate::types::{FocusAssistStatePayload, NotificationSummaryPayload};

#[cfg(windows)]
pub(crate) fn read_focus_assist_state() -> FocusAssistStatePayload {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ};
    use winreg::RegKey;

    let active = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey_with_flags(
            r"Software\Microsoft\Windows\CurrentVersion\QuietHours",
            KEY_READ,
        )
        .and_then(|key| key.get_value::<u32, _>("NFPEnabled"))
        .map(|v| v == 1)
        .unwrap_or(false);

    let profile = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey_with_flags(
            r"Software\Microsoft\Windows\CurrentVersion\QuietHours",
            KEY_READ,
        )
        .and_then(|key| key.get_value::<String, _>("Profile"))
        .unwrap_or_default();

    FocusAssistStatePayload {
        active,
        profile,
        checked_at: crate::unix_time_ms(),
    }
}

#[cfg(not(windows))]
pub(crate) fn read_focus_assist_state() -> FocusAssistStatePayload {
    FocusAssistStatePayload {
        active: false,
        profile: String::new(),
        checked_at: crate::unix_time_ms(),
    }
}

#[cfg(windows)]
fn write_focus_assist_enabled(enabled: bool) -> Result<(), String> {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_SET_VALUE};
    use winreg::RegKey;
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (key, _) = hkcu
        .create_subkey_with_flags(
            r"Software\Microsoft\Windows\CurrentVersion\QuietHours",
            KEY_READ | KEY_SET_VALUE,
        )
        .map_err(|e| format!("failed to open QuietHours key: {e}"))?;
    let value: u32 = if enabled { 1 } else { 0 };
    key.set_value("NFPEnabled", &value)
        .map_err(|e| format!("failed to write NFPEnabled: {e}"))?;
    Ok(())
}

#[cfg(not(windows))]
fn write_focus_assist_enabled(_enabled: bool) -> Result<(), String> {
    Err("focus assist control is only supported on Windows".into())
}

#[cfg(windows)]
fn read_notification_summary() -> NotificationSummaryPayload {
    let focus = read_focus_assist_state();

    NotificationSummaryPayload {
        focus_assist_active: focus.active,
        checked_at: crate::unix_time_ms(),
    }
}

#[cfg(not(windows))]
fn read_notification_summary() -> NotificationSummaryPayload {
    NotificationSummaryPayload {
        focus_assist_active: false,
        checked_at: crate::unix_time_ms(),
    }
}

#[tauri::command]
pub fn get_focus_assist_state() -> FocusAssistStatePayload {
    read_focus_assist_state()
}

#[tauri::command]
pub fn stop_focus_session() -> Result<crate::types::MediaControlResult, String> {
    write_focus_assist_enabled(false)?;
    Ok(crate::types::MediaControlResult { success: true })
}

#[tauri::command]
pub fn get_notification_summary() -> NotificationSummaryPayload {
    read_notification_summary()
}
