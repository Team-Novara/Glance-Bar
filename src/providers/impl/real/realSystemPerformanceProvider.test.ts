import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { createRealSystemPerformanceProvider } from "./realSystemPerformanceProvider";
import type { HubEvent } from "@/entities";
import type { HubProvider } from "../../core/types";
import type { TauriInvoke } from "../../../runtime/tauri/tauriRuntime";

const PROVIDER_ID = "real-system-performance-provider";
const POLL_INTERVAL_MS = 1_800;

/**
 * Installs (or removes) a fake `__TAURI__` global. Each poll calls
 * getTauriInvoke() fresh, so the stub can be swapped between polls.
 */
function stubTauriInvoke(invoke: TauriInvoke | undefined): void {
  const globalRecord = globalThis as Record<string, unknown>;
  if (invoke) {
    globalRecord.__TAURI__ = { core: { invoke } };
  } else {
    delete globalRecord.__TAURI__;
  }
}

/** invoke that answers `get_system_performance` with `payload`. */
function makeInvoke(payload: unknown): TauriInvoke {
  return async (command: string) => {
    if (command !== "get_system_performance") {
      throw new Error(`unexpected command: ${command}`);
    }
    return payload;
  };
}

function makeEnvelope(
  snapshot: Record<string, unknown>,
  diagnostic: Record<string, unknown>,
): Record<string, unknown> {
  return { snapshot, diagnostic };
}

function collectEvents(provider: HubProvider): HubEvent[] {
  const events: HubEvent[] = [];
  provider.subscribe((batch) => {
    events.push(...batch);
  });
  return events;
}

/** Let the async poll() started inside start()/setInterval settle. */
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("createRealSystemPerformanceProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stubTauriInvoke(undefined);
  });

  afterEach(() => {
    stubTauriInvoke(undefined);
    vi.useRealTimers();
  });

  describe("metadata and capabilities", () => {
    it("uses the real-system-performance-provider id and version 1.0.0", () => {
      const provider = createRealSystemPerformanceProvider();
      expect(provider.id).toBe(PROVIDER_ID);
      expect(provider.metadata.name).toBe("System Performance Provider");
      expect(provider.metadata.kind).toBe("system");
      expect(provider.metadata.version).toBe("1.0.0");
      expect(provider.metadata.mock).toBe(false);
    });

    it("advertises a single system capability with origin=real", () => {
      const provider = createRealSystemPerformanceProvider();
      expect(provider.capabilities).toHaveLength(1);
      expect(provider.capabilities[0]).toEqual({
        id: "system",
        kind: "system",
        origin: "real",
        support: "available",
      });
    });
  });

  describe("lifecycle", () => {
    it("starts Registered and transitions to Publishing on start()", async () => {
      const provider = createRealSystemPerformanceProvider();
      expect(provider.status().lifecycle).toBe("Registered");
      expect(provider.status().health).toBe("Healthy");
      provider.start();
      await flushMicrotasks();
      expect(provider.status().lifecycle).toBe("Publishing");
    });

    it("is idempotent: start() called twice does not start a second timer", async () => {
      stubTauriInvoke(
        makeInvoke(makeEnvelope({ cpu: 1, memory: 2, downloadSpeed: 3, uploadSpeed: 4 }, { quality: "live", source: "preflight" })),
      );
      const provider = createRealSystemPerformanceProvider();
      const events = collectEvents(provider);
      provider.start();
      provider.start();
      await flushMicrotasks();

      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2);
      // A second timer would double the cadence — 3 polls must emit 3 events
      expect(events).toHaveLength(3);
      expect(provider.status().lifecycle).toBe("Publishing");
    });

    it("transitions to Stopped on stop()", async () => {
      stubTauriInvoke(
        makeInvoke(makeEnvelope({ cpu: 1, memory: 2, downloadSpeed: 3, uploadSpeed: 4 }, { quality: "live", source: "preflight" })),
      );
      const provider = createRealSystemPerformanceProvider();
      provider.start();
      await flushMicrotasks();
      provider.stop();
      expect(provider.status().lifecycle).toBe("Stopped");
    });
  });

  describe("live emissions", () => {
    it("emits a system event with the polled snapshot on start", async () => {
      stubTauriInvoke(
        makeInvoke(
          makeEnvelope(
            { cpu: 17, memory: 61, downloadSpeed: 2_457_600, uploadSpeed: 512_000 },
            { quality: "live", source: "preflight" },
          ),
        ),
      );
      const provider = createRealSystemPerformanceProvider();
      const events = collectEvents(provider);
      provider.start();
      await flushMicrotasks();

      expect(events).toHaveLength(1);
      const event = events[0];
      expect(event?.id.startsWith(`${PROVIDER_ID}-system-`)).toBe(true);
      expect(event?.type).toBe("system");
      expect(event?.source).toBe("system");
      expect(event?.createdAt).toBe(Date.now());
      // expiresAt = createdAt + poll interval + 500ms grace
      expect(event?.expiresAt).toBe(Date.now() + POLL_INTERVAL_MS + 500);
      expect(event?.payload).toEqual({
        cpu: 17,
        memory: 61,
        downloadSpeed: 2_457_600,
        uploadSpeed: 512_000,
        quality: "live",
      });
    });

    it("keeps emitting on every poll tick", async () => {
      stubTauriInvoke(
        makeInvoke(
          makeEnvelope(
            { cpu: 10, memory: 20, downloadSpeed: 30, uploadSpeed: 40 },
            { quality: "live", source: "preflight" },
          ),
        ),
      );
      const provider = createRealSystemPerformanceProvider();
      const events = collectEvents(provider);
      provider.start();
      await flushMicrotasks();

      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

      expect(events).toHaveLength(3);
      expect(events.every((e) => e.type === "system")).toBe(true);
    });

    it("emits fallback-quality snapshots from the legacy direct-snapshot payload", async () => {
      stubTauriInvoke(
        makeInvoke({ cpu: 5, memory: 6, downloadSpeed: 7, uploadSpeed: 8 }),
      );
      const provider = createRealSystemPerformanceProvider();
      const events = collectEvents(provider);
      provider.start();
      await flushMicrotasks();

      expect(events).toHaveLength(1);
      expect(events[0]?.payload).toMatchObject({ cpu: 5, memory: 6, quality: "fallback" });
    });

    it("stop() clears the poll timer and prevents further emissions", async () => {
      stubTauriInvoke(
        makeInvoke(
          makeEnvelope(
            { cpu: 1, memory: 2, downloadSpeed: 3, uploadSpeed: 4 },
            { quality: "live", source: "preflight" },
          ),
        ),
      );
      const provider = createRealSystemPerformanceProvider();
      const events = collectEvents(provider);
      provider.start();
      await flushMicrotasks();
      expect(events).toHaveLength(1);

      provider.stop();
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);
      expect(events).toHaveLength(1);
    });
  });

  describe("degraded marking", () => {
    it("marks Degraded and emits nothing when no Tauri runtime is available", async () => {
      stubTauriInvoke(undefined);
      const provider = createRealSystemPerformanceProvider();
      const events = collectEvents(provider);
      provider.start();
      await flushMicrotasks();

      expect(events).toHaveLength(0);
      expect(provider.status().health).toBe("Degraded");
      expect(provider.status().lifecycle).toBe("Publishing");
    });

    it("marks Degraded when the native boundary rejects", async () => {
      const failing: TauriInvoke = async () => {
        throw new Error("system performance failed");
      };
      stubTauriInvoke(failing);
      const provider = createRealSystemPerformanceProvider();
      const events = collectEvents(provider);
      provider.start();
      await flushMicrotasks();

      expect(events).toHaveLength(0);
      expect(provider.status().health).toBe("Degraded");
    });

    it("marks Degraded when the native payload is malformed", async () => {
      stubTauriInvoke(makeInvoke({ cpu: "bad", memory: 61, downloadSpeed: 1, uploadSpeed: 2 }));
      const provider = createRealSystemPerformanceProvider();
      const events = collectEvents(provider);
      provider.start();
      await flushMicrotasks();

      expect(events).toHaveLength(0);
      expect(provider.status().health).toBe("Degraded");
    });

    it("marks Degraded when the diagnostic quality is unavailable", async () => {
      stubTauriInvoke(
        makeInvoke(
          makeEnvelope(
            { cpu: 1, memory: 2, downloadSpeed: 3, uploadSpeed: 4 },
            { quality: "unavailable", source: "preflight" },
          ),
        ),
      );
      const provider = createRealSystemPerformanceProvider();
      const events = collectEvents(provider);
      provider.start();
      await flushMicrotasks();

      expect(events).toHaveLength(0);
      expect(provider.status().health).toBe("Degraded");
    });

    it("recovers emissions but keeps the earlier Degraded flag semantics explicit", async () => {
      stubTauriInvoke(undefined);
      const provider = createRealSystemPerformanceProvider();
      const events = collectEvents(provider);
      provider.start();
      await flushMicrotasks();
      expect(provider.status().health).toBe("Degraded");

      // Swap in a healthy runtime before the next tick — polling continues
      stubTauriInvoke(
        makeInvoke(
          makeEnvelope(
            { cpu: 9, memory: 8, downloadSpeed: 7, uploadSpeed: 6 },
            { quality: "live", source: "preflight" },
          ),
        ),
      );
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

      expect(events).toHaveLength(1);
      expect(events[0]?.payload).toMatchObject({ cpu: 9, quality: "live" });
    });
  });
});
