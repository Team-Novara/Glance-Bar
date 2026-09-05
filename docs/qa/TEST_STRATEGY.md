# Test Strategy

## Current baseline

`npm run test:vitest` currently verifies 58 test files and 919 tests. The count is a snapshot, not a release gate; the required gate is a clean command result.

## Test layers

- `src/state`: event bus, aggregation, resolver, and pure scheduling policy.
- `src/providers/core`: contract, adapter, registry, manager, lifecycle, and health summaries.
- `src/providers/impl`: mock and real-provider event/lifecycle behavior.
- `src/runtime`: Tauri parsing, system actions, scheduler service, window policy, and fallback behavior.
- `src/features/desktop`: templates, hooks, settings, and provider-status UI.
- `scripts/qa-showcase-interactions.mjs`: showcase interaction checks.

## Change requirements

- Provider, runtime, resolver, or scheduler changes require focused unit tests.
- Priority/order changes require scheduler coverage.
- UI template changes require accessible rendering coverage where meaningful.
- Native command changes require TypeScript boundary parsing/fallback coverage and Rust checks.

## Commands

```bash
npm run typecheck
npm run lint -- --max-warnings=0
npm run test:vitest
npm run qa
cargo check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -W clippy::all
```

The complete `npm run qa` command runs the Vitest suite, the Showcase interaction
journey, and the production build. The Showcase journey forces the
`i18nextLng` browser cache key to English and verifies that Tauri fixture events
are scoped to `/showcase`; navigating to `/desktop` must not inherit the fixture
payload.
