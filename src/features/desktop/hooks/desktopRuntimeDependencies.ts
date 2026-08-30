/**
 * Injection seam for `useDesktopStatusRuntime`.
 *
 * The hook constructs three core objects on mount: the HubEventBus, the
 * ProviderManager, and the SchedulerService. Constructing them inline makes
 * the hook impossible to unit-test in isolation — the real ProviderManager
 * wires up Tauri-backed listeners that don't exist under jsdom.
 *
 * Instead of hard-coding the constructors, the hook accepts a
 * `DesktopRuntimeDependencies` object whose factories create those objects.
 * Production callers use `defaultDesktopRuntimeDependencies` (the real
 * constructors); tests pass fakes. This mirrors the injection pattern the
 * structure refactor (docs/plans/STRUCTURE_REFACTOR_PLAN.md Slice G6) requires.
 */
import { createProviderManager } from "@/providers";
import type { ProviderManager, ProviderManagerOptions } from "@/providers";
import { createSchedulerService } from "@/runtime/scheduler/schedulerService";
import type { SchedulerService } from "@/runtime/scheduler/schedulerService";
import { createHubEventBus } from "@/state/hubState";
import type { HubEventBus } from "@/state/hubState";

export type DesktopRuntimeDependencies = {
  /** Factory for the shared event bus the manager publishes into. */
  createEventBus: () => HubEventBus;
  /** Factory for the unified provider manager. */
  createProviderManager: (bus: HubEventBus, options: ProviderManagerOptions) => ProviderManager;
  /** Factory for the stateful desktop status scheduler service. */
  createSchedulerService: () => SchedulerService;
};

/** Production factories — identical to the constructors the hook used inline. */
export const defaultDesktopRuntimeDependencies: DesktopRuntimeDependencies = {
  createEventBus: createHubEventBus,
  createProviderManager: createProviderManager,
  createSchedulerService: createSchedulerService,
};
