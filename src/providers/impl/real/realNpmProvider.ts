import type { HubEvent } from "@/entities";

import { createProviderShell } from "../../core/providerShell";
import type { HubProvider, HubProviderCapability, HubProviderMetadata } from "../../core/types";

const PROVIDER_ID = "real-npm-provider";
const POLL_INTERVAL_MS = 6_000;

export type NpmScriptStatus = "idle" | "running" | "success" | "failed";

export type NpmScript = {
  name: string;
  status: NpmScriptStatus;
  durationMs?: number;
  lastRunAt?: number;
};

export type NpmStatusCode = "available" | "no-package-json" | "not-implemented" | "error";

export type NpmStatus = {
  available: boolean;
  scripts: NpmScript[];
  runningCount: number;
  failedCount: number;
  lastCheckedAt: number;
  code: NpmStatusCode;
  diagnostic?: string;
};

function npmStatusToEvent(status: NpmStatus): HubEvent {
  const createdAt = status.lastCheckedAt;
  const total = status.scripts.length;
  const running = status.runningCount;
  const failed = status.failedCount;

  // Subtitle: e.g. "2 running, 1 failed" or "all idle"
  const parts: string[] = [];
  if (running > 0) parts.push(`${running} running`);
  if (failed > 0) parts.push(`${failed} failed`);
  if (parts.length === 0) parts.push("all idle");
  const subtitle = parts.join(", ");

  return {
    id: `${PROVIDER_ID}-npm-${createdAt}`,
    type: "ai",
    source: "npm",
    createdAt,
    expiresAt: createdAt + POLL_INTERVAL_MS + 500,
    payload: {
      id: "npm-status",
      type: "ai",
      title: status.available ? "npm scripts" : "npm (no package.json)",
      subtitle: status.available ? subtitle : (status.diagnostic ?? "no scripts"),
      // progress reflects the fraction of non-failed scripts (0-100)
      progress: total > 0 ? Math.round(((total - failed) / total) * 100) : 0,
      accent: "pink",
    },
    metadata: {
      code: status.code,
      scripts: status.scripts,
    },
  };
}

/**
 * Stage 6 scaffolding: no native source for npm script state exists yet —
 * there is no Tauri shell bridge to read `package.json` or running child
 * processes. The check therefore reports an honest `not-implemented`
 * unavailable result with no fabricated scripts. Once the shell bridge is
 * available this function should read `package.json` and inspect running
 * child processes to derive script state.
 */
export async function checkNpmStatus(): Promise<NpmStatus> {
  return {
    available: false,
    scripts: [],
    runningCount: 0,
    failedCount: 0,
    lastCheckedAt: Date.now(),
    code: "not-implemented",
    diagnostic: "npm script observation is not implemented: no native shell bridge exists yet.",
  };
}

export function createRealNpmProvider(): HubProvider {
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let lastEmittedRunning: number | undefined;
  let lastEmittedFailed: number | undefined;

  const metadata: HubProviderMetadata = {
    id: PROVIDER_ID,
    name: "Real npm Provider",
    kind: "npm",
    version: "1.0.0",
    mock: false,
  };

  const capabilities: HubProviderCapability[] = [
    { id: "npm", kind: "npm", origin: "real", support: "unsupported" },
  ];

  return createProviderShell({
    metadata,
    capabilities,

    async start(handle) {
      const initial = await checkNpmStatus().catch(() => undefined);
      if (!initial) {
        handle.markDegraded();
        return;
      }
      if (!initial.available) {
        // No native source exists yet. Publishing this snapshot would put a
        // fabricated "npm scripts" card on the bar, so the provider stays
        // idle and reports nothing. The capability already advertises
        // `unsupported`; the diagnostic vocabulary carries
        // `not-implemented` for the same fact.
        return;
      }

      lastEmittedRunning = initial.runningCount;
      lastEmittedFailed = initial.failedCount;
      handle.emit([npmStatusToEvent(initial)]);

      pollTimer = setInterval(async () => {
        const next = await checkNpmStatus().catch(() => undefined);
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
        if (lastEmittedRunning === next.runningCount && lastEmittedFailed === next.failedCount) {
          return;
        }
        lastEmittedRunning = next.runningCount;
        lastEmittedFailed = next.failedCount;
        handle.emit([npmStatusToEvent(next)]);
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

export const REAL_NPM_POLL_INTERVAL_MS = POLL_INTERVAL_MS;
