# Stage 5 Continuation: Finish First Real Providers + Land WIP Branch

## Context

The Stage 5 ("First Real Providers") work is mid-flight. The working tree has
~1,630 lines of additions across 31 files plus 7 untracked files, all of which
together turn the desktop status bar from a 6-state prototype into a 7-state
production product with real native data and real native actions:

- **Real data already flows** for system performance, media session, clipboard,
  and focus assist (Provider SDK integrated for the last three; the first two
  are about to be).
- **Real actions** are wired end-to-end for media control (play/pause/next/prev),
  focus stop, download pause/resume/cancel, update install, and notification
  dismiss — the new `*.tsx` templates and `*.ts` runtime files (`a21811a`,
  `194d7a8`, and friends) are the production output of Stage 10 (interactions).
- **A new `notification` status kind** joins the lineup (priority slot 3),
  giving the bar a dedicated surface for foreground-app notifications distinct
  from the focus/clutter it was being mis-mapped into.
- **A 15-second media↔resident alternation** is in place so the bar can
  meaningfully surface system metrics while music is playing without losing
  the now-playing card.

The branch is also missing one structural cleanup flagged in
`docs/ROADMAP-NEXT-V2.md` (Stage 17: Settings CSS class drift — the CSS
class family used by templates just changed to `product-status-template-meta-actions`
and friends, but SettingsPanel was migrated to match only on the icon side).

This plan lands the WIP, hardens the public surface, and prepares the branch
for the next Stage 5 task: wrapping system performance and media session as
first-class `HubProvider` implementations and removing the legacy direct
listener in `useDesktopStatusRuntime`.

## Goals (in order)

1. Land the WIP cleanly — every modified and untracked file commits with tests
   green, no leftover artifacts, no duplicate CSS.
2. Verify the new template/runtime pairing (download/focus/update/notification)
   is consistent with the existing media/clipboard pattern (already shipped).
3. Lock in the public TypeScript surface for the new IPC commands and runtime
   helpers so external callers (Stage 6+ providers) can build on it.
4. Update the documentation to reflect the new 7-state product, the new
   priority order, and the new alternation policy.
5. Set up the next Stage 5 work (system performance + media session as
   `HubProvider`) so it can be picked up without re-deriving the architecture.

## Non-Goals

- Implementing `desktopStatusInputRuntime` migration to Provider SDK (this is
  the *next* Stage 5 slice; the plan only makes it easy to start).
- Stage 6 (developer hub providers: Git, Docker, WSL, etc.).
- Bundle splitting, ESLint/Prettier setup, Rust module split, CSP, CI
  (all in `ROADMAP-NEXT-V2.md` Stages 20–29; deferred).
- Replacing the synthetic notification dismiss with real Windows Toast
  dismissal (`lib.rs` already documents this as future work).

## Critical Files

### Land (modified, in working tree)
- `src-tauri/Cargo.toml` — adds `Win32_System_Threading`, `Win32_System_Com`,
  `Win32_System_WinRT` to windows-sys/windows features. Required for the new
  async-friendly WinRT and `WriteFile` paths that will be used by Stage 5+2
  download/notification providers.
- `src-tauri/src/lib.rs` — registers 5 new IPC commands:
  - `stop_focus_session` → flips `NFPEnabled = 0` in the registry
  - `pause_download` / `resume_download` / `cancel_download` → stub returning
    `{ success: true }` (no real download manager yet — explicit
    "not-implemented" honesty)
  - `install_update` / `dismiss_notification` → stubs returning
    `{ success: true }` for the synthetic notification lifecycle
  All are non-blocking and return the shared `DownloadControlResult` shape.
- `src/types/hub.ts` — adds the `notification` member to
  `DesktopStatusKind`, `DesktopStatusState`, and `DesktopStatusStateMap`;
  adds the `DesktopNotificationState` shape (`app`, `sender`, `message`).
- `src/data/desktopStatusConfig.ts` — adds `notification` to
  `TEMPLATE_ORDER` (slot 7) and `PRIORITY_ORDER` (slot 3, between
  `update` and `download`); adds the `notificationEyebrow` chrome key and the
  default state template.
- `src/runtime/tauriRuntime.ts` — extends `TauriMediaSessionStatus["code"]`
  with `"sta-timeout"` to match the Rust side's new timeout-aware
  classification. Pairs with `f743274`.
- `src/state/desktopStatusState.ts` — initializes the `notification` member
  of `cloneStateMap` (was missing; would `undefined`-regress if a real
  notification state arrived).
- `src/state/desktopStatusAggregation.ts` — promotes `notification` from a
  clipboard-aliased mock fallback to a first-class kind. The
  `snapshotNotificationEvent` now returns `DesktopNotificationState`
  (was `DesktopClipboardState`); `deriveStateOverrides` populates
  `overrides.notification`; `deriveActiveKinds` recognizes the
  `notification` + `source === "notification"` pair.
- `src/state/desktopStatusScheduler.ts` — adds the **15-second
  media↔resident alternation**:
  - New constant `DESKTOP_STATUS_MEDIA_ALTERNATE_WINDOW_MS = 15_000`.
  - New `shouldAlternateMediaWithResident(...)` helper that flips the
    visible kind when both are active+available and the previous
    decision was `≥15s` ago, and only when no higher-priority kind
    (focus/update/notification/download) is active.
  - Initial-decision logic now picks `media` (the more interesting
    state) on first call when both media and resident are eligible.
  - The priority lookup table is now derived from
    `DESKTOP_STATUS_PRIORITY_ORDER` (single source of truth).
- `src/state/desktopStatusState.test.ts` — bumps the 6-template listing
  assertion to 7 (`[..., "notification"]`).
- `src/state/desktopStatusAggregation.vitest.ts` — `clipboard` →
  `notification` in the multi-active-kind assertion.
- `src/state/desktopStatusAggregation.test.ts` — same update.
- `src/features/desktop/components/SettingsPanel.tsx` — registers
  `notification: Bell` in `TEMPLATE_ICON_MAP` so the template picker
  in the settings panel renders the correct icon.
- `src/features/desktop/DesktopPage.tsx` — renders the new
  `NotificationStatusTemplate` branch.
- `src/features/desktop/hooks/useDesktopStatusRuntime.ts` — adds a
  1-second wall-clock heartbeat so the media↔resident alternation
  advances on `Date.now()` even when no upstream event is firing
  (otherwise the alternation would stall until the next media/system
  event arrives, which can be minutes while music is playing).
- `src/features/desktop/templates/{Clipboard,Download,Focus,Update}StatusTemplate.tsx`
  — each template now exposes a primary action button bound to its
  runtime helper, with consistent i18n keys and a `.product-status-toast`
  failure surface (e.g. `clipboard.openFailed`,
  `download.controlFailed`, `focus.stopFailed`,
  `update.installFailed`).
- `src/features/desktop/templates/MediaStatusTemplate.tsx` — adds
  `unavailable`/`unsupported` states (badge + disabled controls +
  hidden shimmer), passes `shimmer` to `StatusRail` so the in-flight
  gradient only appears while music is actively playing and progress
  is mid-range.
- `src/features/desktop/templates/StatusRail.tsx` — adds the `shimmer`
  prop and conditionally renders the
  `product-status-track-shimmer` overlay.
- `src/features/desktop/templates/{Clipboard,Download,Focus,Update,Media,Resident}StatusTemplate.vitest.tsx`
  — new tests covering action button wiring, i18n keys, toast surface
  on failure, shimmer rule, unavailable states, source health
  indicator, and the new `product-status-template-meta-actions`
  wrapper.
- `src/i18n/{en,zh-CN}.json` — new keys for `notification`,
  `clipboard.openInBrowser`, `media.unavailable.badge`,
  `focus.stop`, `download.{pause,resume,cancel,controlFailed}`,
  `update.{installNow,installFailed}`,
  `notification.{dismiss,dismissFailed}`,
  `media.{play,pause,playPause,next,controlFailed}`,
  plus `template.notification` and `states.notification` blocks.
- `src/styles/globals.css` — adds the `product-status-track-shimmer`
  rule (and `prefers-reduced-motion` guard), the
  `product-status-template-meta-actions` wrapper rule, the
  `.product-status-template-meta` `font-variant-numeric: tabular-nums`
  alignment fix, and the removed BOM on the `@tailwind base;` line.
- `src/test/fixtures.ts` — adds `mockNotificationState(...)` for
  vitest parity with the existing `mockMediaState`, `mockClipboardState`,
  etc.

### Land (untracked, new files)
- `src/features/desktop/templates/NotificationStatusTemplate.tsx` —
  the new template. Renders `Bell` icon, title, subtitle, sender,
  message, and a primary dismiss action that calls
  `dismissNotification()`; surfaces a `.product-status-toast` on
  failure.
- `src/features/desktop/templates/NotificationStatusTemplate.vitest.tsx`
  — 15 vitest cases (rendering, dismiss action, toast on
  `success=false`, no toast on `undefined`, eyebrow, source health
  indicator, class hooks, meta wrapper, state overrides, icon
  sizing).
- `src/runtime/{downloadControlRuntime,focusStopRuntime,notificationDismissRuntime,updateInstallRuntime}.ts`
  — four small IPC wrappers. Each takes a Tauri command name, calls
  `getTauriInvoke()`, returns `{ success: boolean }` or `undefined`
  on no-Tauri. Pattern matches the existing
  `mediaControlRuntime.ts` / `clipboardControlRuntime.ts`.
- `src/styles/globals.css.head` — a 699-line head snapshot of
  `globals.css` (pre-shimmer + pre-meta-actions changes). **This
  is a working-tree artifact and should be deleted before
  committing**; the live CSS is in `globals.css`.

### Touch lightly (documentation)
- `docs/product/ROADMAP.md` — Stage 5 "What remains" list shrinks
  (notification template + dismiss action are now done); add the
  notification row to the "What is real today" list.
- `docs/plans/IMPLEMENTATION_PLAN.md` — bump the current Stage 5
  paragraph; add a "Stage 5+1: WIP landing" reference linking
  to this plan.
- `docs/ROADMAP-NEXT-V2.md` — leave untouched (it remains the
  next-iteration roadmap; this plan doesn't execute any of its
  stages).

## Patterns to Reuse

- **`createProviderShell(...)`** (`src/providers/providerShell.ts`) — the
  shared factory encapsulating lifecycle/listener boilerplate. Use this
  for the Stage 5+2 system performance and media session providers.
- **`createRealClipboardProvider()`** (`src/providers/realClipboardProvider.ts`)
  and **`createRealFocusProvider()`** (`src/providers/realFocusProvider.ts`)
  — the canonical patterns for native providers that listen to a Tauri
  event and emit a single `HubEvent` per change. The Stage 5+2 system
  performance and media session providers should follow these exactly,
  replacing the `useEffect(..., [])` direct-listener blocks in
  `useDesktopStatusRuntime.ts`.
- **`getTauriInvoke()` + typed `TauriInvoke`** (`src/runtime/tauriRuntime.ts`)
  — the canonical IPC entry. Every new runtime helper uses this; no
  raw `@tauri-apps/api/core` imports in template files.
- **`mockSourceHealth({ kind, quality })`** (`src/test/fixtures.ts`) —
  the canonical test fixture for `GuestProviderSourceHealth`. Use this
  in every new vitest file, never hand-roll a `sourceHealth` object.
- **`useDownloadPaused` local hook** in
  `DownloadStatusTemplate.tsx` — the canonical pattern for templates
  that need a single toggle state (used by pause/resume). Reuse the
  same pattern in the Stage 5+2 download watcher when it lands.
- **`.product-status-toast` + `useState` + `setTimeout(1600)`** — the
  canonical "transient failure feedback" pattern, already used by
  media, clipboard, download, focus, and update templates. Reuse for
  any new action button.

## Reusable Constants (already defined)

- `DESKTOP_STATUS_MEDIA_ALTERNATE_WINDOW_MS = 15_000`
  (`src/state/desktopStatusScheduler.ts`) — exported.
- `DESKTOP_STATUS_PRIORITY_ORDER` and `DESKTOP_STATUS_TEMPLATE_ORDER`
  (`src/data/desktopStatusConfig.ts`) — exported, used by
  scheduler/aggregation/priority-order tests.
- `MEDIA_ALTERNATION_HEARTBEAT_MS = 1_000` and
  `CLIPBOARD_DISPLAY_WINDOW_MS = 5_000` — defined in
  `useDesktopStatusRuntime.ts`; do not duplicate.

## Implementation Plan

### Slice 1 — Clean up the working tree (1 commit)
1. Delete `src/styles/globals.css.head` (working-tree artifact).
2. Verify the BOM-on-first-line in `src/styles/globals.css` is gone
   (the diff already shows the fix landed).
3. Re-stage all `M` files; `git add` the new files; **do not amend
   any prior commit** — this is a fresh commit on the WIP branch.

### Slice 2 — Lock the public surface (no functional change, 1 commit)
Already shipped in the diff:
- `TauriMediaSessionStatus["code"]` widened to include `"sta-timeout"`.
- `MediaControlResult` / `DownloadControlResult` shapes exported.
- New exported helpers: `sendDownloadControl`, `stopFocusSession`,
  `dismissNotification`, `installUpdate` (all in `src/runtime/`).
- New exported type: `DesktopNotificationState`
  (in `src/types/hub.ts`).

Verification (no code change needed):
```bash
npx tsc --noEmit
```
Should pass clean.

### Slice 3 — Documentation sync (1 commit)
1. `docs/product/ROADMAP.md` — Stage 5 "What remains" → remove the
   notification template line; "What is real today" → add a
   notification row.
2. `docs/plans/IMPLEMENTATION_PLAN.md` — add a "Stage 5 — WIP
   landing (this plan)" subsection under "Current Technical Stack",
   pointing at `docs/plans/STAGE5_WIP_LANDING.md` (this file).
3. Leave `docs/ROADMAP-NEXT-V2.md` untouched.

### Slice 4 — Prepare the next Stage 5 slice (system perf + media as Providers) (no commit, in this plan only)
Document the hand-off in this plan (the **Next Steps** section below).
The actual provider migration is a separate plan; this plan ends with
the WIP landed and the architecture ready.

## Verification

End-to-end checks, in order. All must pass before merging.

```bash
# 1. TypeScript
npx tsc -b

# 2. Vitest (component + aggregation)
npm run test:vitest

# 3. Legacy node test runner (state + providers + runtime)
npm run test:state
npm run test:providers
npm run test:runtime

# 4. Full QA gate (everything above + showcase interaction + build)
npm run qa
```

Manual checks on a real Windows machine (Tauri runtime required):

1. **Media alternation.** Start a long track (≥30s). Watch the bar:
   - 0–15s: media template
   - 15–30s: resident template (with the `is-playing` shimmer hidden)
   - 30–45s: media
   - If a Focus / Update / Notification / Download arrives, the bar
     switches to that kind immediately and the alternation pauses.
2. **Media unavailable.** Stop the track, wait 5s, kill the player.
   Verify:
   - `product-status-media-unavailable-badge` shows "No player detected"
   - All three control buttons are `disabled`
   - `.product-status-track-shimmer` is not in the DOM
3. **Notification template (mock fallback).** With no real notification
   source active, trigger the mock provider from the showcase
   (`/showcase` → "Notification" tile). Verify the bar swaps to
   notification, the `Bell` icon shows in SettingsPanel's template
   picker, and the dismiss button calls `dismiss_notification` (check
   the Rust log) without throwing.
4. **Clipboard URL open button.** Copy a URL like `https://example.com`
   to the clipboard. Verify the `ExternalLink` button appears; click
   it and confirm the default browser opens (Windows
   `start <url>`). For non-URL text the button does not appear.
5. **Download controls (stub).** Render the download template; click
   pause/resume/cancel. Each invocation should hit the Rust stub and
   return `{ success: true }`; the local `paused` state and the
   `.product-status-toast` (on failure) should behave as the vitest
   cases cover.
6. **Focus stop.** Start a focus session (or simulate one). Click
   `MoonStar` in the focus template; verify the Rust log shows
   `stop_focus_session` and the registry `NFPEnabled` flips to `0`.
7. **Update install / notification dismiss stubs.** Both should call
   the Rust stub and return `{ success: true }`. They never throw, so
   no toast appears.
8. **CSS sanity.** Inspect the bar; confirm the new
   `product-status-template-meta-actions` wrapper is visible in DevTools
   on every guest template (resident excluded), and that the shimmer
   animation runs only on `media` while `is-playing`. Toggle
   `prefers-reduced-motion: reduce` in DevTools and confirm the
   shimmer disappears.

## Risks & Open Questions

- **Scheduler alternation interaction with preferredKind.** The
  alternation runs *after* the initial priority decision. If a user
  clicks the rail to pin a preferred kind, the preferred window
  (20s) is shorter than two alternation cycles (30s), so a manual
  preference can be silently overridden. The current code returns
  the alternation result regardless of the preferred window. **This
  is the same behavior as before this WIP** (preferred expired
  before alternation, so the priority path ran), so we are not
  regressing — but it's worth flagging for the next iteration.
- **CSS class name: `product-status-template-meta-actions` is
  unscoped.** If two templates both render an `.meta-actions` row
  (e.g. the new Notification + the existing Clipboard), there's no
  collision today because each template has at most one. We
  should promote this to a CSS class with a stable BEM-style prefix
  in the next refactor.
- **The new IPC stubs (`pause_download`, `install_update`,
  `dismiss_notification`) return success even though no real backend
  exists.** This is documented in the Rust code and is the right
  call for a v0.8 demo build, but the comment in `lib.rs` already
  calls out that a real provider must replace them.
- **`globals.css.head` may have been kept as a backup.** If a
  reviewer asks for it, point them to the commit history — it is
  not a runtime file.

## Next Steps (separate plan, post-merge)

Stage 5+2 — migrate the two remaining legacy paths into the Provider SDK.

1. **Create `src/providers/realMediaSessionProvider.ts`** following
   the `realClipboardProvider` pattern:
   - `start(handle)` calls `loadTauriMediaSessionStatus()` once for
     the initial snapshot, then subscribes to `onMediaSessionChanged`
     for live updates.
   - Maps `TauriMediaSessionStatus` → `HubEvent` (type `"media"`,
     source `"media"`) and emits via `handle.emit([...])`.
   - Calls `handle.markDegraded()` on `sta-timeout` or `provider-failed`.
2. **Create `src/providers/realSystemPerformanceProvider` in the
   same shape as the existing one** (it's already there at
   `src/providers/realSystemPerformanceProvider.ts`; the work is to
   register it in `providerManager.ts` and remove the legacy
   `loadSystemPerformanceStatus` polling from `useSystemPerformance`).
3. **Remove the direct `useEffect(() => onMediaSessionChanged(...))`
   block in `useDesktopStatusRuntime.ts` and the
   `applyDesktopStatusSnapshot` media bypass**; subscribe to the
   `HubEventBus` for media events instead, and let
   `aggregateDesktopStatusInput` do the work.
4. **Register the media provider in `providerManager.ts`** and
   remove the special-case comment about media not going through
   the pipeline.
5. **Update tests**: `MediaStatusTemplate.vitest.tsx` and the
   legacy runtime tests need to reflect the new pipeline path;
   `useDesktopStatusRuntime` tests (currently missing) become
   feasible to write.

That work is a separate plan (likely titled
"Stage 5+2: System Performance + Media as Provider SDK") and is
explicitly **not** part of this plan.
