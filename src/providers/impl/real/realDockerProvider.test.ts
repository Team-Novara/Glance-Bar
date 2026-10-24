import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  REAL_DOCKER_POLL_INTERVAL_MS,
  checkDockerStatus,
  createRealDockerProvider,
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
});
