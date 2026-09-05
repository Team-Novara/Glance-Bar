# Provider Runtime

`createProviderManager` constructs the default provider set, registers it, connects each provider to the `HubEventBus`, and starts or stops the set as one runtime unit.

The desktop runtime hook owns manager lifetime. It creates the event bus, provider manager, and scheduler service through injectable dependencies, which keeps the browser test environment independent of a live Tauri process.

Runtime failures must produce bounded diagnostics or degraded/unavailable behavior. They must not break unrelated providers, bypass the event path, or cause React templates to call native APIs directly.

## Resident system-performance freshness

The real system-performance provider owns the 1.8-second background poll. It
publishes one stable `system` event id for every observation, including
`stale` and `unavailable` diagnostics, so the event bus replaces the prior
sample rather than accumulating history. Native Tauri responses use a bounded
`snapshot`/`diagnostic`/`checkedAt` envelope; a legacy bare snapshot is treated
as fixture fallback data. Last-known metrics are retained inside the provider
for at most 9 seconds after a failed sample, then the Resident state is marked
Unavailable. A successful sample restores provider health and the Live badge.
