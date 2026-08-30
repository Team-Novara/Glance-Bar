# Glance Bar

Glance Bar is a cross-platform desktop status hub built with Tauri 2, Rust, React, TypeScript, and Vite. It presents the most relevant desktop status in a compact status-center window and keeps native collection separate from UI rendering.

## What is implemented

- A product desktop surface at `/desktop` and a lazy-loaded demo and visual-QA surface at `/showcase`.
- A single event pipeline: `Provider -> HubEventBus -> aggregation -> resolver/scheduler -> template UI`.
- Real providers for clipboard, Docker, downloads, focus, Git, media session, npm, system performance, and updates; mock providers for music, downloads, AI, and notifications.
- A Tauri shell with tray controls, preferences, window policy, autostart, native commands, and Windows/macOS/Linux platform modules.
- Scheduler rules for priority, manual preference, stability, pre-emption, and media/resident alternation.

## Start here

1. Read [the repository guide](docs/README.md).
2. Read [the architecture overview](docs/architecture/ARCHITECTURE.md).
3. Read [the unified execution plan](docs/plans/GLANCE_BAR_PLAN.md) before planning product work.
4. Read [the contribution guide](CONTRIBUTING.md) before changing code.

## Development

```bash
npm install
npm run dev
npm run tauri -- dev
```

The Vite application serves `/desktop` and `/showcase`. `npm run tauri -- dev` launches the desktop shell.

## Quality checks

```bash
npm run typecheck
npm run lint -- --max-warnings=0
npm run test:vitest
npm run qa
cargo check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -W clippy::all
```

The current verified JavaScript test baseline is 50 test files and 783 passing tests (2026-08-30). Do not copy this count into future change-specific documentation; run the command and report its output instead.

## Repository layout

```text
src/
  app/          application entry and route switch
  entities/     status and provider domain contracts
  features/     desktop product UI and showcase UI
  providers/    core provider infrastructure plus mock/real implementations
  runtime/      Tauri, system, window, scheduler, and action boundaries
  shared/       reusable UI, utilities, configuration, and test helpers
  state/        event bus, aggregation, resolver, and pure scheduling policy
src-tauri/src/  commands, platform modules, monitoring, tray, preferences, app glue
docs/           current product, architecture, provider, QA, and plan documents
```

Historical material is retained under `docs/archive/`. It is not a description of the current codebase.

## License

See [LICENSE](LICENSE).
