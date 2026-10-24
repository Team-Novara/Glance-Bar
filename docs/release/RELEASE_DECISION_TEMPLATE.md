# Release Decision Record — Windows MVP (Gate D, Day 30)

> Status: Template for Gate D preparation — not release evidence. Fill this
> record on Day 30 of the
> [execution plan](../plans/2026-09-05_WINDOWS_MVP_30_DAY_EXECUTION_PLAN.md) §7.
> Do not record a decision until every referenced document cites the same
> candidate commit and every evidence row below is filled or explicitly marked
> missing.

## 1. Candidate identification

| Field | Value |
|---|---|
| Candidate commit | `<hash>` |
| Version / tag | `<version>` |
| Decision date | `<YYYY-MM-DD>` |
| Deciders (roles) | `<e.g., release owner, engineering owner, QA owner>` |
| Known limitations at this commit | [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) — updated for this candidate: `<link or "not yet updated">` |

All evidence documents below must cite the candidate commit in this section. If
any document still refers to an earlier commit, the record is incomplete.

## 2. Quality gates (clean checkout, candidate commit)

Run from a clean checkout at the candidate commit. Record output references;
a check that could not run is missing evidence, not a pass.

| Gate | Result | Evidence (log/link) |
|---|---|---|
| `npm run typecheck` | | |
| `npm run lint -- --max-warnings=0` | | |
| `npm run test:vitest` | | |
| `npm run qa` | | |
| `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` | | |
| `cargo check --manifest-path src-tauri/Cargo.toml` | | |
| `cargo clippy --manifest-path src-tauri/Cargo.toml -- -W clippy::all` | | |
| CI run on the candidate commit | | |

## 3. Evidence set

### 3.1 Scenario matrix results

Reference: [MVP_SCENARIO_MATRIX.md](../product/MVP_SCENARIO_MATRIX.md).
Every Media (M1-M6), Downloads (D1-D6), and Focus (F1-F6) scenario must have a
recorded result against the candidate commit.

| Scenario group | Verified on hardware? | Evidence location |
|---|---|---|
| Media M1-M6 | yes / no / partial — detail | |
| Downloads D1-D6 (incl. Chrome/Edge/Firefox matrix) | yes / no / partial — detail | |
| Focus F1-F6 | yes / no / partial — detail | |

### 3.2 Shell verification

Reference: [WINDOWS_SHELL_VERIFICATION.md](../qa/WINDOWS_SHELL_VERIFICATION.md).
The physical Windows matrix must be recorded: install/launch, close-to-tray,
tray left-click toggle, Show/Settings/Quit, autostart on/off with reboot,
always-float, fullscreen avoidance, lock position, drag/restore/reset,
DPI/multi-monitor (or explicitly listed as untested configurations), restart
persistence, and uninstall.

| Shell item | Status | Evidence location |
|---|---|---|
| Install / launch / uninstall | | |
| Tray recovery set | | |
| Autostart (incl. reboot) | | |
| Toggles (always-float, avoid-fullscreen, lock-position) | | |
| Position save/restore/reset | | |
| DPI / multi-monitor | | |

### 3.3 Workday soak (Gate C evidence)

At least one six-hour soak of the release build during ordinary work.

| Field | Value |
|---|---|
| Soak date / duration | |
| Build | |
| Unexpected transitions | |
| Stale or misleading status | |
| Duplicate events / repeated toasts | |
| CPU / memory at start / midpoint / end | |
| Tray or window recovery failures | |
| Fullscreen or multi-monitor interference | |
| Provider recovery after app close/reopen | |
| Outcome | pass / fail — no unresolved crash, stuck topmost window, unrecoverable tray state, privacy leak, fake-live state, or repeated disruptive notification |

### 3.4 Tester validation (Days 24-27)

Minimum: three testers, at least two sessions each, including one normal work
session, with all six capture points answered ([TESTER_CHECKLIST.md](TESTER_CHECKLIST.md)).

| Tester | Guided session | Work session | Commit | Findings (P0/P1/P2) | Report link |
|---|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |

Findings summary:

| Severity | Count | Disposition |
|---|---|---|
| **P0** (crash, data/privacy exposure, impossible recovery, false successful action) | | each fixed before GO, or blocks |
| **P1** (misleading live state, common stuck state, broken primary shell behavior, unexplained frequent transition) | | fixed, or accepted with limited audience + documented workaround |
| **P2** (clarity, visual polish, uncommon edge case, enhancement) | | post-MVP backlog |

List each P0/P1 with its disposition:

| # | Finding | Severity | Disposition (fixed at `<commit>` / accepted with workaround / open) |
|---|---|---|---|
| | | | |

Every P0/P1 code fix must cite its regression test and the repeated manual
scenario plus abbreviated (two-hour) soak required by plan Days 28-29.

## 4. Decision

Check exactly one:

- [ ] **GO — limited Windows release.** All section 2 gates pass from a clean
  checkout, sections 3.1-3.4 are complete for the candidate commit, zero open
  P0 findings, and every P1 is fixed or explicitly accepted with a limited
  audience and workaround. Next step: tag and publish the candidate through the
  repository's protected release process.
- [ ] **NO-GO — blockers.** One or more P0 findings or failed release criteria
  block the release. List every blocking fact in section 5.
- [ ] **EXTEND — evidence incomplete.** Required evidence (hardware matrix,
  soak, tester set, packaging, or quality gates) is missing for the candidate
  commit. List every missing item in section 5.

Rationale (a short paragraph, no more):

## 5. Blocking facts / missing evidence (required for NO-GO or EXTEND)

One row per blocking fact. Recheck dates must be concrete.

| # | Blocking fact or missing evidence | Owner role | Next action | Recheck date |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |

## 6. Sign-off

| Role | Name | Date |
|---|---|---|
| Release owner | | |
| Engineering owner | | |
| QA owner | | |

A GO decision is valid only for the candidate commit recorded in section 1 and
the known limitations linked there; a new candidate commit requires a new
record.
