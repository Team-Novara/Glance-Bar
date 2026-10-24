# Tester Guide — Glance Bar Windows MVP Validation

> Status: Draft for Gate D preparation — not release evidence. This guide
> describes how a tester installs, exercises, and reports on the Windows MVP
> candidate. It accompanies [TESTER_CHECKLIST.md](TESTER_CHECKLIST.md); the
> product behavior contract is [MVP_SCENARIO_MATRIX.md](../product/MVP_SCENARIO_MATRIX.md)
> and the current gaps are listed in [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md).

## 1. What you are testing

Glance Bar is a compact status bar that shows one state at a time, chosen from
what is happening on your machine. The Windows MVP validates three states:

- **Media** — what is playing, with playback actions when the system supports them.
- **Downloads** — active download count and bounded outcomes, without controls.
- **Focus** — an active focus session, with a Stop action only when the system
  reports the session is controllable.

A fourth **Resident** state (CPU / memory / network speeds) is the bar's default
home when nothing more important is active. Priorities, alternation timing, and
every expected result per scenario are defined in
[MVP_SCENARIO_MATRIX.md](../product/MVP_SCENARIO_MATRIX.md) — read at least its
sections 1 and 2 before your first session.

You are validating honest behavior, not perfection: the bar must never show a
guessed percentage, a fake successful action, or stale data labeled as live.

## 2. Installing the validation build

**Status: no packaged candidate build exists yet — pending evidence.** Until a
versioned candidate is frozen (plan Days 22-23), run the app from source and
record the exact commit you ran.

### Interim: run from source

Prerequisites (see the repository [README](../../README.md) for details):

- Windows 10/11
- Node.js 20 or later
- Rust stable toolchain
- The Tauri 2 platform prerequisites for Windows

Steps:

```bash
git clone https://github.com/Team-Novara/Glance-Bar.git
cd Glance-Bar
git checkout <candidate-commit>        # record this hash in every report
npm install
npm run tauri -- dev
```

### Packaged installer (to be completed when the candidate build exists)

Install, first-launch, and uninstall instructions for the packaged candidate
will be added here once the build is produced and verified. Until then, treat
installer behavior as untested and report anything you observe under "shell
behavior" rather than assuming it is supported.

### Record before every session

- Glance Bar commit hash you are running.
- Windows version and architecture.
- Session type: guided checklist or normal work session.

## 3. First run

Launch the app. Expected behavior:

1. A compact status bar window appears; with no media, downloads, or focus
   activity it shows the **Resident** state (CPU / memory / network speeds).
2. A tray icon appears. Its tooltip currently reads `Cober Windows Bar`
   (a legacy name — see [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) §6).
3. The Settings panel language defaults per the app locale and can be switched
   between English and 简体中文 in Settings. Tray menu labels remain Simplified
   Chinese regardless.

## 4. Tray behavior and window recovery

The tray is the primary way to get the bar back. Exercise all of it:

| Action | Expected |
|---|---|
| Close the bar window (window close button) | The window hides; the app keeps running in the tray (close-to-tray). No exit. |
| Tray icon **left-click** | Toggles the bar window: shows it if hidden, hides it if visible. |
| Tray menu `显示 / 召回状态中心` (show / recall) | Shows the bar window. |
| Tray menu `打开设置` (open settings) | Opens the Settings panel. |
| Tray menu `退出` (quit) | Exits the app completely; no lingering process or tray icon. |
| Drag the bar (with Lock Position off) | The bar moves; the position is saved on drag end. |
| Settings → Quick Controls → **Reset Position** | The bar returns to the default safe area (first monitor, bottom-right). |

If the bar cannot be recovered through any of these after any action, that is a
serious (P0/P1) finding — see the severity definitions in
[TESTER_CHECKLIST.md](TESTER_CHECKLIST.md).

## 5. Settings and shell preferences

Open Settings (tray menu `打开设置`, or Quick Controls → Open Native Settings).
The **Window Behavior** section has four toggles:

| Toggle | Expected behavior |
|---|---|
| **Always Float** | On: the bar stays on top of other windows. Off: the bar is not forced on top. |
| **Avoid Fullscreen** | On: the bar hides while a fullscreen app (video, game, presentation) is foreground and returns when you leave fullscreen. Off: normal floating behavior. |
| **Lock Position** | On: dragging the bar does nothing ("Position locked"). Off: free to drag. |
| **Start with Windows** | On: the app registers to launch at login. Off: no autostart registration. |

Also available: **Refresh Data**, **Reset Position**, **Recall Status Center**
(Quick Controls), the language switch, a Provider Status panel, and the
Privacy-safe Diagnostics panel used for reporting (below).

## 6. Preference persistence check

After changing any preference (toggles, position, language), restart the app
completely (Quit from the tray, relaunch). Every saved preference — including
the dragged position — must be restored exactly. For `Start with Windows`,
restart Windows itself to verify the registration works; record whether you
performed this reboot, because it is one of the plan's open evidence items.

## 7. Reporting feedback

1. Open **Settings → Privacy-safe Diagnostics**. This bounded view shows app
   version, platform, runtime, and per-provider lifecycle/health with an
   allowlisted last error code and last checked time — nothing else.
2. Copy the diagnostics content and paste it into the bug-report template in
   [PRIVACY_SAFE_DIAGNOSTICS.md](../qa/PRIVACY_SAFE_DIAGNOSTICS.md), filling in
   build/commit, Windows version, steps, expected, and actual.
3. Apply that document's verification checklist before submitting: confirm the
   evidence contains **no** file paths, filenames, clipboard text, media
   titles, notification content, usernames, credentials, or raw payloads.
4. Classify the finding using the P0/P1/P2 definitions in
   [TESTER_CHECKLIST.md](TESTER_CHECKLIST.md) and complete the six capture
   points there for each session.

Do not paste full application logs or raw native errors into a report. If a
report seems to need detail the diagnostics view intentionally excludes, say so
in the report instead of attaching it.
