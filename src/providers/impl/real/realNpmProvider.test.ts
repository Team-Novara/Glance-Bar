import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  REAL_NPM_POLL_INTERVAL_MS,
  checkNpmStatus,
  createRealNpmProvider,
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
});
