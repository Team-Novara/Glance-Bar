import type { HubEvent } from "@/entities";

import {
  getFocusAssistMonitorSupport,
  getFocusAssistState,
  onFocusAssistChanged,
  type FocusAssistState,
} from "../../../runtime/system/systemMonitorRuntime";
import { createProviderShell } from "../../core/providerShell";
import type { HubProvider, HubProviderCapability, HubProviderMetadata } from "../../core/types";

const PROVIDER_ID = "real-focus-provider";
const FOCUS_EVENT_ID = `${PROVIDER_ID}-focus-observation`;
export const FOCUS_COMPLETION_DISPLAY_WINDOW_MS = 8_000;

function focusPayloadToEvent(payload: FocusAssistState): HubEvent {
  const createdAt = payload.checkedAt || Date.now();

  return {
    id: FOCUS_EVENT_ID,
    type: "focus",
    source: "focus",
    origin: "system",
    createdAt,
    expiresAt: payload.active ? undefined : createdAt + FOCUS_COMPLETION_DISPLAY_WINDOW_MS,
    payload: {
      active: payload.active,
      profile: payload.profile,
      code: payload.code,
      controllable: payload.controllable,
      checkedAt: payload.checkedAt,
    },
    metadata: {
      code: payload.code,
      controllable: payload.controllable,
      checkedAt: payload.checkedAt,
    },
  };
}

export function createRealFocusProvider(): HubProvider {
  let unlisten: (() => void) | undefined;
  let listenerGeneration = 0;
  let lastPublishedCheckedAt: number | undefined;
  let lastPublishedActive = false;

  const metadata: HubProviderMetadata = {
    id: PROVIDER_ID,
    name: "Focus Assist Provider",
    kind: "focus",
    version: "1.0.0",
    mock: false,
  };

  const capabilities: HubProviderCapability[] = [
    { id: "focus", kind: "focus", origin: "real", support: getFocusAssistMonitorSupport() },
  ];
  const support = capabilities[0]?.support ?? "unsupported";

  return createProviderShell({
    metadata,
    capabilities,

    start(handle) {
      if (support !== "available") {
        return;
      }

      const generation = ++listenerGeneration;
      lastPublishedCheckedAt = undefined;
      lastPublishedActive = false;

      const publishObservation = (state: FocusAssistState, source: "initial" | "event") => {
        if (generation !== listenerGeneration) {
          return;
        }
        if (state.code !== "available") {
          // Capability support can be present while a particular registry
          // read fails. Surface that distinction through provider health and
          // keep the UI from presenting an invented active/completion card.
          handle.markDegraded();
          if (lastPublishedCheckedAt === undefined || state.checkedAt > lastPublishedCheckedAt) {
            lastPublishedCheckedAt = state.checkedAt;
          }
          return;
        }
        // An inactive initial snapshot only says that no session is running;
        // it is not a completion event. Completion is meaningful after this
        // provider has observed an active session in the current lifecycle.
        if (source === "initial" && !state.active) {
          return;
        }
        if (source === "event" && !state.active && !lastPublishedActive) {
          // Keep the freshness watermark even when there was no active
          // session to complete. This prevents a delayed initial active
          // snapshot from resurrecting an already-ended session.
          if (lastPublishedCheckedAt === undefined || state.checkedAt > lastPublishedCheckedAt) {
            lastPublishedCheckedAt = state.checkedAt;
          }
          return;
        }
        if (
          lastPublishedCheckedAt !== undefined &&
          (source === "initial"
            ? state.checkedAt <= lastPublishedCheckedAt
            : state.checkedAt < lastPublishedCheckedAt)
        ) {
          return;
        }
        lastPublishedCheckedAt = state.checkedAt;
        lastPublishedActive = state.active;
        handle.emit([focusPayloadToEvent(state)]);
      };

      getFocusAssistState()
        .then((state) => {
          if (state) {
            publishObservation(state, "initial");
          }
        })
        .catch(() => {
          handle.markDegraded();
        });

      onFocusAssistChanged((state) => {
        publishObservation(state, "event");
      })
        .then((unlistenFn) => {
          if (generation !== listenerGeneration) {
            unlistenFn();
            return;
          }
          unlisten = unlistenFn;
        })
        .catch(() => {
          if (generation === listenerGeneration) {
            handle.markDegraded();
          }
        });
    },

    stop() {
      listenerGeneration += 1;
      lastPublishedActive = false;
      unlisten?.();
      unlisten = undefined;
    },
  });
}
