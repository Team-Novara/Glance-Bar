import { listen } from "@tauri-apps/api/event";

import type { DownloadObservation, FocusAssistCode, MediaSessionCode } from "@/entities";

import { getTauriInvoke, type TauriInvoke } from "../tauri/tauriRuntime";

const FOCUS_ASSIST_COMMAND = "get_focus_assist_state";
const NOTIFICATION_SUMMARY_COMMAND = "get_notification_summary";
const MAX_OBSERVATION_TIMESTAMP_FUTURE_SKEW_MS = 24 * 60 * 60 * 1_000;

export const FOCUS_ASSIST_CHANGED_EVENT = "status-center://focus-assist-changed";
export const NOTIFICATIONS_CHANGED_EVENT = "status-center://notifications-changed";
export const CLIPBOARD_CHANGED_EVENT = "status-center://clipboard-changed";
export const MEDIA_SESSION_CHANGED_EVENT = "status-center://media-session-changed";
export const DOWNLOAD_CHANGED_EVENT = "status-center://download-changed";
const MAX_ACTIVE_DOWNLOADS = 1_000;

export type FocusAssistState = {
  active: boolean;
  profile: string;
  code: FocusAssistCode;
  controllable: boolean;
  checkedAt: number;
};

export type NotificationSummary = {
  focusAssistActive: boolean;
  checkedAt: number;
};

export type ClipboardChangedPayload = {
  text: string;
  sourceApp: string;
  copiedAt: number;
};

export type MediaSessionChangedPayload = {
  available: boolean;
  playbackStatus: "playing" | "paused" | "unavailable" | "unsupported";
  progress: number;
  positionMs?: number;
  durationMs?: number;
  title?: string;
  artist?: string;
  code: MediaSessionCode;
  checkedAt: number;
};

export type DownloadChangedPayload = DownloadObservation;

export const DOWNLOAD_STATE_COMMAND = "get_download_state";

export async function getFocusAssistState(
  invoke: TauriInvoke | undefined = getTauriInvoke(),
): Promise<FocusAssistState | undefined> {
  if (!invoke) {
    return undefined;
  }

  try {
    const result = await invoke(FOCUS_ASSIST_COMMAND);
    return parseFocusAssistState(result);
  } catch {
    return undefined;
  }
}

export async function getNotificationSummary(
  invoke: TauriInvoke | undefined = getTauriInvoke(),
): Promise<NotificationSummary | undefined> {
  if (!invoke) {
    return undefined;
  }

  try {
    const result = await invoke(NOTIFICATION_SUMMARY_COMMAND);
    if (typeof result === "object" && result !== null) {
      const record = result as Record<string, unknown>;
      return {
        focusAssistActive: record.focusAssistActive === true,
        checkedAt: typeof record.checkedAt === "number" ? record.checkedAt : Date.now(),
      };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function onFocusAssistChanged(
  handler: (state: FocusAssistState) => void,
): Promise<() => void> {
  return listen<unknown>(FOCUS_ASSIST_CHANGED_EVENT, (event) => {
    const state = parseFocusAssistState(event.payload);
    if (state) {
      handler(state);
    }
  });
}

/**
 * Whether the real Focus Assist monitor can run in the current environment.
 * The native implementation is Windows-only and requires the Tauri bridge;
 * browser previews and non-Windows builds must advertise an unsupported
 * capability instead of implying that a live OS observation exists.
 */
export function getFocusAssistMonitorSupport(): "available" | "unsupported" {
  if (!getTauriInvoke()) {
    return "unsupported";
  }
  if (typeof navigator !== "undefined" && /Win/.test(navigator.platform)) {
    return "available";
  }
  return "unsupported";
}

export function parseFocusAssistState(value: unknown): FocusAssistState | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const code = record.code;
  const checkedAt = record.checkedAt;

  if (
    typeof record.active !== "boolean" ||
    typeof record.profile !== "string" ||
    !isFocusAssistCode(code) ||
    typeof record.controllable !== "boolean" ||
    typeof checkedAt !== "number" ||
    !Number.isSafeInteger(checkedAt) ||
    checkedAt < 0 ||
    (checkedAt > 0 && checkedAt > Date.now() + MAX_OBSERVATION_TIMESTAMP_FUTURE_SKEW_MS) ||
    (code !== "available" && record.active)
  ) {
    return undefined;
  }

  return {
    active: record.active,
    profile: record.profile,
    code,
    controllable: record.controllable,
    checkedAt,
  };
}

function isFocusAssistCode(value: unknown): value is FocusAssistCode {
  return (
    value === "available" ||
    value === "unsupported" ||
    value === "permission-denied" ||
    value === "error"
  );
}

export function onNotificationsChanged(
  handler: (summary: NotificationSummary) => void,
): Promise<() => void> {
  return listen<NotificationSummary>(NOTIFICATIONS_CHANGED_EVENT, (event) => {
    handler(event.payload);
  });
}

export function onClipboardChanged(
  handler: (content: ClipboardChangedPayload) => void,
): Promise<() => void> {
  return listen<ClipboardChangedPayload>(CLIPBOARD_CHANGED_EVENT, (event) => {
    handler(event.payload);
  });
}

export function onMediaSessionChanged(
  handler: (status: MediaSessionChangedPayload) => void,
): Promise<() => void> {
  return listen<unknown>(MEDIA_SESSION_CHANGED_EVENT, (event) => {
    const payload = parseMediaSessionChangedPayload(event.payload);
    if (payload) {
      handler(payload);
    }
  });
}

export function parseMediaSessionChangedPayload(
  value: unknown,
): MediaSessionChangedPayload | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const playbackStatus = record.playbackStatus;
  const code = record.code;
  const progress = record.progress;
  const checkedAt = record.checkedAt;

  if (
    typeof record.available !== "boolean" ||
    (playbackStatus !== "playing" &&
      playbackStatus !== "paused" &&
      playbackStatus !== "unavailable" &&
      playbackStatus !== "unsupported") ||
    typeof progress !== "number" ||
    !Number.isFinite(progress) ||
    progress < 0 ||
    progress > 100 ||
    !isMediaSessionCode(code) ||
    typeof checkedAt !== "number" ||
    !Number.isSafeInteger(checkedAt) ||
    checkedAt < 0 ||
    (checkedAt > 0 && checkedAt > Date.now() + MAX_OBSERVATION_TIMESTAMP_FUTURE_SKEW_MS)
  ) {
    return undefined;
  }

  const positionMs = record.positionMs;
  const durationMs = record.durationMs;
  if (
    (positionMs !== undefined &&
      (typeof positionMs !== "number" || !Number.isFinite(positionMs) || positionMs < 0)) ||
    (durationMs !== undefined &&
      (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs < 0)) ||
    (record.title !== undefined && typeof record.title !== "string") ||
    (record.artist !== undefined && typeof record.artist !== "string")
  ) {
    return undefined;
  }

  return {
    available: record.available,
    playbackStatus,
    progress: Math.round(progress),
    positionMs,
    durationMs,
    title: record.title,
    artist: record.artist,
    code,
    checkedAt,
  };
}

function isMediaSessionCode(value: unknown): value is MediaSessionCode {
  return (
    value === "available" ||
    value === "not-playing" ||
    value === "unsupported" ||
    value === "provider-failed" ||
    value === "sta-timeout" ||
    value === "no-session" ||
    value === "no-playback-info" ||
    value === "no-status" ||
    value === "no-timeline"
  );
}

/**
 * Whether real download folder monitoring is available in this environment.
 *
 * Monitoring is Windows-only for the MVP and requires the Tauri native runtime
 * (no runtime => we are outside the desktop app, e.g. a plain browser dev server).
 * The provider uses this to set its capability `support` fact: "available" only
 * when real monitoring works, "unsupported" otherwise (cross-platform stub).
 */
export function getDownloadMonitorSupport(): "available" | "unsupported" {
  if (!getTauriInvoke()) {
    return "unsupported";
  }
  if (typeof navigator !== "undefined" && /Win/.test(navigator.platform)) {
    return "available";
  }
  return "unsupported";
}

export function onDownloadChanged(
  handler: (status: DownloadChangedPayload) => void,
): Promise<() => void> {
  return listen<unknown>(DOWNLOAD_CHANGED_EVENT, (event) => {
    const payload = parseDownloadChangedPayload(event.payload);
    if (payload) {
      handler(payload);
    }
  });
}

/**
 * Maps a raw `get_download_state` invoke result into a
 * {@link DownloadChangedPayload}, or undefined when the payload is malformed.
 */
export function parseDownloadChangedPayload(value: unknown): DownloadChangedPayload | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const status = record.status;
  const progressAccuracy = record.progressAccuracy;
  const code = record.code;
  const activeDownloads = record.activeDownloads;

  if (
    status !== "active" &&
    status !== "completed" &&
    status !== "ended_unknown" &&
    status !== "error" &&
    status !== "idle"
  ) {
    return undefined;
  }
  if (
    progressAccuracy !== "none" &&
    progressAccuracy !== "estimated" &&
    progressAccuracy !== "exact"
  ) {
    return undefined;
  }
  if (
    code !== "available" &&
    code !== "unsupported" &&
    code !== "permission-denied" &&
    code !== "error"
  ) {
    return undefined;
  }
  if (
    typeof activeDownloads !== "number" ||
    !Number.isSafeInteger(activeDownloads) ||
    activeDownloads < 0 ||
    activeDownloads > MAX_ACTIVE_DOWNLOADS ||
    typeof record.controllable !== "boolean" ||
    typeof record.checkedAt !== "number" ||
    !Number.isSafeInteger(record.checkedAt) ||
    record.checkedAt < 0 ||
    (record.checkedAt > 0 &&
      record.checkedAt > Date.now() + MAX_OBSERVATION_TIMESTAMP_FUTURE_SKEW_MS)
  ) {
    return undefined;
  }

  const rawProgress = record.progress;
  if (
    rawProgress !== undefined &&
    (typeof rawProgress !== "number" || !Number.isFinite(rawProgress))
  ) {
    return undefined;
  }
  if (rawProgress !== undefined && (rawProgress < 0 || rawProgress > 100)) {
    return undefined;
  }
  if (progressAccuracy !== "none" && rawProgress === undefined) {
    return undefined;
  }
  if (progressAccuracy === "none" && rawProgress !== undefined) {
    return undefined;
  }
  if (status === "active" && (activeDownloads === 0 || code !== "available")) {
    return undefined;
  }
  if (status !== "active" && activeDownloads !== 0) {
    return undefined;
  }
  if (status === "error" && code === "available") {
    return undefined;
  }
  if (
    (status === "idle" || status === "ended_unknown" || status === "error") &&
    progressAccuracy !== "none"
  ) {
    return undefined;
  }

  return {
    status,
    activeDownloads,
    progress:
      progressAccuracy === "none" || rawProgress === undefined
        ? undefined
        : Math.max(0, Math.min(100, Math.round(rawProgress))),
    progressAccuracy,
    controllable: record.controllable,
    code,
    checkedAt: record.checkedAt,
  };
}

/**
 * One-shot fetch of the current download folder state (mirrors
 * `loadTauriMediaSessionStatus`). Used to seed the provider on start so the
 * bar does not wait for the next change event.
 */
export async function loadDownloadState(
  invoke: TauriInvoke | undefined = getTauriInvoke(),
): Promise<DownloadChangedPayload | undefined> {
  if (!invoke) {
    return undefined;
  }
  try {
    const result = await invoke(DOWNLOAD_STATE_COMMAND);
    return parseDownloadChangedPayload(result);
  } catch {
    return undefined;
  }
}
