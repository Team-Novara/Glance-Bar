# Provider Tutorial

This tutorial describes the current provider structure. It does not use the removed flat `src/providers/*.ts` layout.

## 1. Choose the implementation location

- Add a deterministic demo source under `src/providers/impl/mock/`.
- Add a Tauri-backed source under `src/providers/impl/real/`.
- Reuse `createProviderShell` from `src/providers/core/providerShell.ts` for lifecycle and subscription behavior.

## 2. Implement the contract

Define stable metadata, capability facts, and a provider factory. Keep native calls behind a runtime function. On start, subscribe or poll; normalize each observation into `HubEvent` values; emit them through the shell. On stop, release timers and subscriptions.

## 3. Register and export

Export from the implementation barrel, then register the provider in `src/providers/core/providerManager.ts` if it is part of the default runtime. Do not connect it directly to React state or a desktop template.

## 4. Test

Create a sibling test. Cover metadata/capabilities, lifecycle idempotency, emitted event shape, unavailable-runtime behavior, and cleanup. Update `providerManager.test.ts` if the default registered set changes.

## 5. Verify

```bash
npm run test:vitest -- src/providers
npm run typecheck
npm run lint -- --max-warnings=0
```

## Review checklist

- Does the provider use `HubProvider` and flow through the event bus?
- Does it avoid UI imports and display-priority decisions?
- Is health distinct from lifecycle?
- Are Tauri payloads coarse and privacy-safe?
- Does the source report unsupported or unavailable capability rather than pretending to be live?
