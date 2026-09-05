import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  DesktopStatusKind,
  DesktopStatusState,
  HubStoreState,
  SystemPerformanceMetric,
  SystemPerformancePayload,
} from "@/entities";
import { DESKTOP_STATUS_TEMPLATE_ORDER } from "@/entities/status/config";
import i18n from "@/i18n";
import type { ProviderManager } from "@/providers";
import type { ProviderRegistryRecord } from "@/providers";
import { DESKTOP_STATUS_PREFERRED_WINDOW_MS } from "@/runtime/scheduler/schedulerService";
import { aggregateDesktopStatusInput } from "@/state/desktopStatusAggregation";
import { resolveDesktopStatusState } from "@/state/desktopStatusState";

import {
  defaultDesktopRuntimeDependencies,
  type DesktopRuntimeDependencies,
} from "./desktopRuntimeDependencies";

function systemPayloadToMetrics(payload: SystemPerformancePayload): SystemPerformanceMetric[] {
  return [
    { id: "cpu", label: "CPU", value: payload.cpu, tone: "blue" },
    { id: "memory", label: i18n.t("metrics.memory"), value: payload.memory, tone: "violet" },
    {
      id: "download",
      label: i18n.t("metrics.download"),
      value: payload.downloadSpeed,
      tone: "cyan",
    },
    { id: "upload", label: i18n.t("metrics.upload"), value: payload.uploadSpeed, tone: "emerald" },
  ];
}

export type UseDesktopStatusRuntimeResult = {
  resolvedState: DesktopStatusState;
  activeKinds: DesktopStatusKind[];
  activeStatusKind: DesktopStatusKind | null;
  preferredUntil: number | undefined;
  setActiveStatusKind: (kind: DesktopStatusKind | null) => void;
  setPreferredUntil: (until: number | undefined) => void;
  refreshRuntime: () => Promise<void>;
  preferredWindowMs: number;
  providerManager: ProviderManager | undefined;
  providerRecords: ProviderRegistryRecord[];
};

/**
 * Runs the desktop status runtime: event bus + provider manager + scheduler.
 *
 * The optional `dependencies` parameter is an injection seam (see
 * `desktopRuntimeDependencies.ts`): production callers omit it and get the
 * real constructors; tests pass fakes so the hook can be exercised without
 * wiring up Tauri-backed providers. The third argument is backward-compatible
 * — existing two-argument callers are unaffected.
 */
export function useDesktopStatusRuntime(
  metrics: SystemPerformanceMetric[],
  systemPerformanceSourceQuality: string,
  dependencies: DesktopRuntimeDependencies = defaultDesktopRuntimeDependencies,
): UseDesktopStatusRuntimeResult {
  // Lazy useState initializers (not `useRef(factory())`, which would invoke
  // the factories on every render and discard the result) hold the runtime
  // objects for the lifetime of the hook instance, exactly once each. They
  // come from the injected factories so tests can substitute fakes.
  const [bus] = useState(() => dependencies.createEventBus());
  const [scheduler] = useState(() => dependencies.createSchedulerService());
  const [manager] = useState(() =>
    dependencies.createProviderManager(bus, {
      realProviders: true,
      mockProviders: false,
    }),
  );

  const [hubState, setHubState] = useState<HubStoreState>({
    events: [],
    mode: "idle",
    tasks: [],
  });
  const [activeStatusKind, setActiveStatusKind] = useState<DesktopStatusKind | null>(null);
  const [preferredUntil, setPreferredUntil] = useState<number | undefined>(undefined);
  const [, setScheduledKind] = useState<DesktopStatusKind>("resident");

  const [providerRecords, setProviderRecords] = useState<ProviderRegistryRecord[]>(() =>
    manager.registry.list(),
  );
  const refreshProviderRecords = useCallback(() => {
    setProviderRecords(manager.registry.list());
  }, [manager]);

  useEffect(() => {
    const unsubscribeBus = bus.subscribe((busState) => {
      setHubState((prev) => ({
        ...prev,
        clipboard: busState.clipboard ?? prev.clipboard,
        focus: busState.focus ?? prev.focus,
        // System samples are freshness-bound. Preserve clipboard/focus
        // snapshots for their event semantics, but clear resident metrics
        // when the bus no longer has an active system observation so a
        // failed/stopped poll cannot remain live indefinitely.
        systemPerformance: busState.systemPerformance,
        // The bus emits a complete active snapshot. Replacing it (rather
        // than merging into the previous React state) is essential for
        // expiry: a system sample that is no longer active must disappear.
        events: busState.events,
      }));
    });

    const unsubscribeScheduler = scheduler.subscribe((decision) => {
      setScheduledKind(decision.kind);
    });

    manager.start();
    scheduler.start();
    refreshProviderRecords();

    return () => {
      manager.stop();
      scheduler.stop();
      refreshProviderRecords();
      unsubscribeBus();
      unsubscribeScheduler();
    };
  }, [bus, manager, scheduler, refreshProviderRecords]);

  const aggregatedStatus = useMemo(
    () =>
      aggregateDesktopStatusInput({
        hubState,
        availableKinds: DESKTOP_STATUS_TEMPLATE_ORDER,
      }),
    [hubState],
  );

  const busMetrics = useMemo(
    () =>
      hubState.systemPerformance ? systemPayloadToMetrics(hubState.systemPerformance) : undefined,
    [hubState.systemPerformance],
  );
  const effectiveMetrics = busMetrics ?? metrics;
  const effectiveQuality = hubState.systemPerformance?.quality ?? systemPerformanceSourceQuality;

  const now = Date.now();

  scheduler.updateKinds(aggregatedStatus.activeKinds, aggregatedStatus.availableKinds ?? []);

  if (activeStatusKind && preferredUntil && preferredUntil > now) {
    scheduler.setPreferred(activeStatusKind, preferredUntil);
  } else {
    scheduler.clearPreferred();
  }

  const schedulerSnapshot = scheduler.getSnapshot();
  const resolvedState = resolveDesktopStatusState({
    metrics: effectiveMetrics,
    systemPerformanceSourceStatus: {
      quality: effectiveQuality as "live" | "fallback" | "stale" | "unavailable",
    },
    activeKinds: aggregatedStatus.activeKinds,
    availableKinds: aggregatedStatus.availableKinds,
    states: aggregatedStatus.states,
    preferredKind: schedulerSnapshot.kind,
    preferredUntil: now + DESKTOP_STATUS_PREFERRED_WINDOW_MS * 4,
    now,
  });

  useEffect(() => {
    if (preferredUntil === undefined) {
      return;
    }

    if (preferredUntil <= Date.now()) {
      setPreferredUntil(undefined);
      setActiveStatusKind(null);
      return;
    }

    const timer = window.setTimeout(
      () => {
        setPreferredUntil(undefined);
        setActiveStatusKind(null);
      },
      Math.max(0, preferredUntil - Date.now()),
    );

    return () => window.clearTimeout(timer);
  }, [preferredUntil, setPreferredUntil, setActiveStatusKind]);

  const refreshRuntime = useCallback(async () => {
    refreshProviderRecords();
  }, [refreshProviderRecords]);

  return {
    resolvedState,
    activeKinds: aggregatedStatus.activeKinds,
    activeStatusKind,
    preferredUntil,
    setActiveStatusKind,
    setPreferredUntil,
    refreshRuntime,
    preferredWindowMs: DESKTOP_STATUS_PREFERRED_WINDOW_MS,
    providerManager: manager,
    providerRecords,
  };
}
