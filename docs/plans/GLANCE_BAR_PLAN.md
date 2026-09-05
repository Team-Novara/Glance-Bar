# Glance Bar Unified Plan

> Active product and execution plan. Updated against the repository on 2026-09-05.

The dated delivery plan currently in force is [2026-09-05_WINDOWS_MVP_30_DAY_EXECUTION_PLAN.md](2026-09-05_WINDOWS_MVP_30_DAY_EXECUTION_PLAN.md). It converts the priorities below into daily work, PR boundaries, evidence gates, and a 30-day Windows MVP release decision.

## Product direction

Glance Bar is a compact, privacy-safe desktop status hub. It selects one clear status presentation from provider events and runtime facts, while keeping source collection outside the UI.

## Current baseline

- Desktop product surface: `src/features/desktop/`; showcase and QA surface: `src/features/showcase/`.
- Status path: `Provider -> HubEventBus -> aggregation -> resolver/scheduler -> UI`.
- Provider registry contains 9 real providers and 4 mock providers; the production desktop composition explicitly starts real providers only, while mocks remain showcase fixtures.
- Scheduler: pure policy in `src/state/desktopStatusScheduler.ts` and stateful service in `src/runtime/scheduler/schedulerService.ts`.
- Native shell: commands are split under `src-tauri/src/commands/`; `lib.rs` is application assembly.
- Verification snapshot: 58 Vitest files and 919 tests pass, including the Showcase interaction journey and production build. Run the quality commands rather than relying on this count.

## Closeout checkpoint — 2026-09-05

- The Download Provider truthfulness work, runtime lifecycle hardening, privacy-safe diagnostics, tray preference fixes, and production-composition QA are merged on `main` through PRs #32–#39.
- PR #39 adds an executable guard that the `/desktop` path uses `{ realProviders: true, mockProviders: false }` and that Showcase fixtures do not cross the route boundary.
- Local `npm run qa`, typecheck, and lint are green; the post-merge `main` CI run is green across Node 20/22, Vite build, TypeScript, ESLint, and Rust on Ubuntu, macOS, and Windows.
- Development is paused at this checkpoint. Physical Windows packaging/install, tray recovery, autostart, restart, DPI/multi-monitor, uninstall, workday soak, and three-tester evidence remain open before a limited-release decision.

## Execution priorities

### P0: preserve reliable product behavior

- Keep the provider event pipeline intact and testable.
- Validate fallback, unavailable, and malformed native-payload behavior.
- Maintain window controls, preferences, tray behavior, and status-template accessibility.

### P1: complete capability evidence

- Validate real providers on supported platforms and accurately report availability/health.
- Keep IPC payloads coarse and privacy-safe.
- Remove or replace placeholders only when the native contract and UI fallback are both ready.

### P2: cross-platform parity

- Implement macOS and Linux capabilities behind their platform modules.
- Preserve explicit `unsupported` behavior until each capability is validated on real hardware.
- Keep platform differences out of feature templates and scheduler policy.

### P3: product refinement

- Improve template clarity, settings discoverability, and provider-health feedback from usage evidence.
- Keep the status center compact and prevent low-value sources from destabilizing the visible state.

## Delivery rules

- One ownership area and purpose per PR where practical.
- Provider, runtime, resolver, or scheduler changes include focused tests.
- Do not claim a platform feature is live without a real capability path, bounded payload contract, fallback behavior, and validation evidence.
- Update the relevant current documentation in the same change.

## Superseded plans

`IMPLEMENTATION_PLAN.md`, `MVP_PARALLEL_EXECUTION.md`, `STAGE5_WIP_LANDING.md`, and `v0.7_TAURI_SPIKE_PLAN.md` are historical snapshots. Their archive copies remain for traceability; neither set is an active execution source.
