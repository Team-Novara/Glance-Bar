# Stage 6 — Cross-Platform Abstraction Design

> **Goal:** `Glance Bar` runs on **Windows / macOS / Linux** from one codebase.
> **Baseline:** Windows is fully implemented. macOS/Linux are compilable stubs returning `unsupported`.
> **Status:** trait structure in place (from G1a/G1b). Phase 1 done (Wave 1): platform deps added (§5), 3-OS CI matrix live (§7). Phases 2-6 need real hardware.

## 1. Current State

### What exists (from structure refactor)

| Layer | File | Windows | macOS | Linux |
|---|---|---|---|---|
| Window trait | `window/mod.rs` | `PlatformWindowPolicy` trait (4 methods) | — | — |
| Window impl | `window/windows.rs` | ✅ full Win32 | `MacPolicy` stub | `LinuxPolicy` stub |
| Media trait | `media/mod.rs` | `PlatformMediaProvider` trait (1 method + Cache) | — | — |
| Media impl | `media/windows.rs` | ✅ full WinRT GSMTC | `MacosMediaProvider` stub | `LinuxMediaProvider` stub |
| Command dispatch | `commands/window.rs` | `#[cfg]` selects `ActivePolicy` | — | — |
| Media thread | `media/mod.rs` | `start_mta_media_thread` | `#[cfg(not(windows))]` returns `None` | same |

### What's missing

- macOS: NSWindow chrome, NSWorkspace fullscreen, MediaPlayer NowPlaying, DND/Focus
- Linux: X11/Wayland window, EWMH fullscreen, MPRIS D-Bus, freedesktop Notifications
- ~~Dependencies: `objc2`* (macOS), `x11rb`/`zbus` (Linux) — NOT yet in Cargo.toml~~ ✅ added (Wave 1, versions per §5)
- ~~CI: only Windows runner today~~ ✅ 3-OS matrix added (`ci.yml` rust job, per §7)

## 2. Architecture

### Dispatch pattern (already implemented)

```rust
// commands/window.rs — compile-time platform selection
#[cfg(windows)]
use crate::window::windows::WindowsPolicy as ActivePolicy;
#[cfg(target_os = "macos")]
use crate::window::macos::MacPolicy as ActivePolicy;
#[cfg(target_os = "linux")]
use crate::window::linux::LinuxPolicy as ActivePolicy;
```

**Rule:** ALL platform differences go through `PlatformWindowPolicy` / `PlatformMediaProvider`. Command handlers never write `#[cfg]` themselves.

### Dependency isolation rule

```toml
# Cargo.toml — platform deps are NEVER mixed
[target.'cfg(windows)'.dependencies]
windows-sys = { ... }
windows = { ... }

# Aligned with the objc2 0.6.x / 0.3.x family that tauri / tray-icon / muda /
# arboard already resolve on macOS (see §5 for the version rationale).
[target.'cfg(target_os = "macos")'.dependencies]
objc2 = "0.6"
objc2-foundation = "0.3"
objc2-app-kit = "0.3"
objc2-media-player = "0.3"

# x11rb 0.13 + zbus 5 match what arboard / global-hotkey / tauri-plugin-opener
# already lock on Linux (see §5).
[target.'cfg(target_os = "linux")'.dependencies]
x11rb = "0.13"
zbus = "5"
```

**Rule:** macOS code lives in `#[cfg(target_os = "macos")]` blocks. Linux code in `#[cfg(target_os = "linux")]`. Windows code in `#[cfg(windows)]`. No cross-contamination.

## 3. Trait Signatures (final)

### `PlatformWindowPolicy` (window/mod.rs)

```rust
pub trait PlatformWindowPolicy {
    /// Strip shadow / corner artifacts. Reapply after late-init resets (Windows DWM).
    fn disable_shadow(window: &WebviewWindow, shutdown: Arc<AtomicBool>);

    /// Apply tool-window style (skip taskbar, no app icon).
    fn apply_tool_style(window: &WebviewWindow) -> Result<(), String>;

    /// Pin window topmost or send to bottom.
    fn set_z_order(window: &WebviewWindow, floating: bool) -> Result<(), String>;

    /// True if the foreground window covers the nearest monitor.
    fn foreground_is_fullscreen() -> bool;
}
```

### `PlatformMediaProvider` (media/mod.rs)

```rust
pub trait PlatformMediaProvider {
    /// Opaque per-platform cache (WinRT SessionManager on Windows, () elsewhere).
    type Cache;

    /// Read current media session status.
    fn read_status(cache: &mut Option<Self::Cache>, checked_at: u64) -> MediaSessionStatus;
}
```

**Note:** `MediaSessionStatus` already has `code: available|not-playing|unsupported|provider-failed|sta-timeout`. macOS/Linux return `code: "unsupported"` until implemented.

## 4. Platform Implementation Design

### 4.1 macOS

#### Dependencies

| Crate | Version | Why |
|---|---|---|
| `objc2` | 0.6 | ObjC runtime bindings |
| `objc2-foundation` | 0.3 | NSString, NSDictionary, NSArray |
| `objc2-app-kit` | 0.3 | NSWindow, NSScreen, NSWorkspace |
| `objc2-media-player` | 0.3 | MPNowPlayingInfoCenter, MPRemoteCommandCenter |

> Versions differ from the original design draft (0.5/0.2) on purpose — see the §5 rationale. The 0.6/0.3 family is what tauri's existing macOS stack already resolves.

#### Window chrome (`window/macos.rs`)

| Trait method | macOS API | Notes |
|---|---|---|
| `disable_shadow` | `NSWindow.setHasShadow_(false)` + `setTitlebarAppearsTransparent_(true)` | Glance Bar is transparent borderless; shadow is a compositor artifact |
| `apply_tool_style` | `NSWindowStyleMaskBorderless` + `NSUtilityWindowMask` | Utility mask = skip taskbar |
| `set_z_order` | `NSWindowLevelFloating` (topmost) vs `NSWindowLevelNormal` | Match Windows `HWND_TOPMOST` semantics |
| `foreground_is_fullscreen` | `NSWorkspace.sharedWorkspace.keyWindow` frame vs `NSScreen.mainScreen` frame | Check if any app's window covers the main screen |

#### Media session (`media/macos.rs`)

| Step | API |
|---|---|
| Read now-playing | `MPNowPlayingInfoCenter.defaultCenter().nowPlayingInfo()` |
| Playback state | `MPRemoteCommandCenter.shared().playCommand.enabled` etc. |
| Observe changes | `NotificationCenter` observe `MPNowPlayingInfoCenterNowPlayingInfoDidChangeNotification` |

#### Focus / DND

| Feature | macOS API |
|---|---|
| DND status | `NSUserDefaults` under `com.apple.controlcenter` (BigSur+) or `NSWorkspace` distractionMode (Ventura+) |
| Toggle DND | `NSWorkspace` private API or `distractionMode` (no public API — may need `osascript` to Shortcuts) |

#### Window positioning

macOS WebView is positioned by Tauri at startup. The pill sits above the dock. `NSWindow.setFrame_` can reposition if multi-monitor correction is needed (rare — Tauri handles it).

---

### 4.2 Linux

#### Dependencies

| Crate | Version | Why |
|---|---|---|
| `x11rb` | 0.13 | X11 protocol client (Rust-native, no C deps) |
| `zbus` | 5 | D-Bus client (MPRIS + Notifications) |
| `wayland-client` | 0.31 | (optional) Wayland layer-shell — only if targeting Wayland-only distros |

**Decision:** Start with X11 (`x11rb`). Wayland is a separate session protocol — most "tray + taskbar skip" still works via XWayland. Add native Wayland later if needed.

#### Window chrome (`window/linux.rs`)

| Trait method | X11 API (EWMH) | Notes |
|---|---|---|
| `disable_shadow` | `_NET_WM_STATE` + compositor-specific (_PICOM_SHADOW/_KWIN_SHADOW) | Best-effort; shadow rules are compositor-specific |
| `apply_tool_style` | `_NET_WM_WINDOW_TYPE_UTILITY` | Utility = skip taskbar + no pager |
| `set_z_order` | `_NET_WM_STATE_ABOVE` vs `_NET_WM_STATE_BELOW` | EWMH standard |
| `foreground_is_fullscreen` | `_NET_WM_STATE_FULLSCREEN` on `_NET_ACTIVE_WINDOW` | Query the root window's `_NET_ACTIVE_WINDOW`, then its `_NET_WM_STATE` |

#### Media session (`media/linux.rs`)

| Step | D-Bus call |
|---|---|
| List players | `org.freedesktop.DBus.ListNames` → filter `org.mpris.MediaPlayer2.*` |
| Read status | `org.mpris.MediaPlayer2.Player.PlaybackStatus` + `Metadata` |
| Observe | `org.freedesktop.DBus.Properties.PropertiesChanged` signal |
| Control | `org.mpris.MediaPlayer2.Player.PlayPause` / `Next` / `Previous` |

#### Focus / DND

| Feature | D-Bus call |
|---|---|
| Notification list | `org.freedesktop.Notifications.GetCapabilities` + `GetServerInformation` |
| DND toggle | `org.freedesktop.Notifications.Inhibit` (some implementations) or `org.gnome.SessionManager` (GNOME-specific) |

**Note:** Linux DND is fragmented across DEs (GNOME/KDE/Sway). First target: `org.freedesktop.Notifications` (cross-DE). DE-specific DND is stretch.

---

## 5. Dependency Matrix

```toml
# src-tauri/Cargo.toml — actual (Wave 1)

[target.'cfg(target_os = "macos")'.dependencies]
objc2 = "0.6"
objc2-foundation = { version = "0.3", features = ["NSString", "NSDictionary", "NSArray"] }
objc2-app-kit = { version = "0.3", features = ["NSWindow", "NSScreen", "NSWorkspace"] }
objc2-media-player = { version = "0.3", features = ["MPNowPlayingInfoCenter", "MPRemoteCommandCenter"] }

[target.'cfg(target_os = "linux")'.dependencies]
x11rb = { version = "0.13", features = ["allow-unsafe-code"] }
zbus = "5"
```

### Version rationale — alignment with tauri's resolved stack

The original draft (this doc, pre-Wave-1) named `objc2 0.5` / `objc2-* 0.2` and
`zbus 4`, which were current at design time. Those versions were **deliberately
not** used when the deps were actually added, because the rest of the
workspace already locks a newer family:

- **macOS:** `tauri`, `tray-icon`, `muda`, and `arboard` all resolve the
  `objc2 0.6.x` / `objc2-foundation|app-kit|media-player 0.3.x` family on the
  macOS target. Pinning the draft's `0.5`/`0.2` would compile a **second,
  duplicate ObjC runtime binding stack** into every macOS build (two copies of
  the objc2 runtime crate via cargo's semver-parallel resolution), inflating
  build time and binary size for zero benefit.
- **Linux:** `arboard` / `global-hotkey` already pull `x11rb 0.13` and
  `tauri-plugin-opener` already pulls `zbus 5.x` on Linux. The draft's
  `zbus "4"` would likewise compile a second full D-Bus stack (zbus 4 + zbus 5
  coexist as separate crates) into every Linux build.

**Rule:** before adding any platform dependency, check what the existing
workspace (tauri + plugins) already resolves with `cargo tree
--manifest-path src-tauri/Cargo.toml -e no-dev` on that platform, and align
versions with the already-locked family. Feature flags are the only thing we
add on top (e.g. `allow-unsafe-code` on `x11rb`, the specific `objc2-*`
framework features).

**Windows deps stay unchanged.** No crate is added to `[dependencies]` (common) — all platform-specific.

---

## 6. Implementation Phases

### Phase 1: Architecture readiness (Windows-only dev machine)

**Can be done NOW without macOS/Linux hardware.**

- [x] Add macOS/Linux deps to Cargo.toml (Wave 1 — versions aligned with tauri's stack, see §5)
- [x] Verify `cargo check` passes on Windows (deps are `cfg`-gated, won't break Windows build)
- [x] Add CI matrix: `cargo check` on `windows-latest`, `macos-latest`, `ubuntu-latest` (Wave 1 — `ci.yml` rust job)
- [ ] Write trait-level docs + per-method pseudocode comments in stubs
- [ ] Create tracking issues for each platform function (see §8)

**Exit:** CI verifies macOS/Linux compile. Stubs still return `unsupported`.

### Phase 2: macOS window (needs Mac hardware)

**First real macOS work — window chrome is the foundation.**

- [ ] Implement `MacPolicy::apply_tool_style` — `NSWindowStyleMaskBorderless` + `NSUtilityWindowMask`
- [ ] Implement `MacPolicy::set_z_order` — `NSWindowLevelFloating` / `NSWindowLevelNormal`
- [ ] Implement `MacPolicy::foreground_is_fullscreen` — `NSWorkspace.keyWindow` vs `NSScreen.mainScreen`
- [ ] Implement `MacPolicy::disable_shadow` — `NSWindow.setHasShadow_(false)`
- [ ] Manual test: pill appears above dock, skips taskbar, fullscreen app hides pill

**Exit:** Glance Bar window behaves correctly on macOS.

### Phase 3: Linux window (needs Linux hardware)

- [ ] Implement `LinuxPolicy::apply_tool_style` — `_NET_WM_WINDOW_TYPE_UTILITY`
- [ ] Implement `LinuxPolicy::set_z_order` — `_NET_WM_STATE_ABOVE` / `_NET_WM_STATE_BELOW`
- [ ] Implement `LinuxPolicy::foreground_is_fullscreen` — `_NET_WM_STATE_FULLSCREEN` on active window
- [ ] Implement `LinuxPolicy::disable_shadow` — best-effort compositor hints
- [ ] Manual test: pill appears above panel, skips taskbar, fullscreen hides it

**Exit:** Glance Bar window behaves correctly on Linux.

### Phase 4: macOS media (needs Mac hardware)

- [ ] Implement `MacosMediaProvider::read_status` — `MPNowPlayingInfoCenter`
- [ ] Observe `MPNowPlayingInfoCenterNowPlayingInfoDidChangeNotification`
- [ ] Wire into existing `media/mod.rs` polling loop (replace the `#[cfg(not(windows))]` stub)
- [ ] Manual test: playing Spotify shows title/artist/progress in Glance Bar

**Exit:** Media status works on macOS.

### Phase 5: Linux media (needs Linux hardware)

- [ ] Implement `LinuxMediaProvider::read_status` — MPRIS D-Bus via `zbus`
- [ ] Subscribe to `PropertiesChanged` on `org.mpris.MediaPlayer2.Player`
- [ ] Wire into polling loop
- [ ] Manual test: playing VLC/Spotify shows title/artist/progress

**Exit:** Media status works on Linux.

### Phase 6: Focus / DND (stretch, per-platform)

- [ ] macOS: read DND status (limited public API — may need `osascript`)
- [ ] Linux: read notification DND via `org.freedesktop.Notifications`
- [ ] Wire into existing `realFocusProvider` / `realNotificationProvider`

**Exit:** Focus/DND status works (best-effort on each platform).

---

## 7. CI Strategy

### Matrix (`.github/workflows/ci.yml` — actual, live as of Wave 1)

```yaml
jobs:
  rust:
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        # 3-platform check per this doc §7 — catches cfg-gated code
        # that only compiles on its own platform.
        os: [windows-latest, macos-latest, ubuntu-latest]
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with: { components: clippy, rustfmt }
      - uses: Swatinem/rust-cache@v2
      - name: Cargo check
        run: cargo check --manifest-path src-tauri/Cargo.toml
      - name: Cargo clippy
        run: cargo clippy --manifest-path src-tauri/Cargo.toml -- -W clippy::all -W clippy::pedantic --allow clippy::module_name_repetitions
      - name: Cargo fmt check
        run: cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
```

**Why `cargo check` not `cargo build`?** Building Tauri on CI needs system deps (WebKitGTK on Linux, Xcode on macOS) that slow down CI. `check` verifies compilation without the full link step. Local `cargo tauri dev` is the real build test.

### What CI catches

- macOS code doesn't compile (missing objc2 import, wrong selector)
- Linux code doesn't compile (wrong x11rb API)
- Windows code didn't break from platform refactor

### What CI CANNOT catch

- Runtime behavior (selector returns wrong value, D-Bus call fails)
- UI rendering (pill position, transparency)
- These need manual testing on real hardware

---

## 8. Tracking Issues (template)

Each platform function gets one issue. Template:

```markdown
## [macOS] Implement MacPolicy::set_z_order

**Trait:** `PlatformWindowPolicy::set_z_order`
**File:** `src-tauri/src/window/macos.rs`
**Deps:** `objc2`, `objc2-app-kit`

### Implementation notes
- Use `NSWindow.setLevel_(NSWindowLevelFloating)` for floating=true
- Use `NSWindow.setLevel_(NSWindowLevelNormal)` for floating=false
- Match Windows `HWND_TOPMOST` / `HWND_BOTTOM` semantics

### Acceptance
- [ ] `cargo check` passes on macOS CI
- [ ] Manual test: pill stays above other windows when floating=true
- [ ] Manual test: pill goes to bottom when floating=false
- [ ] No regression on Windows/Linux CI

### References
- Apple docs: NSWindowLevel
- Windows counterpart: window/windows.rs `set_status_window_z_order`
```

**Issue list (initial):**

| # | Title | Phase | Needs hardware |
|---|---|---|---|
| 1 | Add macOS/Linux deps to Cargo.toml | 1 | ❌ |
| 2 | Add CI 3-platform check matrix | 1 | ❌ |
| 3 | [macOS] Implement MacPolicy::apply_tool_style | 2 | ✅ Mac |
| 4 | [macOS] Implement MacPolicy::set_z_order | 2 | ✅ Mac |
| 5 | [macOS] Implement MacPolicy::foreground_is_fullscreen | 2 | ✅ Mac |
| 6 | [macOS] Implement MacPolicy::disable_shadow | 2 | ✅ Mac |
| 7 | [linux] Implement LinuxPolicy::apply_tool_style | 3 | ✅ Linux |
| 8 | [linux] Implement LinuxPolicy::set_z_order | 3 | ✅ Linux |
| 9 | [linux] Implement LinuxPolicy::foreground_is_fullscreen | 3 | ✅ Linux |
| 10 | [linux] Implement LinuxPolicy::disable_shadow | 3 | ✅ Linux |
| 11 | [macOS] Implement MacosMediaProvider::read_status | 4 | ✅ Mac |
| 12 | [linux] Implement LinuxMediaProvider::read_status | 5 | ✅ Linux |
| 13 | [macOS] Read DND status | 6 | ✅ Mac |
| 14 | [linux] Read notification DND | 6 | ✅ Linux |

**Status:** issues **#1** and **#2** are complete (Wave 1 — deps added with
tauri-aligned versions per §5; CI rust job runs the 3-OS matrix per §7).
No separate GitHub issues were filed for them; this checklist is the record.

---

## 9. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| macOS DND has no public API | Use `osascript` to invoke Shortcuts, or skip DND on macOS (show "unsupported") |
| Linux DE fragmentation (GNOME/KDE/Sway) | Target EWMH + freedesktop specs first; DE-specific is stretch |
| `objc2` learning curve | Apple's API maps 1:1 to Rust selectors; use `objc2-foundation` helpers |
| Wayland doesn't allow arbitrary window positioning | Glance Bar uses Tauri's positioning; on Wayland, rely on layer-shell via Tauri config |
| CI macOS minutes cost 2× Windows | Run macOS CI only on PRs labeled `CI` (existing label gate) |
| Stubs silently return `unsupported` | Frontend already handles `code: unsupported` with a badge — no crash |

---

## 10. Exit Criteria

Stage 6 is **done** when:

- [ ] `cargo check` passes on all 3 platforms in CI
- [ ] macOS: pill window chrome works (skip taskbar, fullscreen hide, z-order)
- [ ] Linux: pill window chrome works (same as macOS)
- [ ] macOS: media session reads from MPNowPlayingInfoCenter
- [ ] Linux: media session reads from MPRIS D-Bus
- [ ] No regression on Windows (existing 701/701 tests + manual media/clipboard/focus)

**Stretch:** Focus/DND status on macOS + Linux.

---

*Related: `GLANCE_BAR_PLAN.md` §5 (Stage 6 summary), `STRUCTURE_REFACTOR_PLAN.md` (G1a/G1b created the trait structure).*
