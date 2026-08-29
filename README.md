# Glance Bar

Glance Bar is a Tauri + React prototype for a compact Windows desktop status center.

This repository currently contains two parallel product surfaces:

- `desktop`: the real product-facing desktop status center shell
- `showcase`: the demo and QA surface for state flows, mock providers, and visual review

The goal of this repo is to provide a compact, privacy-respecting Windows desktop status center powered by Tauri's native Rust backend for real system metrics, media session tracking, and window management.

## Start Here

If you just forked the repo and want to understand it quickly:

1. Read [Repository Guide](docs/README.md)
2. Read [Architecture Overview](docs/architecture/ARCHITECTURE.md)
3. Read [Roadmap](docs/product/ROADMAP.md)
4. Read [Contributing](CONTRIBUTING.md)

## Tech Stack

- **Tauri 2** — Desktop shell with Rust backend (sysinfo, WinRT GSMTC, Win32 window management)
- **React 19 + TypeScript 5.9** — UI framework
- **Vite 7** — Build tool and dev server
- **Tailwind CSS 3.4** — Utility-first styling
- **Framer Motion 12** — Animations and transitions
- **Vitest** — Unit and integration testing

## Project Structure

Top-level layout:

```text
src/
  features/
    desktop/      desktop product surface
    showcase/     demo and QA surface
  shared/
    ui/           reusable UI building blocks
  runtime/        desktop/runtime boundary and Tauri-facing logic
  providers/      provider contracts, adapters, registries, mocks
  state/          event bus, store, resolver-friendly state
  data/           mock data and desktop status configuration
  types/          shared domain types
  styles/         global styling

src-tauri/
  Rust native shell, system/runtime commands, window behavior

docs/
  architecture/   system shape and runtime flow
  product/        PRD, UI spec, roadmap
  providers/      provider model and mock/provider plans
  qa/             QA and test strategy
  plans/          active implementation plans
  decisions/      current decision records
  archive/        historical freeze/alignment reports

scripts/
  local helpers such as desktop launch and showcase QA
```

## Source Guide

If you want to change a specific area:

- Desktop status center UI:
  `src/features/desktop/`

- Showcase/demo flows:
  `src/features/showcase/`

- Shared visual primitives:
  `src/shared/ui/`

- Window drag, floating, fullscreen avoidance, display correction:
  `src/runtime/statusWindowRuntime.ts`

- System performance loading:
  `src/runtime/systemPerformanceRuntime.ts`

- Tauri runtime bridge and fixture/runtime capability parsing:
  `src/runtime/tauriRuntime.ts`

- Native Tauri/Rust commands:
  `src-tauri/src/lib.rs`

- Mock data and desktop menu/config labels:
  `src/data/`

## Current Product State

What is already present:

- Desktop route at `/desktop` for the compact status center
- Showcase route at `/showcase` for review, QA, and mock state demos
- Tauri 2 Rust backend (`src-tauri/src/lib.rs`, 1200+ lines) with:
  - Real system performance via `sysinfo` crate (CPU, memory, network, disk, GPU)
  - Real media session tracking via Windows GSMTC (GlobalSystemMediaTransportControlsSessionManager)
  - Native window management (foreground tracking, always-on-top, work-area clamping, fullscreen avoidance)
  - System tray with show/hide toggle and preferences persistence
  - 16 IPC commands and 4 Tauri events for frontend-backend communication
- Provider SDK with HubProvider interface, ProviderRegistry, and event bus architecture
- Three-tier runtime fallback: Mock → Tauri Fixture → Tauri Event Push
- Fluent Design styling (Acrylic/Mica effects, Framer Motion animations)

What is still in progress:

- Remaining native providers (Focus, Clipboard, Downloads, Notifications, Developer tools, AI Agents)
- Native desktop context menu replacing the default web-style menu
- Full tray click-through and recall product behavior polish
- End-to-end integration tests for Tauri event push pipeline

## Local Development

Install dependencies:

```bash
npm install
```

Start the Tauri desktop app (recommended):

```bash
npm run tauri -- dev
```

Or start the web dev server only (no Rust backend):

```bash
npm run dev
```

Useful routes:

```text
http://localhost:5173/desktop
http://localhost:5173/showcase
```

Launch the desktop mock shell:

```bash
npm run desktop:mock
```

## Validation

Main checks:

```bash
npm run build
npm run qa
npm run tauri -- build
```

Focused checks:

```bash
npm run test:runtime
npm run qa:showcase:interactions
```

## Docs

- [Repository Guide](docs/README.md)
- [Architecture](docs/architecture/ARCHITECTURE.md)
- [Event Flow](docs/architecture/EVENT_FLOW.md)
- [Tauri Strategy](docs/architecture/TAURI_STRATEGY.md)
- [PRD](docs/product/PRD.md)
- [UI Spec](docs/product/UI_SPEC.md)
- [Roadmap](docs/product/ROADMAP.md)
- [Provider SDK](docs/providers/PROVIDER_SDK.md)
- [Showcase QA](docs/qa/SHOWCASE_QA.md)
- [Implementation Plan](docs/plans/IMPLEMENTATION_PLAN.md)

## Collaboration

For contribution expectations and a suggested PR path, see [Contributing](CONTRIBUTING.md).

## License

MIT
