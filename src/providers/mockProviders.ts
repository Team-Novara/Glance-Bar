import type {
  HubProvider,
  HubProviderCapability,
  HubProviderLifecycle,
  HubProviderListener,
  HubProviderMetadata,
  MockProviderOptions,
} from "./types";
import { snapshotHubEvent } from "../shared/runtimeGuards";
import type { HubEvent, HubTask, MusicState } from "../types/hub";

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

const resolveNow = (options: MockProviderOptions = {}) => {
  if (typeof options.now === "function") {
    return options.now();
  }

  return options.now ?? Date.now();
};

const createEventId = (providerId: string, type: HubEvent["type"], timestamp: number) =>
  `${providerId}-${type}-${timestamp}`;

export const createMockMusicEvent = (options: MockProviderOptions = {}): HubEvent => {
  const createdAt = resolveNow(options);

  return {
    id: createEventId("mock-music", "music", createdAt),
    type: "music",
    source: "music",
    createdAt,
    progress: 68,
    payload: {
      title: "Midnight City",
      subtitle: "M83 - Hurry Up, We're Dreaming",
      time: "2:46 / 4:03",
      progress: 68,
    },
  };
};

export const createMockDownloadEvent = (options: MockProviderOptions = {}): HubEvent => {
  const createdAt = resolveNow(options);

  return {
    id: createEventId("mock-download", "download", createdAt),
    type: "download",
    source: "download",
    createdAt,
    progress: 45,
    payload: {
      id: "mock-download-task",
      type: "download",
      title: "Windows SDK Preview.zip",
      subtitle: "42.8 MB of 96 MB",
      progress: 45,
      accent: "green",
    },
  };
};

export const createMockAiTaskEvent = (options: MockProviderOptions = {}): HubEvent => {
  const createdAt = resolveNow(options);

  return {
    id: createEventId("mock-ai", "ai", createdAt),
    type: "ai",
    source: "ai",
    createdAt,
    progress: 72,
    payload: {
      id: "mock-ai-task",
      type: "ai",
      title: "Codex is updating the provider SDK",
      subtitle: "Generating mock provider contract tests",
      progress: 72,
      accent: "blue",
    },
  };
};

export const createMockNotificationEvent = (options: MockProviderOptions = {}): HubEvent => {
  const createdAt = resolveNow(options);

  return {
    id: createEventId("mock-notification", "notification", createdAt),
    expiresAt: createdAt + MOCK_NOTIFICATION_DURATION_MS,
    type: "notification",
    source: "notification",
    createdAt,
    payload: {
      app: "Cober",
      sender: "Mock Provider",
      message: "npm run qa passed",
    },
  };
};

type MockProviderConfig = {
  metadata: HubProviderMetadata;
  capabilities: HubProviderCapability[];
  events: () => HubEvent[];
};

const createMockProvider = ({
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

type TickingProviderConfig = {
  metadata: HubProviderMetadata;
  capabilities: HubProviderCapability[];
  tickMs: number;
  buildEvent: (tick: number, createdAt: number) => HubEvent;
  baseNow: number;
};

const createTickingProvider = ({
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

const createMockMetadata = (
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

const createMockCapabilities = (kind: HubProviderCapability["kind"]): HubProviderCapability[] => [
  {
    id: kind,
    kind,
    origin: "mock",
    support: "available",
  },
];

const buildMusicEvent = (tick: number, createdAt: number): HubEvent => {
  const progress = (tick * MOCK_MUSIC_PROGRESS_STEP + 68) % 100;
  const payload: MusicState = {
    title: "Midnight City",
    subtitle: "M83 - Hurry Up, We're Dreaming",
    time: "2:46 / 4:03",
    progress,
  };

  return {
    id: `mock-music-music-${createdAt}`,
    type: "music",
    source: "music",
    createdAt,
    progress,
    payload,
  };
};

export const createMockMusicProvider = (options: MockProviderOptions = {}) =>
  createTickingProvider({
    metadata: createMockMetadata("music", "Mock Music Provider"),
    capabilities: createMockCapabilities("music"),
    tickMs: MOCK_MUSIC_TICK_MS,
    buildEvent: buildMusicEvent,
    baseNow: resolveNow(options),
  });

type DownloadStatus = "downloading" | "completed";

const buildDownloadEvent = (tick: number, createdAt: number): HubEvent => {
  const rawProgress = tick * MOCK_DOWNLOAD_PROGRESS_STEP;
  const capped = Math.min(100, rawProgress);
  const isCompleted = rawProgress >= 100;
  const status: DownloadStatus = isCompleted ? "completed" : "downloading";
  const payload: HubTask = {
    id: "mock-download-task",
    type: "download",
    title: "Windows SDK Preview.zip",
    subtitle: "42.8 MB of 96 MB",
    progress: capped,
    accent: "green",
  };

  return {
    id: `mock-download-download-${createdAt}`,
    type: "download",
    source: "download",
    createdAt,
    progress: capped,
    payload,
    metadata: {
      status,
    },
  };
};

export const createMockDownloadProvider = (options: MockProviderOptions = {}) =>
  createTickingProvider({
    metadata: createMockMetadata("download", "Mock Download Provider"),
    capabilities: createMockCapabilities("download"),
    tickMs: MOCK_DOWNLOAD_TICK_MS,
    buildEvent: buildDownloadEvent,
    baseNow: resolveNow(options),
  });

type AiPhase = "analyzing" | "generating" | "review";

const resolveAiPhase = (progress: number): AiPhase => {
  if (progress < 30) {
    return "analyzing";
  }

  if (progress < 90) {
    return "generating";
  }

  return "review";
};

const AI_PHASE_SUBTITLES: Record<AiPhase, string> = {
  analyzing: "Inspecting repo context",
  generating: "Generating mock provider contract tests",
  review: "Reviewing and finalizing artifacts",
};

const buildAiEvent = (tick: number, createdAt: number): HubEvent => {
  const capped = Math.min(100, tick * MOCK_AI_PROGRESS_STEP);
  const phase = resolveAiPhase(capped);
  const payload: HubTask = {
    id: "mock-ai-task",
    type: "ai",
    title: "Codex is updating the provider SDK",
    subtitle: AI_PHASE_SUBTITLES[phase],
    progress: capped,
    accent: "blue",
  };

  return {
    id: `mock-ai-ai-${createdAt}`,
    type: "ai",
    source: "ai",
    createdAt,
    progress: capped,
    payload,
    metadata: {
      phase,
    },
  };
};

export const createMockAIProvider = (options: MockProviderOptions = {}) =>
  createTickingProvider({
    metadata: createMockMetadata("ai", "Mock AI Provider", "mock-ai-task-provider"),
    capabilities: createMockCapabilities("ai"),
    tickMs: MOCK_AI_TICK_MS,
    buildEvent: buildAiEvent,
    baseNow: resolveNow(options),
  });

export const createMockAiTaskProvider = createMockAIProvider;

export const createMockNotificationProvider = (options: MockProviderOptions = {}) =>
  createMockProvider({
    metadata: createMockMetadata("notification", "Mock Notification Provider"),
    capabilities: createMockCapabilities("notification"),
    events: () => [createMockNotificationEvent(options)],
  });
