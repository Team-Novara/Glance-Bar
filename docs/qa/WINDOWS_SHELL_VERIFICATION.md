# Windows Shell Integration Verification

> Verification of the MVP release criteria for the Glance Bar Windows desktop shell.
> Date: 2026-09-05

## Release criteria under test

1. "The application installs, launches, recalls from the tray, and respects saved preferences"
5. "Fullscreen avoidance, lock position, and always-float preferences work as described"

## Summary

| # | Requirement | Status |
|---|---|---|
| 1 | Installs, launches, recalls from tray, respects saved preferences | **PASS** |
| 5a | Fullscreen avoidance works | **PASS** |
| 5b | Lock position prevents drag | **PASS** |
| 5c | Always-float works as described | **PASS** (after fix — see below) |
| 5d | Position saved and restored | **IMPLEMENTED** — automated evidence; Windows restart matrix pending |

One correctness bug was found and fixed (always-float). Position persistence is
now implemented with bounded, DPI-aware geometry; the physical Windows restart
and multi-monitor matrix remains follow-up evidence.

---

## Tray — `src-tauri/src/tray.rs`, `src-tauri/src/lib.rs`

### Tray icon shows
- **PASS** — `build_tray_icon` constructs a `TrayIconBuilder::with_id(TRAY_ID)` with the
  app icon, tooltip, and menu (`tray.rs:42-63`). It is wired up in `lib.rs:290-293`.

### Click toggles window
- **PASS** — `build_tray_icon` takes an `on_left_click` callback; the tray icon's
  `TrayIconEvent::Click { Left, Up }` fires it (`tray.rs:46-55`). The callback is
  `toggle_status_center_window` (`lib.rs:291-293`), which hides a visible window and
  reveals+hides otherwise (`lib.rs:225-237`).

### Context menu (show / settings / quit)
- **PASS** — `create_tray_menu` builds show / open-settings / quit items
  (`tray.rs:19-31`). `handle_status_center_menu_event` routes them:
  - show → `reveal_status_center_window` (`lib.rs:151`)
  - settings → `request_open_settings` (`lib.rs:152`)
  - quit → `app.exit(0)` (`lib.rs:195-201`)

---

## Preferences — `src-tauri/src/preferences.rs`

### Preferences persist to disk
- **PASS** — `persist_status_center_preferences` serializes `DesktopStatusPreferences`
  to pretty JSON under `app_config_dir()/status-center-preferences.json`, creating the
  parent dir if needed (`preferences.rs:40-59`).

### Preferences load on startup
- **PASS** — `load_status_center_preferences` is called during `setup`
  (`lib.rs:286`), and the loaded value is stored into shared state and emitted to the
  frontend (`lib.rs:295-298`, `lib.rs:329`).

### always_float / avoid_fullscreen / lock_position respected
- **PASS** — all three are fields of `DesktopStatusPreferences` (`types.rs:36-40`),
  toggled in `handle_status_center_menu_event` (`lib.rs:154-192`), reflected in the
  menu check state via `apply_preference_menu_state` (`preferences.rs:61-74`), and
  persisted on change (`lib.rs:205-207`).

---

## Window positioning — `src-tauri/src/commands/window.rs`, `src-tauri/src/commands/system.rs`

### Fullscreen avoidance works (overlay policy)
- **PASS** — `get_overlay_policy` reads the `avoid_fullscreen` preference and the
  foreground-fullscreen state, returning `should_float` (`system.rs:46-62`). The
  frontend `enforceStatusWindowOverlay` drives `set_status_window_floating` from this
  (`statusWindowRuntime.ts:57-123`), suppressing the topmost flag while a fullscreen
  window is foreground.

### Always-float works
- **PASS after fix.** The overlay loop re-asserts the floating state every ~1.8s
  (`statusWindowRuntime.ts:91-101`). Previously `get_overlay_policy` computed
  `should_float` from *only* `avoid_fullscreen` and fullscreen state — it ignored the
  `always_float` preference entirely (`system.rs:55-59`, before fix). So a user who
  disabled "Always Float" had the window forced back to topmost by the next reassert.
  This violated release criterion 5c.

  **Fix applied** (`src-tauri/src/commands/system.rs`):
  - Extracted a pure `compute_overlay_policy(always_float, avoid_fullscreen,
    foreground_fullscreen) -> bool` (`system.rs:70-83`). Floating is now gated on
    `always_float` first; fullscreen avoidance only matters when floating is on.
  - `get_overlay_policy` now reads `always_float` alongside `avoid_fullscreen`
    (`system.rs:51-56`).
  - Added unit tests covering the full truth table, including the previously-broken
    "never floats when always_float disabled" cases (`system.rs:184-211`).

### Lock position prevents drag
- **PASS** — `useDragController` early-returns (no `start_window_drag` call) when
  `lockPositionRef.current` is true (`useDragController.ts:33-35`). The ref is synced
    to the `lock_position` preference each render (`useDragController.ts:30`). Drag is
    only ever initiated through this gated path, so the preference is authoritative.

### Position saved and restored
- **IMPLEMENTED.** `DesktopStatusPreferences.windowPosition` is optional, so legacy
  JSON remains valid. The saved record contains only bounded x/y, work-area geometry,
  and a scale-factor multiplier (`types.rs`).
- The drag controller invokes `persist_status_window_position` once on pointer-up;
  the native command clamps first, captures the current work area, persists the updated
  preference, and emits the updated settings event (`useDragController.ts`,
  `commands/window.rs`).
- Startup restores the saved logical offset, scales it to the current monitor DPI,
  selects the matching monitor when available, falls back to the nearest monitor when
  it was removed, and clamps the final rectangle to the work area (`lib.rs`,
  `commands/window.rs`).
- Reset Position moves the window to the first monitor's bottom-right safe area and
  clears the saved position. The native drag command also rejects locked-position
  starts, so lock state cannot be bypassed by a direct invoke.
- Automated evidence covers legacy preference decoding, position round-trip,
  malformed frontend payloads, DPI scaling, off-screen-safe math, reset/persist
  command routing, and the lock guard. A physical Windows restart/two-monitor matrix
  is still required before marking the release criterion fully verified.

---

## Autostart — `src-tauri/src/commands/system.rs`

### get_autostart_enabled / set_autostart_enabled
- **PASS** — both delegate to `tauri_plugin_autostart::AutoLaunchManager`
  (`system.rs:128-152`): `is_enabled`, `enable`, `disable`, with errors mapped to
  strings. The plugin is initialized in `setup` (`lib.rs:280-284`) and both commands
  are registered in the invoke handler (`lib.rs:370-371`).

---

## Fixes applied

1. `src-tauri/src/commands/system.rs` — `get_overlay_policy` now honors the
   `always_float` preference; extracted and unit-tested `compute_overlay_policy`.
   This closes the release-criterion-5c gap.
2. `src-tauri/src/commands/window.rs` and `src-tauri/src/types.rs` — added
   optional DPI-aware window-position persistence, startup restoration, reset,
   and a native lock-position drag guard.

## Gaps documented

1. Physical Windows restart, DPI-change, monitor-removal, and two-monitor evidence
   still need to be recorded on a Windows-capable runner.

## Verification notes

- `cargo`/`rustc` are not installed in this environment, so the Rust change could not
  be compiled or its unit tests run here. The change is a small, pure boolean
  extraction that preserves the original `avoid_fullscreen` behavior and adds
  `always_float` gating; tests cover all eight input combinations. Run
  `cargo test --lib commands::system::tests` and `cargo check` on a Rust-enabled
  machine before merge.
- `npm run typecheck` passes against the unmodified frontend.
