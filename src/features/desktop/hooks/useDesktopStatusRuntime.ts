import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DESKTOP_STATUS_TEMPLATE_ORDER } from "@/data/desktopStatusConfig";
import i18n from "@/i18n";
import { createProviderManager, type ProviderManager } from "@/providers/providerManager";
import type { ProviderRegistryRecord } from "@/providers/providerRegistry";
import { createSchedulerService, DESKTOP_STATUS_PREFERRED_WINDOW_MS } from "@/runtime/scheduler/schedulerService";
import { aggregateDesktopStatusInput } from "@/state/desktopStatusAggregation";
import { resolveDesktopStatusState } from "@/state/desktopStatusState";
import { createHubEventBus } from "@/state/hubState";
import type {
  DesktopStatusKind,
  DesktopStatusState,
  HubEvent,
  HubStoreState,
  SystemPerformanceMetric,
  SystemPerformancePayload,
} from "@/types/hub";

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

function mergeMediaEvents(
  previous: HubEvent[],
  published: HubEvent[],
): HubEvent[] {
  if (published.length === 0) {
    return previous;
  }

  const now = Date.now();
  const publishedById = new Map<string, HubEvent>();
  for (const event of published) {
    publishedById.set(event.id, event);
  }

  const next: HubEvent[] = [];
  const seen = new Set<string>();
  for (const event of previous) {
    if (event.type === "media" && publishedById.has(event.id)) {
      continue;
    }
    if (
      event.expiresAt !== undefined &&
      typeof event.expiresAt === "number" &&
      event.expiresAt <= now
    ) {
      continue;
    }
    seen.add(event.id);
    next.push(event);
  }
  for (const event of published) {
    if (seen.has(event.id)) {
      continue;
    }
    next.push(event);
  }
  return next;
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

export function useDesktopStatusRuntime(
  metrics: SystemPerformanceMetric[],
  systemPerformanceSourceQuality: string,
): UseDesktopStatusRuntimeResult {
  const busRef = useRef(createHubEventBus());
  const managerRef = useRef<ProviderManager | undefined>(undefined);
  const schedulerRef = useRef(createSchedulerService());

  if (!managerRef.current) {
    managerRef.current = createProviderManager(busRef.current, {
      realProviders: true,
      mockProviders: false,
    });
  }

  const [hubState, setHubState] = useState<HubStoreState>({
    events: [],
    mode: "idle",
    tasks: [],
  });
  const [activeStatusKind, setActiveStatusKind] = useState<DesktopStatusKind | null>(null);
  const [preferredUntil, setPreferredUntil] = useState<number | undefined>(undefined);
  const [, setScheduledKind] = useState<DesktopStatusKind>("resident");

  const [providerRecords, setProviderRecords] = useState<ProviderRegistryRecord[]>(() =>
    managerRef.current?.registry.list() ?? [],
  );
  const refreshProviderRecords = useCallback(() => {
    setProviderRecords(managerRef.current?.registry.list() ?? []);
  }, []);

  useEffect(() => {
    const manager = managerRef.current;
    const bus = busRef.current;
    const scheduler = schedulerRef.current;

    const unsubscribeBus = bus.subscribe((busState) => {
      setHubState((prev) => ({
        ...prev,
        clipboard: busState.clipboard ?? prev.clipboard,
        focus: busState.focus ?? prev.focus,
        systemPerformance: busState.systemPerformance ?? prev.systemPerformance,
        events: mergeMediaEvents(prev.events, busState.events),
      }));
    });

    const unsubscribeScheduler = scheduler.subscribe((decision) => {
      setScheduledKind(decision.kind);
    });

    manager?.start();
    scheduler.start();
    refreshProviderRecords();

    return () => {
      manager?.stop();
      scheduler.stop();
      refreshProviderRecords();
      unsubscribeBus();
      unsubscribeScheduler();
    };
  }, [refreshProviderRecords]);

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

  schedulerRef.current.updateKinds(
    aggregatedStatus.activeKinds,
    aggregatedStatus.availableKinds ?? [],
  );

  if (activeStatusKind && preferredUntil && preferredUntil > now) {
    schedulerRef.current.setPreferred(activeStatusKind, preferredUntil);
  } else {
    schedulerRef.current.clearPreferred();
  }

  const schedulerSnapshot = schedulerRef.current.getSnapshot();
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
    providerManager: managerRef.current,
    providerRecords,
  };
}
