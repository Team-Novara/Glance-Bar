import {
  getFocusAssistState,
  onFocusAssistChanged,
  type FocusAssistState,
} from "../../../runtime/system/systemMonitorRuntime";
import type { HubEvent } from "@/entities";
import { createProviderShell } from "../../core/providerShell";
import type { HubProvider, HubProviderCapability, HubProviderMetadata } from "../../core/types";

const PROVIDER_ID = "real-focus-provider";

function focusPayloadToEvent(payload: FocusAssistState): HubEvent {
  const createdAt = payload.checkedAt || Date.now();

  return {
    id: `${PROVIDER_ID}-focus-${createdAt}`,
    type: "focus",
    source: "focus",
    createdAt,
    payload: {
      active: payload.active,
      profile: payload.profile,
      checkedAt: payload.checkedAt,
    },
  };
}

export function createRealFocusProvider(): HubProvider {
  let unlisten: (() => void) | undefined;

  const metadata: HubProviderMetadata = {
    id: PROVIDER_ID,
    name: "Focus Assist Provider",
    kind: "focus",
    version: "1.0.0",
    mock: false,
  };

  const capabilities: HubProviderCapability[] = [
    { id: "focus", kind: "focus", origin: "real", support: "available" },
  ];

  return createProviderShell({
    metadata,
    capabilities,

    start(handle) {
      getFocusAssistState()
        .then((state) => {
          if (state) {
            handle.emit([focusPayloadToEvent(state)]);
          }
        })
        .catch(() => {
          handle.markDegraded();
        });

      onFocusAssistChanged((state) => {
        handle.emit([focusPayloadToEvent(state)]);
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
