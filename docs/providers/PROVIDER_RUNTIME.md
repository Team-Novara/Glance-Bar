# Provider Runtime

`createProviderManager` constructs the default provider set, registers it, connects each provider to the `HubEventBus`, and starts or stops the set as one runtime unit.

The desktop runtime hook owns manager lifetime. It creates the event bus, provider manager, and scheduler service through injectable dependencies, which keeps the browser test environment independent of a live Tauri process.

Runtime failures must produce bounded diagnostics or degraded/unavailable behavior. They must not break unrelated providers, bypass the event path, or cause React templates to call native APIs directly.
