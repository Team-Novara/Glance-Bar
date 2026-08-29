import { useMemo } from "react";

import {
  aggregateProviderHealth,
  findDegradedProviders,
  type ProviderHealthSnapshot,
  type ProviderHealthSummary,
} from "@/providers";
import type { ProviderManager } from "@/providers";
import type { ProviderRegistryRecord } from "@/providers";

export type UseProviderStatusResult = {
  records: ProviderRegistryRecord[];
  summary: ProviderHealthSummary;
  degraded: ProviderHealthSnapshot[];
};

/**
 * Read-only view onto the ProviderManager's registry. Lets UI components
 * (e.g. SettingsPanel) inspect every registered provider's health without
 * having to subscribe to the bus themselves.
 *
 * - `records` is a memoized snapshot of `manager.registry.list()`.
 * - `summary` rolls the records up into fleet-wide counters.
 * - `degraded` is the subset that needs attention.
 *
 * When the manager is `undefined` (e.g. before first render in test or
 * bootstrap paths) all three fields are empty — the hook is safe to call
 * unconditionally.
 */
export function useProviderStatus(
  manager: ProviderManager | undefined,
): UseProviderStatusResult {
  const records = useMemo<ProviderRegistryRecord[]>(() => {
    if (!manager) {
      return [];
    }
    return manager.registry.list();
  }, [manager]);

  const summary = useMemo(() => aggregateProviderHealth(records), [records]);
  const degraded = useMemo(() => findDegradedProviders(records), [records]);

  return { records, summary, degraded };
}
