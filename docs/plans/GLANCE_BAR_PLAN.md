# Glance Bar Unified Plan

> Active product and execution plan. Updated against the repository on 2026-10-25.

The dated delivery plan currently in force is [2026-09-05_WINDOWS_MVP_30_DAY_EXECUTION_PLAN.md](2026-09-05_WINDOWS_MVP_30_DAY_EXECUTION_PLAN.md). It converts the priorities below into daily work, PR boundaries, evidence gates, and a 30-day Windows MVP release decision.

## Product direction

Glance Bar is a compact, privacy-safe desktop status hub. It selects one clear status presentation from provider events and runtime facts, while keeping source collection outside the UI.

## Current baseline

- Desktop product surface: `src/features/desktop/`; showcase and QA surface: `src/features/showcase/`.
- Status path: `Provider -> HubEventBus -> aggregation -> resolver/scheduler -> UI`.
- Provider registry contains 9 real providers and 4 mock providers; the production desktop composition explicitly starts real providers only, while mocks remain showcase fixtures.
- Scheduler: pure policy in `src/state/desktopStatusScheduler.ts` and stateful service in `src/runtime/scheduler/schedulerService.ts`.
- Native shell: commands are split under `src-tauri/src/commands/`; `lib.rs` is application assembly.
- Verification snapshot: 59 Vitest files and 1015 tests pass, including the Showcase interaction journey and production build; Rust unit tests are 97 (CI runs them since #41). Run the quality commands rather than relying on this count.

## Closeout checkpoint — 2026-09-05

- The Download Provider truthfulness work, runtime lifecycle hardening, privacy-safe diagnostics, tray preference fixes, and production-composition QA are merged on `main` through PRs #32–#39.
- PR #39 adds an executable guard that the `/desktop` path uses `{ realProviders: true, mockProviders: false }` and that Showcase fixtures do not cross the route boundary.
- Local `npm run qa`, typecheck, and lint are green; the post-merge `main` CI run is green across Node 20/22, Vite build, TypeScript, ESLint, and Rust on Ubuntu, macOS, and Windows.
- Development is paused at this checkpoint. Physical Windows packaging/install, tray recovery, autostart, restart, DPI/multi-monitor, uninstall, workday soak, and three-tester evidence remain open before a limited-release decision.

## Development checkpoint — 2026-10-24 (post-window autonomous wave)

The 2026-09-05 evidence window lapsed with the hardware-dependent items still open, so development resumed on the code-and-documentation tracks that do not require physical Windows evidence. Merged on `main` through PRs #41–#46 at `27dc8f0`:

- **#41 — CI now runs `cargo test`** in the Rust job; the 22 then-existing Rust unit tests had never been executed by CI.
- **#42 — Gate D preparation documents** exist under `docs/release/` (known limitations, tester guide, tester checklist, release decision template). They are drafts that describe preparation state, not release evidence; every unverified item is explicitly marked pending evidence.
- **#43/#46 — Linux warning hygiene**: zero unused-import warnings in `commands/`, zero dead-code warnings in `window/` and `monitoring/` on the Linux target (platform items are cfg-gated, not deleted; unit tests keep compiling on Linux via `cfg(any(windows, test))`).
- **#44 — Tray honesty fix**: tray menu labels are English and the tooltip reads `Glance Bar` (was a legacy product name). Full tray-menu i18n that follows the in-app language switch remains a backlog item recorded in `docs/release/KNOWN_LIMITATIONS.md` §6.
- **#45 — Gated Linux MPRIS observation**: `media/linux.rs` now contains a complete MPRIS (zbus 5 blocking) observation implementation with 18 pure-logic unit tests, gated behind `MPRIS_VALIDATED = false` per the STAGE6 rule — the Linux media capability still reports `unsupported` until real-desktop validation (multi-player behavior, connection rebuild, hung-player timeout bound). Remaining validation work and the not-yet-wired Linux event path are listed in the STAGE6 checkpoint section.

Verification snapshot at `27dc8f0` (run in WSL Ubuntu, plus a green CI matrix on every PR): typecheck, lint, and build pass; Vitest 58 files / 919 tests pass; `cargo check`, `cargo fmt -- --check`, and CI-level clippy pass; Rust unit tests 40/40 (22 → 40 with the MPRIS tests). Remaining clippy dead-code warnings are confined to `src/media/**` (platform-dispatch constants and the macOS/Windows provider types) and are the next hygiene item.

Open items are unchanged in kind: physical Windows packaging/install, tray recovery, autostart, restart, DPI/multi-monitor, uninstall, workday soak, and three-tester evidence remain open before the Gate D limited-release decision; MPRIS real-desktop validation precedes any Linux availability claim; tray-menu i18n and the `media/` dead-code warnings are tracked follow-ups.

### Same-day continuation — PRs #48–#54 at `3f2c0eb`

- **#48 — media dead-code cleared**: the crate now has zero dead-code warnings on the Linux target (22 at session start). The macOS provider was rewired into real use instead of deleted, keeping the next platform capability coherent.
- **#49 — i18n locale key parity**: zh-CN gained the two keys missing against en (`media.progressUnknown`, `download.progressUnknown`); deterministic direct-JSON comparison shows 178/178 keys both locales.
- **#50 — contributor docs gates aligned** with what CI enforces (fmt, test, prettier added to AGENTS.md / CONTRIBUTING.md).
- **#51 — whole-tree prettier + CI Prettier gate**: `npm run format:check` is green and now enforced in CI. One semantic hazard found and fixed en route: prettier-plugin-tailwindcss strips the interpolated leading space inside template-literal class names; conditional class names are now built with array `.filter(Boolean).join(" ")`.
- **#52 — tray menu follows the app language**: preferences gained a backward-compatible `language` field (`AppLanguage`, en/zh-CN, English fallback), tray labels live in a bounded in-Rust table, and the menu rebuilds through the existing preference propagation path. Frontend persists the choice on switch and initializes i18next from it at startup. Hardware verification remains pending evidence.
- **#53 — the in-window right-click context menu follows the same language preference** (7-row bilingual label table, cached menu rebuilt through the same propagation path; check states preserved).
- **#54 — gated macOS media observation**: mirrors the Linux MPRIS honesty pattern — `MACOS_MEDIA_VALIDATED = false` returns the identical bounded unsupported payload; a pure mapping layer (13 unit tests) compiles and runs on Linux, the objc2/MPNowPlayingInfoCenter path is cfg-gated and its first real macOS compile happened in this PR's CI matrix. Whether MPNowPlayingInfoCenter exposes system-aggregated info to an observer process is the documented open question for real-Mac validation.

Verification snapshot at `3f2c0eb` (WSL Ubuntu; green CI matrix on every PR): typecheck, lint, format:check, and build pass; Vitest 59 files / 926 tests; `npm run qa` — including the Showcase interaction journey under real Chromium — passes end-to-end for the first time this session; `cargo check`, `cargo fmt -- --check`, CI-level clippy, and `cargo test` 65/65 pass with zero dead-code warnings on the Linux target.

### Same-day continuation — PRs #56–#59 at `a990f18`

- **#56 — typed NSNumber bindings** for the macOS media number extraction (the `NSValue` feature; msg_send probing removed; semantics preserved, integer truncation deliberately avoided).
- **#57 — browser smoke journey for `/desktop`** (`qa:desktop:interactions`): genuine no-Tauri preview, console/page-error guards, mock-boundary assertions. Writing it surfaced the next item.
- **#59 — developer provider honesty restored (P1-severity fix)**: the npm/git/docker "real" providers were unconditional Stage 6 stubs returning fabricated data (`available: true`, "npm scripts 1 running") labeled `native` — in a plain browser and therefore in the packaged app too. They now report `not-implemented`, emit nothing, and never activate the developer card; aggregation derives `native` quality only from explicitly available events; the browser journey is re-grounded to the truthful rendering (resident fallback, source honestly labeled Unavailable). KNOWN_LIMITATIONS gained section 3.5 recording the not-implemented state until a real native contract exists.
- **#58 — showcase journey process hygiene**: the QA script no longer leaks an orphaned Vite process group in WSL (detached spawn + group kill + bounded reap-wait), and two real flake paths (networkidle stall, storage-denied init script) are hardened.

Verification snapshot at `a990f18`: same gates as above, all green — both browser journeys run for real (desktop + showcase), Vitest 59 files / 926 tests, Rust 65/65. Known follow-up recorded by #59: the resident fallback card still displays placeholder metric values (honestly labeled Unavailable) — display refinement pending.

### Same-day continuation — PRs #61–#64 at `9ed86e0`

- **#61 — resident unavailable display refined**: the resident card no longer renders placeholder metric values when the native source is unmeasured — CPU/Memory show em-dashes over the empty indeterminate rail (accessible names via a new bilingual `metrics.usageUnavailable` key), network slots show dashes; live/stale measured rendering is unchanged behind the unit-tested `hasMeasuredResidentMetrics` predicate. This closes the follow-up recorded at `a990f18`.
- **#62/#63 — QA composition and i18n hygiene**: `npm run qa` now runs the desktop interaction journey between the showcase journey and the build; 11 provably-unused locale keys were removed from both locales (179 → 168, parity verified; the 16 dynamic `template.${kind}` keys kept with cited runtime composition evidence).
- **#64 — gated Linux EWMH window policy**: `window/linux.rs` replaces its Stage 6 no-ops with a full implementation behind `LINUX_WINDOW_VALIDATED = false` — z-order via `_NET_WM_STATE` messages, `_NET_WM_WINDOW_TYPE_UTILITY` styling, fullscreen detection via `_NET_ACTIVE_WINDOW` (conservative false on every failure), XID via raw-window-handle with a Wayland no-op path, and a 1s watchdog around the timeout-less x11rb 0.13 blocking API. 15 pure-logic unit tests; a real WSLg smoke probe validated the connection machinery and documented that WSLg advertises only partial EWMH (z-order conservatively no-ops there even post-gate). Full-EWMH window managers remain the validation target before the gate flips.

Verification snapshot at `9ed86e0`: all gates green — full `npm run qa` chain (Vitest 59 files / 931 tests, both browser journeys, build), `cargo check` / `fmt` / CI-level clippy, `cargo test` 80/80, zero dead-code warnings on the Linux target. All three platform capabilities implemented this session (Linux MPRIS media, macOS media, Linux EWMH window) remain gated behind their VALIDATED constants pending real-hardware validation.

### Same-day continuation — PRs #66–#67 (packaging evidence and limitations audit)

- **#66 — first packaging evidence**: a real Linux `.deb` was built from `main` at `91feec8` (`npx tauri build --bundles deb`, exit 0) and inspected read-only (dpkg-deb metadata, dependency declarations, embedded frontend binary, hicolor icons, .desktop entry). Recorded in `docs/qa/PACKAGING_REHEARSAL.md` with commit, sha256, and an explicit scope statement: it validates the Linux packaging pipeline only — Windows installer production, packaged-runtime behavior on any OS, and code signing remain open (KNOWN_LIMITATIONS 1.1 now carries the pointer).
- **#67 — KNOWN_LIMITATIONS re-audited** against the tree at `91feec8`: four stale wordings corrected (CI matrix list gained the Prettier-check and cargo-test steps; "fixed on this branch" bullets de-branched to merged PR numbers; audit provenance added). Every other row confirmed with file:line citations; hardware-dependent claims explicitly left as pending evidence rather than asserted.

### Continuation — PRs #69–#71 (Wave 13, 2026-10-24/25)

- **#69 — showcase screenshots in the qa chain**: a self-contained three-viewport screenshot script (1366x768 / 1440x900 / 1920x1080, same server-lifecycle idiom as the journeys) replaces the server-assuming npx chain; `npm run qa` now ends with the screenshot step before build.
- **#70 — Linux Focus feasibility research** (`docs/plans/LINUX_FOCUS_FEASIBILITY.md`): GNOME DND = `org.gnome.desktop.notifications show-banners`, readable in-process via gio (already in the dependency tree via Tauri's GTK stack — no shell-out); KDE = the `org.freedesktop.Notifications` `Inhibited` property on plasmashell via the existing zbus dependency; XFCE verified to exist but conservative-unsupported in slice one; observation-only mapping (controllable honestly false) with a named validation checklist. Implementation blueprint for a future gated `LINUX_FOCUS_VALIDATED` provider.
- **#71 — candidate freeze process** (plan Days 22-23 preparation): `scripts/release-precheck.mjs` aggregates all 11 quality gates (clean-tree check, per-gate child processes with group-kill, per-run logs, PASS/FAIL table, final `RELEASE-PRECHECK PASSED <commit>` verdict) — verified with a genuine full-suite PASSED run on this branch's commit; `docs/release/CANDIDATE_FREEZE.md` is the freeze runbook (precheck, evidence recording, annotated `candidate/vX.Y.Z-rcN` tag, doc updates) with the explicit note that freezing verifies nothing by itself. Freezing an actual candidate remains a release decision, not an autonomous step.

### Continuation — PRs #73–#74 (Wave 14, 2026-10-25)

- **#73 — macOS Focus feasibility research** (`docs/plans/MACOS_FOCUS_FEASIBILITY.md`): the honest verdict is that the capability stays unsupported on macOS — the historical defaults path broke at macOS 12; the one public API (INFocusStatusCenter) is app-relative by Apple's own semantics and cannot fill the aggregate `active` field; FamilyControls exposes nothing; the DB JSON path is documented but not App-Store-safe. No gate is named; reopen conditions are recorded.
- **#74 — gated Linux Focus observation** per the #70 blueprint: `commands/focus/linux.rs` implements GNOME (gio in-process `show-banners` read, new Linux-target dependency aligned with the already-resolved gio 0.18.4) and KDE (zbus `Properties.Get` of `Inhibited`, cached connection, ~1s bound) behind `LINUX_FOCUS_VALIDATED = false`; conservative XDG-driven mechanism selection that never probes the GNOME schema from KDE (the schemas-installed-everywhere hazard); observation-only on every path; 17 new pure-logic unit tests (crate 97/97); read-only WSL probe evidence recorded in the STAGE6 checkpoint. Rust unit tests now 97.

### Continuation — PRs #76–#79 (Waves 15–16, 2026-10-25)

- **#76/#77 — capability matrix and post-window pointers**: `docs/plans/PLATFORM_CAPABILITY_MATRIX.md` consolidates 11 capabilities × 3 platforms with the four gate constants (grep-proven exactly four), evidence citations, and flip conditions; README/CONTRIBUTING/execution-plan headers now point at the matrix, the precheck script, and the honest post-window status.
- **#78 — checkpoint freshness audit**: all seven GLANCE_BAR_PLAN checkpoints and four STAGE6 checkpoints re-verified against the tree (SHAs, all 28 cited PRs via gh, counts, gate const lines, links); exactly one born-imprecise line-range citation corrected.
- **#79 — coverage gap sweep**: 19 new tests (suite 950); reachable gaps filled (aggregation branch 74.3 → 89.6 percent; mockAiProvider to 100/100; CI-scope branch 85.6 → 88.3). Key finding proved empirically: the npm/git/docker providers' remaining uncovered lines sit behind the honest module-local stubs and are unreachable without a future source refactor (checker injection) — recorded as the follow-up, not papered over.
- **#80 — checkpoint eight** (this document).

### Continuation — PR #81 (Wave 17, 2026-10-25)

- **#81 — provider checker injection (the #79 follow-up, closed)**: the three stub providers now accept an optional injected checker through their existing factories while defaulting to the untouched honest not-implemented stub — production composition byte-identical (providerManager and index exports unmodified; #59 preserved and grep-verified). 34 new tests drive the previously-unreachable wired paths (initial snapshot mapping, poll/dedupe, mid-run unavailable, checker rejection degradation, clean stop with in-flight poll dropped, mapper defensive branches). Coverage: all three providers at 100/100/100/100; impl/real aggregate 78.87 → 98.14 lines. Suite 950 → 984.

Verification snapshot at `0110f47`: all gates green; Vitest 59 files / 984 tests; Rust 97/97; coverage — providers/runtime/state scope now 98+ lines aggregate on impl/real.

### Continuation — PRs #83–#84 (Wave 18, 2026-10-25)

- **#83 — coverage toolchain noise resolved**: the pre-existing v8 PARSE_ERROR (seen since #79) was root-caused to src/providers/impl/platform/README.md matching the CI coverage include glob — vitest 4.1.8's uncovered-files map parses untested included files as JavaScript and soft-fails on markdown. Fixed by `test.coverage.exclude: ["**/*.md"]` in vitest.config.ts (with an explanatory comment); the exact CI coverage command now runs clean with identical totals. The #79 mockHubData side-note is also settled: never-imported fixture, normal v8 rendering, no action.
- **#84 — runtime/state coverage**: 10 more tests; desktopProductRuntime lines 81.25 → 100 (one provably-unreachable branch documented per the #79 convention), statusWindowRuntime and desktopStatusScheduler now fully clean rows. Combined CI-scope coverage lines 95.76 → 97.0.

Verification snapshot at `55a0ab9`: all gates green; Vitest 59 files / 994 tests; Rust 97/97; coverage toolchain noise-free.

### Continuation — PR #86 (Wave 19, 2026-10-25)

- **#86 — tauri runtime coverage completed**: 21 new tests; tauriRuntime.ts to 100 lines / 99.3 branch (fallback invoke wrapper, rejection stringification across all five wrappers, malformed envelope branches for publish/capabilities/guest-providers/media/shell-window), appRuntimeMetadata.ts to 100/100/100/100; runtime/tauri directory at 100/99.17/100/100 — the only residual branch is the desktopProductRuntime L107 case documented in #84, plus one more provably-unreachable branch documented here (invokeWithOptionalTimeout finally timer path, with an ECMA-262 executor-synchronicity proof). Scoped CI coverage: 97.58 stmts / 94.76 branch / 98.69 funcs / 97.5 lines.

Verification snapshot at `407d8be`: all gates green; Vitest 59 files / 1015 tests; Rust 97/97; scoped coverage 97.5 lines — the coverage campaign that started at #79 has now lifted every CI-covered file tree to ~97+ lines with all residuals individually proven unreachable or documented.

### Wave 20 routine snapshot — 2026-10-25 (no new PRs)

`node scripts/release-precheck.mjs` was run for real on a clean `main` at `d9cf43f`: **RELEASE-PRECHECK PASSED** — all 11 gates green in one run (typecheck, lint, format:check, full Vitest incl. both browser journeys under real Chromium, production build, cargo fmt/check/CI-level clippy/test 97/97). This is the routine freeze-grade evidence line: the tree at `d9cf43f` is one `git tag` away from a frozen candidate per `docs/release/CANDIDATE_FREEZE.md` (freezing itself remains a release decision, not taken autonomously).

### Wave 21 — PR #89 (2026-10-25)

- **#89 — screenshot baseline becomes the 12th precheck gate**: the three-viewport PNG baseline (`qa:showcase:screenshots`, local evidence by design) now runs between the desktop journey and build inside `release-precheck`; CANDIDATE_FREEZE synchronized (12-row gate table, counts, tag template). Verified with a real full run on the clean branch commit: **RELEASE-PRECHECK PASSED, 12/12 gates** (screenshot gate 4.9s, three PNGs written). The freeze-grade evidence bar now covers the visual baseline too.

### Wave 22–23 — PR #91 + routine patrol (2026-10-25)

- **#91 — second periodic checkpoint audit**: full re-verification (SHAs, PRs through #90, gate constants, precheck structure, per-SHA Rust test counts, link resolution); two provable corrections applied (header freshness stamp; Current-baseline counts to 59 files / 1015 tests / 97 Rust); four questionable items listed unchanged, including the STAGE6 61-vs-65 count ambiguity that squash history cannot resolve.
- Routine patrol: `node scripts/release-precheck.mjs` on clean `main` at `a0a2dc0` — **RELEASE-PRECHECK PASSED (12/12 gates)**. The tree remains one tag away from a frozen candidate; freezing stays a release decision.
- Wave 24 patrol (no new PRs): clean `main` at `f25c5b7`, in sync with origin, no stray worktrees — **RELEASE-PRECHECK PASSED (12/12 gates)**, the fourth consecutive routine pass. Maintenance cadence holds.
- Wave 25 patrol (no new PRs): `main` at `a7ab5bc` in sync with origin — **RELEASE-PRECHECK PASSED (12/12 gates)**, fifth consecutive routine pass.
- Wave 26 patrol (no new PRs): `main` at `ad4f05e` in sync with origin — **RELEASE-PRECHECK PASSED (12/12 gates)**, sixth consecutive routine pass.
- Wave 27 patrol (no new PRs): `main` at `a0b14d2` in sync with origin — **RELEASE-PRECHECK PASSED (12/12 gates)**, seventh consecutive routine pass.
- Wave 28 patrol (no new PRs): `main` at `c2f1a5f` in sync with origin — **RELEASE-PRECHECK PASSED (12/12 gates)**, eighth consecutive routine pass.
- Wave 29 patrol (no new PRs): `main` at `4fcd1df` in sync with origin — **RELEASE-PRECHECK PASSED (12/12 gates)**, ninth consecutive routine pass.
- Wave 30 patrol (no new PRs): `main` at `dcb95ab` in sync with origin — **RELEASE-PRECHECK PASSED (12/12 gates)**, tenth consecutive routine pass.
- Wave 31 patrol (no new PRs): `main` at `13d9ce0` in sync with origin — **RELEASE-PRECHECK PASSED (12/12 gates)**, eleventh consecutive routine pass.
- Wave 32 patrol (no new PRs): `main` at `2f4e1a3` in sync with origin — **RELEASE-PRECHECK PASSED (12/12 gates)**, twelfth consecutive routine pass.
- Wave 33 patrol (no new PRs): `main` at `ef24dcb` in sync with origin — **RELEASE-PRECHECK PASSED (12/12 gates)**, thirteenth consecutive routine pass.
- Wave 34 patrol (no new PRs): `main` at `7ac9e84` in sync with origin — **RELEASE-PRECHECK PASSED (12/12 gates)**, fourteenth consecutive routine pass.
- Wave 35 patrol (no new PRs): `main` at `06df87d` in sync with origin — **RELEASE-PRECHECK PASSED (12/12 gates)**, fifteenth consecutive routine pass.
- Wave 36 patrol (no new PRs): `main` at `bb4e2db` in sync with origin — **RELEASE-PRECHECK PASSED (12/12 gates)**, sixteenth consecutive routine pass.
- Wave 37 patrol (no new PRs): `main` at `1bb8598` in sync with origin — **RELEASE-PRECHECK PASSED (12/12 gates)**, seventeenth consecutive routine pass.

### P0: preserve reliable product behavior

- Keep the provider event pipeline intact and testable.
- Validate fallback, unavailable, and malformed native-payload behavior.
- Maintain window controls, preferences, tray behavior, and status-template accessibility.

### P1: complete capability evidence

- Validate real providers on supported platforms and accurately report availability/health.
- Keep IPC payloads coarse and privacy-safe.
- Remove or replace placeholders only when the native contract and UI fallback are both ready.

### P2: cross-platform parity

- Implement macOS and Linux capabilities behind their platform modules.
- Preserve explicit `unsupported` behavior until each capability is validated on real hardware.
- Keep platform differences out of feature templates and scheduler policy.

### P3: product refinement

- Improve template clarity, settings discoverability, and provider-health feedback from usage evidence.
- Keep the status center compact and prevent low-value sources from destabilizing the visible state.

## Delivery rules

- One ownership area and purpose per PR where practical.
- Provider, runtime, resolver, or scheduler changes include focused tests.
- Do not claim a platform feature is live without a real capability path, bounded payload contract, fallback behavior, and validation evidence.
- Update the relevant current documentation in the same change.

## Superseded plans

`IMPLEMENTATION_PLAN.md`, `MVP_PARALLEL_EXECUTION.md`, `STAGE5_WIP_LANDING.md`, and `v0.7_TAURI_SPIKE_PLAN.md` are historical snapshots. Their archive copies remain for traceability; neither set is an active execution source.
