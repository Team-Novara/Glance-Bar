import { useCallback, type RefObject } from "react";

import {
  emitTauriFixtureEvents,
  getTauriInvoke,
} from "@/runtime/tauri/tauriRuntime";

export type UseRefreshActionOptions = {
  isDraggingRef: RefObject<boolean>;
  refreshMetrics: () => Promise<void>;
  refreshRuntime: () => Promise<void>;
};

export type UseRefreshActionResult = {
  refresh: () => Promise<void>;
};

/**
 * Composes the manual refresh action behind the settings panel's
 * "refresh" button: a fixture-event fan-out over the Tauri invoke
 * bridge followed by the perf-metrics and provider-runtime reloads.
 *
 * Extracted from DesktopPage so the page-level component keeps no
 * direct runtime imports — tauri/IPC access lives in infrastructure
 * hooks (STRUCTURE_REFACTOR_PLAN.md §4 Rule 2).
 */
export function useRefreshAction({
  isDraggingRef,
  refreshMetrics,
  refreshRuntime,
}: UseRefreshActionOptions): UseRefreshActionResult {
  const refresh = useCallback(async () => {
    // Ignore refresh while the bar is mid-drag — the provider
    // pipeline keeps polling on its own cadence, and a re-render
    // during pointer capture would fight the drag controller.
    if (isDraggingRef.current) {
      return;
    }

    const invoke = getTauriInvoke();
    if (invoke) {
      await emitTauriFixtureEvents({ invoke });
    }

    await Promise.all([refreshMetrics(), refreshRuntime()]);
  }, [refreshMetrics, refreshRuntime, isDraggingRef]);

  return { refresh };
}
