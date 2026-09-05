# MVP Scenario Matrix

> Purpose: define what the Glance Bar shows in every MVP scenario, in product language a tester can verify without reading code. This is the Week 1 experience contract for the three MVP states — **Media**, **Downloads**, and **Focus** — and is the source of truth that the scheduler, aggregation, and UI are built against.
>
> Parent plan: [MVP_LAUNCH_PLAN.md](MVP_LAUNCH_PLAN.md) (Week 1 exit criteria: *the team can describe what the bar shows in every MVP scenario without referring to implementation details*).

## How to read this document

- **States** are the three MVP statuses the bar can show. Each state has a *source* (where the data comes from), a *display* (what the user sees), an *expiry* (when it goes away), *actions* (what the user can do), and a *fallback* (what shows when the source cannot provide live data).
- **Scenarios** are the situations each state must handle. Every scenario is written so a tester can observe the bar and say "yes, that matches" or "no, that is a bug."
- **Display policy** is the six-rule contract from the MVP plan, mapped here to concrete, observable UI behavior.
- **Priority order** is how the bar decides which state to show when more than one is active at the same time.

Traceability notes point to the current implementation so product intent can be matched to code during Week 2 verification. They are references, not the contract — if code and this document disagree, this document wins.

---

## 1. State Definitions

### 1.1 Media

The bar tells the user what is playing and offers playback control.

| Aspect | Definition |
|---|---|
| **Source** | A media session reported by the system (real provider) or, when no system session is present, the mock music provider. The real provider takes priority over the mock. |
| **Display** | Track title, artist, a progress bar, and an elapsed/total time label when the player exposes a timeline. A small health badge indicates whether the data is live from the system, from the app, or unavailable. Controls for previous, play/pause, and next sit above the progress bar. |
| **Expiry** | The media state is shown while a session is active. When nothing is playing (or the session is paused/stopped), media is no longer an active state and the bar moves on. |
| **Actions** | Previous track, play/pause, next track. |
| **Fallback** | When a player is detected but reports it cannot be controlled or has no usable data, the bar shows a **"No player detection"** state and disables the playback controls rather than showing misleading live info. When no player is present at all, media simply is not an active state and the bar falls back to the next useful state. |

> Traceability: aggregation `src/state/desktopStatusAggregation.ts:255-262` (real media takes priority over mock music); template `src/features/desktop/templates/MediaStatusTemplate.tsx:41-119` (unavailable badge + disabled controls); health indicator `GuestSourceHealthIndicator.tsx`.

### 1.2 Downloads

The bar shows meaningful transfer progress and the completion/failure outcome.

| Aspect | Definition |
|---|---|
| **Source** | A Windows Downloads-folder observation reported through the provider pipeline. The observer exposes only the active count and bounded lifecycle facts; it does not expose file names or paths. The fixture provider remains available for deterministic showcase/test states. |
| **Display** | The number of active downloads, a detail line, and a progress rail. Because the folder observer cannot know the final size, the real path uses an indeterminate rail instead of an exact percentage. A health badge indicates source quality. |
| **Expiry** | A download is shown while it is in progress. On completion or failure the bar surfaces the outcome for a bounded period, then returns to the next useful state. |
| **Actions** | None for the real folder observer. Pause/resume and cancel are not shown because the provider cannot control a browser task. |
| **Fallback** | When progress is unavailable, the bar shows an indeterminate rail and does not render a guessed percentage. When a temporary file disappears, the bar reports **"Download ended"** because the filesystem cannot prove completion versus cancellation or failure. Provider errors show a degraded health badge and no live progress claim. |

> Traceability: aggregation `src/state/desktopStatusAggregation.ts:149-210`; template `src/features/desktop/templates/DownloadStatusTemplate.tsx:27-112` (indeterminate real observation rail; controls only when the state explicitly reports control support).

### 1.3 Focus

The bar shows an active focus/work session and offers a way to end it.

| Aspect | Definition |
|---|---|
| **Source** | The system Focus Assist / focus session state (real provider) or a mock fallback. |
| **Display** | A focus label, a session label (for example the profile name and duration), a detail line (for example time remaining), and a health badge. The Stop action appears only when the native observation explicitly reports that control is supported. |
| **Expiry** | The active focus state remains visible while a session is active. An active-to-inactive transition may show a neutral **"Focus session ended"** card for a bounded window, then the bar returns to the next useful state. |
| **Actions** | Stop session only while the observation is active and controllable. No action is shown after completion or when the provider is observation-only. |
| **Fallback** | When the focus provider is unavailable or unsupported, it reports that capability fact and does not invent an active session. If a supported Stop action fails, the bar shows a **"Couldn't stop focus session"** message while retaining the last good active state. |

> Traceability: runtime parser/support `src/runtime/system/systemMonitorRuntime.ts`; provider lifecycle and bounded completion `src/providers/impl/real/realFocusProvider.ts`; aggregation `src/state/desktopStatusAggregation.ts`; template `src/features/desktop/templates/FocusStatusTemplate.tsx`.

### 1.4 Resident (supporting state)

System performance is not one of the three MVP states, but it is the bar's default home and the state the bar returns to when nothing more important needs attention.

| Aspect | Definition |
|---|---|
| **Source** | System performance metrics (CPU, memory, download speed, upload speed). |
| **Display** | CPU and memory as percentage bars; download/upload as speeds. A health badge shows whether the metrics are **Live**, **Stale**, **Fallback**, or **Unavailable**. |
| **Expiry** | Resident is the fallback state — it is shown whenever no higher-priority state is active, and it alternates with media when media is active (see §4). |
| **Actions** | None on the card itself (window-level actions live in settings/tray). |
| **Fallback** | When the performance source is unavailable, the health badge shows **Unavailable** / **Fallback** so the user is never misled into thinking stale numbers are live. |

> Traceability: `src/features/desktop/templates/ResidentStatusTemplate.tsx:117-147` (quality labels and classes).

---

## 2. Scenario Matrix

Each MVP state must handle six scenarios. **Every scenario below is testable**: a tester can set up the situation, observe the bar, and confirm the expected result.

### 2.1 Media

| # | Scenario | Given | Expected bar behavior |
|---|---|---|---|
| M1 | **Normal** | A media session is playing and the provider reports healthy live data. | Shows title, artist, progress bar, and time label (when available). Play/pause reflects the current state. Health badge reads **Native**. If no higher-priority state is active, media alternates with the resident card (media 15s, resident 8s). |
| M2 | **Empty** | Nothing is playing; no mock music is active. | Media is not an active state. The bar does **not** show a media card; it falls back to the next active state, or to resident. |
| M3 | **Unavailable** | A player is detected but reports it is unavailable or unsupported (no usable session data). | Shows the **"No player detection"** state. Playback controls are **disabled**. The bar must **not** present invented track info as if it were live. |
| M4 | **Completion** | Playback stops (track ends or player closes). | Media is no longer active. The bar returns to the next useful state (typically resident). No stale "now playing" card remains. |
| M5 | **Failure** | The user presses a playback control and the system cannot obey (control failed). | The bar shows a **"Couldn't control playback"** message. The last good state remains visible; the bar does not blank out or show corrupt data. |
| M6 | **Malformed** | The player reports a session but with missing/invalid fields (for example no title or no timeline). | Missing title falls back to a generic label; a missing timeline hides the time label rather than showing a broken value. The bar stays readable and never renders a raw error or an empty time field. |

### 2.2 Downloads

| # | Scenario | Given | Expected bar behavior |
|---|---|---|---|
| D1 | **Normal** | A download is in progress and the Windows observer reports an active temporary file. | Shows the active download count, a detail line, an indeterminate progress rail, and a Native health badge. No browser-control buttons are shown. |
| D2 | **Empty** | No download task exists. | Download is not an active state. The bar does **not** show a download card; it falls back to the next active state, or to resident. |
| D3 | **Unavailable** | The Downloads directory cannot be read, or the provider reports unsupported monitoring. | The provider reports an unavailable/degraded health fact. The bar does not show invented download activity or controls. |
| D4 | **Completion** | A temporary download file is replaced by a final file and the observer can confirm the transition. | A bounded **"Download complete"** outcome may be surfaced. If the transition cannot be confirmed, use D5's neutral ended state instead. |
| D5 | **Failure/unknown ending** | A temporary file disappears without evidence that it became a final file. | The bar shows **"Download ended"** and **"Outcome could not be confirmed"** for a bounded period, then returns to the next useful state. It never claims success or failure. |
| D6 | **Malformed** | The native event has an unknown status/code, invalid count, invalid timestamp, or non-finite progress. | The runtime drops the event and retains the last safe state; no broken percentage, raw error, or fake live state is shown. |

> Note on D4/D5: the current Windows folder observer can prove activity and an unknown ending. It must not label a disappearing temporary file as successful completion. A future browser-integrated provider may add exact progress, confirmed completion, and controls behind a separate capability contract.

### 2.3 Focus

| # | Scenario | Given | Expected bar behavior |
|---|---|---|---|
| F1 | **Normal** | A focus session is active and the provider reports healthy, controllable data. | Shows the focus label, session label (profile + duration), detail (for example time remaining), and a stop button. Health badge reflects source quality. |
| F2 | **Empty** | No focus session is active. | Focus is not an active state. The bar does **not** show a focus card; it falls back to the next active state, or to resident. |
| F3 | **Unavailable** | The focus provider cannot be reached or reports unsupported. | The capability is marked unavailable/unsupported and the bar does **not** invent a session or Stop action. |
| F4 | **Completion** | The focus session changes from active to inactive. | A neutral **"Focus session ended"** card is shown for a bounded window without a Stop action, then the bar returns to the next useful state. |
| F5 | **Failure** | The user presses stop and the session cannot be stopped. | The bar shows a **"Couldn't stop focus session"** message. The last good state remains visible. |
| F6 | **Malformed** | The provider reports a session with a missing profile name or detail. | Missing profile falls back to a generic "Focus Assist enabled" label; the card stays readable. No raw error or blank label is shown. |

> Traceability for fallbacks: aggregation `src/state/desktopStatusAggregation.ts:124-147` (focus profile fallback to `focusAssistEnabled`).

---

## 3. Display Policy Verification

These are the six display-policy rules from the MVP plan ([MVP_LAUNCH_PLAN.md §4](MVP_LAUNCH_PLAN.md)), restated as concrete, observable UI behaviors. Every visible change in the bar should be attributable to one of these. If a tester cannot explain why the displayed state changed, that is a product bug.

### Situation 1 — Manual selection: pin, then auto-return

- **Rule:** When the user selects a status manually, the bar pins that status for the configured preference window, then returns to automatic selection.
- **Observable behavior:** After manual selection the chosen card stays on screen and is *not* immediately preempted by a higher-priority state. When the preference window elapses, automatic selection resumes and the bar may change to a higher-priority state if one is active.
- **Preference window:** currently **80 seconds** (the runtime sets `preferredUntil = now + 20s × 4`; the scheduler treats anything within that window as still pinned).
- **Traceability:** `src/features/desktop/hooks/useDesktopStatusRuntime.ts:186-190` (`setPreferred` while `preferredUntil > now`), `:206-226` (auto-clear on expiry); `src/runtime/scheduler/schedulerService.ts:144-154` (preferred-wins branch); `src/state/desktopStatusScheduler.ts:70-81`.

### Situation 2 — Download complete/fail: surface promptly, bounded time, return

- **Rule:** When a download completes or fails, surface it promptly for a bounded period, then return to the next useful state.
- **Observable behavior:** A finished/failed download is shown long enough to be noticed, but does not stay forever. After the bounded window the bar moves on to the next useful state.
- **Traceability:** priority loop in `src/state/desktopStatusScheduler.ts:151-159` (download outranks media/resident, so it surfaces promptly); fallback/expiry logic at `:161-182` (returns to resident or next available when download is no longer active).

### Situation 3 — Focus session complete: surface clearly, then return

- **Rule:** When a focus session ends, surface completion clearly without implying that it can still be stopped.
- **Observable behavior:** The focus card is shown with a clear completion indication and no Stop action is offered after the session ends. The bounded completion card then expires and the bar returns to the next useful state.
- **Traceability:** `src/features/desktop/templates/FocusStatusTemplate.tsx:24-62` (stop action + failure toast); focus priority in `src/state/desktopStatusScheduler.ts:36-45` (focus is highest priority, so it surfaces immediately when active).

### Situation 4 — Media active, no higher priority: show media, alternate with resident

- **Rule:** When media is active and no higher-priority state is active, show media, alternating with the resident state only when the policy says both deserve space.
- **Observable behavior:** With media playing and nothing more important active, the bar cycles **media 15s → resident 8s → media 15s …** so the playing session gets more dwell time without abandoning the resident card. If a higher-priority state (focus, download, notification, update, developer) becomes active, it immediately takes over and alternation stops.
- **Traceability:** `src/state/desktopStatusScheduler.ts:238-292` (`shouldAlternateMediaWithResident`); media/resident durations at `:35-39`; the no-higher-priority guard at `:101-107`.

### Situation 5 — Source unavailable: show fallback/health, NOT misleading live data

- **Rule:** When a source is unavailable or malformed, do not show misleading live data; render the supported fallback/health state.
- **Observable behavior:** The health badge changes to reflect the source quality (**Native / Live / App / Fixture / Mock / Unavailable**). Media shows **"No player detection"** and disables controls; resident shows **Unavailable/Fallback** instead of stale numbers; focus shows a degraded badge rather than inventing a session. At no point does the bar present guessed or stale values as current live data.
- **Traceability:** `src/features/desktop/templates/GuestSourceHealthIndicator.tsx:31-64` (quality → label/class); media unavailable branch `MediaStatusTemplate.tsx:41-78`; resident quality labels `ResidentStatusTemplate.tsx:117-147`.

### Situation 6 — Fullscreen mode: respect the preference

- **Rule:** When the user is in fullscreen mode, respect the fullscreen-avoidance preference.
- **Observable behavior:** With **Avoid Fullscreen** enabled, the bar hides (or stops forcing itself on top) while a fullscreen app is in the foreground, and reasserts its floating position when the fullscreen app is left. With the preference disabled, the bar behaves according to its normal always-float setting. Dragging the bar is never overridden by the overlay policy.
- **Traceability:** `src/features/desktop/hooks/useOverlayPolicy.ts:36-66` (polling only when `avoidFullscreen` is on; reasserts overlay state); drag-skip guard at `:49` and `:83-84`.

---

## 4. Priority Order and Conflict Resolution

### 4.1 Current priority order

When more than one state is active at the same time, the bar shows the **highest-priority** one. The order, from highest to lowest:

| Priority | State | Notes |
|---|---|---|
| 1 (highest) | **Focus** | An active focus session always wins. |
| 2 | **Developer** | Git/Docker/npm status. (Available but not an MVP success criterion.) |
| 3 | **Update** | System/app update progress. |
| 4 | **Notification** | Latest foreground notification. |
| 5 | **Download** | In-progress, completed, or failed transfer. |
| 6 | **Media** | Playing media; alternates with resident when nothing above is active. |
| 7 | **Clipboard** | Recently copied content. |
| 8 (lowest) | **Resident** | System performance; the default home / fallback. |

> Traceability: `src/entities/status/config.ts:36-45` (`DESKTOP_STATUS_PRIORITY_ORDER`). This single list drives both the resolver snapshot path and the hook event path; the two must stay in sync.

### 4.2 How conflicts resolve

The scheduler applies these rules, in order, every time the bar re-evaluates (on each render and on a 250ms heartbeat):

1. **Manual selection wins while pinned.** If the user manually selected a state and the preference window has not elapsed, that state is shown regardless of priority. (Situation 1.)
2. **Media/resident alternation is a special case.** When both media and resident are available and at least one is active, and *no* higher-priority state (focus, developer, update, notification, download) is active, the bar alternates **media 15s ↔ resident 8s** instead of locking onto one. (Situation 4.)
3. **Stability window prevents flicker.** If the currently-shown state is still active and only a short time has passed (≤ **6 seconds**), the bar keeps showing it, unless a higher-priority state has *just* activated and is within its preemption window (≤ **12 seconds**). This stops the bar from thrashing between states on minor, momentary noise.
4. **Otherwise, highest priority wins.** The scheduler walks the priority list top-to-bottom and shows the first state that is both *available* (the source is registered) and *active* (it currently has data).
5. **Fallback.** If nothing is active, the bar shows **resident**. If even resident is unavailable, it shows the first available kind, and finally the resident fallback kind as a last resort.

> Traceability: `src/state/desktopStatusScheduler.ts:61-203` — preferred branch (`:70-81`), media/resident carve-out (`:101-123`), stability + preemption (`:125-149`), priority walk (`:151-159`), fallback chain (`:161-182`). Windows: stability 6s (`:31`), preferred 20s base (`:32`), preemption 12s (`:33`), media 15s / resident 8s (`:35-39`). Hook heartbeat 250ms: `src/runtime/scheduler/schedulerService.ts:233-237`.

### 4.3 Asymmetry worth calling out

- **Media dwells longer than resident** (15s vs 8s) on purpose: a playing session should get more screen time without making the resident card feel abandoned.
- **Manual selection overrides priority** but is bounded (currently 80s) so the bar does not get stuck on a hand-picked state forever.
- **Preemption is one-directional and time-bounded:** a higher-priority state can bump the current one only within 12s of its own activation; after that, the stability window protects the current card from being yanked away mid-view.

---

## 5. Production-readiness notes (Week 1 assessment)

The MVP plan asks which provider paths are production-ready. Current status:

- **Media** — has both a real system-session path and a mock path, with an explicit unavailable state and disabled controls. Closest to production-ready; needs live validation of the real provider and timeline formatting.
- **Downloads** — has a real Windows Downloads-folder observation path with bounded lifecycle states and explicit indeterminate progress. Browser-matrix validation, clean-checkout packaging evidence, and any future browser-integrated controls remain open.
- **Focus** — has a real Focus Assist path with explicit capability/error facts, observation-only fallback behavior, and a bounded completion card. Needs live validation of OS-version behavior, start/stop, and completion surfacing.

These notes are input for Week 2, where each rule above gets focused tests and a manual walkthrough against this matrix.
