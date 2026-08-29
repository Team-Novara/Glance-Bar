import { strict as assert } from "node:assert";
import { createSystemPerformanceMetricSnapshot } from "../data/desktopStatusConfig";
import { createDesktopStatusStateMap, resolveDesktopStatusState } from "./desktopStatusState";
import type { SystemPerformanceSourceStatus } from "../types/hub";

import { describe, it } from "vitest";
describe("desktopStatusState.test", () => {
  it("runs the file's top-level asserts", () => {});
  const metrics = createSystemPerformanceMetricSnapshot({
    cpu: 23,
    memory: 68,
    downloadSpeed: 2_457_600,
    uploadSpeed: 512_000,
  });

  test("desktop status resolver defaults to resident state", () => {
    const state = resolveDesktopStatusState({ metrics });

    assert.equal(state.kind, "resident");
    assert.equal(state.metrics.length, 4);
  });

  test("desktop status resolver can switch to another explicit state kind", () => {
    const now = 48_000;
    const state = resolveDesktopStatusState({
      metrics,
      preferredKind: "media",
      preferredUntil: now,
      now,
    });

    assert.equal(state.kind, "media");
    assert.equal(state.title, "Neon Focus");
  });

  test("desktop status resolver uses priority when multiple active kinds are present", () => {
    const state = resolveDesktopStatusState({
      metrics,
      activeKinds: ["clipboard", "update", "media"],
    });

    assert.equal(state.kind, "update");
  });

  test("desktop status resolver safely falls back to resident when preferred kind is unavailable", () => {
    const state = resolveDesktopStatusState({
      metrics,
      preferredKind: "focus",
      activeKinds: ["focus"],
      availableKinds: ["resident"],
      states: {
        resident: {
          kind: "resident",
          title: "系统性能",
          subtitle: "常驻状态中心",
          source: "system",
          metrics,
        },
      },
    });

    assert.equal(state.kind, "resident");
  });

  test("desktop status state map snapshots metrics instead of leaking caller references", () => {
    const stateMap = createDesktopStatusStateMap(metrics);

    stateMap.resident.metrics[0]!.label = "Mutated";
    assert.equal(metrics[0]!.label, "CPU");
  });

  test("desktop status resolver snapshots system performance source status", () => {
    const sourceStatus: SystemPerformanceSourceStatus = { quality: "stale" };
    const state = resolveDesktopStatusState({
      metrics,
      systemPerformanceSourceStatus: sourceStatus,
    });

    assert.equal(state.kind, "resident");
    assert.deepEqual(state.sourceStatus, { quality: "stale" });

    sourceStatus.quality = "live";
    assert.deepEqual(state.sourceStatus, { quality: "stale" });
  });

  test("desktop status resolver keeps source status high-level and drops diagnostic details", () => {
    const sourceStatus = {
      quality: "stale",
      code: "permission-denied",
      source: "preflight",
      path: "C:\\Users\\private",
      rawPayload: { commandOutput: "secret output" },
    } as unknown as SystemPerformanceSourceStatus;
    const state = resolveDesktopStatusState({
      metrics,
      systemPerformanceSourceStatus: sourceStatus,
    });

    assert.deepEqual(state.sourceStatus, { quality: "stale" });
    assert.equal("code" in state.sourceStatus!, false);
    assert.equal("source" in state.sourceStatus!, false);
    assert.equal("path" in state.sourceStatus!, false);
    assert.equal("rawPayload" in state.sourceStatus!, false);
  });

  test("desktop status state map covers all eight status templates in product order", () => {
    const stateMap = createDesktopStatusStateMap(metrics);
    const kinds = Object.values(stateMap).map((state) => state.kind);
    assert.deepEqual(kinds, [
      "resident",
      "media",
      "download",
      "update",
      "clipboard",
      "focus",
      "notification",
      "developer",
    ]);
  });

  test("desktop status resolver keeps the previous state during the stability window", () => {
    const now = 96_000;
    const state = resolveDesktopStatusState({
      metrics,
      now,
      previousKind: "media",
      previousChangedAt: now - 1_000,
      activeKinds: ["media", "clipboard"],
      availableKinds: ["resident", "media", "clipboard"],
      activatedAtByKind: {
        media: now - 3_000,
        clipboard: now - 400,
      },
    });

    assert.equal(state.kind, "media");
  });
});
