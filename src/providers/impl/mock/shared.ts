import { snapshotHubEvent } from "../../../shared/lib/runtimeGuards";
import type {
  HubProvider,
  HubProviderCapability,
  HubProviderLifecycle,
  HubProviderListener,
  HubProviderMetadata,
  MockProviderOptions,
} from "../../core/types";

/** Tick interval for the mock music provider. */
export const MOCK_MUSIC_TICK_MS = 5_000;

/** Tick interval for the mock download provider. */
export const MOCK_DOWNLOAD_TICK_MS = 3_000;

/** Tick interval for the mock AI provider. */
export const MOCK_AI_TICK_MS = 4_000;

/** Total duration the mock notification stays on screen. */
export const MOCK_NOTIFICATION_DURATION_MS = 3_000;

/** Mock music progress step. */
const MOCK_MUSIC_PROGRESS_STEP = 5;

/** Mock download progress step. */
const MOCK_DOWNLOAD_PROGRESS_STEP = 10;

/** Mock AI progress step. */
const MOCK_AI_PROGRESS_STEP = 5;

export const resolveNow = (options: MockProviderOptions = {}) => {
  if (typeof options.now === "function") {
    return options.now();
  }

  return options.now ?? Date.now();
};

export const createEventId = (
  providerId: string,
  type: HubProviderMetadata["kind"],
  timestamp: number,
) => `${providerId}-${type}-${timestamp}`;

export type MockProviderConfig = {
  metadata: HubProviderMetadata;
  capabilities: HubProviderCapability[];
  events: () => ReturnType<typeof snapshotHubEvent>[];
};

export const createMockProvider = ({
  metadata,
  capabilities,
  events,
}: MockProviderConfig): HubProvider => {
  let lifecycle: HubProviderLifecycle = "Stopped";
  const listeners = new Set<HubProviderListener>();

  const emit = () => {
    if (lifecycle !== "Publishing") {
      return;
    }

    const nextEvents = events();
    listeners.forEach((listener) => {
      try {
        listener(nextEvents.map(snapshotHubEvent));
      } catch {
        // Listener failures should not block unrelated provider subscribers.
      }
    });
  };

  return {
    id: metadata.id,
    label: metadata.name,
    metadata,
    capabilities,
    start() {
      if (lifecycle === "Publishing") {
        return;
      }

      lifecycle = "Publishing";
      emit();
    },
    stop() {
      lifecycle = "Stopped";
    },
    subscribe(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    status() {
      return {
        lifecycle,
        health: "Healthy",
      };
    },
  };
};

export type TickingProviderConfig = {
  metadata: HubProviderMetadata;
  capabilities: HubProviderCapability[];
  tickMs: number;
  buildEvent: (tick: number, createdAt: number) => Parameters<typeof snapshotHubEvent>[0];
  baseNow: number;
};

export const createTickingProvider = ({
  metadata,
  capabilities,
  tickMs,
  buildEvent,
  baseNow,
}: TickingProviderConfig): HubProvider => {
  let lifecycle: HubProviderLifecycle = "Stopped";
  let tick = 0;
  let intervalId: ReturnType<typeof setInterval> | undefined;
  let lastCreatedAt = baseNow;
  const listeners = new Set<HubProviderListener>();

  const emit = () => {
    if (lifecycle !== "Publishing") {
      return;
    }

    const createdAt = lastCreatedAt;
    const built = buildEvent(tick, createdAt);
    const nextEvents = [built].map(snapshotHubEvent);
    listeners.forEach((listener) => {
      try {
        listener(nextEvents);
      } catch {
        // Listener failures should not block unrelated provider subscribers.
      }
    });
  };

  return {
    id: metadata.id,
    label: metadata.name,
    metadata,
    capabilities,
    start() {
      if (lifecycle === "Publishing") {
        return;
      }

      lifecycle = "Publishing";
      tick = 0;
      lastCreatedAt = baseNow;
      emit();

      intervalId = setInterval(() => {
        tick += 1;
        lastCreatedAt += tickMs;
        emit();
      }, tickMs);
    },
    stop() {
      lifecycle = "Stopped";
      if (intervalId !== undefined) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
    },
    subscribe(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    status() {
      return {
        lifecycle,
        health: "Healthy",
      };
    },
  };
};

export const createMockMetadata = (
  kind: HubProviderMetadata["kind"],
  name: string,
  id = `mock-${kind}-provider`,
): HubProviderMetadata => ({
  id,
  name,
  kind,
  version: "0.6.0",
  mock: true,
});

export const createMockCapabilities = (
  kind: HubProviderCapability["kind"],
): HubProviderCapability[] => [
  {
    id: kind,
    kind,
    origin: "mock",
    support: "available",
  },
];

export { MOCK_MUSIC_PROGRESS_STEP, MOCK_DOWNLOAD_PROGRESS_STEP, MOCK_AI_PROGRESS_STEP };
