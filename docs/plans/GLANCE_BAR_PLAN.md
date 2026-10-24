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
- Verification snapshot: 58 Vitest files and 919 tests pass, including the Showcase interaction journey and production build; Rust unit tests are 40 (CI runs them since #41). Run the quality commands rather than relying on this count.

## Closeout checkpoint — 2026-09-05

- The Download Provider truthfulness work, runtime lifecycle hardening, privacy-safe diagnostics, tray preference fixes, and production-composition QA are merged on `main` through PRs #32–#39.
- PR #39 adds an executable guard that the `/desktop` path uses `{ realProviders: true, mockProviders: false }` and that Showcase fixtures do not cross the route boundary.
- Local `npm run qa`, typecheck, and lint are green; the post-merge `main` CI run is green across Node 20/22, Vite build, TypeScript, ESLint, and Rust on Ubuntu, macOS, and Windows.
- Development is paused at this checkpoint. Physical Windows packaging/install, tray recovery, autostart, restart, DPI/multi-monitor, uninstall, workday soak, and three-tester evidence remain open before a limited-release decision.

## Development checkpoint — 2026-10-24 (post-window autonomous wave)

The 2026-09-05 evidence window lapsed with the hardware-dependent items still open, so development resumed on the code-and-documentation tracks that do not require physical Windows evidence. Merged on `main` through PRs #41–#46 at `27dc8f0`:

- **#41 — CI now runs `cargo test`** in the Rust job; the 22 then-existing Rust unit tests had never been executed by CI.
- **#42 — Gate D preparation documents** exist under `docs/release/` (known limitations, tester guide, tester checklist, release decision template). They are drafts that describe preparation state, not release evidence; every unverified item is explicitly marked pending evidence.
- **#43/#46 — Linux warning hygiene**: zero unused-import warnings in `commands/`, zero dead-code warnings in `window/` and `monitoring/` on the Linux target (platform items are cfg-gated, not deleted; unit tests keep compiling on Linux via `cfg(any(windows, test))`).
- **#44 — Tray honesty fix**: tray menu labels are English and the tooltip reads `Glance Bar` (was a legacy product name). Full tray-menu i18n that follows the in-app language switch remains a backlog item recorded in `docs/release/KNOWN_LIMITATIONS.md` §6.
- **#45 — Gated Linux MPRIS observation**: `media/linux.rs` now contains a complete MPRIS (zbus 5 blocking) observation implementation with 18 pure-logic unit tests, gated behind `MPRIS_VALIDATED = false` per the STAGE6 rule — the Linux media capability still reports `unsupported` until real-desktop validation (multi-player behavior, connection rebuild, hung-player timeout bound). Remaining validation work and the not-yet-wired Linux event path are listed in the STAGE6 checkpoint section.

Verification snapshot at `27dc8f0` (run in WSL Ubuntu, plus a green CI matrix on every PR): typecheck, lint, and build pass; Vitest 58 files / 919 tests pass; `cargo check`, `cargo fmt -- --check`, and CI-level clippy pass; Rust unit tests 40/40 (22 → 40 with the MPRIS tests). Remaining clippy dead-code warnings are confined to `src/media/**` (platform-dispatch constants and the macOS/Windows provider types) and are the next hygiene item.

Open items are unchanged in kind: physical Windows packaging/install, tray recovery, autostart, restart, DPI/multi-monitor, uninstall, workday soak, and three-tester evidence remain open before the Gate D limited-release decision; MPRIS real-desktop validation precedes any Linux availability claim; tray-menu i18n and the `media/` dead-code warnings are tracked follow-ups.

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
