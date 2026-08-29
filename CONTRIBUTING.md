# Contributing

## First Read

Before opening a PR, read in this order:

1. [README](README.md)
2. [Repository Guide](docs/README.md)
3. [Glance Bar Unified Plan](docs/plans/GLANCE_BAR_PLAN.md) — single source of truth
4. [Structure Refactor Plan](docs/plans/STRUCTURE_REFACTOR_PLAN.md) — new `src/{app,entities,providers,runtime,shared}` ownership
5. [Architecture Overview](docs/architecture/ARCHITECTURE.md)
6. [Roadmap](docs/product/ROADMAP.md)

## How To Navigate The Repo

Use this mental model (post `STRUCTURE_REFACTOR_PLAN.md` scaffold — old paths still work via barrel re-exports):

- `src/app/` — App shell + routing (new)
- `src/features/desktop|showcase` — product vs demo surfaces
- `src/entities/{status,provider}` — domain types (new, re-exports `src/types/hub.ts`)
- `src/providers/{core,impl/{mock,real,platform}}` — contracts + impls (new barrels re-export old)
- `src/runtime/{tauri,window,scheduler,system,actions}` — Tauri bridge split (new barrels)
- `src/shared/{ui,lib,config}` — UI + guards + constants (new)
- `src/state/` — event bus/store/resolver
- `src-tauri/src/{commands,window/{win,mac,linux},media/{win,mac,linux},monitoring}` — Rust split scaffolds

Old paths (`src/types/hub.ts`, `src/runtime/tauriRuntime.ts`, `src/providers/providerManager.ts`, `src-tauri/src/lib.rs:1754`) still work; new code **must** use new barrels (`@/entities/status`, `@/runtime/tauri`, `@/providers/core`).

## What Kind Of PR To Open

Prefer small PRs with one clear purpose.

Good examples:

- improve desktop status center UI without changing showcase behavior
- add or refine runtime boundary logic in `src/runtime`
- add a new mock provider or provider diagnostic path
- improve docs for a specific subsystem

Avoid mixing these together in one PR:

- desktop UI redesign
- runtime/window behavior changes
- native Rust command changes
- broad doc rewrites

## Suggested PR Paths

If you are working on desktop product behavior:

- start in `src/features/desktop`
- then inspect `src/runtime`
- then inspect `src-tauri/src/lib.rs` if native behavior is needed

If you are working on the showcase:

- start in `src/features/showcase`
- then inspect `src/state` and `src/providers`

If you are working on system/provider boundaries:

- start in `src/providers`, `src/runtime`, and `src/types`

## Validation Before PR

Run the checks that match your change. For most PRs:

```bash
npm run build
npm run test:runtime
```

For broader UI/state/provider work:

```bash
npm run qa
```

## Documentation Rules

When you move or reshape project structure:

- update `README.md`
- update `docs/README.md`
- update any active doc links that point at moved files

Historical files under `docs/archive/` are archival context and should not be treated as the current source of truth.

## Ground Rules

- Keep product-facing desktop work separate from showcase-only demo work.
- Reuse `src/shared/ui` instead of duplicating primitives.
- Put domain types in `src/entities/` (new), not `src/types/` (legacy barrel).
- Keep runtime behavior in `src/runtime/{tauri,window,scheduler,system,actions}` — do not scatter across UI components.
- Respect `CODEOWNERS` ownership per folder; do not edit outside your dir without review.
- Do not add fake "website preview" flows to the desktop product path.

## Questions To Ask Before A Large PR

- Is this a `desktop` change, a `showcase` change, or a `runtime/native` change?
- Does this belong in `shared`, or is it feature-specific?
- Does this need a doc update so a new contributor can still follow the repo?
