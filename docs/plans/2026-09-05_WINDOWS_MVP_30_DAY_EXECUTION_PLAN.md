# 2026-09-05 Windows MVP 30-Day Execution Plan

> Status: active delivery plan for 2026-09-05 through 2026-10-04
>
> Parent plans: [GLANCE_BAR_PLAN.md](GLANCE_BAR_PLAN.md) and [MVP_LAUNCH_PLAN.md](../product/MVP_LAUNCH_PLAN.md)
>
> Product contract: [MVP_SCENARIO_MATRIX.md](../product/MVP_SCENARIO_MATRIX.md)

## 1. Outcome

At the end of this plan Glance Bar must have a limited-release Windows MVP candidate that can stay enabled through a normal workday and truthfully present the three MVP states: Media, Downloads, and Focus.

The release candidate is acceptable only when:

1. Every visible state is backed by a verified native fact or an explicit fallback.
2. No estimated value is presented as exact and no unavailable action appears successful.
3. Provider start, stop, restart, error, and stale-data behavior is covered by focused tests.
4. Tray recall, saved preferences, position restoration, lock position, always-float, fullscreen avoidance, and autostart have Windows verification evidence.
5. The display-policy scenarios agree across tests, the product matrix, and a manual walkthrough.
6. At least three testers complete normal-work sessions and findings are recorded.
7. All required TypeScript, Vitest, QA, Rust, and packaging checks pass from a clean checkout.

This month does **not** include macOS/Linux parity, new provider kinds, account or browser integrations, or production activation of Git, Docker, npm, Update, and other non-MVP providers.

## 2. Verified starting point

Baseline commit when this plan was written: `a969b04`.

| Area | Current state | Gap to close |
|---|---|---|
| Provider pipeline | Provider -> HubEventBus -> aggregation -> resolver/scheduler -> UI is established. | Preserve boundaries while tightening capability and lifecycle behavior. |
| Downloads | Windows Downloads-folder polling emits coarse events. | Estimated progress is presented too precisely; completion versus cancellation/failure is not reliable; pause/resume/cancel commands are success stubs. |
| Media | Windows GSMTC path and UI controls exist. | Prove session detection, timeline handling, controls, cleanup, malformed payloads, and restart behavior on Windows. |
| Focus | Windows Focus Assist path and fallback exist. | Prove activation/completion behavior and verify whether the stop action is genuinely supported. |
| Scheduler | Pure policy, 250 ms service, and display-policy tests exist. | Confirm real provider transitions match the scenario matrix and do not leave stale cards. |
| Windows shell | Tray, preferences, autostart, fullscreen avoidance, lock position, and always-float exist. | Persist and restore a dragged position; run repeatable shell verification on an actual Windows build. |
| Release evidence | Automated coverage is broad and a shell review exists. | Produce real-device results, workday soak evidence, tester findings, installer verification, and known limitations. |
| Documentation | MVP plan and scenario matrix exist. | Remove stale statements, especially the fixture-only Download description, as implementation evidence changes. |

## 3. Delivery order and gates

```text
Week 1: truthful Download contract
    -> Gate A: no fake precision or fake controls
Week 2: Media/Focus/runtime hardening
    -> Gate B: all three MVP providers have evidence
Week 3: Windows daily-use shell and soak
    -> Gate C: one workday without a release-blocking failure
Week 4: tester validation and release candidate
    -> Gate D: limited-release decision
```

Do not start a dependent phase while its preceding gate has an unresolved P0 issue. Independent documentation and test-fixture preparation may continue.

## 4. Week 1 — Download truthfulness and scenario alignment

**Dates:** 2026-09-05 through 2026-09-11

**Gate A:** the product observes Windows download activity without claiming unsupported precision, outcomes, or controls.

### Day 1 — freeze the observable contract

- Define the native payload as an observation, not a controllable browser task.
- Support explicit states: `idle`, `active`, `completed`, `ended_unknown`, and `error`.
- Add facts for `progressAccuracy`, `controllable`, capability code, active count, and observation time.
- Keep filenames and paths inside Rust; IPC may contain only bounded enums, counts, percentages when justified, and timestamps.
- Decide that a vanished temporary file is not automatically a successful completion. Report success only when native evidence can confirm it.
- Update Download rows D1-D6 in the scenario matrix before changing UI behavior.

**Deliverable:** reviewed payload contract and updated scenario expectations in the Download implementation PR.

### Days 2-3 — implement honest native and runtime behavior

- Refactor `src-tauri/src/monitoring/mod.rs` so snapshot comparison has one pure transition function that can be unit-tested without a live folder.
- Make `get_download_state` and the event monitor use the same scan/transition rules.
- Treat a missing/unreadable Downloads directory as an explicit error capability, not idle.
- Retain internal temporary names only long enough to compare snapshots; never serialize them.
- Update `src-tauri/src/types.rs` and `src/runtime/system/systemMonitorRuntime.ts` together.
- Clamp numeric input, reject unknown enum values, and map malformed payloads to a degraded provider state.

**Required native cases:** Chrome/Edge `.crdownload`, Firefox `.part`, zero-byte temporary files, multiple simultaneous files, directory errors, shutdown, and unchanged snapshots.

### Day 4 — remove misleading UI and actions

- Update `realDownloadProvider.ts` to emit exact, estimated, or indeterminate progress explicitly.
- Show an indeterminate rail when no trustworthy total is available; do not render `99%` as a substitute for unknown progress.
- Show completion only for confirmed completion. Use neutral wording for `ended_unknown`.
- Hide or disable pause/resume/cancel when `controllable` is false.
- Remove the always-success download command stubs and their frontend success path, or make them return a truthful unsupported result until a real integration exists.
- Ensure a completion/outcome card expires after its documented bounded window and the scheduler returns to the next useful state.

### Day 5 — automated verification

- Add Rust unit tests for scan normalization and every state transition.
- Add runtime parser tests for missing, malformed, unsupported, error, and valid payloads.
- Add provider tests for start, stop, idempotent unsubscribe, initial snapshot, listener failure, and degraded state.
- Add template tests for indeterminate progress, exact progress, no controls, completion, unknown ending, and accessible labels.
- Add scheduler-service coverage proving that terminal download state does not remain stale.

### Day 6 — real Windows matrix

Run a local Tauri build and record results for:

| Browser/situation | Start detected | Active count | Completion result | Cancel result | No private payload |
|---|---:|---:|---:|---:|---:|
| Chrome, one download | required | required | required | required | required |
| Edge, one download | required | required | required | required | required |
| Firefox, one download | required | required | required | required | required |
| Two concurrent downloads | required | required | required | required | required |
| App starts mid-download | required | required | n/a | n/a | required |
| Downloads directory unavailable | explicit error | n/a | n/a | n/a | required |

Record browser version, application commit, expected result, actual result, and issue link. Do not record downloaded filenames or user paths.

### Day 7 — Gate A and merge

- Run all relevant quality gates.
- Update `MVP_SCENARIO_MATRIX.md`, `WINDOWS_SHELL_VERIFICATION.md`, and current provider documentation with the verified result.
- Merge only when no exact percentage or successful control is shown without supporting evidence.
- Carry non-blocking browser-specific limitations into the release known-limitations list.

## 5. Week 2 — Media, Focus, and runtime lifecycle hardening

**Dates:** 2026-09-12 through 2026-09-18

**Gate B:** Media, Downloads, and Focus each have a truthful capability statement, focused automated coverage, and Windows evidence.

### Days 8-9 — Media provider

- Test Windows GSMTC behavior with at least two media applications or browser media sessions.
- Verify playing, paused, stopped, session replacement, application close, unavailable session, missing title, missing artist, missing duration, and invalid timeline.
- Verify previous/play-pause/next independently. Unsupported controls must be disabled; native failures must preserve the last good state and show failure feedback.
- Confirm `start` and `stop` are idempotent, event subscriptions are removed once, and restarting does not duplicate events.
- Add freshness handling so a disconnected session cannot remain labeled Native/Live indefinitely.
- Update Media scenarios M1-M6 with actual Windows evidence.

**PR boundary:** Media provider, media runtime, Media template behavior, focused tests, and Media evidence only.

### Days 10-11 — Focus provider

- Verify the exact Windows Focus Assist fact being read and document OS-version limitations.
- Exercise inactive -> active, profile change, active -> inactive, runtime unavailable, malformed registry/native payload, and app restart while active.
- Audit the Stop action end to end. If it cannot genuinely stop the native session, remove/disable it and label the provider observation-only.
- Verify completion wording and expiry; do not show a stop action after completion.
- Add provider lifecycle, parser, template, aggregation, and scheduler tests for F1-F6.

**PR boundary:** Focus native/runtime/provider/template behavior, focused tests, and Focus evidence only.

### Day 12 — supporting Resident state

- Verify CPU, memory, download speed, and upload speed ranges on a Windows machine.
- Define stale timing and show `Stale`, `Fallback`, or `Unavailable` after polling or IPC failure.
- Confirm resident remains a safe fallback when all MVP sources are inactive.
- Add tests for counter reset, first network sample, malformed data, IPC failure, recovery, and teardown.

### Days 13-14 — cross-provider scenario walkthrough and Gate B

- Walk through simultaneous Focus + Download + Media, Download + Media, and Media + Resident.
- Verify priority, 6-second stability, 12-second preemption, 15/8-second Media/Resident alternation, manual selection, and automatic return.
- Check that an unavailable high-priority provider does not suppress a useful lower-priority state.
- Check that real providers take precedence over mock providers only when their capability is available and healthy.
- Resolve all P0/P1 mismatches between code, tests, and `MVP_SCENARIO_MATRIX.md` before Gate B.

## 6. Week 3 — Windows shell, persistence, diagnostics, and soak

**Dates:** 2026-09-19 through 2026-09-25

**Gate C:** a release build survives one normal workday without losing position, breaking tray recovery, producing repeated noise, or showing misleading live state.

### Days 15-16 — position persistence

- Add optional logical position fields to desktop preferences with backward-compatible deserialization.
- Persist position on drag end, not on every pointer movement.
- Restore the saved position at startup and clamp it to the current monitor work area.
- Recover safely when the saved monitor is removed, DPI changes, coordinates are off-screen, or preference JSON is malformed.
- Ensure Reset Position clears or replaces the saved position deterministically.
- Verify lock-position prevents drag without preventing restore or reset.

**PR boundary:** preferences schema, native window placement, drag-end persistence bridge, focused Rust/frontend tests, and position documentation.

### Day 17 — tray and preference regression pass

- Test install/launch, close-to-tray, tray left-click toggle, Show, Settings, Quit, autostart on/off, always-float on/off, fullscreen avoidance on/off, and lock position.
- Restart after every persisted preference change and verify the restored behavior.
- Test with one and two monitors when hardware is available; record untested configurations explicitly.

### Day 18 — diagnostics and bug-report evidence

- Provide a privacy-safe diagnostics view or export containing application version, platform, provider capability/health, last error code, and last checked time.
- Exclude paths, filenames, clipboard contents, media titles, usernames, credentials, and raw native payloads.
- Document a reproducible bug-report template: build, Windows version, steps, expected, actual, diagnostics, and optional redacted screenshot.

**PR boundary:** diagnostics data contract, UI/export, tests, and bug-report documentation.

### Days 19-20 — clean build and packaging rehearsal

- Build from a clean checkout using documented Node, Rust, and Tauri prerequisites.
- Verify the packaged app launches, creates its configuration safely, closes to tray, reopens, and uninstalls without leaving a running process.
- Confirm no development fixture or showcase-only provider is enabled in the production composition path.
- Run a dependency/security review and record accepted risks without silently upgrading unrelated major versions.

### Day 21 — workday soak and Gate C

Run the packaged build for at least six hours during ordinary work. Record:

- every unexpected card transition;
- stale or misleading status;
- duplicate events or repeated toasts;
- CPU/memory growth at start, midpoint, and end;
- tray/window recovery failures;
- fullscreen or multi-monitor interference;
- provider recovery after source applications close and reopen.

Gate C passes only when there is no unresolved crash, stuck topmost window, unrecoverable tray state, privacy leak, fake-live state, or repeated disruptive notification.

## 7. Week 4 — tester validation and release candidate

**Dates:** 2026-09-26 through 2026-10-04

**Gate D:** evidence supports a limited Windows release, or the release is explicitly deferred with blocking issues named.

### Days 22-23 — prepare validation build

- Freeze MVP scope and create a versioned candidate build.
- Publish install, first-run, tray recovery, settings, and feedback instructions.
- Publish known limitations, including browser/Windows-version coverage and observation-only actions.
- Prepare a 30-60 minute guided checklist plus a normal-work-session checklist.

### Days 24-27 — three-tester validation

Each tester must complete at least two sessions, including one normal work session. Capture:

1. A moment when Glance Bar avoided a context switch.
2. A distracting or unnecessary transition.
3. A transition whose cause was unclear.
4. A missing or misleading action.
5. Whether they would leave the bar enabled.
6. Any crash, positioning, tray, privacy, or stale-state issue.

Classify findings:

- **P0:** crash, data/privacy exposure, impossible recovery, or false successful action.
- **P1:** misleading live state, common stuck state, broken primary shell behavior, or unexplained frequent transition.
- **P2:** clarity, visual polish, uncommon edge case, or enhancement.

P0 blocks the candidate. P1 must be fixed or explicitly accepted with a limited audience and workaround. P2 goes to the post-MVP backlog.

### Days 28-29 — focused release fixes

- Fix only findings required for the release criteria.
- Add a regression test for every P0/P1 code fix.
- Repeat the affected manual scenario and a two-hour abbreviated soak.
- Avoid unrelated refactors, new providers, or visual redesign during candidate stabilization.

### Day 30 — release decision

- Run the complete quality gates from a clean checkout.
- Confirm the scenario matrix, shell verification, known limitations, tester report, and version number refer to the same candidate commit.
- Produce a release decision with one of: `GO — limited Windows release`, `NO-GO — blockers`, or `EXTEND — evidence incomplete`.
- If GO, tag and publish the candidate through the repository's protected release process.
- If NO-GO or EXTEND, list each blocking fact, owner role, next action, and recheck date.

## 8. Planned PR sequence

| Order | Suggested branch | Scope | Required evidence |
|---:|---|---|---|
| 1 | `fix/download-capability-honesty` | Download contract, UI, false controls, tests, D1-D6 docs | Automated tests + Windows browser matrix |
| 2 | `feat/windows-download-observation` | Native snapshot transitions and errors if too large for PR 1 | Rust tests + privacy payload inspection |
| 3 | `fix/media-provider-hardening` | Media runtime/provider/actions/template | M1-M6 evidence with two players |
| 4 | `fix/focus-provider-hardening` | Focus runtime/provider/action/template | F1-F6 evidence and OS limitations |
| 5 | `fix/resident-health-freshness` | System metrics freshness and recovery | Runtime/provider tests + Windows sampling |
| 6 | `feat/window-position-persistence` | Position schema, save, restore, clamp, reset | Restart + monitor-change matrix |
| 7 | `feat/privacy-safe-diagnostics` | Diagnostics and bug-report path | Privacy review + tests |
| 8 | `qa/windows-mvp-release-candidate` | Findings, release fixes, docs, packaging evidence | Full gates + tester report + soak |

If a PR crosses two ownership areas, split it unless the shared contract would otherwise leave the repository uncompilable. Every PR description must list its user-visible claim, unsupported behavior, tests run, manual evidence, privacy impact, and rollback path.

## 9. File ownership map

| Workstream | Primary files |
|---|---|
| Download native observation | `src-tauri/src/monitoring/mod.rs`, `src-tauri/src/commands/system.rs`, `src-tauri/src/types.rs` |
| Download runtime/provider/UI | `src/runtime/system/systemMonitorRuntime.ts`, `src/providers/impl/real/realDownloadProvider.ts`, `src/features/desktop/templates/DownloadStatusTemplate.tsx` |
| Media hardening | `src-tauri/src/media/`, `src-tauri/src/commands/media.rs`, `src/runtime/system/mediaControlRuntime.ts`, `src/providers/impl/real/realMediaSessionProvider.ts` |
| Focus hardening | `src-tauri/src/commands/focus.rs`, `src/runtime/`, `src/providers/impl/real/realFocusProvider.ts`, `src/features/desktop/templates/FocusStatusTemplate.tsx` |
| Scheduling | `src/state/desktopStatusScheduler.ts`, `src/runtime/scheduler/schedulerService.ts`, focused tests |
| Window persistence | `src-tauri/src/preferences.rs`, `src-tauri/src/commands/window.rs`, `src-tauri/src/types.rs`, desktop drag/runtime hooks |
| Diagnostics | provider health/state projections, settings UI, native bounded metadata command if required |
| Product evidence | `docs/product/MVP_SCENARIO_MATRIX.md`, `docs/qa/WINDOWS_SHELL_VERIFICATION.md`, new release/test reports outside `docs/archive/` |

## 10. Quality gates

Run focused tests while developing. Run the complete suite at Gates B, C, and D:

```bash
npm run typecheck
npm run lint -- --max-warnings=0
npm run test:vitest
npm run qa
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -W clippy::all
```

For native/provider changes, also run the smallest Rust and Vitest targets that prove the changed behavior before the full suite. A check that cannot run must be recorded as missing evidence; it is not a pass.

## 11. Daily execution discipline

- Start each day from updated `main` and work on a focused branch.
- Keep one user-visible claim and one ownership area per PR where practical.
- Write or update tests in the same PR as behavior changes.
- Update current documentation in the same PR when a contract or verified behavior changes.
- Log manual evidence against a commit hash and environment; do not rely on memory or screenshots alone.
- Reclassify a capability immediately when evidence disproves its current claim.
- Do not edit archived plans to make current behavior look complete.

## 12. Definition of done

This plan is complete only when all Gate D evidence is present and the release decision is recorded. Passing unit tests alone is insufficient. The final evidence set must contain:

- automated quality-gate output from the release-candidate commit;
- completed Media, Download, Focus, and shell scenario results;
- one successful six-hour workday soak;
- findings from at least three testers;
- a privacy-safe known-limitations document;
- installer launch, tray recovery, preference restore, and uninstall results;
- the final GO/NO-GO/EXTEND decision and its commit or release reference.
