# Provider Model

Providers are the only source-specific layer in the desktop status pipeline. They translate source observations into normalized events and capability facts.

```text
source observation -> HubProvider -> provider adapter -> HubEventBus -> state -> UI
```

The model intentionally separates four concerns:

- Provider metadata identifies the source.
- Capabilities state what kind of data it can provide and whether support is available.
- Lifecycle states describe execution.
- Health describes source quality independently of execution state.

Providers do not own scheduling, rendering, direct feature state, or raw private data exposure.
