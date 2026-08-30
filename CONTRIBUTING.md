# Contributing

## Read first

1. [Repository guide](docs/README.md)
2. [Architecture](docs/architecture/ARCHITECTURE.md)
3. [Unified execution plan](docs/plans/GLANCE_BAR_PLAN.md)
4. [Structure and dependency guide](docs/plans/STRUCTURE_REFACTOR_PLAN.md)
5. [Provider SDK](docs/providers/PROVIDER_SDK.md), when changing a provider

## Architecture rules

- Keep the data path `Provider -> HubEventBus -> aggregation -> resolver/scheduler -> UI`.
- New providers implement `HubProvider` and are registered through `createProviderManager`.
- UI components do not call Tauri `invoke` directly. Use a runtime module or a feature hook.
- Native data crosses the boundary only through Tauri commands or events and must remain coarse and privacy-safe.
- Use barrels such as `@/entities/status`, `@/providers/core`, and `@/runtime/tauri` for new imports.

## Directory ownership

- `src/app`: composition only.
- `src/features`: product and showcase UI; desktop hooks may call runtime modules.
- `src/entities`: pure domain types and configuration.
- `src/providers`: provider contracts, registry/adapter/manager, and provider implementations.
- `src/runtime`: Tauri, system, scheduler, window, and action boundaries; never imports features or providers.
- `src/shared`: reusable UI and utilities.
- `src/state`: event bus, aggregation, resolver, and pure scheduling policy.
- `src-tauri/src`: native leaf modules and command handlers.

## Verify before requesting review

```bash
npm run typecheck
npm run lint -- --max-warnings=0
npm run test:vitest
npm run qa
cargo check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -W clippy::all
```

Run the checks relevant to the change at minimum. A provider, runtime, resolver, or scheduler change requires focused Vitest coverage.

## Git workflow

`main` is protected. Use a focused `feat/*`, `fix/*`, `refactor/*`, `chore/*`, or `docs/*` branch and create a PR. Do not push directly to `main`; push only when requested. Keep one logical change and one ownership area per PR where possible.

## Documentation

Update the current documentation when behavior, public contracts, structure, or quality gates change. Do not edit `docs/archive/`; it is retained as historical evidence. When a current plan becomes historical, add a clear superseded banner and update [docs/README.md](docs/README.md).
