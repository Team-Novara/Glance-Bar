import { listen, type Event, type UnlistenFn } from "@tauri-apps/api/event";

import type { DesktopStatusMenuActionId, DesktopStatusPreferencesPayload } from "@/entities";

import { isRecord } from "../../shared/lib/runtimeGuards";


export const STATUS_CENTER_SETTINGS_EVENT = "status-center://settings";

export type StatusCenterMenuAction =
  | "refresh-data"
  | "toggle-always-float"
  | "toggle-avoid-fullscreen"
  | "toggle-lock-position"
  | "reset-position"
  | "open-settings"
  | "quit";

export type StatusCenterMenuActionPayload = {
  action: StatusCenterMenuAction;
  checked?: boolean;
};

export type StatusCenterSettingsPayload = DesktopStatusPreferencesPayload;

export function parseStatusCenterMenuActionPayload(
  value: unknown,
): StatusCenterMenuActionPayload | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const action = normalizeStatusCenterMenuAction(value.action);
  if (!action) {
    return undefined;
  }

  return {
    action,
    checked: typeof value.checked === "boolean" ? value.checked : undefined,
  };
}

export function parseStatusCenterSettingsPayload(
  value: unknown,
): StatusCenterSettingsPayload | undefined {
  if (!isRecord(value) || !isDesktopStatusPreferences(value.preferences)) {
    return undefined;
  }

  return {
    preferences: { ...value.preferences },
  };
}

export async function listenStatusCenterSettings(
  handler: (payload: StatusCenterSettingsPayload, event: Event<unknown>) => void | Promise<void>,
): Promise<UnlistenFn> {
  return listen(STATUS_CENTER_SETTINGS_EVENT, async (event) => {
    const payload = parseStatusCenterSettingsPayload(event.payload);
    if (!payload) {
      return;
    }

    await handler(payload, event);
  });
}

function isStatusCenterMenuAction(value: unknown): value is StatusCenterMenuAction {
  return (
    value === "refresh-data" ||
    value === "toggle-always-float" ||
    value === "toggle-avoid-fullscreen" ||
    value === "toggle-lock-position" ||
    value === "reset-position" ||
    value === "open-settings" ||
    value === "quit"
  );
}

function normalizeStatusCenterMenuAction(value: unknown): StatusCenterMenuAction | undefined {
  if (!isDesktopStatusMenuActionId(value)) {
    return undefined;
  }

  switch (value) {
    case "always-float":
      return "toggle-always-float";
    case "avoid-fullscreen":
      return "toggle-avoid-fullscreen";
    case "lock-position":
      return "toggle-lock-position";
    default:
      return isStatusCenterMenuAction(value) ? value : undefined;
  }
}

function isDesktopStatusMenuActionId(value: unknown): value is DesktopStatusMenuActionId {
  return (
    value === "refresh-data" ||
    value === "always-float" ||
    value === "avoid-fullscreen" ||
    value === "lock-position" ||
    value === "toggle-always-float" ||
    value === "toggle-avoid-fullscreen" ||
    value === "toggle-lock-position" ||
    value === "reset-position" ||
    value === "open-settings" ||
    value === "quit"
  );
}

function isDesktopStatusPreferences(
  value: unknown,
): value is DesktopStatusPreferencesPayload["preferences"] {
  return (
    isRecord(value) &&
    typeof value.alwaysFloat === "boolean" &&
    typeof value.avoidFullscreen === "boolean" &&
    typeof value.lockPosition === "boolean"
  );
}
