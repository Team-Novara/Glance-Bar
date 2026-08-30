# Provider SDK

Every status source implements the `HubProvider` contract in `src/entities/provider/types.ts` and participates in the same event path.

## Contract

```ts
type HubProvider = {
  id: string;
  label: string;
  metadata: HubProviderMetadata;
  capabilities: HubProviderCapability[];
  start(): void;
  stop(): void;
  subscribe(listener: HubProviderListener): () => void;
  status(): HubProviderStatus;
};
```

`start` and `stop` are idempotent. `status` is synchronous and does no I/O. `subscribe` returns an idempotent unsubscribe function. Lifecycle and health are separate facts.

## Locations

- Core contract, adapter, registry, manager, and shell: `src/providers/core/`.
- Mock implementations: `src/providers/impl/mock/`.
- Native-backed implementations: `src/providers/impl/real/`.
- Public exports: `src/providers/index.ts` and the relevant subdirectory barrel.

## Rules

- Emit normalized `HubEvent` values; do not choose display modes or import UI.
- Register the provider in `createProviderManager` when it belongs in the default product runtime.
- Keep capability data explicit: kind, origin, and support.
- Use runtime boundaries for Tauri calls and expose safe fallback behavior when Tauri is unavailable.
- Add lifecycle, event, fallback, and registration tests.

See [the tutorial](PROVIDER_TUTORIAL.md) for the implementation sequence.
