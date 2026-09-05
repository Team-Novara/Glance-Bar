import type { HubProvider } from "./types";
import type { HubEventBus } from "../../state/hubState";

export type ProviderConnection = {
  disconnect(): void;
};

export function connectProviderToEventBus(
  provider: HubProvider,
  eventBus: HubEventBus,
): ProviderConnection {
  const unsubscribe = provider.subscribe((events) => {
    for (const event of events) {
      try {
        eventBus.publishHubEvent(
          event.origin
            ? event
            : { ...event, origin: provider.metadata.mock ? "mock" : "system" },
        );
      } catch {
        // Publish failures should not block unrelated events in the same provider batch.
      }
    }
  });
  let connected = true;

  return {
    disconnect() {
      if (!connected) {
        return;
      }

      connected = false;
      unsubscribe();
    },
  };
}
