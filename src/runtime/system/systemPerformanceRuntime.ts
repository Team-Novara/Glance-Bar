import i18n from "../../i18n";
import { isRecord } from "../../shared/lib/runtimeGuards";
import { getTauriInvoke, type TauriInvoke } from "../tauri/tauriRuntime";

import type { SystemPerformanceMetric, SystemPerformanceSnapshot } from "@/entities";
import { systemPerformanceMetrics } from "@/providers/impl/mock/mockHubData";

const TAURI_SYSTEM_PERFORMANCE_COMMAND = "get_system_performance";
const DEFAULT_SYSTEM_STATUS_PREFLIGHT_TIMEOUT_MS = 1500;

function getSystemPerformanceLabels() {
  return {
    cpu: "CPU",
    memory: i18n.t("metrics.memory"),
    download: i18n.t("metrics.download"),
    upload: i18n.t("metrics.upload"),
  };
}

const SYSTEM_STATUS_DIAGNOSTIC_QUALITIES = ["live", "fallback", "stale", "unavailable"] as const;
export const SYSTEM_STATUS_DIAGNOSTIC_CODES = [
  "unsupported",
  "unavailable",
  "permission-denied",
  "malformed",
  "timeout",
  "invoke-failed",
] as const;
const SYSTEM_STATUS_DIAGNOSTIC_SOURCES = [
  "mock",
  "tauri-fixture",
  "tauri-event",
  "preflight",
] as const;

type SystemStatusDiagnosticQuality = (typeof SYSTEM_STATUS_DIAGNOSTIC_QUALITIES)[number];
export type SystemStatusDiagnosticCode = (typeof SYSTEM_STATUS_DIAGNOSTIC_CODES)[number];
type SystemStatusDiagnosticSource = (typeof SYSTEM_STATUS_DIAGNOSTIC_SOURCES)[number];

export type SystemStatusDiagnostic = {
  quality: SystemStatusDiagnosticQuality;
  code: SystemStatusDiagnosticCode;
  source: SystemStatusDiagnosticSource;
  lastSuccessfulSource?: SystemStatusDiagnosticSource;
};

type SystemPerformanceStatusResult = {
  metrics: SystemPerformanceMetric[];
  diagnostic: SystemStatusDiagnostic;
};

export async function loadSystemPerformance({
  invoke = getTauriInvoke(),
}: {
  invoke?: TauriInvoke;
} = {}): Promise<SystemPerformanceMetric[]> {
  const result = await loadSystemPerformanceStatus({ invoke });
  return result.metrics;
}

export async function loadSystemPerformanceStatus({
  invoke = getTauriInvoke(),
  fallbackMetrics = systemPerformanceMetrics,
  lastSuccessfulSource,
  timeoutMs = DEFAULT_SYSTEM_STATUS_PREFLIGHT_TIMEOUT_MS,
}: {
  invoke?: TauriInvoke;
  fallbackMetrics?: SystemPerformanceMetric[];
  lastSuccessfulSource?: SystemStatusDiagnosticSource;
  timeoutMs?: number;
} = {}): Promise<SystemPerformanceStatusResult> {
  if (!invoke) {
    return createDiagnosticResult({
      code: "unavailable",
      fallbackMetrics,
      lastSuccessfulSource,
    });
  }

  try {
    const value = await invokeWithTimeout(invoke, TAURI_SYSTEM_PERFORMANCE_COMMAND, timeoutMs);
    const parsed = parseSystemPerformancePreflightPayload(value);

    if (!parsed) {
      return createDiagnosticResult({
        code: "malformed",
        fallbackMetrics,
        lastSuccessfulSource,
      });
    }

    return {
      metrics: createSystemPerformanceMetrics(parsed.snapshot),
      diagnostic: parsed.diagnostic,
    };
  } catch (error) {
    return createDiagnosticResult({
      code: classifySystemStatusInvokeError(error),
      fallbackMetrics,
      lastSuccessfulSource,
    });
  }
}

function createSystemPerformanceMetrics(
  snapshot: SystemPerformanceSnapshot,
): SystemPerformanceMetric[] {
  const labels = getSystemPerformanceLabels();
  return [
    { id: "cpu", label: labels.cpu, value: snapshot.cpu, tone: "blue" },
    { id: "memory", label: labels.memory, value: snapshot.memory, tone: "violet" },
    { id: "download", label: labels.download, value: snapshot.downloadSpeed, tone: "cyan" },
    { id: "upload", label: labels.upload, value: snapshot.uploadSpeed, tone: "emerald" },
  ];
}

export function normalizeSystemStatusDiagnostic(
  value: unknown,
): SystemStatusDiagnostic | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (!isSystemStatusDiagnosticQuality(value.quality)) {
    return undefined;
  }

  if (!isSystemStatusDiagnosticSource(value.source)) {
    return undefined;
  }

  const code = value.code === undefined ? "unavailable" : value.code;
  if (!isSystemStatusDiagnosticCode(code)) {
    return undefined;
  }

  const diagnostic: SystemStatusDiagnostic = {
    quality: value.quality,
    code,
    source: value.source,
  };

  if (value.lastSuccessfulSource !== undefined) {
    if (!canCarryLastSuccessfulSource(value.quality)) {
      return undefined;
    }
    if (!isSystemStatusDiagnosticSource(value.lastSuccessfulSource)) {
      return undefined;
    }
    diagnostic.lastSuccessfulSource = value.lastSuccessfulSource;
  }

  return diagnostic;
}

function parseSystemPerformancePreflightPayload(
  value: unknown,
): { snapshot: SystemPerformanceSnapshot; diagnostic: SystemStatusDiagnostic } | undefined {
  const directSnapshot = parseSystemPerformanceSnapshot(value);
  if (directSnapshot) {
    return {
      snapshot: directSnapshot,
      diagnostic: {
        quality: "fallback",
        code: "unavailable",
        source: "tauri-fixture",
      },
    };
  }

  if (!isRecord(value)) {
    return undefined;
  }

  const snapshot = parseSystemPerformanceSnapshot(value.snapshot);
  const diagnostic = normalizeSystemStatusDiagnostic(value.diagnostic);

  if (!snapshot || !diagnostic) {
    return undefined;
  }

  return { snapshot, diagnostic };
}

function parseSystemPerformanceSnapshot(value: unknown): SystemPerformanceSnapshot | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const cpu = toPercent(value.cpu);
  const memory = toPercent(value.memory);
  const downloadSpeed = toSpeed(value.downloadSpeed);
  const uploadSpeed = toSpeed(value.uploadSpeed);

  if (
    cpu === undefined ||
    memory === undefined ||
    downloadSpeed === undefined ||
    uploadSpeed === undefined
  ) {
    return undefined;
  }

  return { cpu, memory, downloadSpeed, uploadSpeed };
}

function createDiagnosticResult({
  code,
  fallbackMetrics,
  lastSuccessfulSource,
}: {
  code: SystemStatusDiagnosticCode;
  fallbackMetrics: SystemPerformanceMetric[];
  lastSuccessfulSource?: SystemStatusDiagnosticSource;
}): SystemPerformanceStatusResult {
  const safeLastSuccessfulSource =
    lastSuccessfulSource === "mock" ? undefined : lastSuccessfulSource;

  return {
    metrics: fallbackMetrics,
    diagnostic: safeLastSuccessfulSource
      ? {
          quality: "stale",
          code,
          source: "preflight",
          lastSuccessfulSource: safeLastSuccessfulSource,
        }
      : {
          quality: "unavailable",
          code,
          source: "preflight",
        },
  };
}

async function invokeWithTimeout(
  invoke: TauriInvoke,
  command: string,
  timeoutMs: number,
): Promise<unknown> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return invoke(command);
  }

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new SystemStatusTimeoutError()), timeoutMs);
  });

  try {
    return await Promise.race([invoke(command), timeout]);
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
}

class SystemStatusTimeoutError extends Error {
  constructor() {
    super("System status preflight timed out.");
  }
}

function classifySystemStatusInvokeError(error: unknown): SystemStatusDiagnosticCode {
  if (error instanceof SystemStatusTimeoutError) {
    return "timeout";
  }

  if (
    isRecord(error) &&
    typeof error.code === "string" &&
    isSystemStatusDiagnosticCode(error.code)
  ) {
    return error.code;
  }

  return "invoke-failed";
}

function isSystemStatusDiagnosticQuality(value: unknown): value is SystemStatusDiagnosticQuality {
  return SYSTEM_STATUS_DIAGNOSTIC_QUALITIES.includes(value as SystemStatusDiagnosticQuality);
}

function isSystemStatusDiagnosticCode(value: unknown): value is SystemStatusDiagnosticCode {
  return SYSTEM_STATUS_DIAGNOSTIC_CODES.includes(value as SystemStatusDiagnosticCode);
}

function isSystemStatusDiagnosticSource(value: unknown): value is SystemStatusDiagnosticSource {
  return SYSTEM_STATUS_DIAGNOSTIC_SOURCES.includes(value as SystemStatusDiagnosticSource);
}

function canCarryLastSuccessfulSource(quality: SystemStatusDiagnosticQuality): boolean {
  return quality === "fallback" || quality === "stale";
}

function toPercent(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function toSpeed(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.max(0, Math.round(value));
}
