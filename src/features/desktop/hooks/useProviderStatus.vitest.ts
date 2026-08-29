import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import { useProviderStatus } from "./useProviderStatus";
import type { ProviderManager } from "@/providers";
import type { ProviderRegistryRecord } from "@/providers";
import type {
  HubProvider,
  HubProviderHealth,
  HubProviderLifecycle,
  HubProviderStatus,
} from "@/providers";

// ── Test doubles ────────────────────────────────────────────────────────

/**
 * Build a fully-formed `HubProvider` whose `status()` is a controlled
 * mutable record. Tests can flip `lifecycle` / `health` between
 * `act()` boundaries to drive the aggregator.
 */
function makeProvider(
  id: string,
  name: string,
  kind: HubProvider["metadata"]["kind"],
  initial: { lifecycle: HubProviderLifecycle; health: HubProviderHealth },
): {
  provider: HubProvider;
  setStatus: (next: { lifecycle: HubProviderLifecycle; health: HubProviderHealth }) => void;
} {
  const status: HubProviderStatus = { ...initial };
  const provider: HubProvider = {
    id,
    label: name,
    metadata: { id, name, kind, version: "0.0.0", mock: true },
    capabilities: [{ id: kind, kind, origin: "mock", support: "available" }],
    start: vi.fn(),
    stop: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
    status: () => ({ ...status }),
  };
  return {
    provider,
    setStatus: (next) => {
      status.lifecycle = next.lifecycle;
      status.health = next.health;
    },
  };
}

/**
 * Build a stub ProviderManager whose `registry.list()` returns whatever
 * records the test installs. We do not need the rest of the ProviderManager
 * surface for the hook under test.
 */
function makeManager(initialRecords: ProviderRegistryRecord[] = []): {
  manager: ProviderManager;
  setList: (next: ProviderRegistryRecord[]) => void;
} {
  let current = initialRecords;
  const manager: ProviderManager = {
    registry: {
      register: vi.fn(),
      get: vi.fn(),
      list: vi.fn(() => current),
      listCapabilitySupport: vi.fn(() => []),
      summarizeCapabilitySupport: vi.fn(() => []),
      unregister: vi.fn(() => true),
      start: vi.fn(),
      stop: vi.fn(),
      listProvidersByKind: vi.fn(() => []),
      listRealProviders: vi.fn(() => []),
      listMockProviders: vi.fn(() => []),
      listAvailableCapabilities: vi.fn(() => []),
    } as unknown as ProviderManager["registry"],
    start: vi.fn(),
    stop: vi.fn(),
    listProviderIds: vi.fn(() => current.map((r) => r.id)),
  };
  return {
    manager,
    setList: (next) => {
      current = next;
    },
  };
}

function registryRecord(
  id: string,
  name: string,
  kind: HubProvider["metadata"]["kind"],
  status: HubProviderStatus,
): ProviderRegistryRecord {
  return {
    id,
    name,
    kind,
    metadata: { id, name, kind, version: "0.0.0", mock: true },
    capabilities: [{ id: kind, kind, origin: "mock", support: "available" }],
    status,
    registrationOrder: 0,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("useProviderStatus", () => {
  // 1. manager undefined → empty records
  it("returns empty records when manager is undefined", () => {
    // Arrange
    const manager: ProviderManager | undefined = undefined;

    // Act
    const { result } = renderHook(() => useProviderStatus(manager));

    // Assert
    expect(result.current.records).toEqual([]);
    expect(result.current.summary.total).toBe(0);
    expect(result.current.degraded).toEqual([]);
  });

  // 2. manager with empty registry → empty records
  it("returns empty records when the manager's registry is empty", () => {
    // Arrange
    const { manager } = makeManager([]);

    // Act
    const { result } = renderHook(() => useProviderStatus(manager));

    // Assert
    expect(result.current.records).toEqual([]);
    expect(result.current.summary.total).toBe(0);
    expect(result.current.summary.healthy).toBe(0);
    expect(result.current.degraded).toEqual([]);
  });

  // 3. manager with healthy providers → summary.healthy > 0
  it("aggregates healthy providers and reports summary.healthy > 0", () => {
    // Arrange
    const records = [
      registryRecord("music", "Music", "music", { lifecycle: "Publishing", health: "Healthy" }),
      registryRecord("download", "Download", "download", { lifecycle: "Started", health: "Healthy" }),
    ];
    const { manager } = makeManager(records);

    // Act
    const { result } = renderHook(() => useProviderStatus(manager));

    // Assert
    expect(result.current.records).toHaveLength(2);
    expect(result.current.summary.total).toBe(2);
    expect(result.current.summary.healthy).toBe(2);
    expect(result.current.summary.degraded).toBe(0);
    expect(result.current.summary.unhealthy).toBe(0);
    expect(result.current.summary.anyHealthy).toBe(true);
    expect(result.current.degraded).toEqual([]);
  });

  // 4. manager with degraded provider → degraded.length > 0
  it("surfaces degraded providers in the degraded list", () => {
    // Arrange
    const records = [
      registryRecord("music", "Music", "music", { lifecycle: "Publishing", health: "Healthy" }),
      registryRecord("download", "Download", "download", { lifecycle: "Started", health: "Degraded" }),
      registryRecord("clipboard", "Clipboard", "clipboard", { lifecycle: "Started", health: "Unhealthy" }),
    ];
    const { manager } = makeManager(records);

    // Act
    const { result } = renderHook(() => useProviderStatus(manager));

    // Assert
    expect(result.current.degraded).toHaveLength(2);
    expect(result.current.degraded.map((d) => d.providerId).sort()).toEqual(
      ["clipboard", "download"],
    );
    expect(result.current.summary.degraded).toBe(1);
    expect(result.current.summary.unhealthy).toBe(1);
    expect(result.current.summary.needsAttention).toHaveLength(2);
  });

  // 5. records reference stability across re-renders (useMemo cache hit)
  it("returns a stable records reference when the manager does not change", () => {
    // Arrange
    const { manager } = makeManager([
      registryRecord("music", "Music", "music", { lifecycle: "Publishing", health: "Healthy" }),
    ]);
    const { result, rerender } = renderHook(() => useProviderStatus(manager));

    // Act
    const first = result.current.records;
    const firstSummary = result.current.summary;
    const firstDegraded = result.current.degraded;
    rerender();
    rerender();

    // Assert — useMemo should keep the same array/object across rerenders
    expect(result.current.records).toBe(first);
    expect(result.current.summary).toBe(firstSummary);
    expect(result.current.degraded).toBe(firstDegraded);
  });

  // 6. swapping the manager ref invalidates the memo and refreshes records
  it("recomputes records when the manager reference changes", () => {
    // Arrange — first manager with one provider
    const first = makeManager([
      registryRecord("music", "Music", "music", { lifecycle: "Publishing", health: "Healthy" }),
    ]);
    const second = makeManager([
      registryRecord("music", "Music", "music", { lifecycle: "Publishing", health: "Healthy" }),
      registryRecord("download", "Download", "download", { lifecycle: "Started", health: "Healthy" }),
    ]);

    const { result, rerender } = renderHook(
      ({ mgr }: { mgr: ProviderManager | undefined }) => useProviderStatus(mgr),
      { initialProps: { mgr: first.manager as ProviderManager | undefined } },
    );

    // Act
    expect(result.current.records).toHaveLength(1);
    rerender({ mgr: second.manager });
    expect(result.current.records).toHaveLength(2);

    // Swap to undefined → empty
    rerender({ mgr: undefined });
    expect(result.current.records).toEqual([]);
  });

  // 7. stopped lifecycle is detected
  it("counts Stopped providers in summary.stopped and allStopped when no others exist", () => {
    // Arrange
    const records = [
      registryRecord("music", "Music", "music", { lifecycle: "Stopped", health: "Healthy" }),
      registryRecord("download", "Download", "download", { lifecycle: "Stopped", health: "Healthy" }),
    ];
    const { manager } = makeManager(records);

    // Act
    const { result } = renderHook(() => useProviderStatus(manager));

    // Assert
    expect(result.current.summary.stopped).toBe(2);
    expect(result.current.summary.allStopped).toBe(true);
    expect(result.current.summary.anyHealthy).toBe(true);
  });

  // 8. summary.allStopped is false when at least one provider is publishing
  it("flips summary.allStopped to false when any provider is publishing", () => {
    // Arrange
    const records = [
      registryRecord("music", "Music", "music", { lifecycle: "Stopped", health: "Healthy" }),
      registryRecord("download", "Download", "download", { lifecycle: "Publishing", health: "Healthy" }),
    ];
    const { manager } = makeManager(records);

    // Act
    const { result } = renderHook(() => useProviderStatus(manager));

    // Assert
    expect(result.current.summary.allStopped).toBe(false);
    expect(result.current.summary.publishing).toBe(1);
  });

  // 9. byLifecycle buckets lifecycle states
  it("rolls up lifecycle counters in summary.byLifecycle", () => {
    // Arrange
    const records = [
      registryRecord("music", "Music", "music", { lifecycle: "Publishing", health: "Healthy" }),
      registryRecord("download", "Download", "download", { lifecycle: "Stopped", health: "Healthy" }),
      registryRecord("clipboard", "Clipboard", "clipboard", { lifecycle: "Started", health: "Healthy" }),
    ];
    const { manager } = makeManager(records);

    // Act
    const { result } = renderHook(() => useProviderStatus(manager));

    // Assert
    expect(result.current.summary.byLifecycle).toMatchObject({
      Publishing: 1,
      Stopped: 1,
      Started: 1,
    });
  });
});
