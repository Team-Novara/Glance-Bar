import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  REAL_DOCKER_POLL_INTERVAL_MS,
  checkDockerStatus,
  createRealDockerProvider,
  dockerStatusToEvent,
  type DockerContainer,
  type DockerContainerStatus,
  type DockerStatus,
  type DockerStatusCode,
} from "./realDockerProvider";
import type { HubProvider } from "../../core/types";

function collectEvents(provider: HubProvider) {
  const events: ReturnType<Parameters<HubProvider["subscribe"]>[0]> = [];
  provider.subscribe((batch) => {
    events.push(...batch);
  });
  return events;
}

/** Local fixture builder for type-coverage asserts only — never provider output. */
function makeContainer(overrides: Partial<DockerContainer> = {}): DockerContainer {
  return {
    name: "test-container",
    status: "running",
    image: "alpine:latest",
    ports: "80/tcp",
    ...overrides,
  };
}

/** Local fixture builder for type-coverage asserts only — never provider output. */
function makeStatus(overrides: Partial<DockerStatus> = {}): DockerStatus {
  return {
    available: true,
    containers: [makeContainer()],
    runningCount: 1,
    lastCheckedAt: 1_700_000_000_000,
    code: "available",
    ...overrides,
  };
}

describe("createRealDockerProvider", () => {
  describe("metadata and capabilities", () => {
    it("uses the real-docker-provider id, docker kind, and version 1.0.0", () => {
      const provider = createRealDockerProvider();
      expect(provider.id).toBe("real-docker-provider");
      expect(provider.label).toBe("Real Docker Provider");
      expect(provider.metadata.id).toBe("real-docker-provider");
      expect(provider.metadata.name).toBe("Real Docker Provider");
      expect(provider.metadata.kind).toBe("docker");
      expect(provider.metadata.version).toBe("1.0.0");
      expect(provider.metadata.mock).toBe(false);
    });

    it("advertises a single docker capability with origin=real and support=unsupported", () => {
      const provider = createRealDockerProvider();
      expect(provider.capabilities).toHaveLength(1);
      expect(provider.capabilities[0]).toEqual({
        id: "docker",
        kind: "docker",
        origin: "real",
        support: "unsupported",
      });
    });
  });

  describe("honest status check", () => {
    it("reports not-implemented and unavailable with no fabricated containers", async () => {
      const status = await checkDockerStatus();

      expect(status.available).toBe(false);
      expect(status.code).toBe("not-implemented");
      expect(status.containers).toEqual([]);
      expect(status.runningCount).toBe(0);
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
      const provider = createRealDockerProvider();
      expect(provider.status().lifecycle).toBe("Registered");
      provider.start();
      expect(provider.status().lifecycle).toBe("Publishing");
      // Wait for the async start() to settle so we don't leak timers
      await vi.advanceTimersByTimeAsync(0);
      provider.stop();
    });

    it("is idempotent: start() called twice registers no timer and emits nothing", async () => {
      const provider = createRealDockerProvider();
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
      const provider = createRealDockerProvider();
      provider.start();
      await vi.advanceTimersByTimeAsync(0);
      provider.stop();
      expect(provider.status().lifecycle).toBe("Stopped");
    });

    it("can be restarted after stop()", async () => {
      const provider = createRealDockerProvider();
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
      const provider = createRealDockerProvider();
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

    it("does not invent a docker event when no native source exists", async () => {
      const provider = createRealDockerProvider();
      const events = collectEvents(provider);

      provider.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(events).toHaveLength(0);
      expect(provider.capabilities[0]?.support).toBe("unsupported");
      expect(provider.status().health).toBe("Healthy");
      provider.stop();
    });

    it("registers no poll timer while the source is not implemented", async () => {
      const provider = createRealDockerProvider();
      provider.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(vi.getTimerCount()).toBe(0);
      provider.stop();
    });

    it("emits nothing across poll intervals", async () => {
      const provider = createRealDockerProvider();
      const events = collectEvents(provider);
      provider.start();
      await vi.advanceTimersByTimeAsync(0);

      await vi.advanceTimersByTimeAsync(REAL_DOCKER_POLL_INTERVAL_MS * 3);
      expect(events).toHaveLength(0);

      provider.stop();
    });

    it("emits nothing to any subscriber while the source is not implemented", async () => {
      const provider = createRealDockerProvider();
      const a = collectEvents(provider);
      const b = collectEvents(provider);
      provider.start();
      await vi.advanceTimersByTimeAsync(REAL_DOCKER_POLL_INTERVAL_MS * 2);

      expect(a).toHaveLength(0);
      expect(b).toHaveLength(0);
      provider.stop();
    });

    it("uses the public poll interval constant (5_000ms)", () => {
      expect(REAL_DOCKER_POLL_INTERVAL_MS).toBe(5_000);
    });
  });

  describe("DockerStatusCode coverage", () => {
    it("exposes the DockerStatusCode union literal for downstream consumers", () => {
      const codes: DockerStatusCode[] = [
        "available",
        "no-docker-cli",
        "docker-daemon-down",
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
        containers: [
          {
            name: "test-container",
            status: "running",
            image: "alpine:latest",
            ports: "80/tcp",
          },
        ],
        runningCount: 1,
        lastCheckedAt: 1_700_000_000_000,
        code: "available",
      });
    });
  });

  describe("DockerContainerStatus coverage", () => {
    it("exposes the DockerContainerStatus union literal for downstream consumers", () => {
      const statuses: DockerContainerStatus[] = [
        "running",
        "stopped",
        "exited",
        "paused",
        "unknown",
      ];
      for (const status of statuses) {
        const container = makeContainer({ status });
        expect(container.status).toBe(status);
      }
    });
  });

  describe("injected checker emissions", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("emits the initial snapshot through dockerStatusToEvent when an available checker is injected", async () => {
      const checker = vi.fn(async () =>
        makeStatus({
          runningCount: 2,
          containers: [
            makeContainer({ name: "web", status: "running" }),
            makeContainer({ name: "db", status: "running" }),
            makeContainer({ name: "cache", status: "exited" }),
          ],
        }),
      );
      const provider = createRealDockerProvider({ checker });
      const events = collectEvents(provider);

      provider.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(checker).toHaveBeenCalledTimes(1);
      expect(events).toHaveLength(1);
      expect(events[0]?.id).toBe(`real-docker-provider-docker-${events[0]?.createdAt}`);
      expect(events[0]?.type).toBe("ai");
      expect(events[0]?.source).toBe("docker");
      expect(events[0]?.createdAt).toBe(1_700_000_000_000);
      expect(events[0]?.expiresAt).toBe(1_700_000_000_000 + REAL_DOCKER_POLL_INTERVAL_MS + 500);
      expect(events[0]?.payload).toMatchObject({
        id: "docker-status",
        type: "ai",
        title: "Docker",
        subtitle: "2/3 container(s) running",
        progress: 67,
        accent: "cyan",
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
      const provider = createRealDockerProvider({ checker });
      const events = collectEvents(provider);

      provider.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(events).toHaveLength(1);

      // Poll 1: same runningCount/total as the snapshot -> skipped.
      await vi.advanceTimersByTimeAsync(REAL_DOCKER_POLL_INTERVAL_MS);
      expect(events).toHaveLength(1);

      // Poll 2: runningCount changed -> emitted.
      await vi.advanceTimersByTimeAsync(REAL_DOCKER_POLL_INTERVAL_MS);
      expect(events).toHaveLength(2);
      expect(events[1]?.payload).toMatchObject({ subtitle: "3/1 container(s) running" });
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
          containers: [],
          runningCount: 0,
          code: "docker-daemon-down",
          diagnostic: "daemon went down mid-run",
        });
      });
      const provider = createRealDockerProvider({ checker });
      const events = collectEvents(provider);

      provider.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(events).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(REAL_DOCKER_POLL_INTERVAL_MS * 2);
      expect(events).toHaveLength(1);
      // Unavailable is not degraded: the check answered, the source is gone.
      expect(provider.status().health).toBe("Healthy");
      provider.stop();
    });

    it("marks degraded and registers no timer when the injected initial check rejects", async () => {
      const checker = vi.fn(async () => {
        throw new Error("docker probe failed");
      });
      const provider = createRealDockerProvider({ checker });
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
          throw new Error("docker probe failed");
        }
        return makeStatus({ runningCount: tick, lastCheckedAt: 1_700_000_000_000 + tick });
      });
      const provider = createRealDockerProvider({ checker });
      const events = collectEvents(provider);

      provider.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(events).toHaveLength(1);

      // Poll 1 rejects: health degrades, nothing is published.
      await vi.advanceTimersByTimeAsync(REAL_DOCKER_POLL_INTERVAL_MS);
      expect(provider.status().health).toBe("Degraded");
      expect(events).toHaveLength(1);

      // The interval survives the rejection; the next poll publishes again.
      await vi.advanceTimersByTimeAsync(REAL_DOCKER_POLL_INTERVAL_MS);
      expect(events).toHaveLength(2);
      provider.stop();
    });

    it("stops cleanly: clears the interval and drops an in-flight poll that resolves after stop", async () => {
      const resolvers: Array<(status: DockerStatus) => void> = [];
      const checker = vi.fn(
        () =>
          new Promise<DockerStatus>((resolve) => {
            resolvers.push(resolve);
          }),
      );
      const provider = createRealDockerProvider({ checker });
      const events = collectEvents(provider);

      provider.start();
      resolvers[0]?.(makeStatus({ runningCount: 1 }));
      await vi.advanceTimersByTimeAsync(0);
      expect(events).toHaveLength(1);
      expect(vi.getTimerCount()).toBe(1);

      // The first poll starts but stays pending across the window.
      await vi.advanceTimersByTimeAsync(REAL_DOCKER_POLL_INTERVAL_MS);
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
      const provider = createRealDockerProvider({});
      const events = collectEvents(provider);
      provider.start();
      await vi.advanceTimersByTimeAsync(REAL_DOCKER_POLL_INTERVAL_MS * 2);
      expect(events).toHaveLength(0);
      expect(vi.getTimerCount()).toBe(0);
      provider.stop();
    });
  });
});

describe("dockerStatusToEvent", () => {
  const BASE = 1_700_000_000_000;

  it("maps an available snapshot with the running fraction", () => {
    const event = dockerStatusToEvent(
      makeStatus({
        lastCheckedAt: BASE,
        runningCount: 2,
        containers: [
          makeContainer({ name: "web", status: "running" }),
          makeContainer({ name: "db", status: "running" }),
          makeContainer({ name: "cache", status: "exited" }),
        ],
      }),
    );

    expect(event.id).toBe(`real-docker-provider-docker-${BASE}`);
    expect(event.type).toBe("ai");
    expect(event.source).toBe("docker");
    expect(event.createdAt).toBe(BASE);
    expect(event.expiresAt).toBe(BASE + REAL_DOCKER_POLL_INTERVAL_MS + 500);
    expect(event.payload).toMatchObject({
      id: "docker-status",
      type: "ai",
      title: "Docker",
      subtitle: "2/3 container(s) running",
      progress: 67,
      accent: "cyan",
    });
    expect(event.metadata).toMatchObject({ code: "available" });
  });

  it("reports zero progress for an available snapshot with no containers", () => {
    const event = dockerStatusToEvent(makeStatus({ containers: [], runningCount: 0 }));
    expect(event.payload).toMatchObject({
      title: "Docker",
      subtitle: "0/0 container(s) running",
      progress: 0,
    });
  });

  it("keeps the offline title and diagnostic subtitle when unavailable", () => {
    const event = dockerStatusToEvent(
      makeStatus({
        available: false,
        containers: [],
        runningCount: 0,
        code: "docker-daemon-down",
        diagnostic: "docker daemon is down",
      }),
    );
    expect(event.payload).toMatchObject({
      title: "Docker (offline)",
      subtitle: "docker daemon is down",
      progress: 0,
    });
    expect(event.metadata).toMatchObject({ code: "docker-daemon-down" });
  });

  it("falls back to the generic offline subtitle when no diagnostic is present", () => {
    const event = dockerStatusToEvent(
      makeStatus({
        available: false,
        containers: [],
        runningCount: 0,
        code: "no-docker-cli",
        diagnostic: undefined,
      }),
    );
    expect(event.payload).toMatchObject({
      title: "Docker (offline)",
      subtitle: "Docker unavailable",
      progress: 0,
    });
  });
});
