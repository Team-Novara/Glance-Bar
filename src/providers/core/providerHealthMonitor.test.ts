import { describe, it, expect } from "vitest";
import {
  aggregateProviderHealth,
  findDegradedProviders,
  snapshotProviderHealth,
  type HealthRecordInput,
} from "./providerHealthMonitor";
import type {
  HubProviderHealth,
  HubProviderLifecycle,
  HubProviderStatus,
} from "./types";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeRecord(
  id: string,
  lifecycle: HubProviderLifecycle,
  health: HubProviderHealth,
  overrides: Partial<HealthRecordInput> = {},
): HealthRecordInput {
  const status: HubProviderStatus = { lifecycle, health };
  return {
    id,
    name: overrides.name ?? `Provider ${id}`,
    kind: overrides.kind ?? "system",
    status,
    ...overrides,
  };
}

// ─── snapshotProviderHealth ────────────────────────────────────────────────

describe("snapshotProviderHealth", () => {
  it("marks a Healthy + Publishing provider as healthy and publishing", () => {
    // Arrange
    const record = makeRecord("music-prod", "Publishing", "Healthy");

    // Act
    const snap = snapshotProviderHealth(record);

    // Assert
    expect(snap.providerId).toBe("music-prod");
    expect(snap.providerName).toBe("Provider music-prod");
    expect(snap.kind).toBe("system");
    expect(snap.lifecycle).toBe("Publishing");
    expect(snap.health).toBe("Healthy");
    expect(snap.isHealthy).toBe(true);
    expect(snap.isDegraded).toBe(false);
    expect(snap.isUnhealthy).toBe(false);
    expect(snap.isStopped).toBe(false);
    expect(snap.isPublishing).toBe(true);
  });

  it("marks a Degraded + Started provider as degraded and publishing", () => {
    // Arrange
    const record = makeRecord("download-stuck", "Started", "Degraded", {
      kind: "download",
      name: "Download Provider",
    });

    // Act
    const snap = snapshotProviderHealth(record);

    // Assert — Started is a publishing lifecycle, so isPublishing is true
    expect(snap.isHealthy).toBe(false);
    expect(snap.isDegraded).toBe(true);
    expect(snap.isUnhealthy).toBe(false);
    expect(snap.isPublishing).toBe(true);
    expect(snap.isStopped).toBe(false);
    expect(snap.kind).toBe("download");
    expect(snap.providerName).toBe("Download Provider");
  });

  it("marks an Unhealthy + Stopped provider as unhealthy and stopped", () => {
    // Arrange
    const record = makeRecord("clipboard-broken", "Stopped", "Unhealthy", {
      kind: "clipboard",
    });

    // Act
    const snap = snapshotProviderHealth(record);

    // Assert
    expect(snap.isHealthy).toBe(false);
    expect(snap.isDegraded).toBe(false);
    expect(snap.isUnhealthy).toBe(true);
    expect(snap.isStopped).toBe(true);
    expect(snap.isPublishing).toBe(false);
  });

  it("treats Registered lifecycle as neither publishing nor stopped", () => {
    // Arrange — Registered lifecycle is not a publishing state
    const record = makeRecord("ai-idle", "Registered", "Healthy", {
      kind: "ai",
    });

    // Act
    const snap = snapshotProviderHealth(record);

    // Assert
    expect(snap.isPublishing).toBe(false);
    expect(snap.isStopped).toBe(false);
    expect(snap.isHealthy).toBe(true);
  });

  it("treats Paused as not publishing and not stopped", () => {
    // Arrange
    const record = makeRecord("media-paused", "Paused", "Healthy", {
      kind: "media",
    });

    // Act
    const snap = snapshotProviderHealth(record);

    // Assert
    expect(snap.isPublishing).toBe(false);
    expect(snap.isStopped).toBe(false);
    expect(snap.lifecycle).toBe("Paused");
    expect(snap.health).toBe("Healthy");
  });

  it("treats Failed lifecycle with Degraded health independently", () => {
    // Arrange — Failed + Degraded is the typical "retrying" combination
    const record = makeRecord("notification-fail", "Failed", "Degraded", {
      kind: "notification",
    });

    // Act
    const snap = snapshotProviderHealth(record);

    // Assert
    expect(snap.lifecycle).toBe("Failed");
    expect(snap.isPublishing).toBe(false);
    expect(snap.isStopped).toBe(false);
    expect(snap.isDegraded).toBe(true);
  });
});

// ─── aggregateProviderHealth ────────────────────────────────────────────────

describe("aggregateProviderHealth", () => {
  it("returns empty summary for an empty record list", () => {
    // Arrange / Act
    const summary = aggregateProviderHealth([]);

    // Assert
    expect(summary.total).toBe(0);
    expect(summary.healthy).toBe(0);
    expect(summary.degraded).toBe(0);
    expect(summary.unhealthy).toBe(0);
    expect(summary.stopped).toBe(0);
    expect(summary.publishing).toBe(0);
    expect(summary.byHealth).toEqual({ Healthy: 0, Degraded: 0, Unhealthy: 0 });
    expect(summary.byLifecycle).toEqual({});
    expect(summary.needsAttention).toEqual([]);
    expect(summary.allStopped).toBe(false);
    expect(summary.anyHealthy).toBe(false);
  });

  it("summarises a single healthy record correctly", () => {
    // Arrange
    const records = [makeRecord("solo", "Publishing", "Healthy")];

    // Act
    const summary = aggregateProviderHealth(records);

    // Assert
    expect(summary.total).toBe(1);
    expect(summary.healthy).toBe(1);
    expect(summary.degraded).toBe(0);
    expect(summary.unhealthy).toBe(0);
    expect(summary.publishing).toBe(1);
    expect(summary.stopped).toBe(0);
    expect(summary.byHealth).toEqual({ Healthy: 1, Degraded: 0, Unhealthy: 0 });
    expect(summary.byLifecycle).toEqual({ Publishing: 1 });
    expect(summary.allStopped).toBe(false);
    expect(summary.anyHealthy).toBe(true);
    expect(summary.needsAttention).toEqual([]);
  });

  it("counts lifecycle and health across multiple providers", () => {
    // Arrange
    const records = [
      makeRecord("a", "Publishing", "Healthy", { kind: "music" }),
      makeRecord("b", "Started", "Healthy", { kind: "media" }),
      makeRecord("c", "Stopped", "Healthy", { kind: "system" }),
    ];

    // Act
    const summary = aggregateProviderHealth(records);

    // Assert
    expect(summary.total).toBe(3);
    expect(summary.healthy).toBe(3);
    expect(summary.publishing).toBe(2); // Publishing + Started
    expect(summary.stopped).toBe(1);
    expect(summary.byHealth).toEqual({ Healthy: 3, Degraded: 0, Unhealthy: 0 });
    expect(summary.byLifecycle).toEqual({ Publishing: 1, Started: 1, Stopped: 1 });
    expect(summary.anyHealthy).toBe(true);
    expect(summary.allStopped).toBe(false);
  });

  it("captures mixed health states and surfaces needsAttention", () => {
    // Arrange
    const records = [
      makeRecord("ok", "Publishing", "Healthy", { kind: "music" }),
      makeRecord("slow", "Started", "Degraded", { kind: "download" }),
      makeRecord("dead", "Stopped", "Unhealthy", { kind: "clipboard" }),
      makeRecord("also-ok", "Started", "Healthy", { kind: "focus" }),
    ];

    // Act
    const summary = aggregateProviderHealth(records);

    // Assert
    expect(summary.total).toBe(4);
    expect(summary.healthy).toBe(2);
    expect(summary.degraded).toBe(1);
    expect(summary.unhealthy).toBe(1);
    expect(summary.publishing).toBe(3); // Publishing + Started + Started
    expect(summary.stopped).toBe(1);
    expect(summary.needsAttention.map((s) => s.providerId).sort()).toEqual(["dead", "slow"]);
    expect(summary.anyHealthy).toBe(true);
    expect(summary.allStopped).toBe(false);
  });

  it("reports allStopped only when every record is in Stopped lifecycle", () => {
    // Arrange — two stopped, one not
    const allStoppedRecords = [
      makeRecord("a", "Stopped", "Healthy"),
      makeRecord("b", "Stopped", "Unhealthy"),
      makeRecord("c", "Stopped", "Degraded"),
    ];
    const mostlyStoppedRecords = [
      makeRecord("a", "Stopped", "Healthy"),
      makeRecord("b", "Publishing", "Healthy"),
    ];

    // Act
    const allStoppedSummary = aggregateProviderHealth(allStoppedRecords);
    const mostlyStoppedSummary = aggregateProviderHealth(mostlyStoppedRecords);

    // Assert
    expect(allStoppedSummary.allStopped).toBe(true);
    expect(allStoppedSummary.stopped).toBe(3);
    expect(allStoppedSummary.anyHealthy).toBe(true); // "a" is Healthy even if stopped

    expect(mostlyStoppedSummary.allStopped).toBe(false);
    expect(mostlyStoppedSummary.stopped).toBe(1);
  });

  it("treats anyHealthy as false when no record reports Healthy", () => {
    // Arrange
    const records = [
      makeRecord("a", "Started", "Degraded"),
      makeRecord("b", "Stopped", "Unhealthy"),
    ];

    // Act
    const summary = aggregateProviderHealth(records);

    // Assert
    expect(summary.anyHealthy).toBe(false);
    expect(summary.healthy).toBe(0);
    expect(summary.degraded).toBe(1);
    expect(summary.unhealthy).toBe(1);
    expect(summary.needsAttention).toHaveLength(2);
  });
});

// ─── findDegradedProviders ──────────────────────────────────────────────────

describe("findDegradedProviders", () => {
  it("returns an empty array when no records are supplied", () => {
    // Arrange / Act
    const result = findDegradedProviders([]);

    // Assert
    expect(result).toEqual([]);
  });

  it("returns an empty array when every record is Healthy", () => {
    // Arrange
    const records = [
      makeRecord("ok-1", "Publishing", "Healthy"),
      makeRecord("ok-2", "Started", "Healthy"),
      makeRecord("ok-3", "Paused", "Healthy"),
    ];

    // Act
    const result = findDegradedProviders(records);

    // Assert
    expect(result).toEqual([]);
  });

  it("returns Degraded and Unhealthy snapshots in input order", () => {
    // Arrange
    const records = [
      makeRecord("ok", "Publishing", "Healthy"),
      makeRecord("warn-1", "Started", "Degraded"),
      makeRecord("ok-2", "Publishing", "Healthy"),
      makeRecord("dead", "Stopped", "Unhealthy"),
    ];

    // Act
    const result = findDegradedProviders(records);

    // Assert
    expect(result.map((s) => s.providerId)).toEqual(["warn-1", "dead"]);
    expect(result[0]?.isDegraded).toBe(true);
    expect(result[1]?.isUnhealthy).toBe(true);
  });
});
