# Glance Bar Documentation

## Reading order

1. [Product requirements](product/PRD.md)
2. [UI specification](product/UI_SPEC.md)
3. [MVP launch plan](product/MVP_LAUNCH_PLAN.md)
4. [Architecture](architecture/ARCHITECTURE.md)
5. [Unified execution plan](plans/GLANCE_BAR_PLAN.md)
6. [Structure and dependency guide](plans/STRUCTURE_REFACTOR_PLAN.md)

## Current documentation

- [Architecture overview](architecture/ARCHITECTURE.md): boundaries, ownership, and runtime topology.
- [Event flow](architecture/EVENT_FLOW.md): the authoritative provider-to-UI data path.
- [Tauri strategy](architecture/TAURI_STRATEGY.md): native commands, events, and platform support.
- [MVP launch plan](product/MVP_LAUNCH_PLAN.md): Windows-first scope, validation plan, and release criteria.
- [Provider SDK](providers/PROVIDER_SDK.md): how to add a provider safely.
- [Provider registry](providers/PROVIDER_REGISTRY.md): lifecycle and health read models.
- [Test strategy](qa/TEST_STRATEGY.md): test layers and required verification.
- [Showcase QA](qa/SHOWCASE_QA.md): manual and scripted review of `/showcase`.
- [Packaging rehearsal](qa/PACKAGING_REHEARSAL.md): Linux deb packaging-pipeline evidence (bundle config, icons, metadata, assembly) from the Day 19-20 rehearsal; Windows installer evidence remains pending (known limitations §1.1/§1.2).
- [Platform capability matrix](plans/PLATFORM_CAPABILITY_MATRIX.md): consolidated capability-by-platform status table covering all 11 capabilities (media, focus, downloads, window policy, system performance, tray, preferences, clipboard, autostart, developer states, update install) × Windows/macOS/Linux, with implementation state, the complete gate-const index, recorded evidence, and what flips each gated capability live.

## Release preparation (Gate D)

Draft documents for the limited Windows release decision. They describe preparation state, not verified release evidence; each file states its own status.

- [Candidate freeze process](release/CANDIDATE_FREEZE.md): repeatable precheck-and-tag runbook that turns a clean-checkout commit into the versioned validation candidate (plan Days 22-23).
- [Known limitations](release/KNOWN_LIMITATIONS.md): designed limitations and evidence still pending for the Windows MVP candidate.
- [Tester guide](release/TESTER_GUIDE.md): install, tray recovery, preferences, and privacy-safe feedback reporting for validation testers.
- [Tester checklist](release/TESTER_CHECKLIST.md): guided 30-60 minute checklist and normal-work-session checklist with severity definitions.
- [Release decision record template](release/RELEASE_DECISION_TEMPLATE.md): Day 30 GO / NO-GO / EXTEND record structure.

## Planning documents

[GLANCE_BAR_PLAN.md](plans/GLANCE_BAR_PLAN.md) is the only active product and execution plan. [STRUCTURE_REFACTOR_PLAN.md](plans/STRUCTURE_REFACTOR_PLAN.md) defines the maintained directory and dependency rules.

`IMPLEMENTATION_PLAN.md`, `STAGE5_WIP_LANDING.md`, `v0.7_TAURI_SPIKE_PLAN.md`, and `DEVELOPMENT_PLAN.md` are historical snapshots. They are retained for traceability only and must not be used to infer current behavior.

## Historical material

Everything in `archive/` is historical evidence. It may intentionally contain obsolete names, file paths, counts, and plans. Do not edit it to describe current behavior.
