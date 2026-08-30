import { onClipboardChanged, type ClipboardChangedPayload } from "../../../runtime/system/systemMonitorRuntime";
import { createProviderShell } from "../../core/providerShell";
import type { HubProvider, HubProviderCapability, HubProviderMetadata } from "../../core/types";

import type { HubEvent } from "@/entities";

const PROVIDER_ID = "real-clipboard-provider";
const CLIPBOARD_DISPLAY_WINDOW_MS = 5_000;

function clipboardPayloadToEvent(payload: ClipboardChangedPayload): HubEvent {
  const createdAt = payload.copiedAt || Date.now();

  return {
    id: `${PROVIDER_ID}-clipboard-${createdAt}`,
    type: "clipboard",
    source: "clipboard",
    createdAt,
    expiresAt: createdAt + CLIPBOARD_DISPLAY_WINDOW_MS,
    payload: {
      text: payload.text,
      sourceApp: payload.sourceApp,
      copiedAt: payload.copiedAt,
    },
  };
}

export function createRealClipboardProvider(): HubProvider {
  // Deduplicate consecutive polling emissions of the same clipboard content.
  // When the same text is copied again (after copying something else in between),
  // the event IS emitted — each copy operation is a distinct user action.
  let lastEmittedText: string | undefined;
  let unlisten: (() => void) | undefined;

  const metadata: HubProviderMetadata = {
    id: PROVIDER_ID,
    name: "Clipboard Provider",
    kind: "clipboard",
    version: "1.0.0",
    mock: false,
  };

  const capabilities: HubProviderCapability[] = [
    { id: "clipboard", kind: "clipboard", origin: "real", support: "available" },
  ];

  return createProviderShell({
    metadata,
    capabilities,

    start(handle) {
      onClipboardChanged((payload) => {
        // Skip consecutive polling duplicates (same text read twice in a row)
        if (payload.text === lastEmittedText) {
          return;
        }
        lastEmittedText = payload.text;
        handle.emit([clipboardPayloadToEvent(payload)]);
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
