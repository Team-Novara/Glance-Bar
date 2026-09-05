import type { HubEvent } from "@/entities";

import type {
  HubProvider,
  HubProviderCapability,
  HubProviderListener,
  HubProviderMetadata,
  HubProviderStatus,
} from "./types";

export type ProviderShellHandle = {
  emit(events: HubEvent[]): void;
  markDegraded(): void;
  markHealthy(): void;
};

export type ProviderShellConfig = {
  metadata: HubProviderMetadata;
  capabilities: HubProviderCapability[];
  start(handle: ProviderShellHandle): void;
  stop(): void;
};

/**
 * Shared factory that encapsulates common provider boilerplate:
 * lifecycle management, listener set, emit/subscribe/status methods.
 *
 * Each real provider only needs to supply its specific `start` and `stop` logic.
 */
export function createProviderShell(config: ProviderShellConfig): HubProvider {
  let lifecycle: HubProviderStatus["lifecycle"] = "Registered";
  let health: HubProviderStatus["health"] = "Healthy";
  const listeners = new Set<HubProviderListener>();

  function emit(events: HubEvent[]) {
    if (lifecycle !== "Publishing") {
      return;
    }
    listeners.forEach((listener) => {
      try {
        listener(events);
      } catch {
        // Listener failures should not block other subscribers.
      }
    });
  }

  const handle: ProviderShellHandle = {
    emit,
    markDegraded() {
      health = "Degraded";
    },
    markHealthy() {
      health = "Healthy";
    },
  };

  return {
    id: config.metadata.id,
    label: config.metadata.name,
    metadata: config.metadata,
    capabilities: config.capabilities,

    start() {
      if (lifecycle === "Publishing") {
        return;
      }
      lifecycle = "Publishing";
      config.start(handle);
    },

    stop() {
      lifecycle = "Stopped";
      config.stop();
    },

    subscribe(listener: HubProviderListener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    status(): HubProviderStatus {
      return { lifecycle, health };
    },
  };
}
