import type {
  ClipboardPayload,
  DesktopDeveloperState,
  DesktopClipboardState,
  DesktopDownloadState,
  DesktopFocusState,
  DesktopMediaState,
  DesktopNotificationState,
  DesktopStatusAggregationInput,
  DesktopStatusAggregationResult,
  DesktopStatusKind,
  DesktopStatusState,
  DesktopStatusStateMap,
  DesktopUpdateState,
  FocusAssistPayload,
  HubEvent,
  HubStoreState,
  HubTask,
  MediaSessionPayload,
  MusicState,
} from "@/entities";

import i18n from "../i18n";
import { createHubStoreState, getActiveHubEvents } from "./hubState";
import { formatMediaTime } from "../shared/lib/mediaTime";
import { clampProgress, dedupeKinds } from "../shared/lib/runtimeGuards";

const DESKTOP_STATUS_AVAILABLE_KINDS: DesktopStatusKind[] = [
  "resident",
  "media",
  "download",
  "update",
  "clipboard",
  "focus",
  "notification",
  "developer",
];

function normalizeAvailableKinds(
  kinds: DesktopStatusKind[] | undefined,
): DesktopStatusKind[] | undefined {
  if (!kinds?.length) {
    return undefined;
  }

  return dedupeKinds(kinds.filter((kind) => DESKTOP_STATUS_AVAILABLE_KINDS.includes(kind)));
}

function snapshotMusicState(music: MusicState): DesktopMediaState {
  return {
    kind: "media",
    title: music.title,
    subtitle: i18n.t("aggregation.nowPlaying"),
    source: "mock",
    artist: music.subtitle,
    timeLabel: music.time,
    progress: clampProgress(music.progress),
    progressAccuracy: "exact",
    accent: "violet",
    playbackStatus: "playing",
  };
}

function snapshotRealMediaState(
  payload: MediaSessionPayload,
  metadata?: Record<string, unknown>,
): DesktopMediaState {
  const mediaCode =
    metadata?.["code"] === "unsupported"
      ? "unsupported"
      : metadata?.["code"] === "available" || metadata?.["code"] === "no-timeline"
        ? "available"
        : "provider-failed";
  const mediaAvailable = mediaCode === "available";
  const hasTimeline =
    payload.positionMs !== undefined && payload.durationMs !== undefined && payload.durationMs > 0;
  const timeLabel = hasTimeline
    ? formatMediaTime(payload.positionMs, payload.durationMs)
    : typeof metadata?.["timeLabel"] === "string"
      ? metadata["timeLabel"]
      : "";

  return {
    kind: "media",
    title:
      payload.playbackStatus === "playing"
        ? payload.title || i18n.t("aggregation.nowPlaying")
        : "Media",
    subtitle: payload.playbackStatus === "playing" ? "Playing" : "Paused",
    source: "system",
    artist: payload.artist ?? "",
    timeLabel,
    progress: clampProgress(payload.progress),
    progressAccuracy: hasTimeline ? "exact" : "none",
    accent: "violet",
    playbackStatus: payload.playbackStatus,
    positionMs: payload.positionMs,
    durationMs: payload.durationMs,
    sourceHealth: {
      kind: "media",
      quality: mediaAvailable ? "native" : "unavailable",
      code: mediaCode,
      safeToDisplay: mediaAvailable,
      lastCheckedAt: Date.now(),
    },
  };
}

function snapshotRealClipboardState(payload: ClipboardPayload): DesktopClipboardState {
  const preview = payload.text.length > 80 ? payload.text.slice(0, 80) + "\u2026" : payload.text;

  return {
    kind: "clipboard",
    title: i18n.t("aggregation.clipboardUpdated"),
    subtitle: i18n.t("aggregation.recentMessage"),
    source: "system",
    copiedText: preview,
    detail: payload.sourceApp || i18n.t("aggregation.notificationCenter"),
    accent: "blue",
    sourceHealth: {
      kind: "clipboard",
      quality: "native",
      code: "available",
      safeToDisplay: true,
      lastCheckedAt: payload.copiedAt,
    },
  };
}

function snapshotRealFocusState(payload: FocusAssistPayload): DesktopFocusState {
  const observationCode =
    payload.code === "unsupported"
      ? "unsupported"
      : payload.code === "permission-denied"
        ? "permission-denied"
        : payload.code === "error"
          ? "error"
          : "available";
  const available = observationCode === "available";
  const active = payload.active;
  const healthCode = observationCode === "error" ? "provider-failed" : observationCode;
  const profileLabel = payload.profile
    ? payload.profile.replace("Microsoft.Windows.Focus_", "")
    : "";

  return {
    kind: "focus",
    active,
    title: active ? i18n.t("aggregation.focusMode") : i18n.t("aggregation.focusSessionEnded"),
    subtitle: active ? i18n.t("aggregation.systemStatus") : i18n.t("aggregation.focusSessionEnded"),
    source: "system",
    sessionLabel: active
      ? profileLabel
        ? i18n.t("aggregation.profileModeEnabled", { profile: profileLabel })
        : i18n.t("aggregation.focusAssistEnabled")
      : i18n.t("aggregation.focusSessionEnded"),
    detail: active
      ? i18n.t("aggregation.doNotDisturb")
      : i18n.t("aggregation.focusSessionEndedDetail"),
    accent: "pink",
    controllable: payload.controllable,
    observationCode,
    sourceHealth: {
      kind: "focus",
      quality: available ? "native" : "unavailable",
      code: healthCode,
      safeToDisplay: available,
      lastCheckedAt: payload.checkedAt,
    },
  };
}

function snapshotDownloadTask(task: HubTask): DesktopDownloadState {
  const metadata = task.metadata;
  const status =
    metadata?.["status"] === "active" ||
    metadata?.["status"] === "completed" ||
    metadata?.["status"] === "ended_unknown" ||
    metadata?.["status"] === "error"
      ? metadata["status"]
      : undefined;
  const progressAccuracy =
    metadata?.["progressAccuracy"] === "none" ||
    metadata?.["progressAccuracy"] === "estimated" ||
    metadata?.["progressAccuracy"] === "exact"
      ? metadata["progressAccuracy"]
      : undefined;
  const observationCode =
    metadata?.["code"] === "available" ||
    metadata?.["code"] === "unsupported" ||
    metadata?.["code"] === "permission-denied" ||
    metadata?.["code"] === "error"
      ? metadata["code"]
      : undefined;
  const controllable =
    typeof metadata?.["controllable"] === "boolean" ? metadata["controllable"] : undefined;
  const checkedAt =
    typeof metadata?.["checkedAt"] === "number" ? metadata["checkedAt"] : Date.now();

  return {
    kind: "download",
    title: task.title,
    subtitle: i18n.t("aggregation.downloadTask"),
    source: task.source ?? "mock",
    detail: task.subtitle || i18n.t("aggregation.transferring"),
    progress: clampProgress(task.progress),
    progressAccuracy,
    status,
    controllable,
    observationCode,
    accent: "green",
    sourceHealth:
      task.source === "system"
        ? {
            kind: "download",
            quality: observationCode === "available" ? "native" : "unavailable",
            code:
              observationCode === "available"
                ? "available"
                : observationCode === "permission-denied"
                  ? "permission-denied"
                  : observationCode === "unsupported"
                    ? "unsupported"
                    : "provider-failed",
            safeToDisplay: observationCode === "available",
            lastCheckedAt: checkedAt,
          }
        : undefined,
  };
}

function snapshotAiTask(task: HubTask): DesktopUpdateState {
  return {
    kind: "update",
    title: task.title,
    subtitle: i18n.t("aggregation.inProgress"),
    source: "mock",
    detail: task.subtitle || i18n.t("aggregation.systemTaskProcessing"),
    progress: clampProgress(task.progress),
    accent: "orange",
  };
}

function snapshotDeveloperEvent(event: HubEvent): DesktopDeveloperState {
  const payload = event.payload as HubTask | undefined;
  const title =
    payload && typeof payload.title === "string" && payload.title
      ? payload.title
      : i18n.t("developer.eyebrow");
  const detail =
    payload && typeof payload.subtitle === "string" && payload.subtitle
      ? payload.subtitle
      : i18n.t("developer.defaultDetail");

  return {
    kind: "developer",
    title,
    subtitle: i18n.t("developer.subtitle"),
    source: "system",
    detail,
    accent: "cyan",
    progress:
      payload && typeof payload.progress === "number" ? clampProgress(payload.progress) : undefined,
    sourceHealth: {
      kind: "developer",
      quality: "native",
      code:
        typeof event.metadata?.["code"] === "string"
          ? (event.metadata["code"] as "available" | "unsupported")
          : "available",
      safeToDisplay: true,
      lastCheckedAt: event.createdAt,
    },
  };
}

function snapshotNotificationEvent(
  event: HubEvent,
): DesktopClipboardState | DesktopFocusState | DesktopNotificationState | undefined {
  if (event.source === "notification") {
    const payload = event.payload && "message" in event.payload ? event.payload : undefined;

    return {
      kind: "notification",
      title: payload?.app ?? i18n.t("aggregation.desktopNotification"),
      subtitle: i18n.t("aggregation.recentMessage"),
      source: "system",
      app: payload?.app ?? i18n.t("aggregation.notificationCenter"),
      sender: payload?.sender ?? i18n.t("aggregation.systemStatus"),
      message: payload?.message ?? i18n.t("aggregation.newNotificationReceived"),
      accent: "orange",
    };
  }

  if (event.source === "system" && event.metadata?.["focus"] === true) {
    return {
      kind: "focus",
      title: i18n.t("aggregation.focusMode"),
      subtitle: i18n.t("aggregation.systemStatus"),
      source: "system",
      sessionLabel:
        typeof event.metadata["label"] === "string"
          ? event.metadata["label"]
          : i18n.t("aggregation.focusModeEnabled"),
      detail:
        typeof event.metadata["detail"] === "string"
          ? event.metadata["detail"]
          : i18n.t("aggregation.doNotDisturb"),
      accent: "pink",
    };
  }

  return undefined;
}

function deriveStateOverrides(hubState: HubStoreState): Partial<DesktopStatusStateMap> {
  const overrides: Partial<DesktopStatusStateMap> = {};

  // --- Music (mock provider) ---
  if (hubState.music) {
    overrides.media = snapshotMusicState(hubState.music);
  }

  // --- Media (real provider) takes priority over mock music ---
  const mediaEvent = hubState.events.find((event) => event.type === "media");
  if (mediaEvent && mediaEvent.payload && "playbackStatus" in mediaEvent.payload) {
    const payload = mediaEvent.payload as MediaSessionPayload;
    if (payload.available) {
      overrides.media = snapshotRealMediaState(payload, mediaEvent.metadata);
    }
  }

  // --- Download (mock/fixture) ---
  const downloadTask = hubState.tasks.find((task) => task.type === "download");
  if (downloadTask) {
    overrides.download = snapshotDownloadTask(downloadTask);
  }

  // --- AI task (mock/fixture) ---
  const aiTask = hubState.tasks.find((task) => task.type === "ai");
  if (aiTask) {
    overrides.update = snapshotAiTask(aiTask);
  }

  // --- Developer events (git/docker/npm real providers) ---
  const developerEvent = hubState.events.find(
    (event) =>
      event.type === "ai" &&
      (event.source === "git" || event.source === "docker" || event.source === "npm"),
  );
  if (developerEvent) {
    overrides.developer = snapshotDeveloperEvent(developerEvent);
  }

  // --- Clipboard (real provider) ---
  if (hubState.clipboard) {
    overrides.clipboard = snapshotRealClipboardState(hubState.clipboard);
  }

  // --- Focus (real provider) ---
  if (hubState.focus && (hubState.focus.code ?? "available") === "available") {
    overrides.focus = snapshotRealFocusState(hubState.focus);
  }

  // --- Notification (mock provider fallback) ---
  // Notification events (mock or real provider) map to the dedicated
  // "notification" kind. If a real clipboard event is also present, that
  // wins because it represents a more actionable user action (text on the
  // clipboard is directly usable).
  if (!overrides.clipboard && !overrides.notification) {
    const latestNotification = hubState.events.find(
      (event) => event.type === "notification" && event.source === "notification",
    );
    const notificationState = latestNotification
      ? snapshotNotificationEvent(latestNotification)
      : undefined;
    if (notificationState?.kind === "notification") {
      overrides.notification = notificationState;
    }
  }

  if (!overrides.focus) {
    const focusNotification = hubState.events.find(
      (event) => event.source === "system" && event.metadata?.["focus"] === true,
    );
    const focusState = focusNotification ? snapshotNotificationEvent(focusNotification) : undefined;
    if (focusState?.kind === "focus") {
      overrides.focus = focusState;
    }
  }

  return overrides;
}

function deriveActiveKinds(hubState: HubStoreState, events: HubEvent[]): DesktopStatusKind[] {
  const activeKinds: DesktopStatusKind[] = [];

  // Music (mock provider)
  if (hubState.music) {
    activeKinds.push("media");
  }

  // Media (real provider)
  if (
    events.some((event) => {
      if (event.type !== "media") return false;
      const payload = event.payload;
      const isAvailable =
        payload && "available" in payload && (payload as MediaSessionPayload).available;
      return isAvailable;
    })
  ) {
    activeKinds.push("media");
  }

  // Download
  if (hubState.tasks.some((task) => task.type === "download")) {
    activeKinds.push("download");
  }

  // AI task
  if (hubState.tasks.some((task) => task.type === "ai")) {
    activeKinds.push("update");
  }

  // Developer events (git/docker/npm real providers)
  if (
    events.some(
      (event) =>
        event.type === "ai" &&
        (event.source === "git" || event.source === "docker" || event.source === "npm"),
    )
  ) {
    activeKinds.push("developer");
  }

  // Clipboard (real provider or mock notification)
  if (hubState.clipboard) {
    activeKinds.push("clipboard");
  }

  // Notification (mock or real provider)
  if (events.some((event) => event.type === "notification" && event.source === "notification")) {
    activeKinds.push("notification");
  }

  // Focus (real provider or mock)
  if (hubState.focus && (hubState.focus.code ?? "available") === "available") {
    activeKinds.push("focus");
  } else if (
    events.some((event) => event.source === "system" && event.metadata?.["focus"] === true)
  ) {
    activeKinds.push("focus");
  }

  return dedupeKinds(activeKinds);
}

function resolveHubState(input: DesktopStatusAggregationInput): HubStoreState {
  if (input.hubState) {
    return input.hubState;
  }

  return createHubStoreState(input.events ?? [], input.now);
}

function resolveEvents(input: DesktopStatusAggregationInput): HubEvent[] {
  if (input.events) {
    return getActiveHubEvents(input.events, input.now);
  }

  return input.hubState?.events ?? [];
}

export function aggregateDesktopStatusInput(
  input: DesktopStatusAggregationInput = {},
): DesktopStatusAggregationResult {
  const hubState = resolveHubState(input);
  const events = resolveEvents(input);
  const states = deriveStateOverrides(hubState);
  const activeKinds = deriveActiveKinds(hubState, events);
  const availableKinds = normalizeAvailableKinds(input.availableKinds);

  // Merge external states (legacy path: direct system monitor data)
  // This remains as a fallback for any data that hasn't been migrated
  // to the unified provider pipeline yet.
  if (input.externalStates) {
    for (const [kind, state] of Object.entries(input.externalStates) as [
      DesktopStatusKind,
      DesktopStatusState,
    ][]) {
      if (state && !states[kind]) {
        (states as Record<string, unknown>)[kind] = state;
      }
    }
  }

  // Merge external active kinds (legacy fallback, deduplicated)
  const mergedActiveKinds = input.externalActiveKinds?.length
    ? dedupeKinds([...activeKinds, ...input.externalActiveKinds])
    : activeKinds;

  const result = {
    activeKinds: mergedActiveKinds,
    availableKinds,
    states: Object.keys(states).length ? states : undefined,
  };
  return result;
}
