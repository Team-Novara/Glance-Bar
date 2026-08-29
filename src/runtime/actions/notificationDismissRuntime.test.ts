import { dismissNotification } from "./notificationDismissRuntime";
import type { TauriInvoke } from "../tauri/tauriRuntime";

import { describe, it } from "vitest";
describe("notificationDismissRuntime.test", () => {
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
    const result = await dismissNotification(undefined);

    assert.equal(result, undefined);
  });

  it("invokes dismiss_notification with no arguments and returns success", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke = makeInvoke({ success: true }, calls);

    const result = await dismissNotification(invoke);

    assert.deepEqual(calls, [{ command: "dismiss_notification", args: undefined }]);
    assert.deepEqual(result, { success: true });
  });

  it("propagates success: false from the native boundary as { success: false }", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke = makeInvoke({ success: false }, calls);

    const result = await dismissNotification(invoke);

    assert.deepEqual(calls, [{ command: "dismiss_notification", args: undefined }]);
    assert.deepEqual(result, { success: false });
  });

  it("returns { success: false } when the native boundary rejects", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke: TauriInvoke = async (command, args) => {
      calls.push({ command, args });
      throw new Error("dismiss boundary failed");
    };

    const result = await dismissNotification(invoke);

    assert.deepEqual(calls, [{ command: "dismiss_notification", args: undefined }]);
    assert.deepEqual(result, { success: false });
  });

  it("returns { success: false } when the native boundary returns a malformed payload", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke = makeInvoke({ dismissed: true }, calls);

    const result = await dismissNotification(invoke);

    assert.deepEqual(calls, [{ command: "dismiss_notification", args: undefined }]);
    assert.deepEqual(result, { success: false });
  });

  it("returns { success: false } when the native boundary returns a primitive", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke = makeInvoke("ok", calls);

    const result = await dismissNotification(invoke);

    assert.deepEqual(calls, [{ command: "dismiss_notification", args: undefined }]);
    assert.deepEqual(result, { success: false });
  });
});
