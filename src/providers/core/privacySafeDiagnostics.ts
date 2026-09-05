import type { HubEvent } from "@/entities";

import type { ProviderRegistryRecord } from "./providerRegistry";
import type {
  HubProviderCapability,
  HubProviderHealth,
  HubProviderKind,
  HubProviderLifecycle,
} from "./types";

export type PrivacySafeDiagnosticCapability = Pick<
  HubProviderCapability,
  "kind" | "origin" | "support"
>;

export type PrivacySafeDiagnosticProvider = {
  kind: HubProviderKind;
  lifecycle: HubProviderLifecycle;
  health: HubProviderHealth;
  capabilities: PrivacySafeDiagnosticCapability[];
  lastErrorCode: string | null;
  lastCheckedAt: number | null;
};

export type PrivacySafeDiagnostics = {
  schemaVersion: 1;
  appVersion: string;
  platform: "windows" | "macos" | "linux" | "unknown";
  runtime: "tauri" | "browser";
  generatedAt: number;
  providers: PrivacySafeDiagnosticProvider[];
};

type BuildPrivacySafeDiagnosticsInput = {
  records: ProviderRegistryRecord[];
  events: HubEvent[];
  appVersion: string;
  platform: PrivacySafeDiagnostics["platform"];
  runtime: PrivacySafeDiagnostics["runtime"];
  now?: number;
};

const MAX_FUTURE_TIMESTAMP_MS = 24 * 60 * 60 * 1_000;
const SAFE_ERROR_CODES = new Set([
  "unavailable",
  "unsupported",
  "permission-denied",
  "error",
  "provider-failed",
  "timeout",
  "malformed",
  "invoke-failed",
  "no-session",
  "no-playback-info",
  "no-status",
  "no-timeline",
  "sta-timeout",
  "not-playing",
]);

/**
 * Remove payloads and arbitrary metadata before an event enters the
 * diagnostic history. This keeps the history useful after a UI event has
 * expired without retaining clipboard/media/notification content.
 */
export function projectPrivacySafeDiagnosticEvents(
  events: HubEvent[],
  now = Date.now(),
): HubEvent[] {
  return events.flatMap((event) => {
    const createdAt = isSafeTimestamp(event.createdAt, now) ? event.createdAt : undefined;
    if (createdAt === undefined) {
      return [];
    }

    const metadata: Record<string, unknown> = {};
    const code = sanitizeErrorCode(event.metadata?.code);
    const checkedAt = isSafeTimestamp(event.metadata?.checkedAt, now)
      ? event.metadata?.checkedAt
      : undefined;

    if (code) {
      metadata.code = code;
    }
    if (checkedAt !== undefined) {
      metadata.checkedAt = checkedAt;
    }

    return [
      {
        id: event.id,
        type: event.type,
        source: event.source,
        origin: event.origin,
        createdAt,
        metadata,
      },
    ];
  });
}

/**
 * Project provider state into a support bundle that is safe to show or copy.
 * The function intentionally never reads event payloads, provider ids/names,
 * or arbitrary metadata. Only an allowlisted diagnostic code and timestamp
 * can leave the event boundary.
 */
export function buildPrivacySafeDiagnostics({
  records,
  events,
  appVersion,
  platform,
  runtime,
  now = Date.now(),
}: BuildPrivacySafeDiagnosticsInput): PrivacySafeDiagnostics {
  return {
    schemaVersion: 1,
    appVersion: sanitizeAppVersion(appVersion),
    platform,
    runtime,
    generatedAt: now,
    providers: records.map((record) => {
      const observation = findLatestSafeObservation(record.kind, events, now);
      return {
        kind: record.kind,
        lifecycle: record.status.lifecycle,
        health: record.status.health,
        capabilities: record.capabilities.map(({ kind, origin, support }) => ({
          kind,
          origin,
          support,
        })),
        lastErrorCode: observation?.lastErrorCode ?? null,
        lastCheckedAt: observation?.lastCheckedAt ?? null,
      };
    }),
  };
}

type SafeObservation = {
  lastErrorCode: string | null;
  lastCheckedAt: number | null;
};

function findLatestSafeObservation(
  kind: HubProviderKind,
  events: HubEvent[],
  now: number,
): SafeObservation | undefined {
  const candidates = events
    .filter((event) => event.type === kind || event.source === kind)
    .map((event) => {
      const metadata = event.metadata;
      const checkedAt = isSafeTimestamp(metadata?.checkedAt, now) ? metadata?.checkedAt : undefined;
      const createdAt = isSafeTimestamp(event.createdAt, now) ? event.createdAt : undefined;
      const rawCode = metadata?.code;
      const lastErrorCode = sanitizeErrorCode(rawCode);

      return {
        lastErrorCode,
        lastCheckedAt: checkedAt ?? createdAt ?? null,
        sortAt: checkedAt ?? createdAt ?? -1,
      };
    })
    .filter((observation) => observation.sortAt >= 0)
    .sort((a, b) => b.sortAt - a.sortAt);

  const latest = candidates[0];
  if (!latest) {
    return undefined;
  }

  return {
    lastErrorCode: latest.lastErrorCode,
    lastCheckedAt: latest.lastCheckedAt,
  };
}

function sanitizeErrorCode(value: unknown): string | null {
  return typeof value === "string" && SAFE_ERROR_CODES.has(value) ? value : null;
}

function sanitizeAppVersion(value: string): string {
  if (value.length === 0 || value.length > 64 || !/^[A-Za-z0-9.+_-]+$/.test(value)) {
    return "unknown";
  }
  return value;
}

function isSafeTimestamp(value: unknown, now: number): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= now + MAX_FUTURE_TIMESTAMP_MS
  );
}
