import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  REAL_GIT_POLL_INTERVAL_MS,
  checkGitStatus,
  createRealGitProvider,
  gitStatusToEvent,
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

    it("stops cleanly before start() and can still start afterwards", async () => {
      const provider = createRealGitProvider();
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

  describe("injected checker emissions", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("emits the initial snapshot through gitStatusToEvent when an available checker is injected", async () => {
      const checker = vi.fn(async () => makeStatus({ modifiedCount: 3, branch: "feat/checker" }));
      const provider = createRealGitProvider({ checker });
      const events = collectEvents(provider);

      provider.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(checker).toHaveBeenCalledTimes(1);
      expect(events).toHaveLength(1);
      expect(events[0]?.id).toBe(`real-git-provider-git-${events[0]?.createdAt}`);
      expect(events[0]?.type).toBe("ai");
      expect(events[0]?.source).toBe("git");
      expect(events[0]?.createdAt).toBe(1_700_000_000_000);
      expect(events[0]?.expiresAt).toBe(1_700_000_000_000 + REAL_GIT_POLL_INTERVAL_MS + 500);
      expect(events[0]?.payload).toMatchObject({
        id: "git-status",
        type: "ai",
        title: "Git: feat/checker",
        subtitle: "3 file(s) modified",
        progress: 30,
        accent: "pink",
      });
      expect(events[0]?.metadata).toMatchObject({ code: "available" });
      provider.stop();
    });

    it("dedupes unchanged polls: no duplicate events while modifiedCount and branch stay the same", async () => {
      let tick = 0;
      const checker = vi.fn(async () => {
        tick += 1;
        return makeStatus({
          modifiedCount: tick <= 2 ? 1 : 5,
          branch: "main",
          lastCheckedAt: 1_700_000_000_000 + tick,
        });
      });
      const provider = createRealGitProvider({ checker });
      const events = collectEvents(provider);

      provider.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(events).toHaveLength(1);

      // Poll 1: same modifiedCount/branch as the snapshot -> skipped.
      await vi.advanceTimersByTimeAsync(REAL_GIT_POLL_INTERVAL_MS);
      expect(events).toHaveLength(1);

      // Poll 2: modifiedCount changed -> emitted.
      await vi.advanceTimersByTimeAsync(REAL_GIT_POLL_INTERVAL_MS);
      expect(events).toHaveLength(2);
      expect(events[1]?.payload).toMatchObject({
        title: "Git: main",
        subtitle: "5 file(s) modified",
        progress: 50,
      });
      provider.stop();
    });

    it("publishes nothing when an injected source flips to unavailable mid-run", async () => {
      let tick = 0;
      const checker = vi.fn(async () => {
        tick += 1;
        if (tick === 1) {
          return makeStatus({ modifiedCount: 1 });
        }
        return makeStatus({
          available: false,
          code: "error",
          diagnostic: "git CLI went away",
        });
      });
      const provider = createRealGitProvider({ checker });
      const events = collectEvents(provider);

      provider.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(events).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(REAL_GIT_POLL_INTERVAL_MS * 2);
      expect(events).toHaveLength(1);
      // Unavailable is not degraded: the check answered, the source is gone.
      expect(provider.status().health).toBe("Healthy");
      provider.stop();
    });

    it("marks degraded and registers no timer when the injected initial check rejects", async () => {
      const checker = vi.fn(async () => {
        throw new Error("git probe failed");
      });
      const provider = createRealGitProvider({ checker });
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
          throw new Error("git probe failed");
        }
        return makeStatus({ modifiedCount: tick, lastCheckedAt: 1_700_000_000_000 + tick });
      });
      const provider = createRealGitProvider({ checker });
      const events = collectEvents(provider);

      provider.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(events).toHaveLength(1);

      // Poll 1 rejects: health degrades, nothing is published.
      await vi.advanceTimersByTimeAsync(REAL_GIT_POLL_INTERVAL_MS);
      expect(provider.status().health).toBe("Degraded");
      expect(events).toHaveLength(1);

      // The interval survives the rejection; the next poll publishes again.
      await vi.advanceTimersByTimeAsync(REAL_GIT_POLL_INTERVAL_MS);
      expect(events).toHaveLength(2);
      provider.stop();
    });

    it("stops cleanly: clears the interval and drops an in-flight poll that resolves after stop", async () => {
      const resolvers: Array<(status: GitStatus) => void> = [];
      const checker = vi.fn(
        () =>
          new Promise<GitStatus>((resolve) => {
            resolvers.push(resolve);
          }),
      );
      const provider = createRealGitProvider({ checker });
      const events = collectEvents(provider);

      provider.start();
      resolvers[0]?.(makeStatus({ modifiedCount: 1 }));
      await vi.advanceTimersByTimeAsync(0);
      expect(events).toHaveLength(1);
      expect(vi.getTimerCount()).toBe(1);

      // The first poll starts but stays pending across the window.
      await vi.advanceTimersByTimeAsync(REAL_GIT_POLL_INTERVAL_MS);
      expect(checker).toHaveBeenCalledTimes(2);

      provider.stop();
      expect(vi.getTimerCount()).toBe(0);
      expect(provider.status().lifecycle).toBe("Stopped");

      // The in-flight poll resolves after stop(): no emission, no degradation.
      resolvers[1]?.(makeStatus({ modifiedCount: 2, lastCheckedAt: 1_700_000_000_000 + 1 }));
      await vi.advanceTimersByTimeAsync(0);
      expect(events).toHaveLength(1);
      expect(provider.status().health).toBe("Healthy");
    });

    it("keeps the honest default when no checker is injected", async () => {
      const provider = createRealGitProvider({});
      const events = collectEvents(provider);
      provider.start();
      await vi.advanceTimersByTimeAsync(REAL_GIT_POLL_INTERVAL_MS * 2);
      expect(events).toHaveLength(0);
      expect(vi.getTimerCount()).toBe(0);
      provider.stop();
    });
  });
});

describe("gitStatusToEvent", () => {
  const BASE = 1_700_000_000_000;

  it("maps an available snapshot with a branch title and capped progress", () => {
    const event = gitStatusToEvent(
      makeStatus({ lastCheckedAt: BASE, modifiedCount: 12, branch: "main" }),
    );

    expect(event.id).toBe(`real-git-provider-git-${BASE}`);
    expect(event.type).toBe("ai");
    expect(event.source).toBe("git");
    expect(event.createdAt).toBe(BASE);
    expect(event.expiresAt).toBe(BASE + REAL_GIT_POLL_INTERVAL_MS + 500);
    expect(event.payload).toMatchObject({
      id: "git-status",
      type: "ai",
      title: "Git: main",
      subtitle: "12 file(s) modified",
      progress: 100,
      accent: "pink",
    });
    expect(event.metadata).toMatchObject({ code: "available" });
  });

  it("falls back to the generic title for a branchless available snapshot", () => {
    const event = gitStatusToEvent(makeStatus({ branch: null, modifiedCount: 0 }));
    expect(event.payload).toMatchObject({
      title: "Git status",
      subtitle: "0 file(s) modified",
      progress: 0,
    });
  });

  it("keeps the diagnostic subtitle when unavailable", () => {
    const event = gitStatusToEvent(
      makeStatus({
        available: false,
        branch: null,
        code: "no-git-cli",
        diagnostic: "git CLI not found",
      }),
    );
    expect(event.payload).toMatchObject({
      title: "Git status",
      subtitle: "git CLI not found",
      progress: 0,
    });
    expect(event.metadata).toMatchObject({ code: "no-git-cli" });
  });

  it("still titles a known branch when unavailable", () => {
    const event = gitStatusToEvent(
      makeStatus({ available: false, branch: "main", code: "error", diagnostic: "boom" }),
    );
    expect(event.payload).toMatchObject({ title: "Git: main", subtitle: "boom" });
  });

  it("falls back to the generic unavailable subtitle when no diagnostic is present", () => {
    const event = gitStatusToEvent(
      makeStatus({ available: false, branch: null, code: "no-repo", diagnostic: undefined }),
    );
    expect(event.payload).toMatchObject({
      title: "Git status",
      subtitle: "unavailable",
      progress: 0,
    });
  });
});
