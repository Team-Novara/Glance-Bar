# Glance Bar

> A Windows-first desktop status hub for seeing the important things happening on your computer without switching between apps.

Glance Bar keeps a compact status-center window close at hand. It is designed to surface useful desktop activity—such as what is playing, download progress, and focus sessions—while staying quiet when there is nothing worth interrupting you for.

## MVP focus

The first product release is focused on three everyday states:

- **Media** — see what is playing and use available playback actions.
- **Downloads** — follow meaningful progress, completion, and failure states.
- **Focus** — see an active focus session and its completion state.

System performance and provider health support those experiences. Developer-oriented sources such as Git, Docker, npm, and AI tasks are engineering capabilities, not the success criteria for the first user-facing release.

## Why Glance Bar

- **Less context switching:** understand a state change without hunting for its source app.
- **Predictable display:** priority, manual selection, and automatic return rules determine what is visible.
- **Privacy-safe by design:** platform data is normalized into coarse, bounded facts before it reaches the UI.
- **Desktop-native controls:** tray actions, preferences, window positioning, fullscreen avoidance, and autostart belong to the desktop shell.

## Platform status

| Platform | Status |
|---|---|
| Windows | Primary development and validation target. |
| macOS | Platform modules compile; individual capabilities may report unsupported. |
| Linux | Platform modules compile; individual capabilities may report unsupported. |

Do not treat compile-time support as feature parity. A capability is only available when its native path, provider state, fallback behavior, and validation evidence all exist.

## Quick start

### Prerequisites

- Node.js 20 or later
- Rust stable toolchain
- The platform prerequisites required by Tauri 2 for your operating system

### Run the web surfaces

```bash
npm install
npm run dev
```

Open `/desktop` for the product-facing surface or `/showcase` for the demo and visual-QA surface.

### Run the desktop application

```bash
npm run tauri -- dev
```

## How it works

```text
Provider -> HubEventBus -> aggregation -> resolver/scheduler -> template UI
```

Native commands and events stay behind Tauri/runtime boundaries. Providers normalize source data; the scheduler decides which useful status to show; React templates render the selected state.

For the full design, read the [architecture overview](docs/architecture/ARCHITECTURE.md) and [event flow](docs/architecture/EVENT_FLOW.md).

## Quality checks

```bash
npm run typecheck
npm run lint
npm run test:vitest
npm run qa
cargo check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -W clippy::all
```

## Documentation

- [MVP launch plan](docs/product/MVP_LAUNCH_PLAN.md)
- [Product requirements](docs/product/PRD.md)
- [Product roadmap](docs/product/ROADMAP.md)
- [Repository guide](docs/README.md)
- [Provider SDK](docs/providers/PROVIDER_SDK.md)
- [Contribution guide](CONTRIBUTING.md)

Historical material lives in `docs/archive/` and does not describe the current implementation.

## License

See [LICENSE](LICENSE).
