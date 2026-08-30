// ---------------------------------------------------------------------------
// Commands module — all #[tauri::command] handlers extracted from lib.rs.
// ---------------------------------------------------------------------------
// Each sub-module owns one concern. lib.rs wires these into the
// invoke_handler! macro and keeps only run() + glue + constants.

pub mod clipboard;
pub mod focus;
pub mod media;
pub mod system;
pub mod window;
