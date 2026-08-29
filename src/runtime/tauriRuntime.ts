import { invoke as invokeCommand, isTauri } from "@tauri-apps/api/core";

import {
  isFiniteNumber,
  isOptionalNumber,
  isRecord,
  parseHubEvents,
  snapshotHubEvent,
} from "../shared/lib/runtimeGuards";
import type {
  DesktopGuestStatusKind,
  GuestProviderDiagnosticCode,
  GuestProviderSourceHealth,
  GuestProviderSourceHealthMap,
  GuestProviderSourceQuality,
  HubEvent,
} from "../types/hub";

export const TAURI_FIXTURE_COMMAND = "get_hub_event_fixtures";
export const TAURI_RUNTIME_CAPABILITIES_COMMAND = "get_runtime_capabilities";
export const TAURI_EMIT_FIXTURE_EVENTS_COMMAND = "emit_hub_event_fixtures";
export const TAURI_GUEST_PROVIDER_CAPABILITIES_COMMAND = "get_guest_provider_capabilities";
export const TAURI_MEDIA_SESSION_STATUS_COMMAND = "get_media_session_status";

export type TauriInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

type TauriRuntimeDiagnosticCode = "unavailable" | "invoke-failed" | "malformed";
type TauriRuntimeDiagnosticSurface =
  | "fixtureEvents"
  | "runtimeCapabilities"
  | "guestProviderCapabilities"
  | "mediaSession";
type TauriRuntimeDiagnosticCommand =
  | typeof TAURI_FIXTURE_COMMAND
  | typeof TAURI_RUNTIME_CAPABILITIES_COMMAND
  | typeof TAURI_EMIT_FIXTURE_EVENTS_COMMAND
  | typeof TAURI_GUEST_PROVIDER_CAPABILITIES_COMMAND
  | typeof TAURI_MEDIA_SESSION_STATUS_COMMAND;

export type TauriRuntimeDiagnostic = {
  code: TauriRuntimeDiagnosticCode;
  surface: TauriRuntimeDiagnosticSurface;
  command: TauriRuntimeDiagnosticCommand;
  message: string;
  detail?: string;
};

type TauriRuntimeResult =
  | {
      ok: true;
      events: HubEvent[];
    }
  | {
      ok: false;
      diagnostic: TauriRuntimeDiagnostic;
    };

export type TauriRuntimeCapabilities = {
  runtime: "tauri";
  fixtureIpc: true;
  tray: true;
  alwaysOnTop: true;
  windowsProviders: boolean;
  configuredShellWindow: TauriConfiguredShellWindow;
};

type TauriConfiguredShellWindow = {
  configured: true;
  title: string;
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  resizable: boolean;
  centered: boolean;
};

type TauriRuntimeCapabilitiesResult =
  | {
      ok: true;
      capabilities: TauriRuntimeCapabilities;
    }
  | {
      ok: false;
      diagnostic: TauriRuntimeDiagnostic;
    };

type TauriGuestProviderCapabilitiesResult =
  | {
      ok: true;
      sourceHealthByKind: GuestProviderSourceHealthMap;
    }
  | {
      ok: false;
      diagnostic: TauriRuntimeDiagnostic;
    };

export type TauriMediaSessionStatus = {
  available: boolean;
  playbackStatus: "playing" | "paused" | "unavailable" | "unsupported";
  progress: number;
  positionMs?: number;
  durationMs?: number;
  title?: string;
  artist?: string;
  code: "available" | "not-playing" | "unsupported" | "provider-failed" | "sta-timeout";
  checkedAt: number;
};

type TauriMediaSessionResult =
  | {
      ok: true;
      status: TauriMediaSessionStatus;
      event?: HubEvent;
    }
  | {
      ok: false;
      diagnostic: TauriRuntimeDiagnostic;
    };

type HubEventPublisher = {
  publishHubEvent(event: HubEvent): void;
};

type TauriGlobal = {
  __TAURI_INTERNALS__?: {
    invoke?: unknown;
  };
  __TAURI__?: {
    core?: {
      invoke?: TauriInvoke;
    };
    invoke?: TauriInvoke;
  };
  isTauri?: boolean;
};

const fixtureEventsDiagnosticContext = {
  surface: "fixtureEvents",
  command: TAURI_FIXTURE_COMMAND,
} as const;
const emitFixtureEventsDiagnosticContext = {
  surface: "fixtureEvents",
  command: TAURI_EMIT_FIXTURE_EVENTS_COMMAND,
} as const;
const runtimeCapabilitiesDiagnosticContext = {
  surface: "runtimeCapabilities",
  command: TAURI_RUNTIME_CAPABILITIES_COMMAND,
} as const;
const guestProviderCapabilitiesDiagnosticContext = {
  surface: "guestProviderCapabilities",
  command: TAURI_GUEST_PROVIDER_CAPABILITIES_COMMAND,
} as const;
const mediaSessionDiagnosticContext = {
  surface: "mediaSession",
  command: TAURI_MEDIA_SESSION_STATUS_COMMAND,
} as const;
const guestKinds = new Set<DesktopGuestStatusKind>([
  "media",
  "download",
  "update",
  "clipboard",
  "focus",
]);
const guestQualities = new Set<GuestProviderSourceQuality>([
  "native",
  "app-owned",
  "fixture",
  "mock",
  "unavailable",
]);
const guestDiagnosticCodes = new Set<GuestProviderDiagnosticCode>([
  "available",
  "unsupported",
  "permission-denied",
  "not-implemented",
  "malformed",
  "timeout",
  "provider-failed",
]);

export function getTauriInvoke(globalScope: unknown = globalThis): TauriInvoke | undefined {
  const tauri = (globalScope as TauriGlobal | undefined)?.__TAURI__;
  const invoke = tauri?.core?.invoke ?? tauri?.invoke;

  if (typeof invoke === "function") {
    return invoke;
  }

  const scope = globalScope as TauriGlobal | undefined;
  const hasTauriInternals = typeof scope?.__TAURI_INTERNALS__?.invoke === "function";

  if (scope?.isTauri === true || hasTauriInternals || isTauri()) {
    return (command, args) => invokeCommand(command, args);
  }

  return undefined;
}

export async function publishTauriFixtureEvents(
  eventBus: HubEventPublisher,
  options: {
    invoke?: TauriInvoke;
  } = {},
): Promise<TauriRuntimeResult> {
  const invoke = options.invoke ?? getTauriInvoke();
  if (!invoke) {
    return {
      ok: false,
      diagnostic: {
        ...fixtureEventsDiagnosticContext,
        code: "unavailable",
        message: "Tauri runtime invoke is unavailable.",
      },
    };
  }

  let value: unknown;
  try {
    value = await invoke(TAURI_FIXTURE_COMMAND);
  } catch (error) {
    return {
      ok: false,
      diagnostic: {
        ...fixtureEventsDiagnosticContext,
        code: "invoke-failed",
        message: "Tauri runtime fixture command failed.",
        detail: error instanceof Error ? error.message : String(error),
      },
    };
  }

  if (!Array.isArray(value)) {
    return {
      ok: false,
      diagnostic: {
        ...fixtureEventsDiagnosticContext,
        code: "malformed",
        message: "Tauri runtime returned malformed HubEvent fixtures.",
      },
    };
  }

  const events = parseHubEvents(value).map(snapshotHubEvent);

  if (events.length !== value.length) {
    return {
      ok: false,
      diagnostic: {
        ...fixtureEventsDiagnosticContext,
        code: "malformed",
        message: "Tauri runtime returned malformed HubEvent fixtures.",
      },
    };
  }

  for (const event of events) {
    try {
      eventBus.publishHubEvent(snapshotHubEvent(event));
    } catch {
      // Fixture publish failures should not block unrelated events in the same runtime batch.
    }
  }

  return { ok: true, events };
}

export async function emitTauriFixtureEvents({
  invoke = getTauriInvoke(),
}: {
  invoke?: TauriInvoke;
} = {}): Promise<
  | {
      ok: true;
      emitted: number;
    }
  | {
      ok: false;
      diagnostic: TauriRuntimeDiagnostic;
    }
> {
  if (!invoke) {
    return {
      ok: false,
      diagnostic: {
        ...emitFixtureEventsDiagnosticContext,
        code: "unavailable",
        message: "Tauri runtime invoke is unavailable.",
      },
    };
  }

  try {
    const value = await invoke(TAURI_EMIT_FIXTURE_EVENTS_COMMAND);
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      return {
        ok: false,
        diagnostic: {
          ...emitFixtureEventsDiagnosticContext,
          code: "malformed",
          message: "Tauri runtime returned malformed emitted fixture count.",
        },
      };
    }

    return {
      ok: true,
      emitted: Math.floor(value),
    };
  } catch (error) {
    return {
      ok: false,
      diagnostic: {
        ...emitFixtureEventsDiagnosticContext,
        code: "invoke-failed",
        message: "Tauri runtime emit fixture command failed.",
        detail: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export async function loadTauriRuntimeCapabilities({
  invoke = getTauriInvoke(),
}: {
  invoke?: TauriInvoke;
} = {}): Promise<TauriRuntimeCapabilitiesResult> {
  if (!invoke) {
    return {
      ok: false,
      diagnostic: {
        ...runtimeCapabilitiesDiagnosticContext,
        code: "unavailable",
        message: "Tauri runtime invoke is unavailable.",
      },
    };
  }

  try {
    const value = await invoke(TAURI_RUNTIME_CAPABILITIES_COMMAND);
    const capabilities = parseRuntimeCapabilities(value);

    if (!capabilities) {
      return {
        ok: false,
        diagnostic: {
          ...runtimeCapabilitiesDiagnosticContext,
          code: "malformed",
          message: "Tauri runtime returned malformed capability facts.",
        },
      };
    }

    return {
      ok: true,
      capabilities,
    };
  } catch (error) {
    return {
      ok: false,
      diagnostic: {
        ...runtimeCapabilitiesDiagnosticContext,
        code: "invoke-failed",
        message: "Tauri runtime capability command failed.",
        detail: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export async function loadTauriGuestProviderCapabilities({
  invoke = getTauriInvoke(),
  timeoutMs,
}: {
  invoke?: TauriInvoke;
  timeoutMs?: number;
} = {}): Promise<TauriGuestProviderCapabilitiesResult> {
  if (!invoke) {
    return {
      ok: false,
      diagnostic: {
        ...guestProviderCapabilitiesDiagnosticContext,
        code: "unavailable",
        message: "Tauri runtime invoke is unavailable.",
      },
    };
  }

  try {
    const value = await invokeWithOptionalTimeout(
      invoke(TAURI_GUEST_PROVIDER_CAPABILITIES_COMMAND),
      timeoutMs,
    );
    const sourceHealthByKind = parseGuestProviderCapabilities(value);

    if (!sourceHealthByKind) {
      return {
        ok: false,
        diagnostic: {
          ...guestProviderCapabilitiesDiagnosticContext,
          code: "malformed",
          message: "Tauri runtime returned malformed guest provider capability facts.",
        },
      };
    }

    return {
      ok: true,
      sourceHealthByKind,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "timeout") {
      return {
        ok: true,
        sourceHealthByKind: createUnavailableGuestProviderSourceHealthMap("timeout"),
      };
    }

    return {
      ok: false,
      diagnostic: {
        ...guestProviderCapabilitiesDiagnosticContext,
        code: "invoke-failed",
        message: "Tauri runtime guest provider capability command failed.",
        detail: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export async function loadTauriMediaSessionStatus({
  invoke = getTauriInvoke(),
  timeoutMs,
}: {
  invoke?: TauriInvoke;
  timeoutMs?: number;
} = {}): Promise<TauriMediaSessionResult> {
  if (!invoke) {
    return {
      ok: false,
      diagnostic: {
        ...mediaSessionDiagnosticContext,
        code: "unavailable",
        message: "Tauri runtime media session invoke is unavailable.",
      },
    };
  }

  try {
    const value = await invokeWithOptionalTimeout(
      invoke(TAURI_MEDIA_SESSION_STATUS_COMMAND),
      timeoutMs,
    );
    const status = parseMediaSessionStatus(value);

    if (!status) {
      return {
        ok: false,
        diagnostic: {
          ...mediaSessionDiagnosticContext,
          code: "malformed",
          message: "Tauri runtime returned malformed media session facts.",
        },
      };
    }

    return {
      ok: true,
      status,
      event: createMediaSessionHubEvent(status),
    };
  } catch (error) {
    return {
      ok: false,
      diagnostic: {
        ...mediaSessionDiagnosticContext,
        code: "invoke-failed",
        message: "Tauri runtime media session command failed.",
        detail: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export function createUnavailableGuestProviderSourceHealthMap(
  code: GuestProviderDiagnosticCode,
  lastCheckedAt = Date.now(),
): GuestProviderSourceHealthMap {
  const sourceHealthByKind: GuestProviderSourceHealthMap = {};

  for (const kind of guestKinds) {
    sourceHealthByKind[kind] = {
      kind,
      quality: "unavailable",
      code,
      safeToDisplay: false,
      lastCheckedAt,
    };
  }

  return sourceHealthByKind;
}

function createMediaSessionHubEvent(status: TauriMediaSessionStatus): HubEvent | undefined {
  if (!status.available) {
    return undefined;
  }

  const subtitle = status.playbackStatus === "playing" ? "Playing" : "Media ready";

  return {
    id: "native-media-session",
    type: "music",
    source: "music",
    createdAt: status.checkedAt,
    expiresAt: status.checkedAt + 4_500,
    progress: status.progress,
    payload: {
      title: "Media session",
      subtitle,
      time: formatMediaTime(status.positionMs, status.durationMs),
      progress: status.progress,
    },
    metadata: {
      provider: "windows-media-session",
      privacy: "coarse",
    },
  };
}

function formatMediaTime(positionMs: number | undefined, durationMs: number | undefined): string {
  if (!isFinitePositiveNumber(positionMs) || !isFinitePositiveNumber(durationMs)) {
    return "Playing";
  }

  return `${formatDuration(positionMs)} / ${formatDuration(durationMs)}`;
}

function formatDuration(valueMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(valueMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

async function invokeWithOptionalTimeout<T>(
  value: Promise<T>,
  timeoutMs: number | undefined,
): Promise<T> {
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return value;
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      value,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

function parseRuntimeCapabilities(value: unknown): TauriRuntimeCapabilities | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (
    value.runtime !== "tauri" ||
    value.fixtureIpc !== true ||
    value.tray !== true ||
    value.alwaysOnTop !== true ||
    typeof value.windowsProviders !== "boolean" ||
    !isConfiguredShellWindow(value.configuredShellWindow)
  ) {
    return undefined;
  }

  return {
    runtime: value.runtime,
    fixtureIpc: value.fixtureIpc,
    tray: value.tray,
    alwaysOnTop: value.alwaysOnTop,
    windowsProviders: value.windowsProviders,
    configuredShellWindow: { ...value.configuredShellWindow },
  };
}

function parseGuestProviderCapabilities(value: unknown): GuestProviderSourceHealthMap | undefined {
  const items = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.providers)
      ? value.providers
      : undefined;

  if (!items) {
    return undefined;
  }

  const sourceHealthByKind: GuestProviderSourceHealthMap = {};

  for (const item of items) {
    const sourceHealth = parseGuestProviderSourceHealth(item);
    if (!sourceHealth) {
      return undefined;
    }

    sourceHealthByKind[sourceHealth.kind] = sourceHealth;
  }

  return sourceHealthByKind;
}

function parseGuestProviderSourceHealth(value: unknown): GuestProviderSourceHealth | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (
    !guestKinds.has(value.kind as DesktopGuestStatusKind) ||
    !guestQualities.has(value.quality as GuestProviderSourceQuality) ||
    !guestDiagnosticCodes.has(value.code as GuestProviderDiagnosticCode) ||
    typeof value.safeToDisplay !== "boolean" ||
    !isFiniteNumber(value.lastCheckedAt)
  ) {
    return undefined;
  }

  const sourceHealth: GuestProviderSourceHealth = {
    kind: value.kind as DesktopGuestStatusKind,
    quality: value.quality as GuestProviderSourceQuality,
    code: value.code as GuestProviderDiagnosticCode,
    safeToDisplay: value.safeToDisplay,
    lastCheckedAt: value.lastCheckedAt,
  };

  return sourceHealth;
}

function parseMediaSessionStatus(value: unknown): TauriMediaSessionStatus | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (
    typeof value.available !== "boolean" ||
    !isMediaPlaybackStatus(value.playbackStatus) ||
    !isFiniteNumber(value.progress) ||
    !isMediaSessionCode(value.code) ||
    !isFiniteNumber(value.checkedAt) ||
    !isOptionalNumber(value.positionMs) ||
    !isOptionalNumber(value.durationMs)
  ) {
    return undefined;
  }

  const positionMs = isFiniteNumber(value.positionMs) ? value.positionMs : undefined;
  const durationMs = isFiniteNumber(value.durationMs) ? value.durationMs : undefined;
  const title = typeof value.title === "string" ? value.title : undefined;
  const artist = typeof value.artist === "string" ? value.artist : undefined;

  return {
    available: value.available,
    playbackStatus: value.playbackStatus,
    progress: Math.max(0, Math.min(100, Math.round(value.progress))),
    positionMs,
    durationMs,
    title,
    artist,
    code: value.code,
    checkedAt: value.checkedAt,
  };
}

function isMediaPlaybackStatus(value: unknown): value is TauriMediaSessionStatus["playbackStatus"] {
  return (
    value === "playing" || value === "paused" || value === "unavailable" || value === "unsupported"
  );
}

function isMediaSessionCode(value: unknown): value is TauriMediaSessionStatus["code"] {
  return (
    value === "available" ||
    value === "not-playing" ||
    value === "unsupported" ||
    value === "provider-failed" ||
    value === "sta-timeout"
  );
}

function isConfiguredShellWindow(value: unknown): value is TauriConfiguredShellWindow {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.configured === true &&
    typeof value.title === "string" &&
    isFiniteNumber(value.width) &&
    isFiniteNumber(value.height) &&
    isFiniteNumber(value.minWidth) &&
    isFiniteNumber(value.minHeight) &&
    typeof value.resizable === "boolean" &&
    typeof value.centered === "boolean"
  );
}

function isFinitePositiveNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}
