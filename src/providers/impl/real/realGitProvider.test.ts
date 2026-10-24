import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  REAL_GIT_POLL_INTERVAL_MS,
  checkGitStatus,
  createRealGitProvider,
  type GitStatus,
  type GitStatusCode,
} from "./realGitProvider";
import type { HubProvider } from "../../core/types";

function collectEvents(provider: HubProvider) {
  const events: ReturnType<Parameters<HubProvider["subscribe"]>[0]> = [];
  provider.subscribe((batch) => {
    events.push(...batch);
  });
  return events;
}

/** Local fixture builder for type-coverage asserts only — never provider output. */
function makeStatus(overrides: Partial<GitStatus> = {}): GitStatus {
  return {
    available: true,
    modifiedCount: 0,
    branch: "main",
    lastCheckedAt: 1_700_000_000_000,
    code: "available",
    ...overrides,
  };
}

describe("createRealGitProvider", () => {
  describe("metadata and capabilities", () => {
    it("uses the real-git-provider id, git kind, and version 1.0.0", () => {
      const provider = createRealGitProvider();
      expect(provider.id).toBe("real-git-provider");
      expect(provider.label).toBe("Real Git Provider");
      expect(provider.metadata.id).toBe("real-git-provider");
      expect(provider.metadata.name).toBe("Real Git Provider");
      expect(provider.metadata.kind).toBe("git");
      expect(provider.metadata.version).toBe("1.0.0");
      expect(provider.metadata.mock).toBe(false);
    });

    it("advertises a single git capability with origin=real and support=unsupported", () => {
      const provider = createRealGitProvider();
      expect(provider.capabilities).toHaveLength(1);
      expect(provider.capabilities[0]).toEqual({
        id: "git",
        kind: "git",
        origin: "real",
        support: "unsupported",
      });
    });
  });

  describe("honest status check", () => {
    it("reports not-implemented and unavailable with no fabricated branch state", async () => {
      const status = await checkGitStatus();

      expect(status.available).toBe(false);
      expect(status.code).toBe("not-implemented");
      expect(status.branch).toBeNull();
      expect(status.modifiedCount).toBe(0);
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
      const provider = createRealGitProvider();
      expect(provider.status().lifecycle).toBe("Registered");
      provider.start();
      expect(provider.status().lifecycle).toBe("Publishing");
      // Wait for the async start() to settle so we don't leak timers
      await vi.advanceTimersByTimeAsync(0);
      provider.stop();
    });

    it("is idempotent: start() called twice registers no timer and emits nothing", async () => {
      const provider = createRealGitProvider();
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
      const provider = createRealGitProvider();
      provider.start();
      await vi.advanceTimersByTimeAsync(0);
      provider.stop();
      expect(provider.status().lifecycle).toBe("Stopped");
    });

    it("can be restarted after stop()", async () => {
      const provider = createRealGitProvider();
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

    it("does not invent a git event when no native source exists", async () => {
      const provider = createRealGitProvider();
      const events = collectEvents(provider);

      provider.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(events).toHaveLength(0);
      expect(provider.capabilities[0]?.support).toBe("unsupported");
      expect(provider.status().health).toBe("Healthy");
      provider.stop();
    });

    it("registers no poll timer while the source is not implemented", async () => {
      const provider = createRealGitProvider();
      provider.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(vi.getTimerCount()).toBe(0);
      provider.stop();
    });

    it("emits nothing across poll intervals", async () => {
      const provider = createRealGitProvider();
      const events = collectEvents(provider);
      provider.start();
      await vi.advanceTimersByTimeAsync(0);

      await vi.advanceTimersByTimeAsync(REAL_GIT_POLL_INTERVAL_MS * 3);
      expect(events).toHaveLength(0);

      provider.stop();
    });

    it("emits nothing to any subscriber while the source is not implemented", async () => {
      const provider = createRealGitProvider();
      const a = collectEvents(provider);
      const b = collectEvents(provider);
      provider.start();
      await vi.advanceTimersByTimeAsync(REAL_GIT_POLL_INTERVAL_MS * 2);

      expect(a).toHaveLength(0);
      expect(b).toHaveLength(0);
      provider.stop();
    });

    it("uses the public poll interval constant (5_000ms)", () => {
      expect(REAL_GIT_POLL_INTERVAL_MS).toBe(5_000);
    });
  });

  describe("GitStatusCode coverage", () => {
    it("exposes the GitStatusCode union literal for downstream consumers", () => {
      const codes: GitStatusCode[] = [
        "available",
        "no-repo",
        "no-git-cli",
        "not-implemented",
        "error",
      ];
      for (const code of codes) {
        const status = makeStatus({ code });
        expect(status.code).toBe(code);
      }
    });

    it("makeStatus defaults produce a valid available snapshot (local fixture only)", () => {
      const status = makeStatus();
      expect(status).toEqual({
        available: true,
        modifiedCount: 0,
        branch: "main",
        lastCheckedAt: 1_700_000_000_000,
        code: "available",
      });
    });
  });
});
