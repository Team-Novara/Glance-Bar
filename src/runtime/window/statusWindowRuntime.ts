import { isRecord } from "../../shared/lib/runtimeGuards";
import { getTauriInvoke, type TauriInvoke } from "../tauri/tauriRuntime";

export const STATUS_WINDOW_OVERLAY_POLICY_COMMAND = "get_overlay_policy";
export const STATUS_WINDOW_FLOATING_COMMAND = "set_status_window_floating";
export const STATUS_WINDOW_CORRECT_POSITION_COMMAND = "correct_status_window_position";
export const STATUS_WINDOW_PERSIST_POSITION_COMMAND = "persist_status_window_position";
export const STATUS_WINDOW_RESET_POSITION_COMMAND = "reset_status_window_position";
const STATUS_WINDOW_TOPMOST_REASSERT_MS = 1800;
const STATUS_WINDOW_POSITION_CORRECTION_MS = 2400;
const STATUS_WINDOW_STARTUP_REASSERT_AT_MS = [1000, 5000, 9000] as const;
export const STATUS_WINDOW_SCALE_CHANGE_DEBOUNCE_MS = 500;
export const STATUS_WINDOW_DISPLAY_CHANGE_DEBOUNCE_MS = 220;

type OverlayPolicy = {
  foregroundFullscreen: boolean;
  shouldFloat: boolean;
};

type StatusWindowOverlayMode = "floating" | "suppressed_for_fullscreen" | "restoring";

export type StatusWindowOverlayState = {
  appliedFloating: boolean | null;
  lastFloatingAppliedAt: number;
  lastPositionCorrectionAt: number;
  mode: StatusWindowOverlayMode;
  pendingInitialPositionCorrection: boolean;
  pendingRestorePositionCorrection: boolean;
  startupReassertPendingAt: number[];
};

type EnforceStatusWindowOverlayOptions = {
  invoke?: TauriInvoke;
  now?: number;
  topmostReassertMs?: number;
  positionCorrectionMs?: number;
};

export function createStatusWindowOverlayState(): StatusWindowOverlayState {
  return {
    appliedFloating: null,
    lastFloatingAppliedAt: 0,
    lastPositionCorrectionAt: 0,
    mode: "restoring",
    pendingInitialPositionCorrection: true,
    pendingRestorePositionCorrection: false,
    startupReassertPendingAt: [...STATUS_WINDOW_STARTUP_REASSERT_AT_MS],
  };
}

export async function correctStatusWindowPosition(invoke = getTauriInvoke()): Promise<void> {
  if (!invoke) {
    return;
  }

  await invoke(STATUS_WINDOW_CORRECT_POSITION_COMMAND);
}

export async function persistStatusWindowPosition(invoke = getTauriInvoke()): Promise<void> {
  if (!invoke) {
    return;
  }

  await invoke(STATUS_WINDOW_PERSIST_POSITION_COMMAND);
}

export async function resetStatusWindowPosition(invoke = getTauriInvoke()): Promise<void> {
  if (!invoke) {
    return;
  }

  await invoke(STATUS_WINDOW_RESET_POSITION_COMMAND);
}

export async function enforceStatusWindowOverlay(
  state: StatusWindowOverlayState,
  options: EnforceStatusWindowOverlayOptions = {},
): Promise<OverlayPolicy | undefined> {
  const invoke = options.invoke ?? getTauriInvoke();

  if (!invoke) {
    return undefined;
  }

  const now = options.now ?? Date.now();
  const topmostReassertMs = options.topmostReassertMs ?? STATUS_WINDOW_TOPMOST_REASSERT_MS;
  const positionCorrectionMs = options.positionCorrectionMs ?? STATUS_WINDOW_POSITION_CORRECTION_MS;
  const policy =
    parseOverlayPolicy(await invoke(STATUS_WINDOW_OVERLAY_POLICY_COMMAND)) ??
    defaultOverlayPolicy();
  const currentMode = state.mode;
  const resolvedMode = resolveOverlayMode(policy);
  const enteringFullscreenSuppression =
    currentMode !== "suppressed_for_fullscreen" && resolvedMode === "suppressed_for_fullscreen";
  const leavingFullscreenSuppression =
    currentMode === "suppressed_for_fullscreen" && resolvedMode === "floating";
  const nextMode: StatusWindowOverlayMode = leavingFullscreenSuppression
    ? "restoring"
    : resolvedMode;
  const consumedStartupReasserts = consumeStartupReasserts(state.startupReassertPendingAt, now);
  if (enteringFullscreenSuppression) {
    state.pendingRestorePositionCorrection = true;
  }

  if (leavingFullscreenSuppression) {
    state.pendingRestorePositionCorrection = true;
  }

  const shouldRefreshTopmost =
    state.appliedFloating !== policy.shouldFloat ||
    state.mode !== nextMode ||
    consumedStartupReasserts > 0 ||
    (policy.shouldFloat && now - state.lastFloatingAppliedAt >= topmostReassertMs);

  if (shouldRefreshTopmost) {
    await invoke(STATUS_WINDOW_FLOATING_COMMAND, { floating: policy.shouldFloat });
    state.appliedFloating = policy.shouldFloat;
    state.lastFloatingAppliedAt = now;
  }

  state.mode = nextMode;

  const shouldCorrectPosition =
    state.mode !== "suppressed_for_fullscreen" &&
    (state.pendingInitialPositionCorrection ||
      state.pendingRestorePositionCorrection ||
      now - state.lastPositionCorrectionAt >= positionCorrectionMs);

  if (shouldCorrectPosition) {
    state.lastPositionCorrectionAt = now;
    state.pendingInitialPositionCorrection = false;
    state.pendingRestorePositionCorrection = false;
    await correctStatusWindowPosition(invoke);

    if (state.mode === "restoring") {
      state.mode = "floating";
    }
  }

  return policy;
}

export function scheduleOverlayStartupReassert(state: StatusWindowOverlayState): void {
  state.mode = "restoring";
  state.appliedFloating = null;
  state.lastFloatingAppliedAt = 0;
  state.lastPositionCorrectionAt = 0;
  state.pendingInitialPositionCorrection = true;
  state.pendingRestorePositionCorrection = false;
  state.startupReassertPendingAt = [...STATUS_WINDOW_STARTUP_REASSERT_AT_MS];
}

export async function correctStatusWindowPositionForDisplayChange(
  invoke = getTauriInvoke(),
): Promise<void> {
  await correctStatusWindowPosition(invoke);
}

export function createDebouncedWindowCorrection(
  callback: () => void | Promise<void>,
  delayMs: number,
): {
  trigger: () => void;
  cancel: () => void;
} {
  let timer: number | null = null;

  return {
    trigger() {
      if (timer !== null) {
        window.clearTimeout(timer);
      }

      timer = window.setTimeout(() => {
        timer = null;
        void callback();
      }, delayMs);
    },
    cancel() {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    },
  };
}

export function parseOverlayPolicy(value: unknown): OverlayPolicy | undefined {
  if (!isRecord(value) || typeof value.shouldFloat !== "boolean") {
    return undefined;
  }

  return {
    foregroundFullscreen:
      typeof value.foregroundFullscreen === "boolean"
        ? value.foregroundFullscreen
        : !value.shouldFloat,
    shouldFloat: value.shouldFloat,
  };
}

function defaultOverlayPolicy(): OverlayPolicy {
  return {
    foregroundFullscreen: false,
    shouldFloat: true,
  };
}

function resolveOverlayMode(policy: OverlayPolicy): StatusWindowOverlayMode {
  if (policy.foregroundFullscreen || !policy.shouldFloat) {
    return "suppressed_for_fullscreen";
  }

  return "floating";
}

function consumeStartupReasserts(queue: number[], now: number): number {
  let consumed = 0;

  while (queue[0] !== undefined && now >= queue[0]) {
    queue.shift();
    consumed += 1;
  }

  return consumed;
}
