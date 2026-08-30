# Tauri Strategy

Tauri is the boundary between the desktop product and operating-system capabilities.

## Responsibilities

- `src-tauri/src/commands/`: command handlers for system, media, focus, clipboard, and window operations.
- `src-tauri/src/monitoring/`: native event monitoring.
- `src-tauri/src/window/` and `src-tauri/src/media/`: platform-specific implementations.
- `src-tauri/src/preferences.rs` and `tray.rs`: product preferences and tray behavior.
- `src/runtime/tauri/`: TypeScript parsing, diagnostics, and Tauri availability detection.

## Rules

- Commands return validated, coarse payloads and avoid direct disclosure of sensitive data.
- TypeScript checks for Tauri availability and returns safe fallback results outside Tauri.
- Native command access remains in runtime modules or providers, never in React templates.
- Windows is the most complete implementation today. macOS and Linux modules compile with explicit unsupported behavior where a platform capability is not implemented.

## Product events

The native shell emits status-center menu and settings events. TypeScript parses these events in `src/runtime/tauri/desktopProductRuntime.ts`; feature hooks turn them into UI and preference actions.
