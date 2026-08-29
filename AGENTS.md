# AGENTS.md — Glance Bar Rigorous Dev Rules

> **Single source of truth:** `docs/plans/GLANCE_BAR_PLAN.md` (product + execution) + `docs/plans/STRUCTURE_REFACTOR_PLAN.md` (structure). This file is the **enforced contract** for every agent/human contributor.

@C:\Users\jay\browser-harness\SKILL.md

## 0. Project Identity

- **Glance Bar** (`jay77721/Glance-Bar`, was `Cober-Windows-Bar`) — Cross-platform Unified Status Hub, 303×64 pill `src-tauri/tauri.conf.json:14`, `identifier com.glance.bar`
- Stack: Tauri 2 + Rust + React 19 + TS 5.9 + Vite 7 + Tailwind 3.4 + Framer 12
- Data flow: `Provider(mock+native IPC) -> EventBus -> Store -> Resolver -> UI` `docs/architecture/ARCHITECTURE.md:11` — Scheduler duality intentional `ARCHITECTURE.md:126` (`desktopStatusScheduler.ts:59` pure + `schedulerService.ts:110` 250ms stateful)

## 1. Skill Routing

### Auto-trigger /parallel-dev-workflow when:
- Task involves 3+ independent modules or files
- User describes a feature with multiple components
- Task has clear module boundaries (auth, api, ui, etc.)
- User says: "快速", "并行", "同时处理", "多模块", "快速开发"

### Detection signals:
- "实现一个XXX功能，包括..." -> multiple components
- "添加认证、支付、用户管理" -> 3+ modules
- "重构这个模块，涉及这几个文件" -> 3+ files
- Plan identifies 3+ independent workstreams

### When NOT to auto-trigger:
- Single file changes
- Simple bug fixes
- Tightly coupled changes
- User explicitly says "不需要并行"

## 2. Directory Ownership & Dependency Rule (FSD)

```
src/
  app/            -> features, entities, shared
  features/desktop|showcase -> entities, shared (never runtime directly except via runtime/index)
  entities/{status,provider} -> (pure types, no React)
  providers/{core,impl/*} -> entities, shared, runtime/tauri
  runtime/{tauri,window,scheduler,system,actions} -> entities, shared
  shared/{ui,lib,config} -> (leaf, imports nothing inside src)
  state/          -> entities, shared
src-tauri/src/{commands,window,media,monitoring,preferences,tray,types} -> leaf
```

- **CODEOWNERS** `/.github/CODEOWNERS` is enforced: do not edit outside your owned dir without review
- New code **must** use new barrels: `@/entities/status`, `@/providers/core`, `@/runtime/tauri` — legacy `src/types/hub.ts` `src/runtime/tauriRuntime.ts` are re-export barrels only, marked `@deprecated`
- Violations: `eslint` `import/no-restricted-paths` + `boundaries/element-types` will fail CI

## 3. Provider Contract (Non-Negotiable)

- Every data source **must** implement `HubProvider` `src/providers/types.ts:54` and go through `connectProviderToEventBus -> EventBus -> Store -> Resolver` — **never** bypass to UI/Store directly (see `docs/decisions/v0.8_SYSTEM_STATUS_PRIVACY_CHECKLIST.md`)
- Provider does not decide mode, does not render, does not import UI
- Lifecycle is `Registered -> Started -> Publishing -> Paused -> Stopped -> Failed` — `start/stop` must be idempotent, `subscribe` returns idempotent unsubscribe
- `status()` is sync, no IO; health `Healthy|Degraded|Unhealthy` is separate from lifecycle and event status

## 4. Runtime & Privacy Boundaries

- All native data **must** flow via `src-tauri` IPC commands `lib.rs:1953` (`#[tauri::command]`) — no direct browser API for system data
- `src/runtime/` must detect Tauri via `getTauriInvoke` `tauriRuntime.ts:182` and fallback to mock gracefully; never throw on missing `__TAURI__`
- Privacy: only coarse `%` / bounded enums `quality: live|fallback|stale|unavailable` `src/types/hub.ts:39` / `code: available|unsupported|...` — no process list, path, credential, username crosses IPC
- Hard-coded paths forbidden — `lib.rs:1159` `C:\Users\...media-debug.log` style is blocked by `clippy` + review; use `app_log_dir()` + `#[cfg(debug_assertions)]`

## 5. Coding Conventions

### TypeScript
- `strict: true` `noUncheckedIndexedAccess` `exactOptionalPropertyTypes` — no `any`, use `unknown` + narrow
- `interface` for shapes, `type` for unions; exported functions/components have explicit return/props types
- Props named `{Component}Props`, functional components only, hooks at top, immutable updates (spread)
- No `console.log` in `src/` — use `tauri-plugin-log`; `eslint no-console: warn`

### React / Styling / Animation
- Tailwind utilities + CSS custom properties in `src/styles/` — follow Fluent Acrylic/Mica, tokens only via variables
- Framer Motion only, animate `transform/opacity` (compositor-friendly)
- Keep components small; `DesktopPage.tsx` is orchestrator only — logic goes to `features/desktop/hooks/`

### Rust
- `cargo clippy -- -W clippy::all` + `rustfmt` required; `#[allow(dead_code)]` only with `// TODO` + issue link
- `#[cfg(target_os)]` narrow per file: `window/{macos,linux}.rs` `media/{macos,linux}.rs` stubs return `unsupported` as `lib.rs:294` does today
- `spawn_blocking` for `sysinfo`, `mta_wait_async:961` for WinRT — never block Tauri command thread

## 6. Testing & Quality Gates (Single Gate)

```
npm run typecheck          # tsc -b --noEmit  0
npm run lint --max-warnings=0  # 0 warnings
npm run test:vitest        # 699/699 (current 630 after split, fix before merge)
npm run qa                 # vitest + qa:showcase:interactions + build
cargo check && cargo clippy
```

- Every `Resolver`/`Scheduler`/`Provider` change **must** have vitest; priority/order changes need snapshot tests (`TEMPLATE_ORDER` `desktopStatusConfig.ts`)
- Shared `src/test/fixtures.ts` `mock*State` + `mockSourceHealth` is canonical — never hand-roll health objects
- Coverage: `vitest --coverage` target 80% for `providers/` `runtime/` `state/`

## 7. Docs

- Read order `docs/README.md`: `PRD -> UI_SPEC -> GLANCE_BAR_PLAN.md -> ARCHITECTURE.md`
- `GLANCE_BAR_PLAN.md` is the only execution plan — `ROADMAP-NEXT*` are archived to `docs/archive/plans/`, do not edit archived docs
- Any structural move must update `README.md` + `docs/README.md` + `AGENTS.md §2` + `CONTRIBUTING.md`

## 8. Git Workflow (Protected `main`)

- `main` is protected `allow_force_pushes:false allow_deletions:false` — never force-push, never delete
- Work in `refactor/*` `feat/*` `fix/*` branches via `git worktree` for parallel work — one worktree per Builder
- Small PRs, one purpose, one `CODEOWNERS` dir — avoid mixing `desktop` + `runtime` + `Rust` in one PR
- Commit freely when green; **push only on explicit request**, confirm branch + diff before `git push`
- PR title `feat|fix|chore|docs|refactor(scope): subject`; squash merge, delete remote branch after merge (`git push origin --delete`)

## 9. Desktop Launch

- Prefer `npm run tauri -- dev` (local `tauri` entrypoint) — global `tauri` may be missing
- Tauri starts Vite via `beforeDevCommand`, desktop at `http://localhost:5173/desktop`, showcase at `/showcase`
- `npm run desktop:mock` calls `tauri dev` via `scripts/desktop-mock.ps1`; if missing, use `npm run tauri -- dev`
- Keep `.dev.log` `.dev.err.log` untracked

## 10. Anti-Patterns (Will Be Rejected)

- Scraping integrations (WeChat, QQ, Discord, Chrome CDP)
- Bypassing EventBus/Store/Resolver, or calling `invoke` from UI templates directly
- Adding `any`, hard-coded `C:\` paths, `csp: null`, or `let _ =` swallowing critical errors without `log::warn`
- Editing `docs/archive/` or re-introducing `Cober-Windows-Bar` naming

## 11. Questions Before Large PR

- Is this `desktop`, `showcase`, `runtime/native`, or `provider`? Which `CODEOWNERS` dir?
- Does it belong in `shared` or feature-specific?
- Does it need a doc link update?
- Does it respect the single data flow `Provider -> Bus -> Store -> Resolver -> UI`?
