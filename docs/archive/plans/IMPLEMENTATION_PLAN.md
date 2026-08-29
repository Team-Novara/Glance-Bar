# Cober-Windows-Bar Implementation Plan

## 1. Product Narrative

Cober-Windows-Bar is a **Windows 11 Unified Status Hub**. It has progressed from a visual prototype through Tauri desktop shell integration and into real native provider territory.

The project has completed Stages 0–4 and is in the middle of Stage 5. The Tauri 2 desktop shell is fully integrated with a comprehensive Rust backend (`src-tauri/src/lib.rs`, 1226 lines) providing real system performance metrics (CPU, memory, network via `sysinfo`), Windows Media Session integration (GSMTC API), window management (floating, Z-order, fullscreen avoidance, multi-monitor), system tray, global hotkey, and preferences persistence. The frontend runtime bridge layer (`src/runtime/`) detects Tauri availability and gracefully falls back to mock data.

The next major milestone is wrapping the existing native data sources (system performance, media session) into the Provider SDK lifecycle, then implementing the remaining providers (Focus, Clipboard, Downloads, Notifications).

## 2. Stage Route

- **Stage 0: UI Prototype** — Done (v0.1). Delivered the Win11-style `/showcase` UI review page and six static hub states.
- **Stage 1: Event Playground** — Done (v0.2). Proved state transitions with mock Event Controls, Auto Demo playback, and Resolver Visualization.
- **Stage 2: Architecture Planning** — Done (v0.4). Documented runtime boundaries and future Tauri/Windows architecture needs.
- **Stage 3: Mock Provider SDK** — Done (v0.5/v0.6). Provider lifecycle, registry, mock providers, adapter, and tests all implemented and aligned.
- **Stage 4: Tauri Desktop Shell** — Done (v0.7+). Full Tauri 2 integration delivered: Rust backend, IPC boundary, window management, system tray, global hotkey, system performance metrics, media session integration, preferences persistence.
- **Stage 5: First Real Providers** — **In Progress** (v0.8). System performance and media session data flow end-to-end through Tauri IPC. Next: wrap as Provider SDK implementations, implement Focus/Clipboard/Download/Notification providers. See [Stage 5 WIP landing](./STAGE5_WIP_LANDING.md) for the 7-state product surface (resident + media + download + update + clipboard + focus + notification), the 15s media↔resident alternation, and the 5 new IPC commands (`stop_focus_session`, `pause_download` / `resume_download` / `cancel_download`, `install_update`, `dismiss_notification`).
- **Stage 6: Developer Hub** — Planned (v0.9+). Add Git, Docker, WSL, Maven, Gradle, npm/pnpm, Cargo, and developer workflow surfaces.
- **Stage 7: AI Agent Hub** — Planned (v1.0). Add Codex, Claude, GPT/OpenCode/Gemini-style agent status, queue state, progress, and multi-agent visibility.

The long-term product ceiling is a Windows 11 **Unified Status Hub**, not only a Dynamic Island clone. Real providers, developer workflows, and AI agent status are the strongest differentiation bets.

## 3. Current Technical Stack

- React 19
- TypeScript 5.9
- Vite 7
- TailwindCSS 3.4
- Framer Motion 12
- lucide-react
- **Tauri 2** (integrated — desktop shell, IPC, native APIs)
- **Rust** (sysinfo, windows-sys, windows WinRT crates)
- Playwright CLI for showcase screenshots

## 4. Current Source Shape

```text
src/
|-- features/
|   |-- desktop/
|   |   |-- DesktopPage.tsx          # Main desktop view (orchestrates runtime + UI)
|   |   |-- components/
|   |   `-- templates/               # 6 status templates + transition + health indicator
|   `-- showcase/
|       |-- components/
|       `-- ShowcasePage.tsx
|-- shared/
|   |-- ui/                          # GlassPanel, ProgressBar primitives
|   `-- runtimeGuards.ts             # Runtime environment detection
|-- runtime/
|   |-- tauriRuntime.ts              # Tauri IPC bridge, fixture loading, capability detection
|   |-- desktopStatusInputRuntime.ts # Three-tier source selection (mock → fixture → event push)
|   |-- systemPerformanceRuntime.ts  # System metrics consumer with quality tracking
|   |-- desktopProductRuntime.ts     # Menu action, settings, open-settings listeners
|   `-- statusWindowRuntime.ts       # Window overlay, floating, fullscreen avoidance, position correction
|-- providers/
|   |-- types.ts                     # HubProvider interface, lifecycle, capabilities
|   |-- mockProviders.ts            # Mock Music, Download, AI, Notification providers
|   |-- providerAdapter.ts          # Bridge: provider events → event bus
|   `-- providerRegistry.ts         # Registration, lookup, lifecycle, capability metadata
|-- data/
|   |-- mockHubData.ts              # Deterministic mock events and metrics
|   `-- desktopStatusConfig.ts      # Status template descriptors, labels, menu actions
|-- state/
|   |-- hubState.ts                 # Event bus + store (publish, subscribe, snapshot)
|   |-- desktopStatusState.ts       # Resolver: events → display mode
|   |-- desktopStatusScheduler.ts   # Priority scheduling with preference windows
|   |-- desktopStatusAggregation.ts # Event aggregation and attention scoring
|   `-- hubScenarios.ts             # Deterministic mock scenarios for showcase
|-- styles/
|   `-- globals.css                 # Fluent Design tokens, Acrylic/Mica effects
|-- types/
|   `-- hub.ts                      # HubEvent, HubMode, all shared types
|-- App.tsx                          # Root component — routing, mode state
`-- main.tsx                         # Entry point

src-tauri/
|-- src/
|   `-- lib.rs                       # Rust backend (1226 lines): sysinfo, GSMTC, window mgmt,
|                                     # tray, global hotkey, preferences, IPC commands
|-- Cargo.toml                       # Dependencies: tauri, sysinfo, windows-sys, windows, serde
`-- tauri.conf.json                  # Tauri app config: window size, title, tray icon

docs/
|-- architecture/                    # ARCHITECTURE.md, TAURI_STRATEGY.md, EVENT_FLOW.md
|-- product/                         # PRD.md, UI_SPEC.md, ROADMAP.md
|-- providers/                       # PROVIDER_SDK.md
|-- qa/                              # TEST_STRATEGY.md
|-- plans/                           # IMPLEMENTATION_PLAN.md (this file)
|-- decisions/                       # 16 decision records (v0.8 series, see Decisions section)
`-- archive/                         # Historical freeze/alignment reports
```

The repository has two product surfaces:

- `src/features/desktop/` for the desktop product shell
- `src/features/showcase/` for demo, QA, and fixture review

The Tauri runtime layer lives under `src/runtime/` and `src-tauri/`.

## 5. v0.2 Interactive Event Playground (Completed)

Historical note: this section documents the original showcase/event-playground phase. The current codebase has since been reorganized around `desktop` and `showcase` feature folders.

### Event Controls

Controls publish mock events through the existing event path:

```text
Event Controls -> publishHubEvent() -> store -> resolver -> resolved UI mode
```

Implemented controls: Music, AI, Download, Notification, MultiTask, Start Demo, Clear / Idle.

### Auto Demo

`Start Demo` automatically plays:

```text
Idle -> Music -> AI -> Notification -> Download -> MultiTask -> Idle
```

Implementation notes:

- The sequence is deterministic for QA and repeatable screenshots.
- Manual controls remain usable after the sequence completes.
- Scenario helper lives in `src/state/hubScenarios.ts`.

### Resolver Visualization

The showcase displays:

- Active Events
- Current Mode
- Events → Resolver → Resolved Mode

The visualization makes notification priority and MultiTask resolution easy to verify.

### Integration Files

- `src/state/hubScenarios.ts` defines deterministic mock scenarios and the auto-demo sequence.
- `src/state/hubState.ts` is the event bus/store/resolver boundary.
- `src/state/hubState.test.ts` protects scenario resolution, expiry, clear-to-idle, and playback order.
- `src/features/showcase/components/EventPlaygroundPanel.tsx` is the showcase control and visualization surface.
- `src/features/showcase/ShowcasePage.tsx` integrates the panel while preserving the Win11/Mica shell.

## 6. v0.4 Architecture Planning (Completed)

v0.4 was docs-only. It documented the runtime boundary, desktop shell needs, IPC shape, and provider sequencing. The runtime sequence was planned as:

```text
Mock Runtime -> Tauri Runtime -> Windows Runtime
```

All planning deliverables from v0.4 have been superseded by actual implementation in v0.7+. The architecture documents have been updated to reflect the current state.

## 7. v0.5/v0.6 Mock Provider SDK (Completed)

Stage 3 added the Provider SDK boundary. v0.6 closed at `92f3e01 test: harden provider alignment coverage`.

Implemented:

- `src/providers/types.ts` — provider lifecycle and listener contract.
- `src/providers/mockProviders.ts` — mock Music, Download, AI, and Notification providers.
- `src/providers/providerAdapter.ts` — forwards provider events into the event bus.
- `src/providers/provider.test.ts` — verifies provider output resolves to expected hub modes.
- `src/providers/providerRegistry.ts` — in-memory provider inventory and lifecycle/health snapshots.
- `src/providers/providerRegistry.test.ts` — verifies registry behavior.
- Provider capability facts with mock/native origin and support values.

## 8. v0.7 Tauri Desktop Shell (Completed)

v0.7 significantly exceeded its original spike goal. Rather than just proving the IPC boundary with fixtures, the full Tauri desktop shell was implemented.

### What was delivered

**Rust backend (`src-tauri/src/lib.rs`, 1226 lines):**

- System performance metrics via `sysinfo` crate (CPU, memory, network throughput)
- Windows Media Session integration via WinRT GSMTC API (playback status, position, duration)
- Foreground fullscreen detection via Win32 APIs (`GetForegroundWindow`, `GetWindowRect`, `MonitorFromWindow`, `GetMonitorInfoW`)
- Window Z-order management (`SetWindowPos` with `HWND_TOPMOST`/`HWND_BOTTOM`)
- `WS_EX_TOOLWINDOW` window style (hidden from taskbar)
- System tray icon with context menu (show/settings/quit), left-click toggle
- Global hotkey `Alt+Shift+Space` for window recall
- Preferences persistence (JSON file in app config dir)
- Window drag via Tauri `start_dragging()`
- Multi-monitor position correction with work area clamping and 8px edge margin
- DPI scale change handling with debounced correction (500ms scale, 220ms display)
- Hub event fixture stream for IPC boundary testing
- Guest provider capability reporting
- 16 Tauri IPC commands

**Frontend runtime bridge (`src/runtime/`):**

- `tauriRuntime.ts` — Tauri IPC detection, invoke wrapper with timeout/error handling, fixture loading, capability detection, media session conversion, graceful mock fallback
- `desktopStatusInputRuntime.ts` — Three-tier source selection (mock → tauri-fixture → tauri-event push), 1800ms polling loop
- `systemPerformanceRuntime.ts` — System metrics consumer with live/fallback/stale/unavailable quality tracking
- `desktopProductRuntime.ts` — Menu action, settings, and open-settings event listeners
- `statusWindowRuntime.ts` — Overlay policy enforcement, floating management, fullscreen avoidance, position correction, startup reassertion (1s, 5s, 9s)
- `src/shared/runtimeGuards.ts` — Runtime environment detection utilities

**Frontend UI (`src/features/desktop/`):**

- `DesktopPage.tsx` — Main desktop view orchestrating all runtimes, preferences, window drag, context menu, settings panel
- 6 status templates: Resident, Media, Download, Update, Clipboard, Focus
- `DesktopStatusTransition.tsx` — Animated transitions between templates
- `GuestSourceHealthIndicator.tsx` — Shows data source quality (Live/Fallback/Stale/Unavailable)

### Tests

- `src/runtime/tauriRuntime.test.ts` — IPC bridge, fixture loading, capability detection
- `src/runtime/desktopStatusInputRuntime.test.ts` — Source selection, polling
- `src/runtime/systemPerformanceRuntime.test.ts` — Metrics normalization, quality tracking
- `src/runtime/desktopProductRuntime.test.ts` — Event listeners
- `src/runtime/statusWindowRuntime.test.ts` — Window management

## 9. Boundaries

### Current State (v0.8 In Progress)

The v0.8 system status readiness work established privacy-safe diagnostic infrastructure. The following has been completed:

- Privacy-safe diagnostic fields: `quality`, `code`, `source`, and optional `lastSuccessfulSource`.
- Runtime normalization for unsupported, unavailable, permission denied, malformed, timeout, invoke-failed, fallback, and stale states.
- Compact desktop source-health labels: `Live`, `Fallback`, `Stale`, and `Unavailable`.
- System performance data (CPU, memory, network) flowing from Rust `sysinfo` through Tauri IPC to the frontend.
- Media session data (playback status, position, duration) flowing from WinRT GSMTC through Tauri IPC to the frontend.

### Remaining Boundaries

These items are not yet implemented:

- **Provider SDK wrapping**: System performance and media session data bypass the Provider SDK. They need to be wrapped as `HubProvider` implementations.
- **Focus provider**: Windows Focus Assist API integration.
- **Clipboard provider**: Windows `AddClipboardFormatListener` integration.
- **Download provider**: File system watcher or browser download API.
- **Notification provider**: Windows Notification Listener API (requires user consent).
- **Production packaging**: Code signing, MSI/NSIS installer, auto-updater, SmartScreen compatibility.
- **Settings UI**: Currently inline in DesktopPage; needs dedicated window/panel.

### Privacy Boundaries

All system data collection follows strict privacy rules:

- Only coarse metrics are collected: CPU %, memory %, network throughput category.
- Media session exposes only playback status, position, and duration.
- No process lists, window titles, usernames, file paths, credentials, or hardware serials cross the IPC boundary.
- Diagnostic fields use bounded enums.
- Notification providers must not read private message content.

### Decision Records

The `docs/decisions/` directory contains 16 v0.8 decision documents covering system status readiness, privacy checklist, preflight descriptors, runtime capability transitions, rollback criteria, and native source boundary questions. These were created during the planning phase and are now partially superseded by the actual Tauri integration. They remain as historical context for the privacy and architecture decisions made during development.

## 10. QA Plan

### Build

```bash
npm run build
```

### Full QA

```bash
npm run qa
```

`npm run qa` runs state tests, provider tests, runtime tests, Showcase interaction QA, and the production build.

### Tauri Desktop Build

```bash
npm run tauri dev    # Development build with hot reload
npm run tauri build  # Production desktop build
```

### Showcase Screenshots

Run after the dev server is available:

```bash
npm run qa:showcase:screenshots
```

Required visual widths:

- 1366 x 768
- 1440 x 900
- 1920 x 1080

### Manual Acceptance

- `/showcase` keeps the Windows 11/Mica/Acrylic style from v0.1.
- Event Controls update the active events and current resolved mode.
- Auto Demo plays the full Stage 1 sequence and returns to Idle.
- Resolver Visualization explains why the current mode is selected.
- Provider SDK mock providers work in web-only mode (`npm run dev`).
- Tauri desktop build shows real system performance metrics and media session status.
- System tray icon toggles window visibility on left-click, shows context menu on right-click.
- `Alt+Shift+Space` recalls the status window from any application.
- Window position is corrected to monitor work area on startup and display changes.
- Fullscreen applications cause the status window to auto-hide (avoid-fullscreen preference).
- Preferences persist across application restarts.

## 11. Next Steps (Stage 5 Completion)

1. **Wrap system performance as a Provider SDK implementation**
   - Create `SystemPerformanceProvider` implementing `HubProvider`
   - Register in `ProviderRegistry` with proper lifecycle
   - Route through `providerAdapter` → event bus → store → resolver
   - Remove direct polling from `DesktopPage.tsx`

2. **Wrap media session as a Provider SDK implementation**
   - Create `MediaSessionProvider` implementing `HubProvider`
   - Connect to Rust GSMTC command via Tauri IPC
   - Handle provider lifecycle (start/stop/health)

3. **Implement Focus Provider**
   - Research Windows Focus Assist API availability
   - Implement focus state detection in Rust
   - Create frontend provider with lifecycle management

4. **Implement Clipboard Provider**
   - Use `AddClipboardFormatListener` in Rust
   - Text-only, length-limited, privacy-safe
   - Auto-expire clipboard events

5. **Implement Download Provider**
   - File system watcher on Downloads folder (`notify` crate)
   - Or browser extension integration (more complex)

6. **Implement Notification Provider**
   - Windows Notification Listener API
   - Requires user consent flow
   - Privacy-safe: source app + title only, no message body
