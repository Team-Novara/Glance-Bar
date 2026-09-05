import type { HubEvent } from "@/entities";
import type { SystemPerformanceSnapshot } from "@/entities";

import {
  loadSystemPerformanceStatus,
  type SystemStatusDiagnostic,
} from "../../../runtime/system/systemPerformanceRuntime";
import { getTauriInvoke } from "../../../runtime/tauri/tauriRuntime";
import { createProviderShell } from "../../core/providerShell";
import type { HubProvider, HubProviderCapability, HubProviderMetadata } from "../../core/types";

const PROVIDER_ID = "real-system-performance-provider";
const POLL_INTERVAL_MS = 1_800;
const SYSTEM_EVENT_ID = `${PROVIDER_ID}-system-observation`;
const EVENT_EXPIRY_GRACE_MS = 500;
const UNAVAILABLE_AFTER_MS = 9_000;

function createSystemPerformanceEvent(
  snapshot: SystemPerformanceSnapshot,
  diagnostic: SystemStatusDiagnostic,
): HubEvent {
  const createdAt = Date.now();

  return {
    // One logical observation replaces the previous sample in the event bus.
    // This prevents a failed poll from leaving an older live sample in the
    // resident card while still allowing the scheduler to use the bounded
    // expiry window as a freshness guarantee.
    id: SYSTEM_EVENT_ID,
    type: "system",
    source: "system",
    createdAt,
    expiresAt: createdAt + POLL_INTERVAL_MS + EVENT_EXPIRY_GRACE_MS,
    payload: {
      cpu: snapshot.cpu,
      memory: snapshot.memory,
      downloadSpeed: snapshot.downloadSpeed,
      uploadSpeed: snapshot.uploadSpeed,
      quality: diagnostic.quality,
      code: diagnostic.code,
      checkedAt: createdAt,
    },
    metadata: {
      code: diagnostic.code,
      source: diagnostic.source,
      checkedAt: createdAt,
    },
  };
}

export function createRealSystemPerformanceProvider(): HubProvider {
  let diagnostic: SystemStatusDiagnostic | undefined;
  let lastSnapshot: SystemPerformanceSnapshot | undefined;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let generation = 0;
  let pollInFlight = false;
  let lastSuccessfulAt: number | undefined;

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
      const currentGeneration = ++generation;

      async function poll() {
        if (pollInFlight) {
          return;
        }
        pollInFlight = true;

        try {
          const invoke = getTauriInvoke();
          const result = await loadSystemPerformanceStatus({
            invoke,
            fallbackMetrics: lastSnapshot
              ? [
                  { id: "cpu", label: "CPU", value: lastSnapshot.cpu, tone: "blue" },
                  { id: "memory", label: "Memory", value: lastSnapshot.memory, tone: "violet" },
                  {
                    id: "download",
                    label: "Download",
                    value: lastSnapshot.downloadSpeed,
                    tone: "cyan",
                  },
                  {
                    id: "upload",
                    label: "Upload",
                    value: lastSnapshot.uploadSpeed,
                    tone: "emerald",
                  },
                ]
              : undefined,
            lastSuccessfulSource: diagnostic?.lastSuccessfulSource,
          });

          if (currentGeneration !== generation) {
            return;
          }

          const now = Date.now();
          const effectiveDiagnostic = classifyFreshness(result.diagnostic, lastSuccessfulAt, now);
          diagnostic = effectiveDiagnostic;

          const byId = new Map(result.metrics.map((metric) => [metric.id, metric.value]));
          const snapshot: SystemPerformanceSnapshot = {
            cpu: byId.get("cpu") ?? 0,
            memory: byId.get("memory") ?? 0,
            downloadSpeed: byId.get("download") ?? 0,
            uploadSpeed: byId.get("upload") ?? 0,
          };

          if (
            effectiveDiagnostic.quality === "live" ||
            effectiveDiagnostic.quality === "fallback"
          ) {
            lastSnapshot = snapshot;
            lastSuccessfulAt = now;
            diagnostic = {
              ...effectiveDiagnostic,
              lastSuccessfulSource: effectiveDiagnostic.source,
            };
            handle.markHealthy();
          }

          // Publish every bounded diagnostic, including stale/unavailable. The
          // resident state must visibly downgrade after an IPC or polling error;
          // silently retaining the last event would present stale values as live.
          handle.emit([createSystemPerformanceEvent(snapshot, effectiveDiagnostic)]);

          if (
            effectiveDiagnostic.quality === "stale" ||
            effectiveDiagnostic.quality === "unavailable"
          ) {
            handle.markDegraded();
          }
        } finally {
          pollInFlight = false;
        }
      }

      void poll();

      pollTimer = setInterval(() => {
        void poll();
      }, POLL_INTERVAL_MS);
    },

    stop() {
      generation += 1;
      diagnostic = undefined;
      lastSnapshot = undefined;
      lastSuccessfulAt = undefined;
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = undefined;
      }
    },
  });
}

function classifyFreshness(
  diagnostic: SystemStatusDiagnostic,
  lastSuccessfulAt: number | undefined,
  now: number,
): SystemStatusDiagnostic {
  if (diagnostic.quality === "live" || diagnostic.quality === "fallback") {
    return diagnostic;
  }

  const age = lastSuccessfulAt === undefined ? Number.POSITIVE_INFINITY : now - lastSuccessfulAt;
  if (age <= UNAVAILABLE_AFTER_MS) {
    return {
      ...diagnostic,
      quality: "stale",
    };
  }

  return {
    quality: "unavailable",
    code: diagnostic.code,
    source: diagnostic.source,
  };
}
