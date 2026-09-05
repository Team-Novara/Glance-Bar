import { listen, type Event, type UnlistenFn } from "@tauri-apps/api/event";

import type {
  DesktopStatusMenuActionId,
  DesktopStatusPreferencesPayload,
  DesktopStatusWindowPosition,
} from "@/entities";

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

  const preferences = value.preferences;
  return {
    preferences: {
      alwaysFloat: preferences.alwaysFloat,
      avoidFullscreen: preferences.avoidFullscreen,
      lockPosition: preferences.lockPosition,
      ...(isDesktopStatusWindowPosition(preferences.windowPosition)
        ? { windowPosition: { ...preferences.windowPosition } }
        : {}),
    },
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
    typeof value.lockPosition === "boolean" &&
    (value.windowPosition === undefined ||
      value.windowPosition === null ||
      isDesktopStatusWindowPosition(value.windowPosition))
  );
}

function isDesktopStatusWindowPosition(value: unknown): value is DesktopStatusWindowPosition {
  return (
    isRecord(value) &&
    isI32(value.x) &&
    isI32(value.y) &&
    isI32(value.workAreaX) &&
    isI32(value.workAreaY) &&
    isU32(value.workAreaWidth) &&
    value.workAreaWidth > 0 &&
    isU32(value.workAreaHeight) &&
    value.workAreaHeight > 0 &&
    isU16(value.scaleFactorMilli) &&
    value.scaleFactorMilli > 0 &&
    value.scaleFactorMilli <= 65_535
  );
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function isI32(value: unknown): value is number {
  return isSafeInteger(value) && value >= -2_147_483_648 && value <= 2_147_483_647;
}

function isU32(value: unknown): value is number {
  return isSafeInteger(value) && value >= 0 && value <= 4_294_967_295;
}

function isU16(value: unknown): value is number {
  return isSafeInteger(value) && value >= 0 && value <= 65_535;
}
