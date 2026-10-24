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

## Linux window policy implementation checkpoint - 2026-10-24

The Linux platform window policy (`src-tauri/src/window/linux.rs`) now
contains a complete X11/EWMH implementation behind the STAGE6 validation
gate, replacing the Stage6 TODO stubs. The capability keeps its stub
behavior; per the design rules above it stays that way until it has been
validated on a real Linux desktop.

- **What is implemented behind the gate.** `LINUX_WINDOW_VALIDATED` in
  `window/linux.rs` is `false`, so every trait method returns exactly the
  stub results of earlier builds (`Ok(())`, `false`) without touching X11 —
  byte-identical to the pre-implementation no-op. Behind the gate:
  `set_z_order` sends the two `_NET_WM_STATE` client messages
  (add `_NET_WM_STATE_ABOVE` + remove `_NET_WM_STATE_BELOW` when floating,
  the inverse when parked) to the root window with the
  `SubstructureNotify | SubstructureRedirect` event mask and
  source-indication `application`, mirroring the Windows policy's
  `HWND_TOPMOST` / `HWND_BOTTOM`; `apply_tool_style` replaces
  `_NET_WM_WINDOW_TYPE` with exactly `[_NET_WM_WINDOW_TYPE_UTILITY]`
  (skipping the write when already set), mirroring
  `WS_EX_TOOLWINDOW`-without-`WS_EX_APPWINDOW`; `foreground_is_fullscreen`
  reads `_NET_ACTIVE_WINDOW` on the root window, rejects `XCB_NONE`/the
  root itself, and checks the active window's `_NET_WM_STATE` list for
  `_NET_WM_STATE_FULLSCREEN`. The window's XID comes from the rwh 0.6
  `HasWindowHandle` impl tauri provides for `WebviewWindow` (GTK's gdk-x11
  backend reports an `Xlib` handle under X11/XWayland), which required
  adding `raw-window-handle = "0.6"` to the Linux target dependencies — the
  same 0.6.2 tauri already locks, so no new code is compiled. Shadow
  suppression stays a documented no-op: Linux window shadows are
  compositor-specific (picom/kwin rules) with no portable X11 mechanism,
  and faking it would hide the gap.

- **Bounded connection handling.** Every X11 exchange runs on one
  short-lived x11rb blocking connection opened by a single helper
  (`x11rb::connect`, same auth/abstract-socket handling the toolkit uses).
  x11rb 0.13 ships no EWMH helper API (no `ewmh` module / `EwmhConnection`;
  those landed after 0.13), so the client messages and properties are built
  from the core protocol as libxcb clients do. x11rb 0.13's blocking API
  offers no per-call timeout (its poll waits indefinitely), so each whole
  exchange (connect, requests, replies) runs on a worker thread and the
  calling thread waits at most ~1s; a hung or absent server degrades to the
  conservative result instead of freezing the main thread (where the sync
  Tauri commands that invoke this policy run). Every failure path is
  conservative: setters do nothing and report success, the fullscreen query
  reports `false` — including a non-EWMH window manager (the `_NET_*` atoms
  do not intern), a native Wayland session (no XID on the raw handle), and
  any X error, timeout, or missing `$DISPLAY`.

- **Wayland limitations.** EWMH exists only on X11. A native Wayland
  session exposes no XID on the `WebviewWindow` raw handle, so the setters
  conservatively do nothing and the fullscreen query reports `false`;
  nothing errors or pretends. XWayland sessions (WSLg, X11-compat mode of
  major compositors) are the supported path and report an `Xlib` handle.
  Native Wayland layer-shell — the "real" way to build a bar on Wayland —
  is out of scope for Stage6; adopting it would mean a per-protocol
  backend (gtk-layer-shell), not an extension of this module.

- **Test strategy.** `#[cfg(all(test, target_os = "linux"))]` unit tests
  (15 new, 80 total in the crate) cover pure logic only, mirroring the
  media/linux.rs style: z-order transition tables, EWMH atom-name choices,
  client-message construction (action/property/source-indication payload),
  native-endian format-32 property parsing (empty, wrong-format, truncated
  tails), the conservative fullscreen predicate, active-window candidate
  filtering, XID extraction from `Xlib`/`Xcb` handles (zero and
  out-of-range rejected, Wayland rejected), the no-XID short-circuit
  (no X11 connection is ever opened), and the gate-off contract
  (`assert!(!LINUX_WINDOW_VALIDATED)`; a `WebviewWindow` cannot be
  constructed headlessly, so the trait methods are pinned structurally —
  the gate check precedes every X11 call — plus the const assertion).
  Verified on Linux: `cargo test` 80 passed / 0 failed; `cargo fmt
  --check`, `cargo check`, and `cargo clippy` (CI flags) clean for the new
  code (zero findings in `window/linux.rs`; the crate's 79 pre-existing
  pedantic warnings are unchanged).

- **WSLg smoke evidence (real X11 connection).** A throwaway probe (not
  committed) connected to `DISPLAY=:0` under WSLg and queried the root
  window: the x11rb connection, atom interning, and property round trips
  all work. WSLg's Weston-based XWayland advertises only partial EWMH:
  `_NET_ACTIVE_WINDOW`, `_NET_WM_STATE`, and `_NET_WM_STATE_FULLSCREEN`
  are supported, while `_NET_WM_STATE_ABOVE`, `_NET_WM_STATE_BELOW`,
  `_NET_WM_WINDOW_TYPE`, and `_NET_WM_WINDOW_TYPE_UTILITY` are not
  advertised and the ABOVE/BELOW atoms do not even intern. This is exactly
  the environment the conservative paths were built for: under WSLg the
  z-order setter would (behind the gate) find no ABOVE/BELOW atoms and do
  nothing, and the fullscreen query would read `_NET_ACTIVE_WINDOW = 0x0`
  (no X11 client focused at probe time) and report `false`. The smoke test
  proves the connection machinery, not policy effectiveness — WSLg cannot
  validate z-order or tool-window styling.

- **Remaining validation work.** On a real Linux desktop with a full EWMH
  window manager (KWin / Mutter / XFWM / wlroots-XWayland): confirm the
  `Xlib` raw-handle XID resolves for the status window; that the
  `_NET_WM_STATE` client messages actually raise/park the pill with
  `_NET_WM_STATE_ABOVE`/`_NET_WM_STATE_BELOW`; that replacing
  `_NET_WM_WINDOW_TYPE` with `UTILITY` after mapping removes the window
  from taskbar/pager/alt-tab (some WMs only honor the type at map time —
  if so, the write needs to move before the first `show`, which is a
  command-layer sequencing question, not a policy rewrite); that
  `foreground_is_fullscreen` tracks real fullscreen apps without
  flickering false positives; and the ~1s exchange bound against a frozen
  server. Also confirm the watchdog pattern's thread spawn rate is
  acceptable on the paths that poll fullscreen state. After evidence is
  recorded, flip `LINUX_WINDOW_VALIDATED`, update the gate test, and
  revisit capability reporting.

## Linux focus implementation checkpoint - 2026-10-25

The Linux focus capability now contains a complete observation-only
implementation behind the STAGE6 validation gate, following the mechanism
research in `docs/plans/LINUX_FOCUS_FEASIBILITY.md`. The capability still
reports `unsupported`; per the design rules above it stays that way until it
has been validated on a real Linux desktop.

- **Gate state.** `LINUX_FOCUS_VALIDATED` in
  `src-tauri/src/commands/focus/linux.rs:45` is `false`: the focus read
  returns the bounded `unsupported` payload — field-for-field the stub
  earlier builds reported — without probing the environment, touching gio,
  or opening a session-bus connection (the gate check at `linux.rs:263`
  precedes all of that; the gate test asserts the payload and that the
  connection cache is still empty). `commands/focus.rs` keeps the per-OS
  dispatch: Linux routes through the gated submodule (`focus.rs:58-66`),
  macOS and other non-Windows targets keep the previous stub verbatim
  (`focus.rs:68-76`), and the 2s focus monitor thread is unchanged — it
  already polls `read_focus_assist_state` on every platform, so event
  emission comes free once the gate flips. Flip the const only together
  with recorded real-desktop evidence and the gate test, in the same
  change.

- **Mechanism map.** GNOME-family sessions: `org.gnome.desktop.notifications`
  `show-banners` read in-process through the gio crate — the same key GNOME
  Shell equates with Do Not Disturb (`active = !show-banners`), never a
  `gsettings` shell-out. The mandatory guard runs first
  (`SettingsSchemaSource::default()` → `lookup(schema, recursive)` →
  `has_key`): constructing a `GSettings` object for a missing schema is a
  fatal C-level error, so a missing schema/key maps to bounded
  `unsupported`, never a panic. KDE-family sessions: the read-only
  `Inhibited` property on `org.freedesktop.Notifications`
  (`/org/freedesktop/Notifications`) via zbus — Plasma's aggregate DND
  state — over a process-wide cached blocking connection with a
  connection-wide ~1s method timeout (the `media/linux.rs` pattern), so a
  hung daemon cannot stall the 2s poll. `Inhibit`/`UnInhibit` are never
  called. The gio dependency is Linux-target only (`Cargo.toml`), pinned to
  the same 0.18 series the GTK stack already locks resolves (gio 0.18.4 /
  glib 0.18.5): libgio is already loaded by the app, and the Cargo.lock
  diff is exactly one line (the `app` → `gio` edge) — no new packages
  compiled.

- **Conservative selection.** `XDG_CURRENT_DESKTOP` (colon-separated) is
  authoritative: its first recognized entry decides (case-sensitive standard
  spellings; `GNOME`/`GNOME-*` → GNOME plan, `KDE`/`KDE-*` → KDE plan). A
  set-but-unrecognized value yields no mechanism and never falls through to
  `DESKTOP_SESSION`; the legacy variable is consulted only when
  `XDG_CURRENT_DESKTOP` is unset or empty. GNOME sessions try the GSettings
  key first and the KDE D-Bus probe only as a fall-through when the schema
  is missing (where it can only report another absent surface); KDE sessions
  never probe the GNOME schema, because gsettings-desktop-schemas is often
  installed as a GTK-stack side effect and its default
  (`show-banners = true`) would masquerade as an observation — the probe
  below caught exactly that situation on this WSL box. Unknown desktops
  probe nothing and report `unsupported`.

- **Error vocabulary and scope.** Only the frontend-pinned
  `available`/`error`/`unsupported` codes are produced: absent surfaces →
  `unsupported` (schema/key missing; KDE name unowned or the published
  `org.freedesktop.DBus.Error.{ServiceUnknown,UnknownObject,UnknownInterface,UnknownProperty,UnknownMethod}`
  family), present-surface read failures → `error` (KDE transport, timeout,
  or unexpected property; the GNOME getter is infallible past its guard, so
  `GnomeObservation` deliberately has no read-failure variant), successful
  reads → `available`. `profile` stays empty, `controllable` stays false on
  every Linux path, and `stop_focus_session` is unchanged (observation-only;
  control remains Windows-only). `get_notification_summary` now derives its
  `focus_assist_active` from the focus read on non-Windows, mirroring the
  Windows branch — byte-identical while the gate is off.

- **Test strategy.** 17 new `#[cfg(test)]` unit tests in
  `commands/focus/linux.rs` (97 total in the crate) cover pure logic only —
  desktop classification and plan selection, payload/code mapping for both
  mechanisms, the plan walk with laziness pinned by panicking observer
  closures (unknown desktops and KDE-only plans probe nothing), KDE
  error-name classification, and the gate-off contract (payload fields plus
  an untouched connection cache) — no gio access and no session bus, so
  they run in CI without a desktop session.

- **Verified on Linux (this worktree, WSL).** Gates: `cargo fmt -- --check`
  clean; `cargo check` clean; `cargo clippy -- -W clippy::all -W
  clippy::pedantic --allow clippy::module_name_repetitions` — 79 warnings,
  all pre-existing crate-wide (the window checkpoint's baseline; zero in
  the focus files); `cargo test` 97 passed / 0 failed. A throwaway
  read-only machinery probe (run, then deleted; not committed) recorded
  absence-path evidence on this WSLg box — NOT capability validation:
  `XDG_CURRENT_DESKTOP`/`DESKTOP_SESSION` are both absent, so the product
  path would classify an unknown desktop and probe nothing. The machinery
  itself behaved: the gio schema-source lookup found
  `org.gnome.desktop.notifications` (gsettings-desktop-schemas is installed
  here), `show-banners` exists, and the in-process boolean read returned
  `true` with no main loop, no GTK init, and no panic — evidencing both the
  schema-installed-everywhere caveat above and that the guarded getter is
  safe on a non-GNOME session. The zbus probe connected to the WSLg user
  bus in ~5ms and the `Inhibited` `Properties.Get` failed in ~2ms with the
  typed `FDO(ServiceUnknown)` error — the exact absent-surface shape the
  module maps to `unsupported`, bounded far under the 1s timeout, no stall.
  (Both classifier branches — typed FDO variants and raw `MethodError`
  names — are retained, since which one surfaces can vary across zbus
  versions.)

- **Remaining validation work.** From the feasibility checklist, all still
  open: on pinned GNOME distro versions (X11 and Wayland, including one
  GNOME ≥ 49 where the toggle moved to Quick Settings), toggle DND from the
  UI and confirm `active` flips within one 2s poll, the
  `status-center://focus-assist-changed` event fires, `profile` stays empty
  and `controllable` stays false; on a non-GNOME session without the schema
  installed, confirm the schema-source guard returns `unsupported` without
  panicking (this box had the schema, so the missing-schema lookup path is
  unit-covered but not yet exercised against a schema-less machine); on
  pinned Plasma 6.x, toggle DND in the notification applet and confirm
  `Inhibited` flips through the cached connection, with `active=false` when
  off; with plasmashell down or the name unowned on a KDE-classified
  session, confirm bounded ~1s `unsupported`, no poll-loop stall, no event
  storm; pin per-version surfaces (whether `Inhibited` exists on the oldest
  targeted Plasma; whether `show-banners` exists on the oldest targeted
  GNOME); confirm the 2s one-boolean-read poll costs no measurable CPU or
  battery regression against the Windows registry poll it mirrors. After
  evidence is recorded, flip `LINUX_FOCUS_VALIDATED`, update the gate test,
  and revisit capability reporting.
