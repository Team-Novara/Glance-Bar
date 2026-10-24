# Cross-Platform Capability Plan

Windows currently has the broadest native implementation. macOS and Linux platform modules are present so the application can compile and return explicit unsupported results for capabilities that have not yet been implemented.

## Current checkpoint — 2026-09-05

Cross-platform parity is intentionally paused. The active delivery plan remains Windows-first; macOS and Linux must continue to report explicit unsupported results until each capability is implemented and validated on real target hardware. The latest merged production-composition guards do not broaden platform availability claims.

## Goal

Deliver platform capability parity without hiding platform gaps or weakening privacy boundaries.

## Design rules

- Keep platform-specific code in `src-tauri/src/window/{windows,macos,linux}.rs` and `src-tauri/src/media/{windows,macos,linux}.rs`.
- Keep Tauri command shapes stable and return bounded unsupported/unavailable results where necessary.
- Let provider capabilities and health describe support; do not branch feature templates on operating-system internals.
- Validate on real target hardware before changing a capability from unsupported to available.

## Phased work

1. Verify current build and fallback behavior on all three targets.
2. Implement one capability family at a time: window behavior, media, then system/focus sources.
3. Add native and TypeScript boundary tests for every command shape.
4. Record capability evidence and user-visible fallback behavior before declaring parity.

## Linux media (MPRIS) implementation checkpoint - 2026-10-24

The Linux media-session provider (`src-tauri/src/media/linux.rs`) now contains a
complete MPRIS observation implementation behind the STAGE6 validation gate. The
capability still reports `unsupported`; per the design rules above it stays that
way until it has been validated on a real Linux desktop.

- **Observation-only scope.** The provider reads the
  `org.mpris.MediaPlayer2.Player` properties (`PlaybackStatus`, `Metadata` for
  `xesam:title` / `xesam:artist` / `mpris:length`, `Position`) of one player
  over the session bus using the zbus 5 blocking API, and maps them onto the
  bounded `MediaSessionStatus` shape. No playback control is implemented or
  exposed on Linux; `media_control` remains Windows-only. Only bounded fields
  cross the IPC boundary: coarse playback state, 0-100 progress, millisecond
  timeline facts, and title/artist clamped to 200 characters. Bus names, URLs
  (`xesam:url` is never read), and raw metadata never leave the module.

- **Deterministic selection.** MPRIS has no "current session" concept, so the
  provider enumerates `org.mpris.MediaPlayer2.*` well-known names and observes
  the lexicographically first one. This keeps successive polls on the same
  player (no flapping between running players) and makes the pick reproducible
  for diagnostics.

- **Error codes.** Failure modes reuse the Windows provider's vocabulary:
  `provider-failed` (session bus unreachable, `available=false`), `no-session`
  (no MPRIS player registered, `available=false`), `no-status`
  (`PlaybackStatus` unreadable), `no-playback-info` (`Metadata` unreadable),
  `no-timeline` (duration or position missing/malformed), `available` (full
  observation). Missing or wrongly typed fields map to conservative values
  (`None` timeline, empty strings); nothing is coerced or invented. Every
  D-Bus call is bounded by a ~1s method timeout so a hung player cannot stall
  polling; the blocking connection is cached and rebuilt after a bus-level
  failure.

- **Gate state.** `MPRIS_VALIDATED` in `media/linux.rs` is `false`: the
  provider returns the bounded `unsupported` payload, byte-for-byte the stub
  behavior earlier builds reported. The Linux branch of
  `get_media_session_status` routes through the provider, so flipping that
  const is the single switch that enables the capability end to end. The gate
  must only be flipped together with recorded real-desktop validation
  evidence.

- **Test strategy.** `#[cfg(test)]` unit tests in the module cover pure logic
  only — player-name filtering and ordering, playback-status mapping,
  microseconds→milliseconds conversion, text clamping, artist joining, progress
  derivation and clamping, malformed/wrongly typed metadata, error-status
  shapes, and the gate-off contract (`read_status` reports `unsupported`
  without touching the bus). They construct zvariant values in memory and
  require no session bus, so they pass in CI environments without D-Bus.
  Verified on Linux: `cargo test` 40 passed / 0 failed; `cargo check`,
  `cargo clippy` (CI flags) and `cargo fmt --check` clean for the new code.

- **Remaining validation work.** On a real Linux desktop with real players:
  confirm session-bus connection caching and rebuild, player enumeration and
  deterministic selection with multiple players running, metadata/position
  reads across player types (e.g. Firefox, VLC, mpv), the ~1s timeout bound
  against a hung player, and the end-user fallback behavior while gated.
  Event emission (the `status-center://media-session-changed` refresh loop the
  Windows media thread provides) is not yet wired on Linux and belongs to the
  same validation step. After evidence is recorded, flip `MPRIS_VALIDATED`,
  update the gate test, and revisit capability reporting.
