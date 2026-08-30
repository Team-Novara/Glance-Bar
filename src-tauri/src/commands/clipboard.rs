// ---------------------------------------------------------------------------
// Clipboard + URL open commands.
// ---------------------------------------------------------------------------

use crate::types::ClipboardContent;

#[tauri::command]
pub fn open_url_in_browser(url: String) -> Result<(), String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("only http/https URLs are allowed".into());
    }
    std::process::Command::new("explorer")
        .arg(&url)
        .spawn()
        .map_err(|e| format!("failed to open URL: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn get_clipboard_content() -> Result<ClipboardContent, String> {
    let mut clipboard =
        arboard::Clipboard::new().map_err(|e| format!("clipboard init failed: {e}"))?;
    let text = clipboard
        .get_text()
        .map_err(|e| format!("clipboard read failed: {e}"))?;
    let source_app = String::new();

    Ok(ClipboardContent {
        text,
        source_app,
        copied_at: crate::unix_time_ms(),
    })
}

#[tauri::command]
pub fn set_clipboard_content(text: String) -> Result<(), String> {
    let mut clipboard =
        arboard::Clipboard::new().map_err(|e| format!("clipboard init failed: {e}"))?;
    clipboard
        .set_text(&text)
        .map_err(|e| format!("clipboard write failed: {e}"))?;
    Ok(())
}
