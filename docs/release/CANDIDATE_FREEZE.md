# Candidate Freeze — Versioned Validation Build

> Status: process definition for plan Days 22-23 — a repeatable procedure, not
> release evidence. No candidate build exists yet
> ([KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) §1.3). When one is frozen by
> following this runbook, record it in the [freeze record](#freeze-record) and
> update the linked documents to cite the tag.

Related: [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) §1.3,
[RELEASE_DECISION_TEMPLATE.md](RELEASE_DECISION_TEMPLATE.md) §1-2,
[PACKAGING_REHEARSAL.md](../qa/PACKAGING_REHEARSAL.md),
[execution plan §7, Days 22-23 — prepare validation build](../plans/2026-09-05_WINDOWS_MVP_30_DAY_EXECUTION_PLAN.md).

## What freezing is — and what it is not

Freezing turns one commit into **the versioned validation candidate**: every
quality gate is run from a clean checkout of that commit, the commit receives
an annotated `candidate/vX.Y.Z-rcN` tag, and the validation documents point at
the tag instead of "whatever the tester had checked out". The procedure is one
script run plus a tag.

**Freezing does not verify anything by itself.** It runs the automated quality
gates — nothing more. A frozen candidate is not verified release software, and
the tag proves no runtime behavior. Before Gate D a frozen candidate still
needs, at minimum:

- **Windows packaging**, produced and exercised from a clean checkout at the
  tagged commit ([KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) §1.1). The Linux
  deb rehearsal in [PACKAGING_REHEARSAL.md](../qa/PACKAGING_REHEARSAL.md)
  covers the bundle pipeline only; no Windows installer has ever been built,
  and that rehearsal's artifact was never installed or launched.
- **Packaged-app runtime evidence** on real hardware: the physical Windows
  shell matrix (KNOWN_LIMITATIONS §2) and the six-hour workday soak (Gate C,
  KNOWN_LIMITATIONS §5.1).
- **Tester evidence**: at least three testers, two sessions each, per plan
  Days 24-27 (KNOWN_LIMITATIONS §5.2).

Do not describe a frozen candidate as "verified" or "tested" in any document;
describe it as frozen at a tag with its automated gate results recorded.

## Preconditions

1. The worktree is at the commit to freeze and the working tree is clean
   (`git status --porcelain` prints nothing). The precheck checks this first
   and fails the run on a dirty tree — even when every gate passes — because
   gate output from a tree that does not match a commit is not citable
   evidence. It still runs the gates for diagnosis; treat such a run as
   diagnostic only.
2. Dependencies are installed (`npm install`). Playwright browsers must be
   present for the interaction and screenshot gates (`npx playwright install
   chromium` if they have never been fetched).
3. Toolchains: Node, and cargo — the precheck sources `~/.cargo/env` in the
   cargo gates' child shell, so cargo needs no manual PATH setup. If a shared
   cargo target dir is used, export `CARGO_TARGET_DIR` before running; the
   gates inherit it.
4. `main` is protected (see the contributor contract in `AGENTS.md`): freeze
   from a focused branch, or from `main` after the candidate PR has merged.

## Step 1 — run the precheck

```
node scripts/release-precheck.mjs
```

The script (see its header comment for implementation details):

1. Records the commit hash and branch, and checks whether the working tree is
   clean. A dirty tree is reported up front and fails the run, but the gates
   still run so the full table is available for diagnosis.
2. Runs all 12 quality gates sequentially, streaming each gate's output to the
   console and saving it to `output/release-precheck/<run id>/<gate>.log`
   (gitignored). The interaction gates and `npm run build` are the same
   commands CI runs; the cargo gates run in a login shell with
   `source ~/.cargo/env` applied.
3. Prints one PASS/FAIL line per gate with its duration, then exactly one of:
   `RELEASE-PRECHECK PASSED <commit>` or
   `RELEASE-PRECHECK FAILED (n/12 gates failed)`.
4. Exits nonzero on a dirty tree, any failed gate, or an interrupt. Ctrl-C
   kills the running gate's entire process group (including any Vite dev
   server the interaction or screenshot gates started), so an interrupted
   run leaves no orphaned processes.

The gates, in run order:

| Gate | Command |
|---|---|
| 1 | `npm run typecheck` |
| 2 | `npm run lint` |
| 3 | `npm run format:check` |
| 4 | `npm run test:vitest` |
| 5 | `npm run qa:showcase:interactions` |
| 6 | `npm run qa:desktop:interactions` |
| 7 | `npm run qa:showcase:screenshots` |
| 8 | `npm run build` |
| 9 | `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` |
| 10 | `cargo check --manifest-path src-tauri/Cargo.toml` |
| 11 | `cargo clippy --manifest-path src-tauri/Cargo.toml -- -W clippy::all -W clippy::pedantic --allow clippy::module_name_repetitions` |
| 12 | `cargo test --manifest-path src-tauri/Cargo.toml` |

The screenshot gate (7) captures the three-viewport PNG baseline of the
`/showcase` page (1366x768 / 1440x900 / 1920x1080) locally; the screenshots
are local evidence, not committed artifacts.

**Required outcome: the last line is exactly `RELEASE-PRECHECK PASSED <commit>`
and the exit code is 0.** Any other outcome means no freeze: fix the tree or
the failing gate and rerun. A run on a dirty tree prints the full gate table
but always ends FAILED — those results describe an unpinned tree and must not
be cited for any commit. A gate that could not run is missing evidence, not
a pass — the same rule as [RELEASE_DECISION_TEMPLATE.md](RELEASE_DECISION_TEMPLATE.md) §2.

The script changes nothing in the repository except writing logs under
`output/`, so it can be dry-run on any clean tree at any time.

## Step 2 — record the evidence

In the freeze PR description (and later in
[RELEASE_DECISION_TEMPLATE.md](RELEASE_DECISION_TEMPLATE.md) §1-2 when the
Day 30 record is written), record:

- The **commit hash** and branch from the precheck header.
- The **gate table**: each gate's PASS/FAIL result and duration from the
  precheck output.
- The **log paths** under `output/release-precheck/<run id>/` — `output/` is
  gitignored, so cite the run id and copy the logs somewhere durable (the PR
  description, the freeze record below) if they must outlive the checkout.
- If packaging runs as part of the freeze: each artifact's path and its
  SHA-256 (`sha256sum <artifact>`), as in
  [PACKAGING_REHEARSAL.md](../qa/PACKAGING_REHEARSAL.md).

## Step 3 — tag the candidate

```
git tag -a candidate/vX.Y.Z-rcN -m "Validation candidate vX.Y.Z-rcN

Precheck: RELEASE-PRECHECK PASSED <commit> (12/12 gates) at <UTC date>.
Known limitations at freeze: docs/release/KNOWN_LIMITATIONS.md.
Freeze record: docs/release/CANDIDATE_FREEZE.md."
git push origin candidate/vX.Y.Z-rcN
```

- Version scheme: `candidate/v<major>.<minor>.<patch>-rc<N>`. Start at
  `rc1`; re-freeze the same version as `rc2`, `rc3`, ...; bump the patch
  number when a new fixed candidate is cut.
- The tag must be annotated and its message must cite the exact commit and
  the precheck result. A tag whose message cannot show gate evidence is not a
  freeze.
- The tag is created at the commit the precheck passed on. If anything is
  committed after the precheck run — including the documentation updates in
  step 4 — those changes are a different commit and require rerunning the
  precheck before tagging that new commit.

## Step 4 — update the documents to cite the tag

In the same change that records the freeze (the known-limitations maintenance
rule requires evidence updates to land with the evidence):

- [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) §1.3: replace "No versioned
  candidate build exists yet" with the tag and commit. Keep the honest scope:
  the §1.1/§1.2 packaging gaps, §2 hardware gaps, and §5 missing evidence are
  untouched by a freeze and stay pending.
- [RELEASE_DECISION_TEMPLATE.md](RELEASE_DECISION_TEMPLATE.md) §1: set
  `Candidate commit` to the full hash and `Version / tag` to the tag.
- The tester materials ([TESTER_GUIDE.md](TESTER_GUIDE.md),
  [TESTER_CHECKLIST.md](TESTER_CHECKLIST.md)) must tell testers to record the
  tag, not a raw commit, for every session from then on.

## Freeze record

One row per frozen candidate. This is the index the Day 30 decision record and
the known-limitations update cite.

| Date | Tag | Commit | Precheck run id | Docs updated |
|---|---|---|---|---|
| | | | | |
