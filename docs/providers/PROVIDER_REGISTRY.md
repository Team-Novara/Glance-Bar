# Provider Registry

The registry in `src/providers/core/providerRegistry.ts` is the in-memory read model for registered providers.

## Responsibilities

- Register providers with deterministic ordering and reject duplicate ids.
- Start and stop providers while refreshing lifecycle/health snapshots.
- Expose copied registry records, capability summaries, and health read models.
- Distinguish mock, native, and real capability origins without making display-policy decisions.

The registry does not subscribe to providers, publish events, choose templates, or access Tauri. `createProviderManager` owns registration, adapter connections, and provider startup. `connectProviderToEventBus` owns provider-event forwarding.

## Provider health

Provider status combines a lifecycle (`Registered`, `Started`, `Publishing`, `Paused`, `Stopped`, or `Failed`) and a health value (`Healthy`, `Degraded`, or `Unhealthy`). UI summaries consume registry records through the provider-health monitor; they do not inspect provider internals.
