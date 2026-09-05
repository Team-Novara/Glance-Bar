use crate::types::AppRuntimeMetadata;

#[cfg(target_os = "windows")]
const PLATFORM: &str = "windows";
#[cfg(target_os = "macos")]
const PLATFORM: &str = "macos";
#[cfg(target_os = "linux")]
const PLATFORM: &str = "linux";
#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
const PLATFORM: &str = "unknown";

/// Return only coarse build/runtime facts for the privacy-safe diagnostics
/// panel. Provider state is projected in the frontend from bounded records;
/// raw native payloads are never included here.
#[tauri::command]
pub fn get_app_runtime_metadata() -> AppRuntimeMetadata {
    AppRuntimeMetadata {
        app_version: env!("CARGO_PKG_VERSION").to_owned(),
        platform: PLATFORM,
        runtime: "tauri",
    }
}
