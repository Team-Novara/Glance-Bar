import { listen } from "@tauri-apps/api/event";

import { getTauriInvoke, type TauriInvoke } from "../tauri/tauriRuntime";

const FOCUS_ASSIST_COMMAND = "get_focus_assist_state";
const NOTIFICATION_SUMMARY_COMMAND = "get_notification_summary";

export const FOCUS_ASSIST_CHANGED_EVENT = "status-center://focus-assist-changed";
export const NOTIFICATIONS_CHANGED_EVENT = "status-center://notifications-changed";
export const CLIPBOARD_CHANGED_EVENT = "status-center://clipboard-changed";
export const MEDIA_SESSION_CHANGED_EVENT = "status-center://media-session-changed";

export type FocusAssistState = {
  active: boolean;
  profile: string;
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
  code: string;
  checkedAt: number;
};

export async function getFocusAssistState(
  invoke: TauriInvoke | undefined = getTauriInvoke(),
): Promise<FocusAssistState | undefined> {
  if (!invoke) {
    return undefined;
  }

  try {
    const result = await invoke(FOCUS_ASSIST_COMMAND);
    if (typeof result === "object" && result !== null) {
      const record = result as Record<string, unknown>;
      return {
        active: record.active === true,
        profile: typeof record.profile === "string" ? record.profile : "",
        checkedAt: typeof record.checkedAt === "number" ? record.checkedAt : Date.now(),
      };
    }
    return undefined;
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
  return listen<FocusAssistState>(FOCUS_ASSIST_CHANGED_EVENT, (event) => {
    handler(event.payload);
  });
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
  return listen<MediaSessionChangedPayload>(MEDIA_SESSION_CHANGED_EVENT, (event) => {
    handler(event.payload);
  });
}
