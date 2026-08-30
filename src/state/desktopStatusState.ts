
import type {
  DesktopStatusKind,
  DesktopStatusResolverInput,
  DesktopStatusState,
  DesktopStatusStateMap,
  SystemPerformanceMetric,
  SystemPerformanceSourceStatus,
} from "@/entities";
import {
  DESKTOP_STATUS_TEMPLATE_ORDER,
  createDesktopStatusStateTemplates,
} from "@/entities/status/config";

import { scheduleDesktopStatus } from "./desktopStatusScheduler";

const DESKTOP_STATUS_DEFAULT_KIND: DesktopStatusKind = "resident";

function cloneMetrics(metrics: SystemPerformanceMetric[]): SystemPerformanceMetric[] {
  return metrics.map((metric) => ({ ...metric }));
}

function cloneStateMap(states: DesktopStatusStateMap): DesktopStatusStateMap {
  return {
    resident: {
      ...states.resident,
      metrics: cloneMetrics(states.resident.metrics),
      sourceStatus: cloneSourceStatus(states.resident.sourceStatus),
    },
    media: { ...states.media },
    download: { ...states.download },
    update: { ...states.update },
    clipboard: { ...states.clipboard },
    focus: { ...states.focus },
    notification: { ...states.notification },
    developer: { ...states.developer },
  };
}

export function createDesktopStatusStateMap(
  metrics: SystemPerformanceMetric[],
): DesktopStatusStateMap {
  return cloneStateMap(createDesktopStatusStateTemplates(metrics));
}

export function resolveDesktopStatusState(input: DesktopStatusResolverInput): DesktopStatusState {
  const defaults = createDesktopStatusStateTemplates(cloneMetrics(input.metrics));
  const states = cloneStateMap({
    ...defaults,
    ...input.states,
    resident: {
      ...defaults.resident,
      ...input.states?.resident,
      metrics: cloneMetrics(input.states?.resident?.metrics ?? input.metrics),
      sourceStatus: cloneSourceStatus(
        input.systemPerformanceSourceStatus ?? input.states?.resident?.sourceStatus,
      ),
    },
  });
  const availableKinds =
    input.availableKinds?.filter((kind) => DESKTOP_STATUS_TEMPLATE_ORDER.includes(kind)) ??
    DESKTOP_STATUS_TEMPLATE_ORDER.filter((kind) => Boolean(states[kind]));
  const decision = scheduleDesktopStatus({
    preferredKind: input.preferredKind,
    activeKinds: input.activeKinds,
    availableKinds,
    now: (input as DesktopStatusResolverInput & { now?: number }).now,
    previousKind: (input as DesktopStatusResolverInput & { previousKind?: DesktopStatusKind })
      .previousKind,
    previousChangedAt: (input as DesktopStatusResolverInput & { previousChangedAt?: number })
      .previousChangedAt,
    preferredUntil: (input as DesktopStatusResolverInput & { preferredUntil?: number })
      .preferredUntil,
    activatedAtByKind: (
      input as DesktopStatusResolverInput & {
        activatedAtByKind?: Partial<Record<DesktopStatusKind, number>>;
      }
    ).activatedAtByKind,
  });

  return states[decision.kind] ?? states[DESKTOP_STATUS_DEFAULT_KIND];
}

function cloneSourceStatus(
  sourceStatus: SystemPerformanceSourceStatus | undefined,
): SystemPerformanceSourceStatus | undefined {
  return sourceStatus ? { quality: sourceStatus.quality } : undefined;
}
