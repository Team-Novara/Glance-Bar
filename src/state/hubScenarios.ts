import type { HubEventBus } from "./hubState";

import type { HubEvent, HubMode } from "@/entities";

export type HubDemoScenarioId =
  | "idle"
  | "clear"
  | "music"
  | "ai"
  | "download"
  | "notification"
  | "multiTask";

type HubDemoScenario = {
  id: HubDemoScenarioId;
  label: string;
  caption: string;
  events: HubEvent[];
  expectedMode: HubMode;
  durationMs: number;
};

const NOTIFICATION_TTL_MS = 3000;
const DEFAULT_STEP_DURATION_MS = 1800;

function eventDefaults(now: number) {
  return {
    source: "mock" as const,
    createdAt: now,
  };
}

function createMusicDemoEvent(now = Date.now()): HubEvent {
  return {
    ...eventDefaults(now),
    id: "demo-music",
    type: "music",
    progress: 42,
    payload: {
      title: "Neon Focus",
      subtitle: "Acrylic Night Drive",
      time: "1:24 / 3:20",
      progress: 42,
    },
  };
}

function createAiDemoEvent(now = Date.now()): HubEvent {
  return {
    ...eventDefaults(now),
    id: "demo-ai",
    type: "ai",
    progress: 68,
    payload: {
      id: "demo-ai-task",
      type: "ai",
      title: "GPT workspace",
      subtitle: "Generating showcase motion states",
      progress: 68,
      accent: "blue",
    },
  };
}

function createDownloadDemoEvent(now = Date.now()): HubEvent {
  return {
    ...eventDefaults(now),
    id: "demo-download",
    type: "download",
    progress: 36,
    payload: {
      id: "demo-download-task",
      type: "download",
      title: "Cober-Windows-Bar.zip",
      subtitle: "Downloading release preview",
      progress: 36,
      accent: "green",
    },
  };
}

function createNotificationDemoEvent(now = Date.now()): HubEvent {
  return {
    ...eventDefaults(now),
    id: "demo-notification",
    type: "notification",
    expiresAt: now + NOTIFICATION_TTL_MS,
    payload: {
      app: "Microsoft Teams",
      sender: "Design Review",
      message: "Win11 showcase polish is ready for a quick pass.",
    },
  };
}

function createMultiTaskDemoEvents(now = Date.now()): HubEvent[] {
  return [
    createDownloadDemoEvent(now),
    createAiDemoEvent(now - 120),
    createMusicDemoEvent(now - 240),
  ];
}

export function createHubDemoScenario(id: HubDemoScenarioId, now = Date.now()): HubDemoScenario {
  switch (id) {
    case "music":
      return {
        id,
        label: "Music",
        caption: "Publish a media playback event.",
        events: [createMusicDemoEvent(now)],
        expectedMode: "music",
        durationMs: DEFAULT_STEP_DURATION_MS,
      };
    case "ai":
      return {
        id,
        label: "AI",
        caption: "Publish an AI progress event.",
        events: [createAiDemoEvent(now)],
        expectedMode: "aiProgress",
        durationMs: DEFAULT_STEP_DURATION_MS,
      };
    case "download":
      return {
        id,
        label: "Download",
        caption: "Publish a file transfer event.",
        events: [createDownloadDemoEvent(now)],
        expectedMode: "download",
        durationMs: DEFAULT_STEP_DURATION_MS,
      };
    case "notification":
      return {
        id,
        label: "Notification",
        caption: "Publish a short-lived notification event.",
        events: [createNotificationDemoEvent(now)],
        expectedMode: "notification",
        durationMs: NOTIFICATION_TTL_MS,
      };
    case "multiTask":
      return {
        id,
        label: "MultiTask",
        caption: "Publish multiple active task events.",
        events: createMultiTaskDemoEvents(now),
        expectedMode: "multiTask",
        durationMs: DEFAULT_STEP_DURATION_MS,
      };
    case "idle":
      return {
        id,
        label: "Idle",
        caption: "Show the resting hub state.",
        events: [],
        expectedMode: "idle",
        durationMs: 900,
      };
    case "clear":
      return {
        id,
        label: "Clear",
        caption: "Clear all active mock events.",
        events: [],
        expectedMode: "idle",
        durationMs: 900,
      };
  }
}

export function createHubDemoScenarios(now = Date.now()): HubDemoScenario[] {
  return [
    createHubDemoScenario("music", now),
    createHubDemoScenario("ai", now),
    createHubDemoScenario("download", now),
    createHubDemoScenario("notification", now),
    createHubDemoScenario("multiTask", now),
    createHubDemoScenario("clear", now),
  ];
}

export function createAutoDemoSequence(now = Date.now()): HubDemoScenario[] {
  return [
    createHubDemoScenario("idle", now),
    createHubDemoScenario("music", now + 1000),
    createHubDemoScenario("ai", now + 2000),
    createHubDemoScenario("notification", now + 3000),
    createHubDemoScenario("download", now + 4000),
    createHubDemoScenario("multiTask", now + 5000),
    createHubDemoScenario("idle", now + 6000),
  ];
}

export function playHubDemoScenario(bus: HubEventBus, scenario: HubDemoScenario, now = Date.now()) {
  bus.clearHubEvents();

  for (const event of [...scenario.events].reverse()) {
    bus.publishHubEvent(event);
  }

  return bus.getState(now);
}
