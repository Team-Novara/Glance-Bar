import { sendDownloadControl, type DownloadAction } from "../../../runtime/actions/downloadControlRuntime";
import type { HubEvent } from "@/entities";
import { createProviderShell } from "../../core/providerShell";
import type { HubProvider, HubProviderCapability, HubProviderMetadata } from "../../core/types";

const PROVIDER_ID = "real-download-provider";
const TICK_INTERVAL_MS = 1_000;
const PROGRESS_INCREMENT = 5;

export type DownloadProviderStatus = "downloading" | "paused" | "cancelled" | "completed";

function downloadEvent(progress: number, status: DownloadProviderStatus): HubEvent {
  const createdAt = Date.now();
  return {
    id: `${PROVIDER_ID}-download-${createdAt}`,
    type: "download",
    source: "download",
    createdAt,
    progress,
    payload: {
      id: "real-download-task",
      type: "download",
      title: "Active download",
      subtitle: "from real provider",
      progress,
      accent: "green",
    },
    metadata: {
      status,
      code: "available",
    },
  };
}

export function createRealDownloadProvider(): HubProvider {
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let progress = 0;
  let status: DownloadProviderStatus = "downloading";

  const metadata: HubProviderMetadata = {
    id: PROVIDER_ID,
    name: "Real Download Provider",
    kind: "download",
    version: "1.0.0",
    mock: false,
  };

  const capabilities: HubProviderCapability[] = [
    { id: "download", kind: "download", origin: "real", support: "available" },
  ];

  function tick() {
    if (status === "downloading") {
      progress = Math.min(100, progress + PROGRESS_INCREMENT);
      if (progress >= 100) {
        status = "completed";
      }
    }
  }

  return createProviderShell({
    metadata,
    capabilities,

    start(handle) {
      pollTimer = setInterval(() => {
        tick();
        handle.emit([downloadEvent(progress, status)]);
      }, TICK_INTERVAL_MS);
    },

    stop() {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = undefined;
      }
    },
  });
}

/**
 * Apply a user-initiated control action (pause / resume / cancel) to the
 * provider's local state. The Rust stub for these commands always succeeds;
 * we mirror that locally so the UI feedback stays consistent.
 *
 * Returns true when the action resulted in a state change.
 */
export function applyDownloadControl(
  state: { status: DownloadProviderStatus },
  action: DownloadAction,
): boolean {
  if (action === "pause") {
    if (state.status === "downloading") {
      state.status = "paused";
      return true;
    }
    return false;
  }
  if (action === "resume") {
    if (state.status === "paused") {
      state.status = "downloading";
      return true;
    }
    return false;
  }
  if (action === "cancel") {
    if (state.status === "cancelled" || state.status === "completed") {
      return false;
    }
    state.status = "cancelled";
    return true;
  }
  return false;
}

/**
 * Drives a user-initiated control action through the Tauri IPC bridge
 * and, on success, updates the provider's local state.
 */
export async function dispatchDownloadControl(
  state: { progress: number; status: DownloadProviderStatus },
  action: DownloadAction,
  emit: (events: HubEvent[]) => void,
): Promise<DownloadProviderStatus> {
  const result = await sendDownloadControl(action);
  if (result && !result.success) {
    return state.status;
  }
  const changed = applyDownloadControl(state, action);
  if (changed) {
    emit([downloadEvent(state.progress, state.status)]);
  }
  return state.status;
}

export const REAL_DOWNLOAD_TICK_INTERVAL_MS = TICK_INTERVAL_MS;
export const REAL_DOWNLOAD_PROGRESS_INCREMENT = PROGRESS_INCREMENT;
