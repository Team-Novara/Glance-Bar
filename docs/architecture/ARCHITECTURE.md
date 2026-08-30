# Glance Bar Architecture

Glance Bar is a Tauri desktop application with a React product surface. It is intentionally layered so that system collection, business policy, and rendering can evolve independently.

## Runtime topology

```text
Tauri commands and events
  -> runtime modules and real providers
  -> HubEventBus
  -> desktop-status aggregation
  -> resolver and scheduler
  -> desktop status templates
```

Mock providers use the same event bus and state path. This makes `/showcase` and browser-based tests useful without requiring a Tauri runtime.

## Frontend layers

- `src/app`: application entry and `/desktop` or `/showcase` route selection.
- `src/features`: desktop orchestration, hooks, templates, settings, and showcase UI.
- `src/entities`: domain types and status template configuration.
- `src/providers/core`: the `HubProvider` contract, adapter, registry, manager, and health read models.
- `src/providers/impl/{mock,real}`: provider implementations.
- `src/runtime/{actions,scheduler,system,tauri,window}`: Tauri and browser-runtime boundaries.
- `src/state`: event bus, aggregation, resolver, and pure scheduling policy.
- `src/shared`: reusable UI, guards, configuration, and test utilities.

Dependencies point toward lower-level layers. `runtime` never imports `features` or `providers`; UI never invokes Tauri commands directly.

## Status selection

`useDesktopStatusRuntime` composes the event bus, provider manager, stateful scheduler service, aggregation, and resolver. The pure `scheduleDesktopStatus` policy is also used by state resolution. The policy accounts for priority, manual preference, stability, pre-emption, and media/resident alternation.

The two scheduler forms are deliberate: the pure policy creates deterministic snapshot decisions, while the service maintains wall-clock transitions and subscriptions. Both require matching tests when their shared behavior changes.

## Native boundary

Rust command handlers live in `src-tauri/src/commands/`; `src-tauri/src/lib.rs` is application assembly. Platform-specific window and media implementations live in `src-tauri/src/window/` and `src-tauri/src/media/`.

Native payloads must expose only coarse, bounded facts. Process lists, paths, credentials, user identifiers, and raw private system data must not cross IPC.
