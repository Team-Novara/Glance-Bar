import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useDesktopStatusRuntime } from "./useDesktopStatusRuntime";
import { mockMetrics } from "@/test/fixtures";
import type { SystemPerformanceMetric } from "../../types/hub";

// We don't want the real ProviderManager wiring up Tauri listeners in
// jsdom — the Tauri `listen()` function isn't available, the
// onClipboardChanged / onFocusAssistChanged / onMediaSessionChanged
// bridges all return rejected promises, and we don't want real timers
// or intervals to leak between tests. Mock the entire runtime surface.
vi.mock("@/runtime/tauriRuntime", () => ({
  getTauriInvoke: vi.fn(() => undefined),
  loadTauriMediaSessionStatus: vi.fn().mockResolvedValue({
    ok: false,
    diagnostic: { code: "unavailable", message: "no Tauri" },
  }),
  loadSystemPerformanceStatus: vi.fn().mockResolvedValue({
    metrics: [],
    diagnostic: { quality: "unavailable", code: "unavailable", source: "mock" },
  }),
}));

vi.mock("@/runtime/systemMonitorRuntime", () => ({
  onClipboardChanged: vi.fn(() => Promise.resolve(() => undefined)),
  onFocusAssistChanged: vi.fn(() => Promise.resolve(() => undefined)),
  onMediaSessionChanged: vi.fn(() => Promise.resolve(() => undefined)),
  onNotificationsChanged: vi.fn(() => Promise.resolve(() => undefined)),
  getFocusAssistState: vi.fn(() => Promise.resolve(undefined)),
  getNotificationsSummary: vi.fn(() => Promise.resolve(undefined)),
}));

const baseMetrics: SystemPerformanceMetric[] = mockMetrics();

beforeEach(() => {
  vi.useFakeTimers();
  // Set a deterministic "now" so the alternation math is reproducible.
  vi.setSystemTime(new Date("2026-06-12T16:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("useDesktopStatusRuntime", () => {
  it("returns a resident resolved state when no providers are emitting", () => {
    const { result } = renderHook(() => useDesktopStatusRuntime(baseMetrics, "fallback"));

    expect(result.current.activeKinds).toEqual(["developer"]);
    expect(result.current.resolvedState.kind).toBe("developer");
  });

  it("exposes the preferred window constant via the result", () => {
    const { result } = renderHook(() => useDesktopStatusRuntime(baseMetrics, "fallback"));

    // 20_000 ms per desktopStatusScheduler — keep this in sync if it changes.
    expect(result.current.preferredWindowMs).toBe(20_000);
  });

  it("clears the preferred kind when setPreferredUntil + setActiveStatusKind are reset", () => {
    const { result } = renderHook(() => useDesktopStatusRuntime(baseMetrics, "fallback"));

    act(() => {
      result.current.setActiveStatusKind("media");
      result.current.setPreferredUntil(Date.now() + 5_000);
    });

    expect(result.current.activeStatusKind).toBe("media");
    expect(result.current.preferredUntil).toBeGreaterThan(Date.now());

    act(() => {
      result.current.setActiveStatusKind(null);
      result.current.setPreferredUntil(undefined);
    });

    expect(result.current.activeStatusKind).toBeNull();
    expect(result.current.preferredUntil).toBeUndefined();
  });

  it("returns stable setter identities across renders", () => {
    const { result, rerender } = renderHook(() => useDesktopStatusRuntime(baseMetrics, "fallback"));

    const firstSetters = {
      setActiveStatusKind: result.current.setActiveStatusKind,
      setPreferredUntil: result.current.setPreferredUntil,
    };

    rerender();

    expect(result.current.setActiveStatusKind).toBe(firstSetters.setActiveStatusKind);
    expect(result.current.setPreferredUntil).toBe(firstSetters.setPreferredUntil);
  });
});
