import type { DownloadObservationStatus, HubEvent } from "@/entities";

import type { DownloadAction } from "../../../runtime/actions/downloadControlRuntime";
import {
  getDownloadMonitorSupport,
  loadDownloadState,
  onDownloadChanged,
  type DownloadChangedPayload,
} from "../../../runtime/system/systemMonitorRuntime";
import { createProviderShell } from "../../core/providerShell";
import type { HubProvider, HubProviderCapability, HubProviderMetadata } from "../../core/types";


const PROVIDER_ID = "real-download-provider";
const DOWNLOAD_EVENT_ID = `${PROVIDER_ID}-download-observation`;

export type DownloadProviderStatus = DownloadObservationStatus;

/**
 * Map a native {@link DownloadChangedPayload} to a download {@link HubEvent}.
 * Privacy-safe: the payload carries no file paths or names, only bounded status,
 * optional progress with an explicit accuracy fact, and the active count.
 */
function downloadPayloadToEvent(payload: DownloadChangedPayload): HubEvent | undefined {
  if (payload.status === "idle") {
    return undefined;
  }
  if (payload.status === "active" && payload.code !== "available") {
    return undefined;
  }

  const createdAt = payload.checkedAt || Date.now();

  let title = "Downloads";
  let subtitle = "No active download activity";
  if (payload.status === "active") {
    title =
      payload.activeDownloads > 1
        ? `${payload.activeDownloads} downloads`
        : "Downloading";
    subtitle = "In progress";
  } else if (payload.status === "completed") {
    title = "Download complete";
    subtitle = "Saved to Downloads";
  } else if (payload.status === "ended_unknown") {
    title = "Download ended";
    subtitle = "Outcome could not be confirmed";
  } else if (payload.status === "error") {
    title = "Download unavailable";
    subtitle = "Download activity could not be read";
  }

  return {
    id: DOWNLOAD_EVENT_ID,
    type: "download",
    source: "download",
    origin: "system",
    createdAt,
    expiresAt:
      payload.status === "active"
        ? undefined
        : createdAt + 8_000,
    progress: payload.progress,
    payload: {
      id: "real-download-task",
      type: "download",
      title,
      subtitle,
      progress: payload.progress,
      accent: "green",
    },
    metadata: {
      status: payload.status,
      code: payload.code,
      activeDownloads: payload.activeDownloads,
      progressAccuracy: payload.progressAccuracy,
      controllable: payload.controllable,
      checkedAt: payload.checkedAt,
    },
  };
}

export function createRealDownloadProvider(): HubProvider {
  let unlisten: (() => void) | undefined;
  let listenerGeneration = 0;

  const metadata: HubProviderMetadata = {
    id: PROVIDER_ID,
    name: "Real Download Provider",
    kind: "download",
    version: "1.0.0",
    mock: false,
  };

  // Real monitoring is Windows-only (MVP) and requires the Tauri runtime, so the
  // capability `support` fact reflects whether monitoring actually works here.
  const support = getDownloadMonitorSupport();

  const capabilities: HubProviderCapability[] = [
    { id: "download", kind: "download", origin: "real", support },
  ];

  return createProviderShell({
    metadata,
    capabilities,

    start(handle) {
      // If monitoring is unsupported on this platform there is nothing to watch;
      // leave the capability as "unsupported" and do not register a listener.
      if (support !== "available") {
        return;
      }

      // Seed the bar with the current state so we don't wait for the next change
      // event before reflecting an already-active download.
      loadDownloadState()
        .then((result) => {
          if (!result || result.status === "idle") {
            return;
          }
          const event = downloadPayloadToEvent(result);
          if (event) {
            handle.emit([event]);
          }
        })
        .catch(() => {
          // Initial fetch failed — non-critical, the listener below catches
          // future changes.
        });

      const generation = ++listenerGeneration;
      onDownloadChanged((payload) => {
        const event = downloadPayloadToEvent(payload);
        if (event) {
          handle.emit([event]);
        }
      })
        .then((unlistenFn) => {
          if (generation !== listenerGeneration) {
            unlistenFn();
            return;
          }
          unlisten = unlistenFn;
        })
        .catch(() => {
          handle.markDegraded();
        });
    },

    stop() {
      listenerGeneration += 1;
      unlisten?.();
      unlisten = undefined;
    },
  });
}

/**
 * Compatibility hook for callers that still issue a control action. The
 * folder observer has no control capability, so every action is rejected.
 *
 * Returns true when the action resulted in a state change.
 */
export function applyDownloadControl(
  state: { status: DownloadProviderStatus },
  action: DownloadAction,
): boolean {
  void state;
  void action;
  return false;
}

/**
 * Compatibility hook for the former control path. No IPC call is made until a
 * provider explicitly advertises browser-task control support.
 */
export async function dispatchDownloadControl(
  state: { progress: number; status: DownloadProviderStatus },
  action: DownloadAction,
  emit: (events: HubEvent[]) => void,
): Promise<DownloadProviderStatus> {
  void action;
  void emit;
  return state.status;
}
