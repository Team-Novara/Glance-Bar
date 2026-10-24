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

## macOS media implementation checkpoint - 2026-10-24

The macOS media-session provider (`src-tauri/src/media/macos.rs`) now contains
a complete NowPlaying observation implementation behind the STAGE6 validation
gate, mirroring the gated Linux MPRIS provider. The capability still reports
`unsupported`; per the design rules above it stays that way until it has been
validated on a real Mac.

- **Observation-only scope.** The provider reads
  `MPNowPlayingInfoCenter.defaultCenter` — its `nowPlayingInfo` dictionary and
  the macOS-specific `playbackState` — via objc2-media-player 0.3
  (objc2 0.6 / objc2-foundation 0.3), and maps the bounded fields onto the
  shared `MediaSessionStatus` shape: playback state, 0-100 progress,
  millisecond timeline facts, and title/artist clamped to 200 characters.
  No playback control is implemented or exposed on macOS; `media_control`
  remains Windows-only. Dictionary keys beyond the bounded set (artwork,
  persistent IDs, URLs) are never read, and player or bundle identifiers
  never leave the module.

- **Native source choice.** macOS has no public GSMTC-style "current session"
  registry. `MPNowPlayingInfoCenter` is the public MediaPlayer.framework
  read surface and is what the already-vendored objc2-media-player dependency
  covers; `MPRemoteCommandCenter` (also enabled in the dependency) is a
  command sink for media-playing apps, not a state source, and is not used by
  this observer. Two alternatives were considered and rejected: the private
  MediaRemote framework (no objc2 bindings, not App-Store-safe) and NSWorkspace
  media-key observation (observes hardware key events rather than playback
  state, and global system-defined event monitoring is the wrong primitive
  for a passive poll observer). The open risk is honest and is exactly what
  the gate exists for: Apple documents the default center from the
  perspective of a media-playing app ("holds now playing info about the
  current application"), so whether a non-playing observer process like
  Glance Bar sees the system-aggregated Now Playing info through it must be
  determined on real hardware before the capability is enabled.

- **Error codes.** Failure modes reuse the shared vocabulary as a subset:
  `no-session` (the center reports no now-playing info at all,
  `available=false`), `no-timeline` (duration or elapsed time missing or
  malformed), `available` (full observation). `provider-failed`, `no-status`,
  and `no-playback-info` have no macOS counterpart here — the center accessor
  cannot fail like a bus connection can, and field extraction maps anything
  missing or wrongly typed (including non-NSString/non-number values) to
  conservative defaults (`None` timeline, empty strings) instead of failing
  the read; anything not `Playing` (including `Unknown`) reports `paused`,
  matching the Windows and Linux providers.

- **Gate state.** `MACOS_MEDIA_VALIDATED` in `media/macos.rs` is `false`: the
  provider returns the bounded `unsupported` payload, byte-for-byte the stub
  behavior earlier builds reported. The macOS branch of
  `get_media_session_status` already routes through the provider (PR #48), so
  flipping that const is the single switch that enables the capability end to
  end. The gate must only be flipped together with recorded real-hardware
  validation evidence.

- **Test strategy.** The pure mapping layer (playback-state labels,
  seconds→milliseconds conversion with rejection of non-finite/absurd values,
  text clamping, progress derivation and clamping, timeline codes, partial
  and full status mapping, gate-off contract) contains no objc2 types and is
  unit-tested on every platform the module compiles for. To make that
  possible, `media/mod.rs` now declares the macOS module for every non-Windows
  target (mirroring how the Linux module's unconditional declaration is what
  makes its pure layer Linux-testable); the objc2 path stays
  `#[cfg(target_os = "macos")]`. Verified on Linux: `cargo test` 61 passed /
  0 failed, including the 13 new `media::macos` tests; `cargo fmt --check`,
  `cargo check`, and `cargo clippy` (CI flags) clean for the new code (zero
  clippy findings in `media/macos.rs`). The objc2 path itself cannot be
  compiled from the Linux development environment: its compilation, both in
  the gate-off shell and behind the gate, is verified only by the PR CI
  matrix's macOS job.

- **Remaining validation work.** On a real Mac: first, the PR CI macOS job
  must confirm the objc2 path type-checks (signatures were written against
  the vendored objc2 0.6.4 / objc2-foundation 0.3.2 / objc2-media-player 0.3.2
  sources but never compiled locally); then, with players active (Music,
  Safari, Spotify), confirm whether the default center reflects their
  sessions in an observer process, whether `nowPlayingInfo` vs
  `playbackState` carry the expected values, bounded-field extraction across
  player types, and the end-user fallback behavior while gated. If the public
  center proves not to aggregate other apps' sessions, the fallback decision
  (private MediaRemote bindings behind the same gate, or keeping the
  capability unsupported on macOS) belongs to that validation step. Event
  emission (the `status-center://media-session-changed` refresh loop the
  Windows media thread provides) is not wired on macOS and belongs to the
  same validation step. After evidence is recorded, flip
  `MACOS_MEDIA_VALIDATED`, update the gate test, and revisit capability
  reporting.
