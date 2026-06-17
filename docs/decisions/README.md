# Decision Records Index

This directory contains decision records from the v0.8 system status readiness planning phase. Many of these were created during a cautious, gate-driven planning process. The Tauri integration (v0.7+) has since surpassed several of these planning gates with actual implementation.

## Status Summary

| Document | Status | Notes |
|----------|--------|-------|
| `v0.8_FIRST_PROVIDER_CANDIDATE_DECISION.md` | ✅ Superseded | System status selected as first provider. Now implemented in Rust (sysinfo). |
| `v0.8_FIRST_REAL_PROVIDER_READINESS.md` | ✅ Superseded | Readiness assessment. System performance and media session are now connected. |
| `v0.8_RUNTIME_CAPABILITY_TRANSITION_EVIDENCE_PLAN.md` | ✅ Superseded | Planned evidence for `windowsProviders` transition. Tauri backend now reports `windowsProviders: true`. |
| `v0.8_SYSTEM_STATUS_FIRST_CONCRETE_PHASE_BOUNDARY_DECISION.md` | ✅ Superseded | Selected docs-only boundary questions as first phase. Implementation has moved past this. |
| `v0.8_SYSTEM_STATUS_GATE_COMPLETION_DECISION.md` | ✅ Superseded | Gate completion for planning. Implementation has proceeded. |
| `v0.8_SYSTEM_STATUS_NATIVE_BOUNDARY_DESIGN_PLAN.md` | ✅ Superseded | Planned native boundary design. Rust backend now implements native data collection. |
| `v0.8_SYSTEM_STATUS_NATIVE_RUNTIME_PROVIDER_PATH_PLAN.md` | ✅ Superseded | 6-phase path plan. Phases 0-3 are effectively complete via direct implementation. |
| `v0.8_SYSTEM_STATUS_NATIVE_SOURCE_ANSWER_SAFE_BOUNDARY_DECISION.md` | ⚠️ Partially relevant | Boundary classifications still inform privacy decisions. |
| `v0.8_SYSTEM_STATUS_NATIVE_SOURCE_BOUNDARY_ANSWERABILITY_DECISION.md` | ⚠️ Partially relevant | Answerability classifications still inform future provider design. |
| `v0.8_SYSTEM_STATUS_NATIVE_SOURCE_BOUNDARY_QUESTIONS.md` | ⚠️ Partially relevant | Some questions answered by implementation; others still relevant for new providers. |
| `v0.8_SYSTEM_STATUS_NATIVE_SOURCE_FUTURE_EVIDENCE_GATE_MAP.md` | ⚠️ Partially relevant | Evidence gates still apply to unimplemented providers (Focus, Clipboard, Downloads, Notifications). |
| `v0.8_SYSTEM_STATUS_PREFLIGHT_DESCRIPTOR_PLAN.md` | ✅ Superseded | Preflight descriptors now implemented as `GuestProviderCapability` in Rust. |
| `v0.8_SYSTEM_STATUS_PRIVACY_CHECKLIST.md` | ✅ Active | Privacy rules remain the governing checklist for all providers. |
| `v0.8_SYSTEM_STATUS_READINESS_EVIDENCE_DECISION.md` | ✅ Superseded | Readiness evidence has been validated by actual implementation. |
| `v0.8_SYSTEM_STATUS_ROLLBACK_DISABLE_KILL_SWITCH_CRITERIA.md` | ⚠️ Partially relevant | Rollback/disable criteria still relevant as operational guidance. |
| `v0.8_SYSTEM_STATUS_RUNTIME_PAYLOAD_CONTRACT_PLAN.md` | ✅ Superseded | Runtime payload contract now implemented as Tauri IPC commands. |
| `v0.8_DESKTOP_STATUS_SCHEDULER_DUALITY_DECISION.md` | 🟡 Proposed | Accepts the dual-layer scheduler (resolver snapshot path + hook event path). Stage 5+1 WIP landing. |

## Key Takeaway

The planning phase produced extensive decision records. With the Tauri integration complete and real system data flowing, most planning gates have been passed through implementation. The remaining relevant documents are:

1. **Privacy Checklist** — Still governs what data can be collected by any provider.
2. **Boundary Questions / Answerability / Evidence Gate Map** — Still relevant for new providers not yet implemented (Focus, Clipboard, Downloads, Notifications).
3. **Rollback/Disable Criteria** — Still relevant as operational guidance.

Future decision records should be created only when genuinely novel architectural or product decisions arise, not as planning gates for implementation that can proceed directly.
