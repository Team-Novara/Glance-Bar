import type { HubEvent } from "@/entities";
import { createProviderShell } from "../../core/providerShell";
import type { HubProvider, HubProviderCapability, HubProviderMetadata } from "../../core/types";

const PROVIDER_ID = "real-wsl-provider";
export const REAL_WSL_POLL_INTERVAL_MS = 8_000;

type WslDistro = {
  name: string;
  state: "Running" | "Stopped";
  version: string;
  isDefault: boolean;
};

type WslStatus = {
  available: boolean;
  distros: WslDistro[];
  runningCount: number;
  lastCheckedAt: number;
  code: "available" | "no-wsl-cli" | "wsl-not-installed" | "error";
  diagnostic?: string;
};

function wslStatusToEvent(status: WslStatus): HubEvent {
  const createdAt = status.lastCheckedAt;
  const total = status.distros.length;
  const running = status.runningCount;
  const subtitle = status.available
    ? `${running}/${total} distro(s) running`
    : status.diagnostic ?? "WSL unavailable";

  return {
    id: `${PROVIDER_ID}-wsl-${createdAt}`,
    type: "ai",
    source: "wsl",
    createdAt,
    expiresAt: createdAt + REAL_WSL_POLL_INTERVAL_MS + 500,
    payload: {
      id: "wsl-status",
      type: "ai",
      title: status.available ? "WSL" : "WSL (offline)",
      subtitle,
      progress: total > 0 ? Math.round((running / total) * 100) : 0,
      accent: "cyan",
    },
    metadata: {
      code: status.code,
      distros: status.distros,
    },
  };
}

function checkWslStatus(): WslStatus {
  // Stage 6 stub: 模拟固定的发行版状态
  // 后续可替换为通过 tauri-plugin-shell 调用 `wsl --list --verbose`
  const now = Date.now();
  return {
    available: true,
    distros: [
      { name: "Ubuntu", state: "Running", version: "2", isDefault: true },
      { name: "Debian", state: "Stopped", version: "2", isDefault: false },
    ],
    runningCount: 1,
    lastCheckedAt: now,
    code: "available",
  };
}

export function createRealWslProvider(): HubProvider {
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let lastEmittedRunning: number | undefined;
  let lastEmittedTotal: number | undefined;

  const metadata: HubProviderMetadata = {
    id: PROVIDER_ID,
    name: "Real WSL Provider",
    kind: "wsl",
    version: "1.0.0",
    mock: false,
  };

  const capabilities: HubProviderCapability[] = [
    { id: "wsl", kind: "wsl", origin: "real", support: "available" },
  ];

  return createProviderShell({
    metadata,
    capabilities,
    start(handle) {
      const initial = checkWslStatus();
      if (initial.available) {
        lastEmittedRunning = initial.runningCount;
        lastEmittedTotal = initial.distros.length;
        handle.emit([wslStatusToEvent(initial)]);
      } else {
        handle.markDegraded();
      }
      pollTimer = setInterval(() => {
        const next = checkWslStatus();
        if (!next.available) {
          handle.markDegraded();
          return;
        }
        if (
          lastEmittedRunning === next.runningCount &&
          lastEmittedTotal === next.distros.length
        ) {
          return;
        }
        lastEmittedRunning = next.runningCount;
        lastEmittedTotal = next.distros.length;
        handle.emit([wslStatusToEvent(next)]);
      }, REAL_WSL_POLL_INTERVAL_MS);
    },
    stop() {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = undefined;
      }
    },
  });
}
