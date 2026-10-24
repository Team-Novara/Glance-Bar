# Known Limitations — Windows MVP Release Candidate

> Status: Draft for Gate D preparation — not release evidence. Compiled from the
> execution plan and current documentation at `main` commit `2ffff11`. Items
> marked **pending evidence** have no hardware, packaging, or tester proof yet;
> they must not be reported as verified behavior.

Related: [TESTER_GUIDE.md](TESTER_GUIDE.md), [TESTER_CHECKLIST.md](TESTER_CHECKLIST.md),
[RELEASE_DECISION_TEMPLATE.md](RELEASE_DECISION_TEMPLATE.md).

## How to read this list

- **Designed limitation** — intended product behavior for the Windows MVP. Not a
  defect; do not file it as a bug unless observed behavior deviates from what is
  described here.
- **Pending evidence** — implemented in code with automated coverage, but not
  yet demonstrated on physical Windows hardware, a packaged build, or real
  testers. These are the open items between the current checkpoint and Gate D.

Sources: [30-day execution plan](../plans/2026-09-05_WINDOWS_MVP_30_DAY_EXECUTION_PLAN.md),
[WINDOWS_SHELL_VERIFICATION.md](../qa/WINDOWS_SHELL_VERIFICATION.md),
[MVP_SCENARIO_MATRIX.md](../product/MVP_SCENARIO_MATRIX.md).

## 1. Distribution and packaging

| # | Limitation | Status |
|---|---|---|
| 1.1 | No packaged installer has been produced or verified. Clean-checkout packaging evidence, installer launch, and uninstall-without-leftover-process checks are still open (plan Days 19-20). | **Pending evidence** |
| 1.2 | All current verification ran through development workspaces and CI runners. The CI matrix (Node 20/22, Vite build, TypeScript, ESLint, Rust on Ubuntu/macOS/Windows) is green, but no run proves the packaged app's behavior. | **Pending evidence** |
| 1.3 | No versioned candidate build exists yet (plan Days 22-23). Until one is frozen, every tester session must record its source commit. | **Pending evidence** |

## 2. Windows hardware verification gaps

Implemented and covered by automated tests, but **not verified on a physical
Windows machine** (see [WINDOWS_SHELL_VERIFICATION.md](../qa/WINDOWS_SHELL_VERIFICATION.md),
"Gaps documented"):

| # | Area | What remains unverified |
|---|---|---|
| 2.1 | Tray recovery | Close-to-tray, tray left-click toggle, and tray menu Show/Settings/Quit after launch from an installed app; recovery after Explorer restart. |
| 2.2 | Autostart | `Start with Windows` registration surviving reboot and launching the app. |
| 2.3 | Restart persistence | Restored preferences and saved window position after a full app restart on real hardware. |
| 2.4 | DPI and multi-monitor | DPI-change behavior, monitor removal, and two-monitor position restoration. The restore logic (nearest-monitor fallback, work-area clamping) has automated coverage only. |
| 2.5 | Uninstall | Uninstalling without leaving a running process behind. |

## 3. Provider capability limitations (designed)

### 3.1 Downloads — observation only

- The Windows Downloads-folder observer reports an active count and bounded
  lifecycle states only. **Pause, resume, and cancel are never shown**, because
  the provider cannot control a browser task ([MVP_SCENARIO_MATRIX.md](../product/MVP_SCENARIO_MATRIX.md) §1.2).
- Progress is an **indeterminate rail**; no exact percentage is shown, because
  the folder observer cannot know the final size.
- When a temporary file disappears without proof it became a final file, the bar
  reports a neutral "Download ended — outcome could not be confirmed" state. It
  never labels that case as success or failure.

### 3.2 Downloads — browser matrix unrecorded

The required real-Windows matrix (Chrome `.crdownload`, Edge, Firefox `.part`,
two concurrent downloads, app start mid-download, unavailable Downloads
directory — plan Week 1 Day 6) has **not been recorded**. Browser- and
version-specific detection gaps, if any, are unknown. **Pending evidence.**

### 3.3 Focus — conditional Stop action

- The **Stop action is rendered only while the native Focus Assist observation
  is both active and controllable**. Whenever the native path does not report
  control support, Focus is observation-only and shows no action.
- The exact Focus Assist fact read per Windows version, and OS-version
  limitations, are documented intentions without hardware evidence.
  **Pending evidence.**

### 3.4 Media — Windows validation open

- The GSMTC-based path exists with an explicit unavailable state and disabled
  controls, but the required two-player Windows walkthrough (session
  replacement, timeline edge cases, per-control verification — plan Days 8-9)
  has not been run. **Pending evidence.**

## 4. Cross-platform scope

- macOS and Linux are **not part of the Windows MVP release**. Platform modules
  compile (CI runs Rust checks on all three OSes), and individual capabilities
  may report `unsupported`. Compile-time support is not feature parity; no
  macOS/Linux capability claims are made. See the repository
  [README](../../README.md) platform status table.

## 5. Missing release evidence (Gates C-D)

| # | Evidence | Plan reference |
|---|---|---|
| 5.1 | One successful six-hour workday soak of a release build (transitions, stale state, duplicate toasts, resource growth, tray recovery, fullscreen/multi-monitor interference, provider recovery). | Day 21, Gate C |
| 5.2 | Findings from at least three testers, each completing at least two sessions including one normal work session. | Days 24-27 |
| 5.3 | A real bug-report walkthrough using the privacy-safe diagnostics view on a packaged build. | Day 18 checkpoint |

## 6. Additional code-observed items (not yet triaged)

Observed in the current source; recorded here so testers are not surprised, and
to be triaged during Gate D:

- Tray menu labels were hardcoded Simplified Chinese
  (`显示 / 召回状态中心` = show/recall, `打开设置` = open settings, `退出` =
  quit) and the tray tooltip read `Cober Windows Bar`, a legacy product name.
  **Fixed on this branch** (`src-tauri/src/tray.rs`): the labels now read
  `Show / Recall Status Center`, `Open Settings`, and `Quit`, and the tooltip
  reads `Glance Bar`. **Tray labels now follow the in-app language setting**
  (same branch): the choice is persisted in the desktop preferences
  (`language: "en" | "zh-CN"`), both label sets live in a bounded table in
  Rust (`src-tauri/src/tray.rs`, English fallback for missing/unknown
  values), and switching language in Settings rebuilds the tray menu through
  the existing `set_status_center_preferences` path — no new IPC channel.
  Startup builds the tray menu from the stored preference, and the frontend
  initializes i18next from it while keeping the browser detector (and its
  `i18nextLng` localStorage cache key) as the fallback when no preference
  exists. The in-window right-click context menu (`create_status_center_menu`
  in `src-tauri/src/lib.rs`) had the same fixed Simplified Chinese labels.
  **Fixed on this branch** as well: its labels now come from a sibling
  bounded table in `src-tauri/src/tray.rs` (`status_center_menu_labels`, both
  en and zh-CN sets, English fallback for missing/unknown values), built from
  the same stored `language` preference, and a language switch rebuilds the
  cached context menu in place through the existing
  `set_status_center_preferences` path — no new IPC channel. Like the tray
  fix this is a code-level change with automated unit-test coverage, not
  release evidence — it has not been demonstrated on a packaged build or
  physical Windows hardware.

## Maintenance rule

Update this document in the same change that records new evidence. When an item
gains hardware or packaging proof, move it out of **pending evidence** and cite
where the evidence is recorded. Do not delete a designed limitation because a
tester dislikes it — file that reaction as P2 feedback instead.
