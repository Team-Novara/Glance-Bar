import { clampProgress, isFiniteNumber, snapshotHubEvent } from "../shared/lib/runtimeGuards";

import type {
  ClipboardPayload,
  FocusAssistPayload,
  HubEvent,
  HubMode,
  HubStoreState,
  HubTask,
  SystemPerformancePayload,
} from "@/entities";

const taskAccentMap: Record<string, HubTask["accent"]> = {
  music: "pink",
  ai: "blue",
  download: "green",
  notification: "cyan",
  media: "pink",
};

export function getActiveHubEvents(events: HubEvent[], now = Date.now()) {
  return events
    .filter(
      (event) =>
        isFiniteNumber(event.createdAt) &&
        (event.expiresAt === undefined ||
          (isFiniteNumber(event.expiresAt) && event.expiresAt > now)),
    )
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function resolveHubMode(events: HubEvent[], now = Date.now()): HubMode {
  const activeEvents = getActiveHubEvents(events, now);

  if (activeEvents.length === 0) {
    return "idle";
  }

  if (activeEvents.some((event) => event.type === "notification")) {
    return "notification";
  }

  // Filter out non-task events (clipboard, focus, system are status events, not tasks)
  const taskEvents = activeEvents.filter(
    (event) =>
      event.type !== "notification" &&
      event.type !== "clipboard" &&
      event.type !== "focus" &&
      event.type !== "system",
  );

  if (taskEvents.length > 1) {
    return "multiTask";
  }

  const [event] = taskEvents;

  if (!event) {
    return "idle";
  }

  if (event.type === "ai") {
    return "aiProgress";
  }

  // Map "media" provider events to "music" mode (same display surface)
  if (event.type === "media") {
    return "music";
  }

  // clipboard, focus, system are status events — they don't change the hub mode
  if (event.type === "clipboard" || event.type === "focus" || event.type === "system") {
    return "idle";
  }

  return event.type;
}

function eventToTask(event: HubEvent): HubTask {
  const payload = event.payload && "title" in event.payload ? event.payload : undefined;
  const shouldDefaultProgress = event.type === "ai" || event.type === "download";
  const subtitle =
    payload && "subtitle" in payload ? (payload as { subtitle: string }).subtitle : "";

  return {
    id: event.id,
    type: event.type,
    title: payload?.title ?? event.type,
    subtitle,
    progress:
      event.progress === undefined
        ? shouldDefaultProgress
          ? 0
          : undefined
        : clampProgress(event.progress),
    accent: taskAccentMap[event.type] ?? "blue",
  };
}

export function createHubStoreState(events: HubEvent[], now = Date.now()): HubStoreState {
  const activeEvents = getActiveHubEvents(events, now).map(snapshotHubEvent);
  const mode = resolveHubMode(activeEvents, now);
  const tasks = activeEvents.filter((event) => event.type !== "notification").map(eventToTask);

  let notificationEvent: HubEvent | undefined;
  let musicEvent: HubEvent | undefined;
  let clipboardEvent: HubEvent | undefined;
  let focusEvent: HubEvent | undefined;
  let systemEvent: HubEvent | undefined;

  for (const event of activeEvents) {
    switch (event.type) {
      case "notification":
        notificationEvent ??= event;
        break;
      case "music":
        musicEvent ??= event;
        break;
      case "clipboard":
        clipboardEvent ??= event;
        break;
      case "focus":
        focusEvent ??= event;
        break;
      case "system":
        systemEvent ??= event;
        break;
    }
  }

  return {
    events: activeEvents,
    mode,
    tasks,
    notification:
      notificationEvent && notificationEvent.payload && "message" in notificationEvent.payload
        ? { ...notificationEvent.payload }
        : undefined,
    music:
      musicEvent && musicEvent.payload && "time" in musicEvent.payload
        ? { ...musicEvent.payload, progress: clampProgress(musicEvent.payload.progress) }
        : undefined,
    clipboard:
      clipboardEvent && clipboardEvent.payload && "text" in clipboardEvent.payload
        ? { ...(clipboardEvent.payload as ClipboardPayload) }
        : undefined,
    focus:
      focusEvent && focusEvent.payload && "active" in focusEvent.payload
        ? { ...(focusEvent.payload as FocusAssistPayload) }
        : undefined,
    systemPerformance:
      systemEvent && systemEvent.payload && "cpu" in systemEvent.payload
        ? { ...(systemEvent.payload as SystemPerformancePayload) }
        : undefined,
  };
}

export type HubEventBus = {
  getState(now?: number): HubStoreState;
  publishHubEvent(event: HubEvent): void;
  replaceHubEvents(events: HubEvent[]): void;
  clearHubEvents(): void;
  clearExpiredEvents(now?: number): void;
  subscribe(subscriber: (state: HubStoreState) => void): () => void;
};

export function createHubEventBus(initialEvents: HubEvent[] = []): HubEventBus {
  let events = initialEvents.map(snapshotHubEvent);
  const subscribers = new Set<(state: HubStoreState) => void>();

  function snapshot(now = Date.now()) {
    return createHubStoreState(events, now);
  }

  function deliver(subscriber: (state: HubStoreState) => void, state: HubStoreState) {
    try {
      subscriber(state);
    } catch {
      // Subscriber failures should not prevent unrelated listeners from receiving state.
    }
  }

  function notify() {
    const state = snapshot();
    subscribers.forEach((subscriber) => deliver(subscriber, state));
  }

  return {
    getState: snapshot,
    publishHubEvent(event: HubEvent) {
      events = [snapshotHubEvent(event), ...events.filter((item) => item.id !== event.id)];
      notify();
    },
    replaceHubEvents(nextEvents: HubEvent[]) {
      events = nextEvents.map(snapshotHubEvent);
      notify();
    },
    clearHubEvents() {
      events = [];
      notify();
    },
    clearExpiredEvents(now = Date.now()) {
      events = getActiveHubEvents(events, now);
      notify();
    },
    subscribe(subscriber: (state: HubStoreState) => void) {
      subscribers.add(subscriber);
      deliver(subscriber, snapshot());
      return () => subscribers.delete(subscriber);
    },
  };
}
