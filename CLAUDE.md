# CLAUDE.md

> This file guides Claude Code when working with this repository.
> **Rigorous dev rules → [`AGENTS.md`](./AGENTS.md)** — single enforced contract (ownership, dependency, provider, privacy, quality gates). Read `AGENTS.md` first; this file is the product overview.

@./AGENTS.md

## Project Identity

**Glance Bar** (was `Cober-Windows-Bar`, repo `jay77721/Glance-Bar`) — Cross-platform Unified Status Hub, 303×64 pill `src-tauri/tauri.conf.json:14`, `identifier com.glance.bar`.
Docked at the bottom-right above the taskbar/dock, showing music, AI generation, download progress and important notifications in a compact, low-disturbance way.

- **Current Stage:** Stage 5 First Real Providers → Stage 6 Cross-Platform (see `docs/plans/GLANCE_BAR_PLAN.md`)
- **License:** MIT
- **Author:** Freedsss

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | React 19 + TypeScript 5.9 |
| Bundler | Vite 7 |
| Styling | Tailwind CSS 3.4 + PostCSS |
| Animation | Framer Motion 12 |
| Icons | Lucide React |
| Desktop Shell | Tauri 2 (integrated) |

## Directory Structure (post `STRUCTURE_REFACTOR_PLAN.md` scaffold — old paths re-export via barrels)

```
src/
├── app/             # App shell + routing (new, was App.tsx/main.tsx)
├── features/desktop|showcase
├── entities/{status,provider} # Domain types (new, re-exports types/hub.ts:346)
├── providers/{core,impl/{mock,real,platform}} # Contracts + impls (new)
├── runtime/{tauri,window,scheduler,system,actions} # Tauri bridge split (new)
├── shared/{ui,lib,config}
├── state/           # Event bus/store/resolver
├── data/            # Mock data + desktopStatusConfig
└── styles/          # product.css + showcase.css

src-tauri/src/
├── commands/ window/{win,mac,linux} media/{win,mac,linux} monitoring/ preferences/ tray/ types.rs
└── lib.rs           # now ~150 lines glue only (was 1754)

See `AGENTS.md:2` for ownership & dependency rule (CODEOWNERS enforced).
```

## Architecture

- **HubMode** (union type in `src/types/hub.ts`) drives all state: `idle | music | ai | download | notification | multitask`.
- `App.tsx` holds the active mode in local `useState`; child components are purely presentational.
- `HubShell` wraps each hub variant with shared Fluent Design chrome (glass panel, hover states, reveal animations).
- Mock data comes from `src/data/mockHubData.ts`; real data flows through Tauri IPC commands in `src/runtime/`.
- The Tauri Rust backend (`src-tauri/src/lib.rs`) provides: system performance metrics (sysinfo), Windows Media Session integration (GSMTC), window management (floating, position correction, fullscreen avoidance), system tray with context menu, global hotkey (Alt+Shift+Space), and preferences persistence.
- Runtime bridge layer (`src/runtime/`) handles Tauri IPC detection, graceful fallback to mock data when Tauri is unavailable, and diagnostic error classification.

## Development Commands

```bash
npm install       # Install dependencies
npm run dev       # Start Vite dev server
npm run build     # Type-check + production build
npm run preview   # Preview production build
npm run tauri -- dev   # Start Tauri desktop app in dev mode
npm run tauri -- build # Build production desktop app
npm run qa        # Full QA: state tests + provider tests + runtime tests + showcase QA + build
npm run test:state     # State management tests
npm run test:providers # Provider tests
npm run test:runtime   # Runtime bridge tests
```

## Coding Conventions

Follow these rules when modifying code:

### TypeScript
- Explicit types on exported functions and component props (see `~/.claude/rules/ecc/typescript/coding-style.md`)
- Use `interface` for object shapes, `type` for unions/intersections
- No `any` — use `unknown` and narrow safely
- Immutable updates (spread, never mutate)

### React
- Functional components only, hooks at the top
- Props interfaces named `{ComponentName}Props`
- Keep components small and focused

### Styling
- Tailwind utility classes in JSX; design tokens via CSS custom properties in `src/styles/globals.css`
- Follow Fluent Design principles: Acrylic/Mica materials, reveal highlights, depth through layered surfaces
- See `docs/UI_SPEC.md` for visual reference

### Animation
- Framer Motion for enter/exit transitions and hover states
- Prefer compositor-friendly properties (transform, opacity)

## Roadmap Stages

| Stage | Focus | Status |
|-------|-------|--------|
| 0 | UI showcase prototype | **Done** |
| 1 | Mock event bus and state resolver | **Done** |
| 2 | Tauri 2 floating desktop shell | **Done** — shell, IPC, window management, tray, global hotkey all integrated |
| 3 | Real providers for system, music, downloads, AI states | **In Progress** — system performance (CPU/RAM/network via sysinfo) and media session (GSMTC) connected; focus, clipboard, download, notification providers pending |
| 4 | Ecosystem providers (Git, Docker, WSL, Maven, Gradle, notifications) | Planned |
| 5 | AI Agent Hub (Codex, Claude, GPT agents) | Planned |

## Documentation

- `docs/product/PRD.md` — Product requirements and MVP scope
- `docs/product/UI_SPEC.md` — Visual design specification
- `docs/product/ROADMAP.md` — Product summary (points to `docs/plans/GLANCE_BAR_PLAN.md`)
- `docs/plans/GLANCE_BAR_PLAN.md` — **Single source of truth** (execution)
- `docs/plans/STRUCTURE_REFACTOR_PLAN.md` — FSD ownership + new `src/{app,entities,providers,runtime,shared}` barrels
- [`AGENTS.md`](./AGENTS.md) — Rigorous dev rules (enforced)

## Git Workflow

- **Commit freely** when work is complete and tested.
- **Push only on explicit request.** Do not run `git push` automatically after commit.
- When asked to push, confirm the target branch and what's being pushed before proceeding.

## Anti-Patterns

- Do not add scraping integrations (WeChat, QQ, Discord, Chrome CDP)
- Do not auto-push after commits — wait for explicit push instruction
- Real provider implementations must respect privacy boundaries (see `docs/decisions/v0.8_SYSTEM_STATUS_PRIVACY_CHECKLIST.md`)
- Provider adapters must publish through the Event Bus; do not bypass the Event Bus, Store, or Resolver
