import type { HubEvent } from "@/entities";

import { createProviderShell } from "../../core/providerShell";
import type { HubProvider, HubProviderCapability, HubProviderMetadata } from "../../core/types";

const PROVIDER_ID = "real-docker-provider";
const POLL_INTERVAL_MS = 5_000;

export type DockerContainerStatus = "running" | "stopped" | "exited" | "paused" | "unknown";

export type DockerContainer = {
  name: string;
  status: DockerContainerStatus;
  image: string;
  ports: string;
};

export type DockerStatusCode =
  "available" | "no-docker-cli" | "docker-daemon-down" | "not-implemented" | "error";

export type DockerStatus = {
  available: boolean;
  containers: DockerContainer[];
  runningCount: number;
  lastCheckedAt: number;
  code: DockerStatusCode;
  diagnostic?: string;
};

export type DockerProviderOptions = {
  /**
   * Overrides the status check used for the initial snapshot and every
   * poll. Production never passes this: the default remains the honest
   * `not-implemented` module-local stub below (see #59).
   */
  checker?: () => Promise<DockerStatus>;
};

export function dockerStatusToEvent(status: DockerStatus): HubEvent {
  const createdAt = status.lastCheckedAt;

  // Build subtitle summarizing container states
  const total = status.containers.length;
  const running = status.runningCount;
  const subtitle = status.available
    ? `${running}/${total} container(s) running`
    : (status.diagnostic ?? "Docker unavailable");

  return {
    id: `${PROVIDER_ID}-docker-${createdAt}`,
    type: "ai",
    source: "docker",
    createdAt,
    expiresAt: createdAt + POLL_INTERVAL_MS + 500,
    payload: {
      id: "docker-status",
      type: "ai",
      title: status.available ? "Docker" : "Docker (offline)",
      subtitle,
      // progress shows the fraction of running containers (0-100)
      progress: total > 0 ? Math.round((running / total) * 100) : 0,
      accent: "cyan",
    },
    metadata: {
      code: status.code,
      containers: status.containers,
    },
  };
}

/**
 * Stage 6 scaffolding: no native source for Docker state exists yet —
 * there is no Tauri shell bridge to run `docker ps`. The check therefore
 * reports an honest `not-implemented` unavailable result with no fabricated
 * containers. Once the shell bridge is available this function should call
 * `docker ps --format "{{.Names}}\t{{.Status}}\t{{.Image}}\t{{.Ports}}"`
 * and parse the output into a DockerStatus.
 */
export async function checkDockerStatus(): Promise<DockerStatus> {
  return {
    available: false,
    containers: [],
    runningCount: 0,
    lastCheckedAt: Date.now(),
    code: "not-implemented",
    diagnostic: "Docker observation is not implemented: no native shell bridge exists yet.",
  };
}

export function createRealDockerProvider(options: DockerProviderOptions = {}): HubProvider {
  // Injection seam for tests. With no options this is exactly the honest
  // module-local stub, so the production call sites behave identically.
  const checkStatus: () => Promise<DockerStatus> = options.checker ?? checkDockerStatus;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let lastEmittedRunningCount: number | undefined;
  let lastEmittedTotalCount: number | undefined;

  const metadata: HubProviderMetadata = {
    id: PROVIDER_ID,
    name: "Real Docker Provider",
    kind: "docker",
    version: "1.0.0",
    mock: false,
  };

  const capabilities: HubProviderCapability[] = [
    { id: "docker", kind: "docker", origin: "real", support: "unsupported" },
  ];

  return createProviderShell({
    metadata,
    capabilities,

    async start(handle) {
      const initial = await checkStatus().catch(() => undefined);
      if (!initial) {
        handle.markDegraded();
        return;
      }
      if (!initial.available) {
        // No native source exists yet. Publishing this snapshot would put a
        // fabricated "Docker" card with invented containers on the bar, so
        // the provider stays idle and reports nothing. The capability
        // already advertises `unsupported`; the diagnostic vocabulary
        // carries `not-implemented` for the same fact.
        return;
      }

      lastEmittedRunningCount = initial.runningCount;
      lastEmittedTotalCount = initial.containers.length;
      handle.emit([dockerStatusToEvent(initial)]);

      pollTimer = setInterval(async () => {
        const next = await checkStatus().catch(() => undefined);
        if (!next) {
          handle.markDegraded();
          return;
        }
        if (!next.available) {
          // The source went away mid-run: publish nothing rather than a
          // stale or invented snapshot.
          return;
        }

        // Skip identical emissions (no state change)
        if (
          lastEmittedRunningCount === next.runningCount &&
          lastEmittedTotalCount === next.containers.length
        ) {
          return;
        }
        lastEmittedRunningCount = next.runningCount;
        lastEmittedTotalCount = next.containers.length;
        handle.emit([dockerStatusToEvent(next)]);
      }, POLL_INTERVAL_MS);
    },

    stop() {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = undefined;
      }
    },
  });
}

export const REAL_DOCKER_POLL_INTERVAL_MS = POLL_INTERVAL_MS;
