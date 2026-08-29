# Glance Bar Structure Refactor Plan — FSD + Multi-Owner

> **Goal:** Make `Glance-Bar` structure **multi-person safe** without changing behavior. Pure move/rename + lint gates. Follows `GLANCE_BAR_PLAN.md` §8 P1 Rust split and §6 cross-platform trait.

## 1. Why Now

- `src/` 136 files 20286 lines, `src-tauri/src/` 7 files 2849 lines (`lib.rs:1754` = 61%)
- `providers/30` mock+real+registry flat, `runtime/24` 12 wrappers flat, `types/hub.ts:346` monolith, `shared/4` empty
- No ownership: 2 devs editing `providerManager.ts:76` or `lib.rs` conflicts; no import boundary, `DesktopPage` can bypass `ProviderManager`
- Next work is Stage6 cross-platform trait (`window/{win,mac,linux}` `media/{win,mac,linux}`) — needs folder ownership now, else trait lands in flat `runtime/`

## 2. Non-Goals

- No feature logic change, no IPC/shape change, no UI redesign
- No `ROADMAP` stage work (Stage5+2, Stage6) inside this plan — only structure to make them parallelizable
- No big-bang rename: slices 1–4 are each `git mv` + `tsconfig` + `eslint` only, tests stay green

## 3. Target Structure

```
src/
  app/                          # App shell, routing, providers root
    App.tsx                     # from src/App.tsx:19
    main.tsx                    # from src/main.tsx
    providers.tsx               # i18n + Query etc.
  features/
    desktop/
      page/        DesktopPage.tsx + use* hooks moved here
      templates/   8 StatusTemplates + hooks/
      components/  SettingsPanel, ProviderStatusPanel
      index.ts     # public: DesktopPage, useDesktopStatusRuntime
    showcase/
      page/        ShowcasePage.tsx
      components/  13 demo components
      index.ts
  entities/                     # Domain, no React
    status/
      types.ts     # split from types/hub.ts:1-200 (HubEvent, HubMode)
      desktop.ts   # DesktopStatusKind/State/Map  hub.ts:52-212
      performance.ts # SystemPerformance* hub.ts:28-50
      config.ts    # from data/desktopStatusConfig.ts
    provider/
      types.ts     # from providers/types.ts
  providers/
    core/          # registry, adapter, manager, shell, health (owner: @core)
    impl/
      mock/        # mockProviders.ts split
      real/        # real*Provider.ts 10 files
      platform/    # win/mac/linux sub-impls (for Stage6)
    index.ts       # re-export createProviderManager
  runtime/                      # Frontend native bridge, no UI
    tauri/         # tauriRuntime.ts, tauriWindow.ts
    window/        # statusWindowRuntime.ts, autostartRuntime.ts
    scheduler/     # schedulerService.ts + desktopStatusScheduler re-export
    system/        # systemPerformanceRuntime.ts, systemMonitorRuntime.ts, mediaControlRuntime.ts
    actions/       # downloadControl, focusStop, notificationDismiss, updateInstall
    index.ts
  shared/
    ui/            # GlassPanel, ProgressBar
    lib/           # runtimeGuards.ts, mediaTime.ts, tauriWindow.ts
    config/        # constants, feature flags
    styles/        # product.css, showcase.css (from src/styles/)
  data/            # mockHubData.ts (or move to entities/status/mock)
  i18n/            # en.json zh-CN.json
  test/            # setup.ts fixtures

src-tauri/src/
  lib.rs           # only `run` + `invoke_handler` (~150 lines)
  commands/        # system.rs, media.rs, clipboard.rs, focus.rs, window.rs, prefs.rs
  window/          # mod.rs, windows.rs, macos.rs, linux.rs (trait PlatformWindow)
  media/           # mod.rs, windows.rs, macos.rs (NowPlaying), linux.rs (MPRIS)
  monitoring/      # clipboard.rs, focus.rs (merge 800ms+2s polls)
  preferences/     # prefs.rs (from lib.rs persist)
  tray/            # tray.rs
  types.rs         # keep

.github/
  CODEOWNERS
```

Dependency rule (enforced by `eslint-plugin-import` + `eslint-plugin-boundaries`):

```
app -> features -> entities, providers, runtime, shared
features -> entities, shared (never runtime directly, except desktop page via runtime/index)
providers -> entities, shared, runtime/tauri
runtime -> entities, shared (never features)
shared -> (nothing inside src)
```

## 4. Ownership (CODEOWNERS)

```
# .github/CODEOWNERS
/src/features/desktop/    @glance/desktop
/src/features/showcase/   @glance/showcase
/src/entities/            @glance/core
/src/providers/           @glance/provider
/src/runtime/             @glance/runtime
/src/shared/              @glance/core
/src-tauri/src/window/    @glance/runtime
/src-tauri/src/media/     @glance/runtime
/src-tauri/src/commands/  @glance/runtime
```

## 5. Slices (each 1 commit, green `npm run qa`)

### Slice 1 — Create `entities/` + split `hub.ts` (no import change yet)
- `src/types/hub.ts:346` → `src/entities/status/{types,desktop,performance}.ts` + `src/entities/provider/types.ts`
- Keep `src/types/hub.ts` as re-export barrel for compat, add `// @deprecated use entities/status`
- `tsc -b --noEmit` green

### Slice 2 — Create `shared/lib` + `app/` barrel
- Move `shared/runtimeGuards.ts` `shared/tauriWindow.ts` `shared/mediaTime.ts` → `shared/lib/`
- Move `App.tsx` `main.tsx` → `app/`, update `vite.config.ts:62` alias `@` + `tsconfig.app.json:21`
- Add `src/shared/index.ts` `src/entities/status/index.ts` barrels

### Slice 3 — Split `runtime/24` → `runtime/{tauri,window,scheduler,system,actions}`
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
