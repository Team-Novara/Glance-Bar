# Glance Bar Structure Refactor Plan — FSD + Multi-Owner

> **Goal:** Make `Glance-Bar` structure **multi-person safe** without changing behavior. Pure move/rename + lint gates. Follows `GLANCE_BAR_PLAN.md` §8 P1 Rust split and §6 cross-platform trait.

> **Plan version:** this revision supersedes the previous slice list (slices 1–6). It re-states the plan around a concrete **ideal target structure**, five minimal rules, a **current-vs-ideal gap table**, and a new slice sequence that closes the gaps left by the first pass (Rust ghosts, missing barrels, no lint gates, `runtime/product/`黑洞).

## 1. Why Now

- `src/` 136 files 20286 lines, `src-tauri/src/` 7 files 2849 lines (`lib.rs:1754` = 61%)
- `providers/30` mock+real+registry flat, `runtime/24` 12 wrappers flat, `types/hub.ts:346` monolith, `shared/4` empty
- No ownership: 2 devs editing `providerManager.ts:76` or `lib.rs` conflicts; no import boundary, `DesktopPage` can bypass `ProviderManager`
- Next work is Stage6 cross-platform trait (`window/{win,mac,linux}` `media/{win,mac,linux}`) — needs folder ownership now, else trait lands in flat `runtime/`

## 2. Non-Goals

- No feature logic change, no IPC/shape change, no UI redesign
- No `ROADMAP` stage work (Stage5+2, Stage6) inside this plan — only structure to make them parallelizable
- No big-bang rename: slices are each `git mv` + `tsconfig` + `eslint` only, tests stay green

## 3. Ideal Target Structure

> This is the single source of truth for where code lives. Every slice moves the codebase toward this. The rule of thumb: **"where does this go?" has one obvious answer.**

```
src/
  app/                          # App shell, routing, providers root
    App.tsx                     # from src/App.tsx — route switch (desktop / showcase)
    main.tsx                    # React root
    rootProviders.tsx           # i18n / QueryClient / global providers
    index.ts                    # export { App }
  features/                     # Per user-visible surface, not per technology
    desktop/                    # Product page (the only real product)
      page/
        DesktopPage.tsx         # pure orchestration: declare hooks + layout + conditional render
        index.ts                # export { DesktopPage }
      templates/                # 8 status templates (resident/media/download/...)
        ResidentStatusTemplate.tsx
        MediaStatusTemplate.tsx
        ...                     # one file per kind, ≤60 lines each
      components/               # "smart" in-page components
        SettingsPanel.tsx
        ProviderStatusPanel.tsx
      hooks/                    # page-level hooks (consume runtime, never invoke IPC directly)
        useDesktopStatusRuntime.ts
        useOverlayPolicy.ts
        useWindowLifecycle.ts
        ...
      index.ts                  # public API: export { DesktopPage } ONLY
    showcase/                   # Demo page (lazy, out of main bundle)
      page/ShowcasePage.tsx
      components/               # 13 demo components
      index.ts                  # export { ShowcasePage }
  providers/                    # All data sources (the ONLY place that talks to runtime)
    core/                       # Provider SDK itself
      types.ts                  # HubProvider / HubProviderStatus
      providerShell.ts          # createProviderShell template method
      providerRegistry.ts       # register + lifecycle
      providerAdapter.ts        # connectProviderToEventBus
      providerManager.ts        # orchestrate: register all + start/stop
      index.ts
    impl/
      real/                     # Real data sources (consume runtime/*)
        realMediaSessionProvider.ts
        realSystemPerformanceProvider.ts
        realClipboardProvider.ts
        ...                     # 10 files
      mock/                     # Mock data sources
      platform/                 # Stage6 cross-platform differences (win/mac/linux subdirs)
        windows/
        macos/
        linux/
    index.ts                    # export { createProviderManager }
  runtime/                      # Frontend↔native bridge (the ONLY place that talks to Tauri IPC)
    tauri/                      # Tauri shell: invoke wrapper + capability detection
      tauriRuntime.ts           # getTauriInvoke + TS wrappers for all commands
      index.ts
    system/                     # System info (perf/media/clipboard/focus on TS side)
      systemPerformanceRuntime.ts
      systemMonitorRuntime.ts
      mediaControlRuntime.ts
      index.ts
    window/                     # Window behavior (floating, drag, autostart)
      statusWindowRuntime.ts
      autostartRuntime.ts
      index.ts
    scheduler/                  # State scheduling (pure fn + 250ms service)
      desktopStatusScheduler.ts # pure: input kinds → output decision
      schedulerService.ts       # stateful: 250ms tick
      index.ts
    actions/                    # User-action IPC shells (download/focus/notification/update)
      downloadControlRuntime.ts
      focusStopRuntime.ts
      notificationDismissRuntime.ts
      updateInstallRuntime.ts
      index.ts
    index.ts                    # internal barrel (runtime-internal + providers only)
  state/                        # Client state (store + resolver)
    hubState.ts                 # HubEventBus implementation
    hubStore.ts                 # current snapshot
    aggregation/
      desktopStatusAggregation.ts
      desktopStatusState.ts
    resolver/
      desktopStatusResolver.ts
    index.ts
  entities/                     # Pure types + pure functions (no React, no IO)
    status/
      types.ts                  # HubEvent / HubMode (split from types/hub.ts:1-200)
      desktop.ts                # DesktopStatusKind/State/Map (hub.ts:52-212)
      performance.ts            # SystemPerformance* (hub.ts:28-50)
      config.ts                 # TEMPLATE_ORDER / PRIORITY (moved from data/)
    provider/
      types.ts                  # (or merge into providers/core/types.ts)
    index.ts
  shared/                       # Leaf layer (imports nothing inside src)
    ui/                         # Generic UI atoms
      GlassPanel.tsx
      ProgressBar.tsx
      ...
    lib/                        # Utility functions
      runtimeGuards.ts          # isRecord / parseHubEvent
      mediaTime.ts              # formatMediaTime
      tauriWindow.ts            # getSafeCurrentWindow
    config/                     # Constants
      constants.ts
    index.ts
  styles/                       # Global styles (only 2 files)
    product.css
    showcase.css

src-tauri/src/
  lib.rs                        # ONLY run() + invoke_handler! + thread spawns (~150 lines)
  types.rs                      # MediaSessionStatus / ClipboardContent etc.
  commands/                     # ALL #[tauri::command] handlers (the single IPC exit to frontend)
    mod.rs
    system.rs                   # get_system_performance / overlay_policy / download / update / notification / autostart
    media.rs                    # get_media_session_status / media_control
    window.rs                   # floating / position / drag / menu / settings / show / quit
    clipboard.rs                # open_url / get / set
    focus.rs                    # focus_assist / notification_summary / stop_focus
  window/                       # Cross-platform window strategy
    mod.rs                      # trait PlatformWindowPolicy
    windows.rs                  # WS_EX_TOOLWINDOW / DWM / HWND_TOPMOST
    macos.rs                    # NSWindowLevelFloating / NSWindowStyleMaskBorderless
    linux.rs                    # X11/Wayland skip_taskbar + layer-shell
  media/                        # Cross-platform media strategy
    mod.rs                      # trait PlatformMediaProvider + start_mta_media_thread lives HERE only
    windows.rs                  # GSMTC + MTA thread
    macos.rs                    # MediaPlayer NowPlaying
    linux.rs                    # MPRIS D-Bus
  monitoring/                   # Background polling (clipboard 800ms + focus 2s merged)
    mod.rs
  preferences.rs                # Persistence
  tray.rs                       # Tray menu

.github/
  CODEOWNERS                    # real owners enabled (see §4)
```

Dependency rule (enforced by `eslint-plugin-boundaries` + `import/no-restricted-paths`):

```
app -> features -> (everything below)
features -> entities, shared, providers, runtime, state, i18n, styles (top consumer, no restriction)
providers -> entities, shared, runtime, state (Bus connection is the designed data flow)
runtime -> entities, shared, state, i18n (NEVER features, NEVER providers)
state -> entities, shared, i18n (NEVER features, NEVER providers, NEVER runtime)
entities -> entities, i18n (config.ts i18n exception documented)
shared -> shared, entities (runtimeGuards HubEvent types documented)
```

**Key invariant:** the wall protects the **leaf and data layers** — nothing imports INTO `features`; `providers` never imports UI; `runtime`/`state` never import each other's upstream. Data flow `Provider → Bus → Store → Resolver → UI` stays enforceable by lint. Hooks in `features/` may touch `runtime/` (G4 relaxed the original strict rule — they are infrastructure hooks, and the actual enforced zones live in `eslint.config.js`).

## 4. Five Minimal Rules

These rules are simpler than textbook FSD and match the project's real scale (≈140 TS + ≈2000 Rust, 1–3 maintainers). Every slice is judged against them.

**Rule 1 — One-way data flow**
`providers → runtime` (sole IPC consumer). `features → providers` (never runtime). Enforced by eslint boundaries.

**Rule 2 — One public API per directory**
Every top-level directory has an `index.ts`. External consumers import **only** from `index`. `features/desktop/index.ts` exports **only `DesktopPage`** — hooks, templates, components are internal.

**Rule 3 — `entities/` = types + pure functions only**
Anything with `import React`, `invoke`, or `setInterval` is **banned** from `entities/`.

**Rule 4 — Rust `commands/` is the single IPC exit**
All `#[tauri::command]` live under `commands/`. The old `window.rs`/`media.rs` files are **gone**; cross-platform impl lives in `window/{windows,macos,linux}.rs` and `media/{windows,macos,linux}.rs` with strategy traits in their respective `mod.rs`.

**Rule 5 — Tests sit next to implementation**
Every `.ts` may have a `.test.ts` beside it. No separate `src/test/` directory. `fixtures.ts` lives in `shared/test-util/` or beside the test that uses it.

## 5. Ownership (CODEOWNERS)

```
# .github/CODEOWNERS — real owners enabled (uncommented)
/src/features/desktop/    @glance/desktop
/src/features/showcase/   @glance/showcase
/src/entities/            @glance/core
/src/providers/           @glance/provider
/src/runtime/             @glance/runtime
/src/shared/              @glance/core
/src-tauri/src/window/    @glance/runtime
/src-tauri/src/media/     @glance/runtime
/src-tauri/src/commands/  @glance/runtime
/src-tauri/src/monitoring/@glance/runtime
/src/app/                 @glance/core
```

Until the team grows, all `@glance/*` accounts fall back to `@jay77721` (the `*` default line). But the directory lines are **uncommented** so ownership is real as soon as the team splits.

## 6. Current vs Ideal — Gap Table

This table is the ground truth that drives the new slices. Each gap is closed by exactly one slice.

| Current state | Ideal state | Slice |
|---|---|---|
| `window.rs`(371) + `commands/window.rs`(366) coexist, overlapping fns | only `commands/window.rs` + `window/{windows,macos,linux}.rs` | G1 |
| `media.rs`(335) + `commands/media.rs`(139) coexist, role confusion | only `commands/media.rs` + `media/{windows,macos,linux}.rs` | G1 |
| `runtime/product/desktopProductRuntime.ts` 黑洞 | deleted; content migrated to `app/` or `runtime/tauri/` | G2 |
| `data/` holds `desktopStatusConfig.ts` + test | config → `entities/status/config.ts`; test sits beside impl | G3 |
| `types/` holds only the deprecated `hub.ts` barrel | deleted; barrel moves to `entities/index.ts` | G3 |
| `test/legacy-test-shim.ts` relic | deleted (no "legacy shim" after refactor) | G3 |
| `features/*/` have no `index.ts` barrel; `DesktopPage` uses 7-deep relative paths | each feature has one index exporting only the page | G4 |
| `DesktopPage` directly imports `runtime/tauri/*` + `runtime/window/*` (boundary violation) | features → providers only; runtime hidden behind providers | G4 |
| No `eslint-plugin-boundaries`; dependency rules are paper-only | boundaries enforced in CI | G5 |
| CODEOWNERS all-commented; `*` fallback only | directory owners enabled | G5 |
| `DesktopPage` is a 210-line hook-assembly center; `useDesktopStatusRuntime` `new`s ProviderManager/Bus/Scheduler | page is pure orchestration; core objects injected (testable) | G6 |

## 7. Verification Per Slice

```bash
npm run lint        # 0 warnings (boundaries enforced)
npm run typecheck   # tsc -b --noEmit
npm run test:vitest # all green (update snapshots for moved files)
npm run qa          # vitest + showcase + build
cargo check && cargo clippy
```

No behavior change: `DesktopPage` still renders 8 states, `GLANCE_BAR_PLAN.md:119` single gate.

## 8. New Slices (closing the gaps)

### Slice G1 — Rust: merge ghosts, single IPC exit
- **Merge `window.rs` into `commands/window.rs`** + `window/{windows,macos,linux}.rs`. Keep the `#[cfg(windows)]` impl in `windows.rs`; `macos.rs`/`linux.rs` become real trait impls (not 3-line stubs). Delete `window.rs`.
- **Merge `media.rs` into `commands/media.rs`** + `media/{windows,macos,linux}.rs`. `start_mta_media_thread` moves to `media/mod.rs` (the trait owner). `append_media_log` uses `#[cfg(debug_assertions)]` + `app_log_dir()`, not hard-coded `C:\`. Delete `media.rs`.
- `lib.rs` drops `mod window; mod media;` (keeps `mod commands;` only). `lib.rs` → ~150 lines (run + invoke_handler + thread spawns).
- `monitoring/mod.rs` gets the merged clipboard+focus poll (both read the same registry).
- **Gate:** `cargo check && cargo clippy -- -W clippy::all` green.

### Slice G2 — Kill `runtime/product/`
- Read `desktopProductRuntime.ts`, decide its real home:
  - if it's app-shell logic → `app/desktopProductRuntime.ts`
  - if it's Tauri-capability logic → `runtime/tauri/desktopProductRuntime.ts`
- Update every importer. Remove `runtime/product/` and the `export * from './product'` line in `runtime/index.ts`.
- **Gate:** `tsc -b --noEmit` + affected vitest green.

### Slice G3 — Collapse relic directories (`data/`, `types/`, `test/`)
- `data/desktopStatusConfig.ts` → `entities/status/config.ts` (Rule 3: pure config belongs with domain).
- `data/mockHubData.ts` → either `providers/impl/mock/mockHubData.ts` or stays as test-util in `shared/test-util/`.
- `types/hub.ts` (deprecated barrel) → **delete**; its re-exports move to `entities/index.ts`.
- `test/legacy-test-shim.ts` → **delete**.
- `test/fixtures.ts` → `shared/test-util/fixtures.ts` (or keep if truly global; rename dir to make purpose obvious).
- **Gate:** `tsc -b --noEmit` green; no import breaks.

### Slice G4 — Feature barrels + enforce `features → providers` only
- Create `features/desktop/index.ts` exporting **only** `DesktopPage`. Same for `showcase/`.
- Rewrite `DesktopPage.tsx` imports: remove direct `runtime/tauri/*` and `runtime/window/*` imports. Runtime access goes through provider hooks (which already encapsulate it).
- `useOverlayPolicy.ts`, `useWindowLifecycle.ts` etc. may still touch `runtime/*` (they're infrastructure hooks), but the page itself doesn't.
- **Gate:** `tsc -b --noEmit` green; verify import graph with `eslint`.

### Slice G5 — Lint gates + CODEOWNERS
- Add `eslint-plugin-boundaries` (or `import/no-restricted-paths`). Encode the §3 dependency rules. CI fails on violation.
- Enable real CODEOWNERS: uncomment the directory lines in `.github/CODEOWNERS`. Add a `* @jay77721` fallback.
- Add `docs/CONTRIBUTING.md` section "Where to put code" mirroring the §3 structure + §4 rules.
- **Gate:** `npm run lint --max-warnings=0` green on a deliberately-placed test violation (proves the gate works).

### Slice G6 — Page orchestration + core-object injection
- `DesktopPage.tsx` → pure orchestration: declare hooks + layout + conditional render. Extract any remaining state (`appWindowRef`, `autostartEnabled`) into a hook.
- `useDesktopStatusRuntime` stops `new`-ing `ProviderManager`/`HubEventBus`/`SchedulerService` internally. They are created in `app/rootProviders.tsx` (or a `createDesktopDependencies()` factory) and injected — makes the runtime mockable in tests.
- **Gate:** `npm run qa` green; add a vitest that swaps `ProviderManager` for a fake (proves injectability).

## 9. Risks & Mitigations

- **Rust merge breaks `#[cfg(windows)]`** → keep `#[cfg]` narrow per file; `not(windows)` impls return `unsupported` as before; run `cargo check` on all 3 platforms (add CI matrix for macos/linux check).
- **`git mv` loses blame** → use `git log --follow`; slices small; no `git mv` + edit in the same commit.
- **`desktopProductRuntime` has no obvious home** → decide in Slice G2 with a 1-line ADR in `docs/decisions/`; don't let it linger.
- **Barrel re-exports cause circular imports** → `entities/index.ts` and `shared/index.ts` are leaf barrels only; `features/*/index.ts` exports the page, never hooks.
- **Boundaries plugin is too strict initially** → start with `warn` level for 1 release, then escalate to `error`.

## 10. Timeline (solo: 3 days, 2-person: 2 days parallel)

```
Day 1: Slice G1 Rust merge + Slice G2 kill product/ (parallelizable — different layers)
Day 2: Slice G3 collapse relics + Slice G4 feature barrels
Day 3: Slice G5 lint gates + Slice G6 page injection + final qa + docs/README.md update
```

After this, Stage6 cross-platform can land as 3 parallel PRs: `window/mac`, `media/mac`, `media/linux` each touching only its `providers/impl/platform/*` + `src-tauri/src/window|media/*` owner dir. The lint gates (G5) are the prerequisite — without them, parallel PRs silently re-introduce boundary violations.

---
*Teams: do not edit outside your `CODEOWNERS` dir without review. This plan is pure structure; Stage5+2 and Stage6 feature work stays in `GLANCE_BAR_PLAN.md`.*,window,scheduler,system,actions}`
- `tauri/` : `tauriRuntime.ts:640` `tauriWindow.ts`
- `window/` : `statusWindowRuntime.ts` `autostartRuntime.ts` + `statusWindow` helpers
- `scheduler/` : `schedulerService.ts:110` + re-export `desktopStatusScheduler.ts`
- `system/` : `systemPerformanceRuntime.ts` `systemMonitorRuntime.ts` `mediaControlRuntime.ts`
- `actions/` : `downloadControlRuntime.ts` `focusStopRuntime.ts` `notificationDismissRuntime.ts` `updateInstallRuntime.ts`
- Keep `src/runtime/index.ts` re-exporting all for compat, update internal imports
- Add `eslint` rule `no-restricted-imports` to forbid `features/desktop` → `runtime/system` deep import

### Slice 4 — Split `providers/30` → `providers/{core,impl/{mock,real,platform}}`
- `core/` : `providerRegistry.ts` `providerAdapter.ts` `providerManager.ts:48` `providerShell.ts` `types.ts`
- `impl/mock/` : `mockProviders.ts:358` split per kind if >300 lines
- `impl/real/` : `real*Provider.ts` 10 files
- Add `providers/impl/platform/` empty with `README.md` explaining Stage6 trait

### Slice 5 — Split `src-tauri/src/lib.rs:1754`
- Extract `commands/{system,media,clipboard,focus,window,prefs}.rs` (move `#[tauri::command]` fns)
- `window/mod.rs` already `window.rs:320`, add `macos.rs` `linux.rs` stubs `#[cfg(not(windows))]`
- `media/mod.rs` from `media.rs:471`, add trait `PlatformMediaProvider`
- `monitoring/` merge clipboard 800ms + focus 2s loops, reuse `arboard::Clipboard`
- `lib.rs` left with `run`, `invoke_handler`, `start_mta_media_thread:71` glue only
- `cargo check` + `cargo clippy -- -W clippy::all` green

### Slice 6 — Features ownership + CODEOWNERS + lint gates
- `features/desktop/` → `features/desktop/{page,templates,components,hooks}` with `index.ts` public API
- `features/showcase/` → `page/components` + `index.ts`
- Add `.github/CODEOWNERS`, `eslint` boundaries, `tsconfig` `paths: @/*`
- Add `docs/CONTRIBUTING.md` section: "Where to put code"

## 6. Verification Per Slice

```bash
npm run lint        # 0 warnings (boundaries enforced)
npm run typecheck   # tsc -b --noEmit
npm run test:vitest # 699/699 (update snapshots for moved files)
npm run qa          # vitest + showcase + build
cargo check && cargo clippy
```

No behavior change: `DesktopPage` still renders 8 states, `GLANCE_BAR_PLAN.md:119` single gate.

## 7. Risks & Mitigations

- **Import churn breaks `vitest`** → keep barrel re-exports in old paths for 1 release, deprecate after
- **`git mv` loses blame** → use `git log --follow`, slices small, no `git mv` + edit in same commit
- **Rust split breaks `#[cfg(windows)]`** → keep `#[cfg]` narrow per file, `not(windows)` stubs return `unsupported` as before `lib.rs:294`
- **Team friction on ownership** → CODEOWNERS `*` fallback to `@glance/core`, require 1 owner review

## 8. Timeline (solo: 3–4 days, 2-person: 2 days parallel)

```
Day 1: Slice 1 entities + Slice 2 shared/app (parallelizable)
Day 2: Slice 3 runtime + Slice 4 providers
Day 3: Slice 5 Rust split
Day 4: Slice 6 CODEOWNERS + final qa + docs/README.md update
```

After this, Stage6 cross-platform can land as 3 parallel PRs: `window/mac`, `media/mac`, `media/linux` each touching only its `providers/impl/platform/*` + `src-tauri/src/window|media/*` owner dir.

---
*Teams: do not edit outside your `CODEOWNERS` dir without review. This plan is pure structure; Stage5+2 and Stage6 feature work stays in `GLANCE_BAR_PLAN.md`.*
