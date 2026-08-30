import {
  onMediaSessionChanged,
  type MediaSessionChangedPayload,
} from "../../../runtime/system/systemMonitorRuntime";
import { loadTauriMediaSessionStatus, type TauriMediaSessionStatus } from "../../../runtime/tauri/tauriRuntime";
import { MEDIA_DISPLAY_WINDOW_MS, formatMediaTime } from "../../../shared/lib/mediaTime";
import { createProviderShell } from "../../core/providerShell";
import type { HubProvider, HubProviderCapability, HubProviderMetadata } from "../../core/types";

import type { HubEvent } from "@/entities";

const PROVIDER_ID = "real-media-session-provider";
const POLL_FALLBACK_MS = 30_000;

function mediaPayloadToEvent(payload: MediaSessionChangedPayload): HubEvent {
  const createdAt = payload.checkedAt || Date.now();
  const expiresAt = payload.available ? createdAt + MEDIA_DISPLAY_WINDOW_MS : createdAt;

  return {
    id: `${PROVIDER_ID}-media-${createdAt}`,
    type: "media",
    source: "media",
    createdAt,
    expiresAt,
    progress: payload.progress,
    payload: {
      available: payload.available,
      playbackStatus: payload.playbackStatus,
      progress: payload.progress,
      positionMs: payload.positionMs,
      durationMs: payload.durationMs,
      title: payload.title,
      artist: payload.artist,
    },
    metadata: {
      timeLabel: formatMediaTime(payload.positionMs, payload.durationMs),
      code: payload.code,
    },
  };
}

function statusToPayload(status: TauriMediaSessionStatus): MediaSessionChangedPayload {
  return {
    available: status.available,
    playbackStatus: status.playbackStatus,
    progress: status.progress,
    positionMs: status.positionMs,
    durationMs: status.durationMs,
    title: status.title,
    artist: status.artist,
    code: status.code,
    checkedAt: status.checkedAt,
  };
}

export function createRealMediaSessionProvider(): HubProvider {
  let unlisten: (() => void) | undefined;

  const metadata: HubProviderMetadata = {
    id: PROVIDER_ID,
    name: "Media Session Provider",
    kind: "media",
    version: "1.0.0",
    mock: false,
  };

  const capabilities: HubProviderCapability[] = [
    { id: "media", kind: "media", origin: "real", support: "available" },
  ];

  return createProviderShell({
    metadata,
    capabilities,

    start(handle) {
      // Fetch the current state once so we don't wait for the next
      // change event before the bar knows about an already-playing
      // session.
      loadTauriMediaSessionStatus()
        .then((result) => {
          if (!result.ok || !result.status) {
            return;
          }
          const payload = statusToPayload(result.status);
          handle.emit([mediaPayloadToEvent(payload)]);
        })
        .catch(() => {
          // Initial fetch failed — non-critical, the listener below will
          // catch future changes.
        });

      // Note: we deliberately do NOT dedup by content hash here. The Rust
      // media thread already debounces its own emits (it only fires on
      // real changes plus the 20s keepalive + post-action force-emit),
      // so adding a frontend hash on top of that caused the play/pause
      // icon to lag the actual session state.
      onMediaSessionChanged((payload) => {
        handle.emit([mediaPayloadToEvent(payload)]);
      })
        .then((unlistenFn) => {
          unlisten = unlistenFn;
        })
        .catch(() => {
          handle.markDegraded();
        });
    },

    stop() {
      unlisten?.();
      unlisten = undefined;
    },
  });
}

// Re-export the polling fallback so consumers (tests, future stages)
// can drive the provider without the live Tauri bridge.
export const REAL_MEDIA_SESSION_FALLBACK_POLL_MS = POLL_FALLBACK_MS;
