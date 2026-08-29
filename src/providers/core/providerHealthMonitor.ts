import type { HubProviderHealth, HubProviderStatus } from "./types";

/**
 * Per-provider health snapshot — derived from a single provider's status
 * snapshot plus its identity. Each boolean makes downstream UI/diagnostic
 * checks straightforward and avoids re-deriving the same predicate.
 */
export type ProviderHealthSnapshot = {
  providerId: string;
  providerName: string;
  kind: string;
  lifecycle: string;
  health: HubProviderHealth;
  isHealthy: boolean;
  isDegraded: boolean;
  isUnhealthy: boolean;
  isStopped: boolean;
  isPublishing: boolean;
};

/**
 * Fleet-wide health summary — counters and rollups useful for status
 * banners, debug overlays, and regression assertions. Kept additive so
 * older consumers can ignore fields they don't know about.
 */
export type ProviderHealthSummary = {
  total: number;
  byHealth: Record<HubProviderHealth, number>;
  byLifecycle: Record<string, number>;
  healthy: number;
  degraded: number;
  unhealthy: number;
  stopped: number;
  publishing: number;
  /** Snapshots whose health is Degraded or Unhealthy. */
  needsAttention: ProviderHealthSnapshot[];
  /** True only when at least one record exists AND every record is Stopped. */
  allStopped: boolean;
  /** True when at least one record is Healthy. */
  anyHealthy: boolean;
};

/**
 * Minimal record shape this monitor accepts. The provider registry's
 * `list()` output already satisfies this contract, but exposing an
 * explicit input type keeps the monitor decoupled and unit-testable.
 */
export type HealthRecordInput = {
  id: string;
  name: string;
  kind: string;
  status: HubProviderStatus;
};

/**
 * Derive a snapshot from one provider record. Pure function — no IO.
 * Mirrors the lifecycle/health model declared in `types.ts` and is
 * stable enough to use as the foundation of registry-level summaries.
 */
export function snapshotProviderHealth(record: HealthRecordInput): ProviderHealthSnapshot {
  const { lifecycle, health } = record.status;
  return {
    providerId: record.id,
    providerName: record.name,
    kind: record.kind,
    lifecycle,
    health,
    isHealthy: health === "Healthy",
    isDegraded: health === "Degraded",
    isUnhealthy: health === "Unhealthy",
    isStopped: lifecycle === "Stopped",
    isPublishing: lifecycle === "Publishing" || lifecycle === "Started",
  };
}

/**
 * Roll up a list of records into a fleet-wide summary. The aggregator
 * is intentionally O(n) with a single pass and never mutates inputs.
 */
export function aggregateProviderHealth(
  records: HealthRecordInput[],
): ProviderHealthSummary {
  const snapshots = records.map(snapshotProviderHealth);

  const byHealth: Record<HubProviderHealth, number> = {
    Healthy: 0,
    Degraded: 0,
    Unhealthy: 0,
  };
  const byLifecycle: Record<string, number> = {};
  let publishing = 0;
  let stopped = 0;
  const needsAttention: ProviderHealthSnapshot[] = [];

  for (const snap of snapshots) {
    byHealth[snap.health] += 1;
    byLifecycle[snap.lifecycle] = (byLifecycle[snap.lifecycle] ?? 0) + 1;
    if (snap.isPublishing) publishing += 1;
    if (snap.isStopped) stopped += 1;
    if (snap.isDegraded || snap.isUnhealthy) needsAttention.push(snap);
  }

  return {
    total: snapshots.length,
    byHealth,
    byLifecycle,
    healthy: byHealth.Healthy,
    degraded: byHealth.Degraded,
    unhealthy: byHealth.Unhealthy,
    stopped,
    publishing,
    needsAttention,
    allStopped: snapshots.length > 0 && stopped === snapshots.length,
    anyHealthy: byHealth.Healthy > 0,
  };
}

/**
 * Convenience helper: return only the snapshots that need attention
 * (Degraded or Unhealthy). Preserves the order of the input records.
 */
export function findDegradedProviders(records: HealthRecordInput[]): ProviderHealthSnapshot[] {
  return records
    .map(snapshotProviderHealth)
    .filter((snap) => snap.isDegraded || snap.isUnhealthy);
}
