import {
  createDebouncedWindowCorrection,
  createStatusWindowOverlayState,
  STATUS_WINDOW_CORRECT_POSITION_COMMAND,
  STATUS_WINDOW_PERSIST_POSITION_COMMAND,
  STATUS_WINDOW_RESET_POSITION_COMMAND,
  enforceStatusWindowOverlay,
  parseOverlayPolicy,
  persistStatusWindowPosition,
  resetStatusWindowPosition,
  scheduleOverlayStartupReassert,
  STATUS_WINDOW_FLOATING_COMMAND,
  STATUS_WINDOW_OVERLAY_POLICY_COMMAND,
  type StatusWindowOverlayState,
} from "./statusWindowRuntime";
import type { TauriInvoke } from "../tauri/tauriRuntime";

import { describe, it } from "vitest";
describe("statusWindowRuntime.test", () => {
  function invokeWithPolicy(
    policy: unknown,
    calls: Array<{ command: string; args?: Record<string, unknown> }>,
  ): TauriInvoke {
    return async (command, args) => {
      calls.push({ command, args });

      if (command === STATUS_WINDOW_OVERLAY_POLICY_COMMAND) {
        return policy;
      }

      return undefined;
    };
  }

  it("persists the native window position after a drag ends", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke: TauriInvoke = async (command, args) => {
      calls.push({ command, args });
      return undefined;
    };

    await persistStatusWindowPosition(invoke);

    assert.deepEqual(calls, [{ command: STATUS_WINDOW_PERSIST_POSITION_COMMAND }]);
  });

  it("resets the native window position through the shell command", async () => {
    const calls: string[] = [];
    const invoke: TauriInvoke = async (command) => {
      calls.push(command);
      return undefined;
    };

    await resetStatusWindowPosition(invoke);

    assert.deepEqual(calls, [STATUS_WINDOW_RESET_POSITION_COMMAND]);
  });

  it("parses current overlay policy payload", () => {
    assert.deepEqual(parseOverlayPolicy({ foregroundFullscreen: true, shouldFloat: false }), {
      foregroundFullscreen: true,
      shouldFloat: false,
    });
  });

  it("keeps legacy shouldFloat-only overlay payload usable", () => {
    assert.deepEqual(parseOverlayPolicy({ shouldFloat: true }), {
      foregroundFullscreen: false,
      shouldFloat: true,
    });
  });

  it("rejects malformed overlay policy payloads", () => {
    assert.equal(parseOverlayPolicy(null), undefined);
    assert.equal(parseOverlayPolicy({ shouldFloat: "yes" }), undefined);
  });

  it("applies floating on the first non-fullscreen policy", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const state = createStatusWindowOverlayState();

    await enforceStatusWindowOverlay(state, {
      invoke: invokeWithPolicy({ foregroundFullscreen: false, shouldFloat: true }, calls),
      now: 100,
      positionCorrectionMs: Number.POSITIVE_INFINITY,
    });

    assert.deepEqual(
      calls.map((call) => call.command),
      [
        STATUS_WINDOW_OVERLAY_POLICY_COMMAND,
        STATUS_WINDOW_FLOATING_COMMAND,
        STATUS_WINDOW_CORRECT_POSITION_COMMAND,
      ],
    );
    assert.deepEqual(calls[1]?.args, { floating: true });
    assert.equal(state.appliedFloating, true);
    assert.equal(state.lastFloatingAppliedAt, 100);
    assert.equal(state.mode, "floating");
  });

  it("reasserts topmost after the refresh interval", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const state: StatusWindowOverlayState = {
      appliedFloating: true,
      lastFloatingAppliedAt: 100,
      lastPositionCorrectionAt: 0,
      mode: "floating",
      pendingInitialPositionCorrection: false,
      pendingRestorePositionCorrection: false,
      startupReassertPendingAt: [],
    };

    await enforceStatusWindowOverlay(state, {
      invoke: invokeWithPolicy({ foregroundFullscreen: false, shouldFloat: true }, calls),
      now: 2000,
      topmostReassertMs: 1800,
      positionCorrectionMs: Number.POSITIVE_INFINITY,
    });

    assert.deepEqual(
      calls.map((call) => call.command),
      [STATUS_WINDOW_OVERLAY_POLICY_COMMAND, STATUS_WINDOW_FLOATING_COMMAND],
    );
    assert.deepEqual(calls[1]?.args, { floating: true });
    assert.equal(state.lastFloatingAppliedAt, 2000);
  });

  it("does not reassert topmost before the refresh interval", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const state: StatusWindowOverlayState = {
      appliedFloating: true,
      lastFloatingAppliedAt: 100,
      lastPositionCorrectionAt: 0,
      mode: "floating",
      pendingInitialPositionCorrection: false,
      pendingRestorePositionCorrection: false,
      startupReassertPendingAt: [],
    };

    await enforceStatusWindowOverlay(state, {
      invoke: invokeWithPolicy({ foregroundFullscreen: false, shouldFloat: true }, calls),
      now: 1000,
      topmostReassertMs: 1800,
      positionCorrectionMs: Number.POSITIVE_INFINITY,
    });

    assert.deepEqual(
      calls.map((call) => call.command),
      [STATUS_WINDOW_OVERLAY_POLICY_COMMAND],
    );
  });

  it("releases topmost when the foreground app is fullscreen", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const state: StatusWindowOverlayState = {
      appliedFloating: true,
      lastFloatingAppliedAt: 100,
      lastPositionCorrectionAt: 0,
      mode: "floating",
      pendingInitialPositionCorrection: false,
      pendingRestorePositionCorrection: false,
      startupReassertPendingAt: [],
    };

    await enforceStatusWindowOverlay(state, {
      invoke: invokeWithPolicy({ foregroundFullscreen: true, shouldFloat: false }, calls),
      now: 700,
      positionCorrectionMs: Number.POSITIVE_INFINITY,
    });

    assert.deepEqual(
      calls.map((call) => call.command),
      [STATUS_WINDOW_OVERLAY_POLICY_COMMAND, STATUS_WINDOW_FLOATING_COMMAND],
    );
    assert.deepEqual(calls[1]?.args, { floating: false });
    assert.equal(state.appliedFloating, false);
    assert.equal(state.mode, "suppressed_for_fullscreen");
  });

  it("startup reasserts force a floating refresh at scheduled checkpoints", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const state = createStatusWindowOverlayState();

    await enforceStatusWindowOverlay(state, {
      invoke: invokeWithPolicy({ foregroundFullscreen: false, shouldFloat: true }, calls),
      now: 100,
      positionCorrectionMs: Number.POSITIVE_INFINITY,
    });

    calls.length = 0;

    await enforceStatusWindowOverlay(state, {
      invoke: invokeWithPolicy({ foregroundFullscreen: false, shouldFloat: true }, calls),
      now: 1200,
      topmostReassertMs: Number.POSITIVE_INFINITY,
      positionCorrectionMs: Number.POSITIVE_INFINITY,
    });

    assert.deepEqual(
      calls.map((call) => call.command),
      [STATUS_WINDOW_OVERLAY_POLICY_COMMAND, STATUS_WINDOW_FLOATING_COMMAND],
    );
  });

  it("startup reassert schedule can be reset explicitly", () => {
    const state = createStatusWindowOverlayState();
    state.startupReassertPendingAt = [];
    state.mode = "floating";
    state.appliedFloating = true;
    state.pendingInitialPositionCorrection = false;
    state.pendingRestorePositionCorrection = true;

    scheduleOverlayStartupReassert(state);

    assert.equal(state.mode, "restoring");
    assert.equal(state.appliedFloating, null);
    assert.equal(state.pendingInitialPositionCorrection, true);
    assert.equal(state.pendingRestorePositionCorrection, false);
    assert.equal(state.startupReassertPendingAt.length > 0, true);
  });

  it("performs an initial position correction on first overlay enforcement", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const state = createStatusWindowOverlayState();

    await enforceStatusWindowOverlay(state, {
      invoke: invokeWithPolicy({ foregroundFullscreen: false, shouldFloat: true }, calls),
      now: 100,
      topmostReassertMs: Number.POSITIVE_INFINITY,
      positionCorrectionMs: Number.POSITIVE_INFINITY,
    });

    assert.deepEqual(
      calls.map((call) => call.command),
      [
        STATUS_WINDOW_OVERLAY_POLICY_COMMAND,
        STATUS_WINDOW_FLOATING_COMMAND,
        STATUS_WINDOW_CORRECT_POSITION_COMMAND,
      ],
    );
    assert.equal(state.pendingInitialPositionCorrection, false);
    assert.equal(state.mode, "floating");
  });

  it("skips position correction while fullscreen suppression is active", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const state: StatusWindowOverlayState = {
      appliedFloating: true,
      lastFloatingAppliedAt: 100,
      lastPositionCorrectionAt: 100,
      mode: "floating",
      pendingInitialPositionCorrection: false,
      pendingRestorePositionCorrection: false,
      startupReassertPendingAt: [],
    };

    await enforceStatusWindowOverlay(state, {
      invoke: invokeWithPolicy({ foregroundFullscreen: true, shouldFloat: false }, calls),
      now: 200,
      positionCorrectionMs: 0,
    });

    assert.deepEqual(
      calls.map((call) => call.command),
      [STATUS_WINDOW_OVERLAY_POLICY_COMMAND, STATUS_WINDOW_FLOATING_COMMAND],
    );
    assert.equal(state.mode, "suppressed_for_fullscreen");
    assert.equal(state.pendingRestorePositionCorrection, true);
  });

  it("restores floating mode with a single position correction after fullscreen suppression", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const state: StatusWindowOverlayState = {
      appliedFloating: false,
      lastFloatingAppliedAt: 100,
      lastPositionCorrectionAt: 100,
      mode: "suppressed_for_fullscreen",
      pendingInitialPositionCorrection: false,
      pendingRestorePositionCorrection: true,
      startupReassertPendingAt: [],
    };

    await enforceStatusWindowOverlay(state, {
      invoke: invokeWithPolicy({ foregroundFullscreen: false, shouldFloat: true }, calls),
      now: 300,
      topmostReassertMs: Number.POSITIVE_INFINITY,
      positionCorrectionMs: Number.POSITIVE_INFINITY,
    });

    assert.deepEqual(
      calls.map((call) => call.command),
      [
        STATUS_WINDOW_OVERLAY_POLICY_COMMAND,
        STATUS_WINDOW_FLOATING_COMMAND,
        STATUS_WINDOW_CORRECT_POSITION_COMMAND,
      ],
    );
    assert.equal(state.mode, "floating");
    assert.equal(state.pendingRestorePositionCorrection, false);
    assert.equal(state.lastPositionCorrectionAt, 300);
  });

  it("debounced correction collapses repeated triggers", async () => {
    let callCount = 0;
    const restoreWindow = globalThis.window;
    const timers = new Map<number, () => void>();
    let nextTimerId = 1;

    (
      globalThis as typeof globalThis & {
        window: {
          setTimeout: (handler: () => void, timeout?: number) => number;
          clearTimeout: (id: number) => void;
        };
      }
    ).window = {
      setTimeout(handler) {
        const id = nextTimerId++;
        timers.set(id, handler);
        return id;
      },
      clearTimeout(id) {
        timers.delete(id);
      },
    };

    try {
      const debounced = createDebouncedWindowCorrection(async () => {
        callCount += 1;
      }, 100);

      debounced.trigger();
      debounced.trigger();
      debounced.trigger();

      assert.equal(timers.size, 1);
      timers.values().next().value?.();
      await Promise.resolve();
      assert.equal(callCount, 1);
    } finally {
      (globalThis as typeof globalThis & { window: typeof window }).window = restoreWindow;
    }
  });
});
