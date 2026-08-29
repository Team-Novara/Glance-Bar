# Glance Bar Unified Plan

> **Formerly `Cober-Windows-Bar` → `Glance-Bar` (repo `jay77721/Glance-Bar` @ `main`)**
> This document **supersedes** `IMPLEMENTATION_PLAN.md`, `STAGE5_WIP_LANDING.md`, `v0.7_TAURI_SPIKE_PLAN.md` (archived to `docs/archive/plans/`) and consolidates `docs/product/ROADMAP.md`, `docs/ROADMAP-NEXT.md`, `docs/ROADMAP-NEXT-V2.md` into one executable roadmap.
> Baseline date: 2026-08-29 · Latest commit `197ed12 feat(desktop): add developer status kind`

## 1. Product Identity

- **Name:** **Glance Bar** — `Glance` = glanceable (0.5s readable), `Bar` = 303×64 pill `src-tauri/tauri.conf.json:14`
- **Tagline:** *Your system at a glance.*
- **Positioning:** Cross-platform **Unified Status Hub** (was Windows 11 only). Compact, low-disturbance pill above taskbar/dock aggregating music / AI / download / notification / system / clipboard / focus / developer.
- **Surfaces:** `src/features/desktop/` (product) + `src/features/showcase/` (demo/QA, lazy `src/App.tsx:15`)
- **Privacy:** coarse % only, bounded enums `quality: live|fallback|stale|unavailable` `src/types/hub.ts:39`, no process list / path / credential `docs/decisions/v0.8_SYSTEM_STATUS_PRIVACY_CHECKLIST.md`

## 2. Current Baseline

| Item | Value |
|---|---|
| Stack | Tauri 2 + Rust + React 19 + TS 5.9 + Vite 7 + Tailwind 3.4 + Framer 12 `package.json:26` `src-tauri/Cargo.toml:21` |
| Source | `src/` 136 files 20286 lines (源码10207 + 测试10079) · `src-tauri/src/` 7 files 2849 lines (`lib.rs:1754` `media.rs:471` `window.rs:320` `types.rs:189`) |
| Tests | 47 files 699 cases (`vitest run`) — current 696 pass / 3 fail (`developer` kind unsynced, see §6) |
| IPC | 26 commands + 7 events `src-tauri/src/lib.rs:1953-1980` `lib.rs:240-246` (docs still say 16) |
| States | 8 `DesktopStatusKind` `src/types/hub.ts:52` = `resident|media|download|update|clipboard|focus|notification|developer` (was 6, then 7 in WIP landing, now 8 @197ed12) |
| Providers | 14 kinds `src/providers/types.ts:18` · `ProviderManager` registers 10 real + 4 mock `src/providers/providerManager.ts:76` |
| Quality | `tsc -b --noEmit` pass · `eslint --max-warnings=0` 1 warning `DesktopPage.tsx:22 import/order` · `csp: null` `tauri.conf.json:31` |

Data flow: `Provider(mock+native via IPC) -> EventBus -> Store -> Resolver -> UI` `docs/architecture/ARCHITECTURE.md:11` · Scheduler duality intentional `ARCHITECTURE.md:126` (`desktopStatusScheduler.ts:59` pure + `schedulerService.ts:110` 250ms stateful for 15s media↔resident alternation)

## 3. Stage History — Done (do not reopen)

| Stage | Artifact | Close |
|---|---|---|
| 0 UI Prototype | `/showcase` 6 states, Mica/Acrylic | v0.1 |
| 1 Event Playground | `hubScenarios.ts` Auto Demo, Resolver vis | v0.2 |
| 2 Arch Planning | Runtime sequence `Mock->Tauri->Windows` | v0.4 (docs-only, now superseded) |
| 3 Mock Provider SDK | `types.ts` `providerRegistry.ts` `adapter` + 4 mocks, `92f3e01` | v0.6 |
| 4 Tauri Shell | `lib.rs` 1226→2849, `sysinfo`+GSMTC, tray `Alt+Shift+Space`, 3 threads | v0.7 (spike plan `v0.7_TAURI_SPIKE_PLAN.md` vastly exceeded) |

`ROADMAP-NEXT.md` stages 8–16 (DesktopPage split, clipboard, interactions, async, more providers, i18n, autostart, multi-state, Vitest) are **all done** — archived as historical.

## 4. Stage 5 — First Real Providers (In Progress, WIP landed)

This merges the former `STAGE5_WIP_LANDING.md` slices 1–4 into the trunk.

**Landed (already in `main`):**
- 7-state → 8-state surface: `notification` then `developer` (`types/hub.ts:60` `desktopStatusConfig.ts` TEMPLATE/PRIORITY)
- 15s `media↔resident` alternation `desktopStatusScheduler.ts:91` + 1s heartbeat `useDesktopStatusRuntime.ts:114`
- 5 new IPC stubs `lib.rs:442-480` `stop_focus_session` `pause|resume|cancel_download` `install_update` `dismiss_notification` (always `success:true`)
- 4 new runtime wrappers `downloadControlRuntime.ts` `focusStopRuntime.ts` `notificationDismissRuntime.ts` `updateInstallRuntime.ts` + `NotificationStatusTemplate.tsx` + shimmer `StatusRail`
- i18n keys `en|zh-CN.json` + `ProviderStatusPanel`

**Remaining in Stage 5 (Stage 5+2):**
1. Wrap `systemPerformance` + `mediaSession` as `HubProvider` via `createProviderShell` (follow `realClipboardProvider.ts`/`realFocusProvider.ts` pattern), register in `providerManager.ts`, remove direct `onMediaSessionChanged` bypass in `useDesktopStatusRuntime.ts`
2. Real download watcher (`notify` crate vs browser Native Messaging — decision needed)
3. Real notification listener (Windows `UserNotificationListener`, macOS `UNUserNotificationCenter`, Linux `D-Bus`) — currently synthetic `dismiss_notification`
4. Fix 3 failing tests + 1 lint to green `npm run qa`

**Exit criteria:** `npm run qa` = `test:vitest + qa:showcase:interactions + build` all green, 8 states all backed by real or explicit `unavailable` health.

## 5. Stage 6 — Cross-Platform Abstraction (NEW, P0 after Stage 5+2)

Goal: `Glance Bar` runs on **Windows / macOS / Linux** from one codebase. Today `Cargo.toml:34` isolates `windows*`/`winreg` correctly so it **compiles** on all three, but `lib.rs:294` `#[cfg(not(windows))]` returns `"unsupported"` for media/focus/window — **compiles, not usable**.

| Area | Windows (now) | macOS target | Linux target |
|---|---|---|---|
| Window chrome | `WS_EX_TOOLWINDOW` `HWND_TOPMOST` `DwmSetWindowAttribute` `window.rs:15` | `NSWindowLevelFloating` `NSWindowStyleMaskBorderless` | X11/Wayland `skip_taskbar + layer-shell` |
| Fullscreen avoid | `GetForegroundWindow` `window.rs:99` | `NSWorkspace` | `EWMH _NET_WM_STATE_FULLSCREEN` |
| Media | GSMTC MTA thread `lib.rs:71` | `MediaPlayer.framework NowPlaying` | `MPRIS D-Bus` |
| Focus/DND | Registry `QuietHours\NFPEnabled` `lib.rs:382` | `DND / Focus` | `org.freedesktop.Notifications` |
| Clipboard | `arboard` (already cross) | — | — |
| Perf | `sysinfo` (already cross) | — | — |

**Tasks:**
- Split `window.rs` / `media.rs` into `window/{mod,windows,macos,linux}` `media/{trait,windows,macos,linux}` trait `PlatformMediaProvider`, `PlatformWindowPolicy`
- Add `target.'cfg(target_os="macos")'.dependencies objc2` etc., keep `#[cfg]` narrow
- Transparent WebView parity test (WebView2 vs WKWebView vs WebKitGTK) for 303×64 pill corners
- CI: `cargo check` on 3 runners

## 6. Stage 7 — Developer Hub (was Stage 6, now after cross-platform)

Git / Docker / WSL / npm / Cargo / Maven / Gradle status. Already skeletoned: `realGitProvider` `realDockerProvider` `realWslProvider` `realNpmProvider` registered in `providerManager.ts:76` @ `d1aebf1/48447e6/197ed12`. Need real sampling + `DeveloperStatusTemplate.tsx`.

## 7. Stage 8 — AI Agent Hub

Codex / Claude / OpenCode / Gemini session summarization. Depends on Provider SDK stability.

## 8. Engineering Hardening (from `ROADMAP-NEXT-V2.md` 17–32, de-duplicated)

Pulled forward as parallel track, not a separate stage. Status audited 2026-08-29:

| V2 Stage | Topic | Status now | Action |
|---|---|---|---|
| 17 Settings CSS | `SettingsPanel` class drift | **Fixed** (class family now `product-status-template-meta-actions`) | Verify, add vitest |
| 18 WinRT blocking | 3 commands blocking | **Fixed** (`lib.rs:264` now `async` + MTA `mta_wait_async:961`) | Keep timeout 5s |
| 19 Thread shutdown | 3 `std::thread::spawn` no exit | **Partial** (`shutdown: Arc<AtomicBool>` added `lib.rs:9` for media, but clipboard/focus still `loop`) | Merge focus+notification poll (both read same registry) + `CancellationToken` |
| 20 Toolchain | ESLint/Prettier | **Done** `eslint.config.js` `prettier` `package.json:20-24` | Add `husky+lint-staged` |
| 21 Rust split | `lib.rs` 1754 monolith | **Partial** (`types.rs` `window.rs` `media.rs` split, still 1754 in lib) | Split `commands/` `monitoring/` `preferences/` `tray.rs` |
| 22 Dead code | `DesktopStatusTransition` etc | **Partial** (823 lines removed `48447e6`, but `sta_wait_async:993` 160 lines archive remains) | Remove or gate `#[cfg(debug)]` |
| 23 CSS split | `globals.css` 2556 | **Done** `product.css`+`showcase.css` lazy `App.tsx:6` | Remove showcase from prod bundle |
| 24 Tests | dual `.test.ts`+`.vitest.*` | **Mostly done** (47 files Vitest) | Unify, add coverage `--coverage` 80% |
| 25 DesktopPage fat | 427→210 lines | **Partial** (`de7592c` split 3 hooks) | Extract `useSettingsActions`/`useWindowLifecycle` further if needed |
| 26 Bundle | 510KB single chunk | **Done** `manualChunks: react-vendor/animation/i18n` `vite.config.ts:62` | Add `chunkSizeWarningLimit` |
| 27 i18n | Settings/showcase | **Done** (en/zh) | Add missing-key check |
| 28 Security | CSP `null` | **TODO P1** | Enable CSP, tighten `core:default` permissions |
| 29 CI | build/test | **TODO P1** | `cargo check` + `vitest` on 3 OS |
| 30-32 | Deps/VSCode/Rust tests | **TODO P2** | Renovate, `clippy`, pure-fn unit tests |

P0 order for next 2 weeks: fix 3 tests + 1 lint (§4) → thread shutdown + CSP + CI → Rust split.

## 9. Hard-Coded Debt to Clear Before 1.0

- `lib.rs:1159` `C:\\Users\\jay\\Desktop\\media-debug.log` — move to `app_log_dir` or `#[cfg(debug_assertions)]`
- `lib.rs:448-480` stub `success:true` — return `code: not-implemented` so UI toast can surface
- `tauri.conf.json:31 csp:null`
- `scripts/diag-missing.mjs` untracked — delete or ignore

## 10. Verification (single gate)

```bash
npm run lint          # 0 warnings
npm run typecheck     # tsc -b --noEmit
npm run test:vitest   # 699/699
npm run qa            # vitest + qa:showcase:interactions + build
npm run tauri -- build # on Windows + macOS + Linux runners
```

Manual: media 15s alternation, media unavailable badge, clipboard URL `open_url_in_browser`, focus stop flips `NFPEnabled`, download stubs toast.

## 11. Execution Order

```
Now:        Stage 5+2 provider wrapping + fix 3 tests/1 lint (1 week)
Next:       Stage 6 cross-platform abstraction trait + CI 3 OS (2 weeks)
Then:       Stage 7 Developer Hub (skeletons already) (2 weeks)
Then:       Stage 8 AI Hub
Parallel:   §8 hardening P1 items (thread/CSP/split) — interleave with stages
Far:        bundle/CSP already done, deps bump
```

---
*Supersedes: `docs/archive/plans/IMPLEMENTATION_PLAN.md`, `STAGE5_WIP_LANDING.md`, `v0.7_TAURI_SPIKE_PLAN.md`, `docs/ROADMAP-NEXT.md`, `docs/ROADMAP-NEXT-V2.md`. Keep `docs/product/ROADMAP.md` as product-facing summary, this file as engineering execution plan.*
