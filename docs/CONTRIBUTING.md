# Contributing to Glance Bar

This guide covers where code lives in the project and the five rules every
contributor follows. The single source of truth for structure is
`docs/plans/STRUCTURE_REFACTOR_PLAN.md`; this document mirrors the parts you
need before writing code.

## Where to put code

The project follows a Feature-Sliced Design (FSD) layout. **"Where does this
go?" must have one obvious answer** — if you're unsure, the table below should
tell you.

```
src/
  app/                          # App shell, routing, providers root
    App.tsx                     # route switch (desktop / showcase)
    main.tsx                    # React root
    rootProviders.tsx           # i18n / QueryClient / global providers
    index.ts                    # export { App }
  features/                     # Per user-visible surface, not per technology
    desktop/                    # Product page (the only real product)
      page/DesktopPage.tsx      # pure orchestration: hooks + layout + render
      templates/                # 8 status templates (resident/media/download/...)
      components/               # "smart" in-page components
      hooks/                    # page-level hooks (consume runtime via providers)
      index.ts                  # public API: export { DesktopPage } ONLY
    showcase/                   # Demo page (lazy, out of main bundle)
      page/ShowcasePage.tsx
      components/               # 13 demo components
      index.ts                  # export { ShowcasePage }
  providers/                    # All data sources (the ONLY place that talks to runtime)
    core/                       # Provider SDK: HubProvider / registry / adapter / manager
    impl/
      real/                     # Real data sources (consume runtime/*)
      mock/                     # Mock data sources
      platform/                 # Stage6 cross-platform differences (win/mac/linux)
    index.ts                    # export { createProviderManager }
  runtime/                      # Frontend↔native bridge (the ONLY place that talks to Tauri IPC)
    tauri/                      # Tauri shell: invoke wrapper + capability detection
    system/                     # System info (perf/media/clipboard/focus on TS side)
    window/                     # Window behavior (floating, drag, autostart)
    scheduler/                  # State scheduling (pure fn + 250ms service)
    actions/                    # User-action IPC shells (download/focus/notification/update)
    index.ts                    # internal barrel (runtime-internal + providers only)
  state/                        # Client state (store + resolver)
    hubState.ts                 # HubEventBus implementation
    hubStore.ts                 # current snapshot
    aggregation/                # desktopStatusAggregation / desktopStatusState
    resolver/                   # desktopStatusResolver
    index.ts
  entities/                     # Pure types + pure functions (no React, no IO)
    status/                     # HubEvent / HubMode / DesktopStatus* / config
    provider/                   # provider domain types
    index.ts
  shared/                       # Leaf layer (imports nothing inside src)
    ui/                         # Generic UI atoms (GlassPanel, ProgressBar, ...)
    lib/                        # Utility functions (runtimeGuards, mediaTime, ...)
    config/                     # Constants
    index.ts
  styles/                       # Global styles
    product.css
    showcase.css

src-tauri/src/
  lib.rs                        # ONLY run() + invoke_handler! + thread spawns (~150 lines)
  types.rs                      # MediaSessionStatus / ClipboardContent etc.
  commands/                     # ALL #[tauri::command] handlers (the single IPC exit to frontend)
  window/                       # Cross-platform window strategy (windows/macos/linux.rs)
  media/                        # Cross-platform media strategy (windows/macos/linux.rs)
  monitoring/                   # Background polling (clipboard + focus merged)
  preferences.rs                # Persistence
  tray.rs                       # Tray menu
```

### Dependency rule (enforced by lint)

```
app       -> features, entities, providers, runtime, shared
features  -> entities, shared, providers   (NEVER runtime directly)
providers -> entities, shared, runtime     (providers is the ONLY layer allowed into runtime)
runtime   -> entities, shared              (NEVER features, NEVER providers)
state     -> entities, shared
entities  -> (nothing inside src)
shared    -> (nothing inside src)
```

**Key invariant:** `providers` is the **sole** consumer of `runtime`. `features/`
talks to providers through `ProviderManager`, never calls `invoke` itself. This
makes the data flow `Provider → Bus → Store → Resolver → UI` enforceable by
lint, not convention.

## The five rules

These rules are simpler than textbook FSD and match the project's real scale
(≈140 TS + ≈2000 Rust, 1–3 maintainers). Every change is judged against them.

### Rule 1 — One-way data flow

`providers → runtime` (sole IPC consumer). `features → providers` (never
runtime). Enforced by `import/no-restricted-paths` (and eventually
`eslint-plugin-boundaries`) in `eslint.config.js`.

### Rule 2 — One public API per directory

Every top-level directory has an `index.ts`. External consumers import **only**
from `index`. `features/desktop/index.ts` exports **only `DesktopPage`** —
hooks, templates, components are internal.

### Rule 3 — `entities/` = types + pure functions only

Anything with `import React`, `invoke`, or `setInterval` is **banned** from
`entities/`.

### Rule 4 — Rust `commands/` is the single IPC exit

All `#[tauri::command]` live under `commands/`. Cross-platform impl lives in
`window/{windows,macos,linux}.rs` and `media/{windows,macos,linux}.rs` with
strategy traits in their respective `mod.rs`.

### Rule 5 — Tests sit next to implementation

Every `.ts` may have a `.test.ts` beside it. No separate `src/test/`
directory. `fixtures.ts` lives in `shared/test-util/` or beside the test that
uses it.

## Before you open a PR

- Is this `desktop`, `showcase`, `runtime/native`, or `provider`? Which
  `CODEOWNERS` dir?
- Does it belong in `shared` or feature-specific?
- Does it need a doc link update?
- Does it respect the single data flow `Provider → Bus → Store → Resolver → UI`?

Run the full gate before requesting review:

```bash
npm run typecheck
npm run lint --max-warnings=0
npm run test:vitest
npm run qa
cargo check && cargo clippy
```
