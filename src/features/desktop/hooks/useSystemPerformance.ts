import { useCallback, useRef, useState } from "react";

import type { SystemPerformanceMetric } from "@/entities";
import { systemPerformanceMetrics } from "@/providers/impl/mock/mockHubData";
import {
  loadSystemPerformanceStatus,
  type SystemStatusDiagnostic,
} from "@/runtime/system/systemPerformanceRuntime";
import { getTauriInvoke } from "@/runtime/tauri/tauriRuntime";

export type UseSystemPerformanceResult = {
  metrics: SystemPerformanceMetric[];
  diagnostic: SystemStatusDiagnostic;
  metricsRef: React.RefObject<SystemPerformanceMetric[]>;
  diagnosticRef: React.RefObject<SystemStatusDiagnostic>;
  refreshMetrics: () => Promise<void>;
};

/**
 * Supplies the first-render fallback and an explicit manual refresh. The real
 * system provider owns background polling so one native source remains
 * authoritative for Resident freshness and health.
 */
export function useSystemPerformance(): UseSystemPerformanceResult {
  const [metrics, setMetrics] = useState<SystemPerformanceMetric[]>(systemPerformanceMetrics);
  const [diagnostic, setDiagnostic] = useState<SystemStatusDiagnostic>({
    quality: "fallback",
    code: "unavailable",
    source: "mock",
  });

  const metricsRef = useRef(metrics);
  const diagnosticRef = useRef(diagnostic);

  metricsRef.current = metrics;
  diagnosticRef.current = diagnostic;

  const refreshMetrics = useCallback(async () => {
    const invoke = getTauriInvoke();
    const nextPerformance = await loadSystemPerformanceStatus({
      invoke,
      fallbackMetrics: metricsRef.current,
      lastSuccessfulSource:
        diagnosticRef.current.quality === "live"
          ? diagnosticRef.current.source
          : diagnosticRef.current.lastSuccessfulSource,
    });

    setMetrics(nextPerformance.metrics);
    setDiagnostic(nextPerformance.diagnostic);
  }, []);

  return { metrics, diagnostic, metricsRef, diagnosticRef, refreshMetrics };
}
