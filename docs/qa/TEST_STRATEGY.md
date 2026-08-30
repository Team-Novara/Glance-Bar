# Test Strategy

## Current baseline

`npm run test:vitest` currently verifies 50 test files and 783 tests. The count is a snapshot, not a release gate; the required gate is a clean command result.

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
