import { stopFocusSession } from "./focusStopRuntime";
import type { TauriInvoke } from "../tauri/tauriRuntime";

import { describe, it } from "vitest";
describe("focusStopRuntime.test", () => {
  function makeInvoke(
    result: unknown,
    calls: Array<{ command: string; args?: Record<string, unknown> }>,
  ): TauriInvoke {
    return async (command, args) => {
      calls.push({ command, args });
      return result;
    };
  }

  it("returns undefined when no Tauri invoke is available", async () => {
    const result = await stopFocusSession(undefined);

    assert.equal(result, undefined);
  });

  it("invokes stop_focus_session with no arguments and returns success", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke = makeInvoke({ success: true }, calls);

    const result = await stopFocusSession(invoke);

    assert.deepEqual(calls, [{ command: "stop_focus_session", args: undefined }]);
    assert.deepEqual(result, { success: true });
  });

  it("propagates success: false from the native boundary", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke = makeInvoke({ success: false }, calls);

    const result = await stopFocusSession(invoke);

    assert.deepEqual(calls, [{ command: "stop_focus_session", args: undefined }]);
    assert.deepEqual(result, { success: false });
  });

  it("returns undefined when the native boundary rejects", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke: TauriInvoke = async (command, args) => {
      calls.push({ command, args });
      throw new Error("stop focus session failed");
    };

    const result = await stopFocusSession(invoke);

    assert.deepEqual(calls, [{ command: "stop_focus_session", args: undefined }]);
    assert.equal(result, undefined);
  });

  it("returns undefined when the native boundary returns a malformed payload", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke = makeInvoke({ stopped: true }, calls);

    const result = await stopFocusSession(invoke);

    assert.deepEqual(calls, [{ command: "stop_focus_session", args: undefined }]);
    assert.equal(result, undefined);
  });

  it("returns undefined when the native boundary returns a primitive", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke = makeInvoke(true, calls);

    const result = await stopFocusSession(invoke);

    assert.deepEqual(calls, [{ command: "stop_focus_session", args: undefined }]);
    assert.equal(result, undefined);
  });
});
