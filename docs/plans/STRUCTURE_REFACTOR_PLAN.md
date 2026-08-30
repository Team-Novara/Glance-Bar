# Structure and Dependency Guide

> Active guide for code placement and dependency direction. Structural refactors must preserve the boundaries below.

## Layout

```text
src/app                 application composition
src/entities            domain types and status configuration
src/features            desktop and showcase UI
src/providers/core      provider contract and infrastructure
src/providers/impl      mock and real provider implementations
src/runtime             action, scheduler, system, Tauri, and window boundaries
src/shared              reusable UI, utilities, configuration, test support
src/state               event bus, aggregation, resolver, pure scheduler
src-tauri/src           native commands, platform modules, monitoring, shell glue
```

## Dependency direction

- `app` composes feature-level modules.
- `features` may consume entities, providers, runtime, state, and shared modules.
- `providers` may consume entities, runtime, shared utilities, and state event interfaces.
- `runtime` may consume entities, shared utilities, and state; it never consumes features or providers.
- `entities` stays free of React, Tauri, and UI dependencies.
- `shared` stays reusable and may depend only on entities where needed.

## Placement rules

- A source-specific observation belongs in a provider implementation.
- A native command or Tauri event parser belongs in `runtime` or `src-tauri/src`.
- A visible product interaction belongs in a feature hook or component.
- A cross-feature domain contract belongs in `entities`.
- Scheduling policy belongs in `state`; timer/subscription mechanics belong in `runtime/scheduler`.

## Refactor checklist

1. Preserve public barrel exports or update all callers.
2. Update import-boundary lint configuration when an allowed relationship changes.
3. Move colocated tests with their implementation.
4. Update architecture, provider, and contributor docs when paths or contracts change.
5. Run typecheck, lint, focused tests, and applicable Rust checks.
