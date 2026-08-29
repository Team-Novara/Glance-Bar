import { createProviderShell } from "./providerShell";
import type { HubProvider, HubProviderCapability, HubProviderMetadata } from "./types";
import {
  loadSystemPerformanceStatus,
  type SystemStatusDiagnostic,
} from "../runtime/system/systemPerformanceRuntime";
import { getTauriInvoke } from "../runtime/tauri/tauriRuntime";
import type { HubEvent } from "../types/hub";
import type { SystemPerformanceSnapshot } from "../types/hub";

const PROVIDER_ID = "real-system-performance-provider";
const POLL_INTERVAL_MS = 1_800;

function createSystemPerformanceEvent(
  snapshot: SystemPerformanceSnapshot,
  quality: string,
): HubEvent {
  const createdAt = Date.now();

  return {
    id: `${PROVIDER_ID}-system-${createdAt}`,
    type: "system",
    source: "system",
    createdAt,
    expiresAt: createdAt + POLL_INTERVAL_MS + 500,
    payload: {
      cpu: snapshot.cpu,
      memory: snapshot.memory,
      downloadSpeed: snapshot.downloadSpeed,
      uploadSpeed: snapshot.uploadSpeed,
      quality: quality as "live" | "fallback" | "stale" | "unavailable",
    },
  };
}

export function createRealSystemPerformanceProvider(): HubProvider {
  let diagnostic: SystemStatusDiagnostic | undefined;
  let pollTimer: ReturnType<typeof setInterval> | undefined;

  const metadata: HubProviderMetadata = {
    id: PROVIDER_ID,
    name: "System Performance Provider",
    kind: "system",
    version: "1.0.0",
    mock: false,
  };

  const capabilities: HubProviderCapability[] = [
    { id: "system", kind: "system", origin: "real", support: "available" },
  ];

  return createProviderShell({
    metadata,
    capabilities,

    start(handle) {
      async function poll() {
        const invoke = getTauriInvoke();
        const result = await loadSystemPerformanceStatus({
          invoke,
          lastSuccessfulSource: diagnostic?.lastSuccessfulSource,
        });

        diagnostic = result.diagnostic;

        if (result.diagnostic.quality === "live" || result.diagnostic.quality === "fallback") {
          const byId = new Map(result.metrics.map((m) => [m.id, m.value]));
          const snapshot: SystemPerformanceSnapshot = {
            cpu: byId.get("cpu") ?? 0,
            memory: byId.get("memory") ?? 0,
            downloadSpeed: byId.get("download") ?? 0,
            uploadSpeed: byId.get("upload") ?? 0,
          };

          handle.emit([createSystemPerformanceEvent(snapshot, result.diagnostic.quality)]);
        } else {
          handle.markDegraded();
        }
      }

      void poll();

      pollTimer = setInterval(() => {
        void poll();
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
