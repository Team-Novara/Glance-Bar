import type { HubEvent } from "@/entities";

/**
 * Type guard: checks if a value is a non-null, non-array object.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Type guard: checks if a value is a finite number.
 */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Checks if a value is undefined or a finite number.
 */
export function isOptionalNumber(value: unknown): boolean {
  return value === undefined || isFiniteNumber(value);
}

/**
 * Checks if a value is undefined or a record.
 */
export function isOptionalRecord(value: unknown): boolean {
  return value === undefined || isRecord(value);
}

/**
 * Shallow-clones a HubEvent, including payload and metadata.
 */
export function snapshotHubEvent(event: HubEvent): HubEvent {
  return {
    ...event,
    payload: event.payload ? { ...event.payload } : undefined,
    metadata: event.metadata ? { ...event.metadata } : undefined,
  };
}

const HUB_EVENT_TYPES = new Set([
  "music",
  "ai",
  "download",
  "notification",
  "media",
  "clipboard",
  "focus",
  "system",
]);
const HUB_EVENT_SOURCES = new Set([
  "mock",
  "system",
  "music",
  "download",
  "ai",
  "notification",
  "media",
  "clipboard",
  "focus",
  "git",
  "docker",
  "wsl",
  "npm",
]);

export function isHubEventType(value: unknown): value is HubEvent["type"] {
  return typeof value === "string" && HUB_EVENT_TYPES.has(value);
}

export function isHubEventSource(value: unknown): value is HubEvent["source"] {
  return typeof value === "string" && HUB_EVENT_SOURCES.has(value);
}

export function parseHubEvent(value: unknown): HubEvent | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (typeof value.id !== "string") {
    return undefined;
  }

  if (!isHubEventType(value.type)) {
    return undefined;
  }

  if (!isHubEventSource(value.source)) {
    return undefined;
  }

  if (!isFiniteNumber(value.createdAt)) {
    return undefined;
  }

  if (!isOptionalNumber(value.expiresAt)) {
    return undefined;
  }

  if (!isOptionalNumber(value.progress)) {
    return undefined;
  }

  if (!isOptionalRecord(value.payload)) {
    return undefined;
  }

  if (!isOptionalRecord(value.metadata)) {
    return undefined;
  }

  return {
    id: value.id,
    type: value.type,
    source: value.source,
    createdAt: value.createdAt,
    ...(value.expiresAt !== undefined && { expiresAt: value.expiresAt as number }),
    ...(value.progress !== undefined && { progress: value.progress as number }),
    ...(value.payload !== undefined && { payload: value.payload as HubEvent["payload"] }),
    ...(value.metadata !== undefined && { metadata: value.metadata as Record<string, unknown> }),
  };
}

export function parseHubEvents(values: unknown[]): HubEvent[] {
  return values.map(parseHubEvent).filter((event): event is HubEvent => event !== undefined);
}

/**
 * Removes duplicate entries from an array, preserving first-occurrence order.
 */
export function dedupeKinds<T>(items: T[]): T[] {
  return items.filter((item, index) => items.indexOf(item) === index);
}

/**
 * Removes duplicate entries from an optional array, returning an empty array
 * when the input is undefined or empty.
 */
export function dedupeKindsOrEmpty<T>(items: T[] | undefined): T[] {
  if (!items?.length) {
    return [];
  }

  return dedupeKinds(items);
}

/**
 * Clamps a progress value to the 0-100 range.
 */
export function clampProgress(value: number | undefined, fallback = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(100, value));
}
