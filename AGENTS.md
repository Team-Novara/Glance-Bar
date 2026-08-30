# Glance Bar Contributor Contract

@C:\Users\jay\browser-harness\SKILL.md

`docs/plans/GLANCE_BAR_PLAN.md` is the active product and execution plan. `docs/plans/STRUCTURE_REFACTOR_PLAN.md` is the active structure and dependency guide.

## Project identity

Glance Bar is a Tauri 2, Rust, React, TypeScript, and Vite desktop status hub. Its product flow is:

```text
Provider -> HubEventBus -> aggregation -> resolver/scheduler -> UI
```

The pure scheduler policy is in `src/state/desktopStatusScheduler.ts`; the 250ms stateful scheduler service is in `src/runtime/scheduler/schedulerService.ts`.

## Directory and dependency rules

```text
src/app                 -> composition only
src/features            -> entities, providers, runtime, state, shared
src/entities            -> domain types and configuration
src/providers           -> entities, runtime, shared, state
src/runtime             -> entities, shared, state
src/shared              -> shared and entities
src/state               -> entities and shared
src-tauri/src           -> native leaf modules
```

- New domain imports use `@/entities/status` or `@/entities/provider`.
- New provider infrastructure imports use `@/providers/core`; implementations live in `@/providers/impl/*`.
- New Tauri boundary imports use `@/runtime/tauri`.
- `runtime` never imports `features` or `providers`.
- React templates never call Tauri `invoke` directly.

## Provider contract

- Each data source implements `HubProvider` from `src/entities/provider/types.ts`.
- Providers emit normalized events through `connectProviderToEventBus`; they do not select UI modes or import UI.
- `start` and `stop` are idempotent; `subscribe` returns an idempotent unsubscribe; `status` is synchronous and does no I/O.
- Lifecycle and health are distinct. Capabilities use explicit kind, origin, and support facts.

## Runtime and privacy

- System data enters through Tauri commands/events and runtime modules, never direct browser system APIs.
- Detect Tauri through `getTauriInvoke` in `src/runtime/tauri/tauriRuntime.ts` and return safe fallbacks outside Tauri.
- IPC exposes only coarse percentages and bounded enums. Never expose process lists, paths, credentials, usernames, or raw private payloads.
- Put native handlers in `src-tauri/src/commands/`; keep platform code in `window/` and `media/` modules.

## Quality gates

```bash
npm run typecheck
npm run lint -- --max-warnings=0
npm run test:vitest
npm run qa
cargo check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -W clippy::all
```

Provider, runtime, resolver, and scheduler changes require focused Vitest coverage. Use `src/shared/test-util/fixtures.ts` for shared test facts.

## Documentation and Git

- Current docs live outside `docs/archive/`; archived material is historical and must not be edited.
- Update current docs when contracts, structure, behavior, or quality gates change.
- `main` is protected. Work on a focused branch and use a PR; do not push directly to `main`.
