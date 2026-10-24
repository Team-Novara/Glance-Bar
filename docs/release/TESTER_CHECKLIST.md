# Tester Checklist — Glance Bar Windows MVP Validation

> Status: Draft for Gate D preparation — not release evidence. Each tester
> completes (a) the guided checklist once and (b) at least one normal work
> session (plan Days 24-27 require at least two sessions per tester, including
> one normal work session). Read [TESTER_GUIDE.md](TESTER_GUIDE.md) first; the
> behavioral expectations referenced below are defined in
> [MVP_SCENARIO_MATRIX.md](../product/MVP_SCENARIO_MATRIX.md).

Record for every session: tester name or initials, Glance Bar commit, Windows
version, session type, date, and duration.

## Severity definitions

Classify every finding before reporting (definitions from the
[execution plan](../plans/2026-09-05_WINDOWS_MVP_30_DAY_EXECUTION_PLAN.md) §7):

- **P0:** crash, data/privacy exposure, impossible recovery, or false successful action.
- **P1:** misleading live state, common stuck state, broken primary shell behavior, or unexplained frequent transition.
- **P2:** clarity, visual polish, uncommon edge case, or enhancement.

P0 blocks the candidate. P1 must be fixed or explicitly accepted with a limited
audience and workaround. P2 goes to the post-MVP backlog.

## (a) Guided checklist — 30-60 minutes

Work through the parts in order. Each line has the expected result; mark PASS,
FAIL, or N-A (with a note). Scenario IDs (M1-M6, D1-D6, F1-F6) refer to
[MVP_SCENARIO_MATRIX.md](../product/MVP_SCENARIO_MATRIX.md) §2.

### Part 1 — Media (about 15 minutes)

Use a real media application or a browser media session.

- [ ] **M1 normal:** start playback with title/artist/duration available. The
  bar shows title, artist, progress, and time; play/pause reflects state; the
  health badge reads Native. With nothing higher-priority active, media
  alternates with resident (media ~15 s, resident ~8 s).
- [ ] **M2 empty:** stop playback and close the player. No media card remains;
  the bar returns to resident or the next active state.
- [ ] **M3 unavailable:** if you can force a detected-but-unusable player
  state, the bar shows "No player detection" with disabled controls and never
  invents track info. If you cannot force it, mark N-A.
- [ ] **M4 completion:** let a track end naturally. Media stops being active
  with no stale "now playing" card.
- [ ] **M5 failure:** if a control fails (e.g., a player that refuses
  commands), the bar shows "Couldn't control playback" and keeps the last good
  state. If you cannot force a failure, mark N-A.
- [ ] **M6 malformed:** play media with missing title or no duration (e.g., a
  stream). The bar stays readable: generic label, no broken time value.
- [ ] **Manual selection:** click the media card/state manually. It stays
  pinned (about 80 seconds) instead of being preempted, then automatic
  selection resumes.

### Part 2 — Downloads (about 10 minutes)

Use each installed browser and record browser + version. Expected results
assume the Downloads-folder observer.

- [ ] **D1 normal (Chrome):** start one download. The bar shows active count
  1, an **indeterminate** rail (no percentage), a Native badge, and **no
  pause/resume/cancel buttons**.
- [ ] **D1 normal (Edge):** same expectations as Chrome.
- [ ] **D1 normal (Firefox):** same expectations as Chrome.
- [ ] **D1 two concurrent downloads:** active count rises to 2 and the rail
  remains indeterminate.
- [ ] **App starts mid-download:** quit and relaunch Glance Bar while a
  download is in progress. The active download is detected on startup.
- [ ] **D4 completion:** finish a download the observer can confirm. A bounded
  "Download complete" outcome may appear, then the bar moves on.
- [ ] **D5 unknown ending:** cancel a download in the browser (if the browser
  allows). The bar shows a neutral "Download ended / outcome could not be
  confirmed" state — never "complete" and never "failed".
- [ ] **D2 empty:** with no downloads, no download card appears.
- [ ] **D3/D6 unavailable/malformed:** developer-forced cases; mark N-A unless
  a natural occurrence appears.

### Part 3 — Focus (about 10 minutes)

Use Windows Focus Assist (name and location vary by Windows version).

- [ ] **F1 active:** enable a focus session. The bar shows the focus card with
  a session label, detail, and health badge. Focus takes priority over media,
  downloads, and resident.
- [ ] **Stop action:** note whether a Stop action appears. It should appear
  only while the native observation is active **and** controllable; record
  which case you observed.
- [ ] **F4 completion:** end the focus session from Windows (not via the bar).
  A neutral "Focus session ended" card appears for a bounded window, with **no**
  Stop action, then the bar returns to the next useful state.
- [ ] **F5 failure:** if Stop is shown and cannot actually stop the session,
  the bar shows "Couldn't stop focus session" while keeping the last good
  state. A Stop that reports success without stopping the session is **P0**
  (false successful action).
- [ ] **F2 empty:** with no session active, no focus card appears.

### Part 4 — Shell behavior (about 10 minutes)

- [ ] Close the bar window: it hides to tray; the app keeps running.
- [ ] Tray left-click: toggles the bar window visibility.
- [ ] Tray menu show/recall, open settings, quit: each works; quit leaves no
  process or tray icon behind.
- [ ] **Always Float** off: the bar is no longer forced on top; re-enable it.
- [ ] **Avoid Fullscreen** on: open a fullscreen app (video player, F11
  browser); the bar hides; leaving fullscreen brings it back. Then set it off
  and confirm normal floating behavior.
- [ ] **Lock Position** on: dragging does nothing; off: dragging works.
- [ ] Drag the bar and restart the app: the saved position is restored.
- [ ] **Reset Position**: the bar returns to the default safe area.
- [ ] **Start with Windows** on, then reboot Windows (record that you
  rebooted): the app launches at login. Set it off afterwards.
- [ ] Multi-monitor/DPI (only if you have the hardware; otherwise mark N-A and
  record your configuration): move the bar to a second monitor, restart, and
  note where it reappears.

### Part 5 — Preference persistence (about 5 minutes)

- [ ] Change several preferences (toggles, language, position). After each
  change or in one batch, quit from the tray and relaunch: every preference is
  restored exactly as saved.

## (b) Normal work-session checklist

Do your ordinary work for at least one session (plan soak guidance is six
hours for the internal Gate C run; tester sessions should be at least one
focused work block — record the duration). Keep the bar enabled the whole time.
Do not script scenarios; observe.

During and after the session, capture:

- [ ] Every unexpected card transition (what changed, when, what you were doing).
- [ ] Any stale or misleading status (labeled live but obviously wrong).
- [ ] Duplicate events or repeated toasts.
- [ ] Whether the bar interfered with fullscreen apps or multi-monitor use.
- [ ] Whether the bar/tray stayed recoverable for the whole session.
- [ ] Whether providers recovered after you closed and reopened source apps
  (player, browser, Focus Assist).
- [ ] Subjective resource impact (did the machine feel slower with the bar on?).

## Required capture points (both session types)

Answer all six for every session (plan Days 24-27):

1. **A moment when Glance Bar avoided a context switch.** Describe the moment.
2. **A distracting or unnecessary transition.** Describe it; if none, say none.
3. **A transition whose cause was unclear.** What changed and why was it confusing?
4. **A missing or misleading action.** An action you expected but did not get,
   or one that misled you.
5. **Whether you would leave the bar enabled.** Yes / no / with changes, and why.
6. **Any crash, positioning, tray, privacy, or stale-state issue.** If none, say none.

## Findings log template

```text
Tester:
Commit / build:
Windows version:
Session type (guided / normal work) and duration:

Finding 1
  Title:
  Severity (P0/P1/P2):
  Steps to reproduce:
  Expected:
  Actual:
  Diagnostics (Settings -> Privacy-safe Diagnostics):
  Related scenario (M#/D#/F#/shell):
  Screenshot (redacted): yes/no

Capture points 1-6:
  1. Avoided a context switch:
  2. Distracting/unnecessary transition:
  3. Unclear transition:
  4. Missing or misleading action:
  5. Would leave enabled:
  6. Crash/positioning/tray/privacy/stale-state issues:
```

Submit using the reporting flow in [TESTER_GUIDE.md](TESTER_GUIDE.md) §7 and
the privacy rules in [PRIVACY_SAFE_DIAGNOSTICS.md](../qa/PRIVACY_SAFE_DIAGNOSTICS.md).
