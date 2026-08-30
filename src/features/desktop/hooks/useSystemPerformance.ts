import { useCallback, useEffect, useRef, useState } from "react";

import { systemPerformanceMetrics } from "@/providers/impl/mock/mockHubData";
import {
  loadSystemPerformanceStatus,
  type SystemStatusDiagnostic,
} from "@/runtime/system/systemPerformanceRuntime";
import { getTauriInvoke } from "@/runtime/tauri/tauriRuntime";
import type { SystemPerformanceMetric } from "@/entities";

const STATUS_REFRESH_MS = 1800;

export type UseSystemPerformanceResult = {
  metrics: SystemPerformanceMetric[];
  diagnostic: SystemStatusDiagnostic;
  metricsRef: React.RefObject<SystemPerformanceMetric[]>;
  diagnosticRef: React.RefObject<SystemStatusDiagnostic>;
  refreshMetrics: () => Promise<void>;
};

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

  useEffect(() => {
    let mounted = true;

    async function poll() {
      const invoke = getTauriInvoke();
      const nextPerformance = await loadSystemPerformanceStatus({
        invoke,
        fallbackMetrics: metricsRef.current,
        lastSuccessfulSource:
          diagnosticRef.current.quality === "live"
            ? diagnosticRef.current.source
            : diagnosticRef.current.lastSuccessfulSource,
      });

      if (mounted) {
        setMetrics(nextPerformance.metrics);
        setDiagnostic(nextPerformance.diagnostic);
      }
    }

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, STATUS_REFRESH_MS);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  return { metrics, diagnostic, metricsRef, diagnosticRef, refreshMetrics };
}
