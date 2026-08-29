import { strict as assert } from "node:assert";
import {
  DESKTOP_STATUS_MEDIA_DURATION_MS,
  DESKTOP_STATUS_PREFERRED_WINDOW_MS,
  DESKTOP_STATUS_PREEMPTION_WINDOW_MS,
  DESKTOP_STATUS_RESIDENT_DURATION_MS,
  DESKTOP_STATUS_STABILITY_WINDOW_MS,
  getDesktopStatusPriorityOrder,
  scheduleDesktopStatus,
  shouldAlternateMediaWithResident,
} from "./desktopStatusScheduler";

import { describe, it } from "vitest";
describe("desktopStatusScheduler.test", () => {
  it("runs the file's top-level asserts", () => {});
  test("desktop status scheduler falls back to resident by default", () => {
    const decision = scheduleDesktopStatus({
      availableKinds: [
        "resident",
        "media",
        "download",
        "update",
        "clipboard",
        "focus",
        "notification",
      ],
    });

    assert.equal(decision.kind, "resident");
    assert.equal(decision.reason, "fallback");
    assert.equal(decision.changed, true);
  });

  test("desktop status scheduler uses configured priority when multiple kinds are active", () => {
    const decision = scheduleDesktopStatus({
      activeKinds: ["clipboard", "media", "focus"],
      availableKinds: [
        "resident",
        "media",
        "download",
        "update",
        "clipboard",
        "focus",
        "notification",
      ],
    });

    assert.equal(decision.kind, "focus");
    assert.equal(decision.reason, "priority");
    assert.equal(decision.changed, true);
  });

  test("desktop status scheduler lets preferred kind override priority", () => {
    const now = 32_000;
    const decision = scheduleDesktopStatus({
      now,
      preferredKind: "media",
      preferredUntil: now,
      activeKinds: ["focus", "update"],
      availableKinds: [
        "resident",
        "media",
        "download",
        "update",
        "clipboard",
        "focus",
        "notification",
      ],
    });

    assert.equal(decision.kind, "media");
    assert.equal(decision.reason, "preferred");
    assert.equal(decision.changed, true);
  });

  test("desktop status scheduler safely falls back when inputs are missing or unknown", () => {
    const decision = scheduleDesktopStatus({
      activeKinds: ["focus"],
      availableKinds: ["resident"],
    });

    assert.equal(decision.kind, "resident");
    assert.equal(decision.reason, "fallback");
    assert.equal(decision.changed, true);
  });

  test("desktop status priority order is exposed for higher-level resolvers", () => {
    assert.deepEqual(getDesktopStatusPriorityOrder(), [
      "focus",
      "developer",
      "update",
      "notification",
      "download",
      "media",
      "clipboard",
      "resident",
    ]);
  });

  test("desktop status scheduler keeps the previous active kind within the stability window", () => {
    const now = 50_000;
    const decision = scheduleDesktopStatus({
      now,
      previousKind: "media",
      previousChangedAt: now - 1_200,
      activeKinds: ["media", "clipboard"],
      availableKinds: ["resident", "media", "clipboard"],
      activatedAtByKind: {
        media: now - 2_000,
        clipboard: now - 500,
      },
    });

    assert.equal(decision.kind, "media");
    assert.equal(decision.reason, "priority");
    assert.equal(decision.changed, false);
  });

  test("desktop status scheduler allows a newly activated higher-priority kind to preempt within the preemption window", () => {
    const now = 80_000;
    const decision = scheduleDesktopStatus({
      now,
      previousKind: "download",
      previousChangedAt: now - 1_000,
      activeKinds: ["download", "focus"],
      availableKinds: ["resident", "download", "focus"],
      activatedAtByKind: {
        download: now - 5_000,
        focus: now - (DESKTOP_STATUS_PREEMPTION_WINDOW_MS - 1_000),
      },
    });

    assert.equal(decision.kind, "focus");
    assert.equal(decision.reason, "priority");
    assert.equal(decision.changed, true);
  });

  test("desktop status scheduler keeps a manual preference only inside the preferred window", () => {
    const now = 120_000;
    const pinnedDecision = scheduleDesktopStatus({
      now,
      preferredKind: "media",
      preferredUntil: now,
      activeKinds: ["focus"],
      availableKinds: ["resident", "media", "focus"],
    });

    assert.equal(pinnedDecision.kind, "media");
    assert.equal(pinnedDecision.reason, "preferred");
    assert.equal(pinnedDecision.changed, true);

    const expiredDecision = scheduleDesktopStatus({
      now,
      preferredKind: "media",
      preferredUntil: now - DESKTOP_STATUS_PREFERRED_WINDOW_MS * 4 - 1,
      activeKinds: ["focus"],
      availableKinds: ["resident", "media", "focus"],
    });

    assert.equal(expiredDecision.kind, "focus");
    assert.equal(expiredDecision.reason, "priority");
    assert.equal(expiredDecision.changed, true);
  });

  test("desktop status scheduler alternates media (15s) and resident (8s) when both are active", () => {
    const baseInput = {
      activeKinds: ["media", "resident"],
      availableKinds: ["resident", "media"],
    } as const;

    const t0 = 1_000_000;
    // First call (no previous decision) — the media-priority entry point
    // picks media (the more interesting state) over the resident fallback.
    const first = scheduleDesktopStatus({
      ...baseInput,
      now: t0,
    });
    assert.equal(first.kind, "media");
    assert.equal(first.changed, true);

    // Within the 15s media window we keep media.
    const tooSoon = scheduleDesktopStatus({
      ...baseInput,
      now: t0 + DESKTOP_STATUS_MEDIA_DURATION_MS - 1_000,
      previousKind: first.kind,
      previousChangedAt: t0,
    });
    assert.equal(tooSoon.kind, "media");

    // After the 15s media window we flip to resident. The first call sets
    // previousChangedAt = t0; we step 15s + 100ms past it for the second call,
    // and that also updates previousChangedAt = t0 + 15_100 for the third.
    const after = scheduleDesktopStatus({
      ...baseInput,
      now: t0 + DESKTOP_STATUS_MEDIA_DURATION_MS + 100,
      previousKind: first.kind,
      previousChangedAt: t0,
    });
    assert.equal(after.kind, "resident");
    assert.equal(after.changed, true);

    // 2nd cycle: after the 8s resident window we flip back to media. This
    // reflects the asymmetric cadence: 15s media + 8s resident = 23s for
    // one full media→resident→media cycle.
    const cycle2 = scheduleDesktopStatus({
      ...baseInput,
      now: t0 + DESKTOP_STATUS_MEDIA_DURATION_MS + DESKTOP_STATUS_RESIDENT_DURATION_MS + 200,
      previousKind: after.kind,
      previousChangedAt: t0 + DESKTOP_STATUS_MEDIA_DURATION_MS + 100,
    });
    assert.equal(cycle2.kind, "media");
    assert.equal(cycle2.changed, true);

    // 3rd cycle: after another 15s media window, back to resident. Pattern:
    // media(15s) → resident(8s) → media(15s) → resident(8s)...
    const cycle3 = scheduleDesktopStatus({
      ...baseInput,
      now:
        t0 +
        DESKTOP_STATUS_MEDIA_DURATION_MS * 2 +
        DESKTOP_STATUS_RESIDENT_DURATION_MS +
        300,
      previousKind: cycle2.kind,
      previousChangedAt:
        t0 + DESKTOP_STATUS_MEDIA_DURATION_MS + DESKTOP_STATUS_RESIDENT_DURATION_MS + 200,
    });
    assert.equal(cycle3.kind, "resident");
    assert.equal(cycle3.changed, true);
  });

  test("desktop status scheduler forces media even when previousKind is set to resident", () => {
    // This guards against the alternation being completely masked by the
    // previousKind=resident stability branch. The media-priority entry
    // must always pick media first so the alternation cycle can start.
    const t0 = 5_000_000;
    const decision = scheduleDesktopStatus({
      activeKinds: ["media", "resident"],
      availableKinds: ["resident", "media"],
      now: t0,
    });
    // No previous decision yet — the IIFE branch picks "media" to start
    // the alternation.
    assert.equal(decision.kind, "media");
  });

  test("desktop status scheduler does not alternate when media is unavailable", () => {
    const t0 = 2_000_000;
    const decision = scheduleDesktopStatus({
      activeKinds: ["media", "resident"],
      availableKinds: ["resident"],
      now: t0 + DESKTOP_STATUS_MEDIA_DURATION_MS + 1_000,
      previousKind: "resident",
      previousChangedAt: t0,
    });

    assert.equal(decision.kind, "resident");
    assert.equal(decision.reason, "priority");
  });

  test("desktop status scheduler does not preempt higher-priority kinds to alternate", () => {
    const t0 = 3_000_000;
    const decision = scheduleDesktopStatus({
      activeKinds: ["focus", "media", "resident"],
      availableKinds: ["resident", "media", "focus"],
      now: t0 + DESKTOP_STATUS_MEDIA_DURATION_MS + 1_000,
      previousKind: "focus",
      previousChangedAt: t0,
    });

    assert.equal(decision.kind, "focus");
  });

  test("shouldAlternateMediaWithResident skips when not media/resident", () => {
    const result = shouldAlternateMediaWithResident({
      kind: "focus",
      now: 0,
      previousChangedAt: undefined,
      activeKinds: ["focus", "media", "resident"],
      availableKinds: ["resident", "media", "focus"],
    });

    assert.equal(result, "focus");
  });

  test("shouldAlternateMediaWithResident skips when activeKinds do not include media/resident", () => {
    const result = shouldAlternateMediaWithResident({
      kind: "media",
      now: 0,
      previousChangedAt: undefined,
      activeKinds: ["focus"],
      availableKinds: ["resident", "media", "focus"],
    });

    assert.equal(result, "media");
  });
});
