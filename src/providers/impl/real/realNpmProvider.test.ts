import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  REAL_NPM_POLL_INTERVAL_MS,
  checkNpmStatus,
  createRealNpmProvider,
  npmStatusToEvent,
  type NpmScript,
  type NpmScriptStatus,
  type NpmStatus,
  type NpmStatusCode,
} from "./realNpmProvider";
import type { HubProvider } from "../../core/types";

function collectEvents(provider: HubProvider) {
  const events: ReturnType<Parameters<HubProvider["subscribe"]>[0]> = [];
  provider.subscribe((batch) => {
    events.push(...batch);
  });
  return events;
}

/** Local fixture builder for type-coverage asserts only — never provider output. */
function makeScript(overrides: Partial<NpmScript> = {}): NpmScript {
  return {
    name: "build",
    status: "idle",
    ...overrides,
  };
}

/** Local fixture builder for type-coverage asserts only — never provider output. */
function makeStatus(overrides: Partial<NpmStatus> = {}): NpmStatus {
  return {
    available: true,
    scripts: [makeScript({ name: "build", status: "success" })],
    runningCount: 0,
    failedCount: 0,
    lastCheckedAt: 1_700_000_000_000,
    code: "available",
    ...overrides,
  };
}

describe("createRealNpmProvider", () => {
  describe("metadata and capabilities", () => {
    it("uses the real-npm-provider id, npm kind, and version 1.0.0", () => {
      const provider = createRealNpmProvider();
      expect(provider.id).toBe("real-npm-provider");
      expect(provider.label).toBe("Real npm Provider");
      expect(provider.metadata.id).toBe("real-npm-provider");
      expect(provider.metadata.name).toBe("Real npm Provider");
      expect(provider.metadata.kind).toBe("npm");
      expect(provider.metadata.version).toBe("1.0.0");
      expect(provider.metadata.mock).toBe(false);
    });

    it("advertises a single npm capability with origin=real and support=unsupported", () => {
      const provider = createRealNpmProvider();
      expect(provider.capabilities).toHaveLength(1);
      expect(provider.capabilities[0]).toEqual({
        id: "npm",
        kind: "npm",
        origin: "real",
        support: "unsupported",
      });
    });
  });

  describe("honest status check", () => {
    it("reports not-implemented and unavailable with no fabricated scripts", async () => {
      const status = await checkNpmStatus();

      expect(status.available).toBe(false);
      expect(status.code).toBe("not-implemented");
      expect(status.scripts).toEqual([]);
      expect(status.runningCount).toBe(0);
      expect(status.failedCount).toBe(0);
      expect(Number.isFinite(status.lastCheckedAt)).toBe(true);
      expect(typeof status.diagnostic).toBe("string");
      expect(status.diagnostic!.length).toBeGreaterThan(0);
    });
  });

  describe("lifecycle", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("starts Registered and transitions to Publishing on start()", async () => {
      const provider = createRealNpmProvider();
      expect(provider.status().lifecycle).toBe("Registered");
      provider.start();
      expect(provider.status().lifecycle).toBe("Publishing");
      // Wait for the async start() to settle so we don't leak timers
      await vi.advanceTimersByTimeAsync(0);
      provider.stop();
    });

    it("is idempotent: start() called twice registers no timer and emits nothing", async () => {
      const provider = createRealNpmProvider();
      const events = collectEvents(provider);
      provider.start();
      provider.start();
      expect(provider.status().lifecycle).toBe("Publishing");
      await vi.advanceTimersByTimeAsync(0);
      expect(events).toHaveLength(0);
      expect(vi.getTimerCount()).toBe(0);
      provider.stop();
    });

    it("transitions to Stopped on stop()", async () => {
      const provider = createRealNpmProvider();
      provider.start();
      await vi.advanceTimersByTimeAsync(0);
      provider.stop();
      expect(provider.status().lifecycle).toBe("Stopped");
    });

    it("can be restarted after stop()", async () => {
      const provider = createRealNpmProvider();
      const events = collectEvents(provider);
      provider.start();
      await vi.advanceTimersByTimeAsync(0);
      provider.stop();
      provider.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(provider.status().lifecycle).toBe("Publishing");
      expect(events).toHaveLength(0);
      provider.stop();
    });

    it("stops cleanly before start() and can still start afterwards", async () => {
      const provider = createRealNpmProvider();
      const events = collectEvents(provider);

      expect(() => provider.stop()).not.toThrow();
      expect(provider.status().lifecycle).toBe("Stopped");

      provider.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(provider.status().lifecycle).toBe("Publishing");
      // The unimplemented source still publishes nothing after the restart.
      expect(events).toHaveLength(0);
      provider.stop();
    });
  });

  describe("honest emissions", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("does not invent an npm event when no native source exists", async () => {
      const provider = createRealNpmProvider();
      const events = collectEvents(provider);

      provider.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(events).toHaveLength(0);
      expect(provider.capabilities[0]?.support).toBe("unsupported");
      expect(provider.status().health).toBe("Healthy");
      provider.stop();
    });

    it("registers no poll timer while the source is not implemented", async () => {
      const provider = createRealNpmProvider();
      provider.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(vi.getTimerCount()).toBe(0);
      provider.stop();
    });

    it("emits nothing across poll intervals", async () => {
      const provider = createRealNpmProvider();
      const events = collectEvents(provider);
      provider.start();
      await vi.advanceTimersByTimeAsync(0);

      await vi.advanceTimersByTimeAsync(REAL_NPM_POLL_INTERVAL_MS * 3);
      expect(events).toHaveLength(0);

      provider.stop();
    });

    it("emits nothing to any subscriber while the source is not implemented", async () => {
      const provider = createRealNpmProvider();
      const a = collectEvents(provider);
      const b = collectEvents(provider);
      provider.start();
      await vi.advanceTimersByTimeAsync(REAL_NPM_POLL_INTERVAL_MS * 2);

      expect(a).toHaveLength(0);
      expect(b).toHaveLength(0);
      provider.stop();
    });

    it("uses the public poll interval constant (6_000ms)", () => {
      expect(REAL_NPM_POLL_INTERVAL_MS).toBe(6_000);
    });
  });

  describe("NpmStatusCode coverage", () => {
    it("exposes the NpmStatusCode union literal for downstream consumers", () => {
      const codes: NpmStatusCode[] = ["available", "no-package-json", "not-implemented", "error"];
      for (const code of codes) {
        const status = makeStatus({ code });
        expect(status.code).toBe(code);
      }
    });

    it("makeStatus defaults produce a valid available snapshot (local fixture only)", () => {
      const status = makeStatus();
      expect(status).toEqual({
        available: true,
        scripts: [{ name: "build", status: "success" }],
        runningCount: 0,
        failedCount: 0,
        lastCheckedAt: 1_700_000_000_000,
        code: "available",
      });
    });
  });

  describe("NpmScriptStatus coverage", () => {
    it("exposes the NpmScriptStatus union literal for downstream consumers", () => {
      const statuses: NpmScriptStatus[] = ["idle", "running", "success", "failed"];
      for (const status of statuses) {
        const script = makeScript({ status });
        expect(script.status).toBe(status);
      }
    });

    it("preserves optional durationMs and lastRunAt fields", () => {
      const script = makeScript({
        name: "build",
        status: "success",
        durationMs: 2_300,
        lastRunAt: 1_700_000_000_000,
      });
      expect(script.durationMs).toBe(2_300);
      expect(script.lastRunAt).toBe(1_700_000_000_000);
    });
  });

  describe("injected checker emissions", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("emits the initial snapshot through npmStatusToEvent when an available checker is injected", async () => {
      const checker = vi.fn(async () =>
        makeStatus({
          runningCount: 2,
          failedCount: 1,
          scripts: [
            makeScript({ name: "build", status: "success" }),
            makeScript({ name: "dev", status: "running" }),
            makeScript({ name: "test", status: "running" }),
            makeScript({ name: "lint", status: "failed" }),
          ],
        }),
      );
      const provider = createRealNpmProvider({ checker });
      const events = collectEvents(provider);

      provider.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(checker).toHaveBeenCalledTimes(1);
      expect(events).toHaveLength(1);
      expect(events[0]?.id).toBe(`real-npm-provider-npm-${events[0]?.createdAt}`);
      expect(events[0]?.type).toBe("ai");
      expect(events[0]?.source).toBe("npm");
      expect(events[0]?.createdAt).toBe(1_700_000_000_000);
      expect(events[0]?.expiresAt).toBe(1_700_000_000_000 + REAL_NPM_POLL_INTERVAL_MS + 500);
      expect(events[0]?.payload).toMatchObject({
        id: "npm-status",
        type: "ai",
        title: "npm scripts",
        subtitle: "2 running, 1 failed",
        progress: 75,
        accent: "pink",
      });
      expect(events[0]?.metadata).toMatchObject({ code: "available" });
      provider.stop();
    });

    it("dedupes unchanged polls: no duplicate events while runningCount stays the same", async () => {
      let tick = 0;
      const checker = vi.fn(async () => {
        tick += 1;
        return makeStatus({
          runningCount: tick <= 2 ? 1 : 3,
          lastCheckedAt: 1_700_000_000_000 + tick,
        });
      });
      const provider = createRealNpmProvider({ checker });
      const events = collectEvents(provider);

      provider.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(events).toHaveLength(1);

      // Poll 1: same runningCount/failedCount as the snapshot -> skipped.
      await vi.advanceTimersByTimeAsync(REAL_NPM_POLL_INTERVAL_MS);
      expect(events).toHaveLength(1);

      // Poll 2: runningCount changed -> emitted.
      await vi.advanceTimersByTimeAsync(REAL_NPM_POLL_INTERVAL_MS);
      expect(events).toHaveLength(2);
      expect(events[1]?.payload).toMatchObject({ subtitle: "3 running" });
      provider.stop();
    });

    it("publishes nothing when an injected source flips to unavailable mid-run", async () => {
      let tick = 0;
      const checker = vi.fn(async () => {
        tick += 1;
        if (tick === 1) {
          return makeStatus({ runningCount: 1 });
        }
        return makeStatus({
          available: false,
          scripts: [],
          code: "error",
          diagnostic: "shell bridge went away",
        });
      });
      const provider = createRealNpmProvider({ checker });
      const events = collectEvents(provider);

      provider.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(events).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(REAL_NPM_POLL_INTERVAL_MS * 2);
      expect(events).toHaveLength(1);
      // Unavailable is not degraded: the check answered, the source is gone.
      expect(provider.status().health).toBe("Healthy");
      provider.stop();
    });

    it("marks degraded and registers no timer when the injected initial check rejects", async () => {
      const checker = vi.fn(async () => {
        throw new Error("npm probe failed");
      });
      const provider = createRealNpmProvider({ checker });
      const events = collectEvents(provider);

      provider.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(provider.status().health).toBe("Degraded");
      expect(events).toHaveLength(0);
      expect(vi.getTimerCount()).toBe(0);
      provider.stop();
    });

    it("marks degraded on a mid-run rejection but keeps polling", async () => {
      let tick = 0;
      const checker = vi.fn(async () => {
        tick += 1;
        if (tick === 2) {
          throw new Error("npm probe failed");
        }
        return makeStatus({ runningCount: tick, lastCheckedAt: 1_700_000_000_000 + tick });
      });
      const provider = createRealNpmProvider({ checker });
      const events = collectEvents(provider);

      provider.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(events).toHaveLength(1);

      // Poll 1 rejects: health degrades, nothing is published.
      await vi.advanceTimersByTimeAsync(REAL_NPM_POLL_INTERVAL_MS);
      expect(provider.status().health).toBe("Degraded");
      expect(events).toHaveLength(1);

      // The interval survives the rejection; the next poll publishes again.
      await vi.advanceTimersByTimeAsync(REAL_NPM_POLL_INTERVAL_MS);
      expect(events).toHaveLength(2);
      provider.stop();
    });

    it("stops cleanly: clears the interval and drops an in-flight poll that resolves after stop", async () => {
      const resolvers: Array<(status: NpmStatus) => void> = [];
      const checker = vi.fn(
        () =>
          new Promise<NpmStatus>((resolve) => {
            resolvers.push(resolve);
          }),
      );
      const provider = createRealNpmProvider({ checker });
      const events = collectEvents(provider);

      provider.start();
      resolvers[0]?.(makeStatus({ runningCount: 1 }));
      await vi.advanceTimersByTimeAsync(0);
      expect(events).toHaveLength(1);
      expect(vi.getTimerCount()).toBe(1);

      // The first poll starts but stays pending across the window.
      await vi.advanceTimersByTimeAsync(REAL_NPM_POLL_INTERVAL_MS);
      expect(checker).toHaveBeenCalledTimes(2);

      provider.stop();
      expect(vi.getTimerCount()).toBe(0);
      expect(provider.status().lifecycle).toBe("Stopped");

      // The in-flight poll resolves after stop(): no emission, no degradation.
      resolvers[1]?.(makeStatus({ runningCount: 2, lastCheckedAt: 1_700_000_000_000 + 1 }));
      await vi.advanceTimersByTimeAsync(0);
      expect(events).toHaveLength(1);
      expect(provider.status().health).toBe("Healthy");
    });

    it("keeps the honest default when no checker is injected", async () => {
      const provider = createRealNpmProvider({});
      const events = collectEvents(provider);
      provider.start();
      await vi.advanceTimersByTimeAsync(REAL_NPM_POLL_INTERVAL_MS * 2);
      expect(events).toHaveLength(0);
      expect(vi.getTimerCount()).toBe(0);
      provider.stop();
    });
  });
});

describe("npmStatusToEvent", () => {
  const BASE = 1_700_000_000_000;

  it("maps an available snapshot with running and failed scripts", () => {
    const event = npmStatusToEvent(
      makeStatus({
        lastCheckedAt: BASE,
        runningCount: 2,
        failedCount: 1,
        scripts: [
          makeScript({ name: "build", status: "success" }),
          makeScript({ name: "dev", status: "running" }),
          makeScript({ name: "test", status: "running" }),
          makeScript({ name: "lint", status: "failed" }),
        ],
      }),
    );

    expect(event.id).toBe(`real-npm-provider-npm-${BASE}`);
    expect(event.type).toBe("ai");
    expect(event.source).toBe("npm");
    expect(event.createdAt).toBe(BASE);
    expect(event.expiresAt).toBe(BASE + REAL_NPM_POLL_INTERVAL_MS + 500);
    expect(event.payload).toMatchObject({
      id: "npm-status",
      type: "ai",
      title: "npm scripts",
      subtitle: "2 running, 1 failed",
      progress: 75,
      accent: "pink",
    });
    expect(event.metadata).toMatchObject({ code: "available" });
  });

  it("reports all idle with full progress when nothing is running or failed", () => {
    const event = npmStatusToEvent(makeStatus({ runningCount: 0, failedCount: 0 }));
    expect(event.payload).toMatchObject({ subtitle: "all idle", progress: 100 });
  });

  it("keeps the unavailable title and diagnostic subtitle without fabricating progress", () => {
    const event = npmStatusToEvent(
      makeStatus({
        available: false,
        scripts: [],
        code: "not-implemented",
        diagnostic: "npm script observation is not implemented",
      }),
    );
    expect(event.payload).toMatchObject({
      title: "npm (no package.json)",
      subtitle: "npm script observation is not implemented",
      progress: 0,
    });
    expect(event.metadata).toMatchObject({ code: "not-implemented" });
  });

  it("falls back to the generic no-scripts subtitle when an unavailable status has no diagnostic", () => {
    const event = npmStatusToEvent(
      makeStatus({ available: false, scripts: [], code: "error", diagnostic: undefined }),
    );
    expect(event.payload).toMatchObject({
      title: "npm (no package.json)",
      subtitle: "no scripts",
      progress: 0,
    });
  });
});
