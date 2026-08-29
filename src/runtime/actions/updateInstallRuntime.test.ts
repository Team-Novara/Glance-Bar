import { installUpdate } from "./updateInstallRuntime";
import type { TauriInvoke } from "../tauri/tauriRuntime";

import { describe, it } from "vitest";
describe("updateInstallRuntime.test", () => {
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
    const result = await installUpdate(undefined);

    assert.equal(result, undefined);
  });

  it("invokes install_update with no arguments and returns success", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke = makeInvoke({ success: true }, calls);

    const result = await installUpdate(invoke);

    assert.deepEqual(calls, [{ command: "install_update", args: undefined }]);
    assert.deepEqual(result, { success: true });
  });

  it("propagates success: false from the native boundary", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke = makeInvoke({ success: false }, calls);

    const result = await installUpdate(invoke);

    assert.deepEqual(calls, [{ command: "install_update", args: undefined }]);
    assert.deepEqual(result, { success: false });
  });

  it("returns undefined when the native boundary rejects", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke: TauriInvoke = async (command, args) => {
      calls.push({ command, args });
      throw new Error("install update failed");
    };

    const result = await installUpdate(invoke);

    assert.deepEqual(calls, [{ command: "install_update", args: undefined }]);
    assert.equal(result, undefined);
  });

  it("returns undefined when the native boundary returns a malformed payload", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke = makeInvoke({ installed: true }, calls);

    const result = await installUpdate(invoke);

    assert.deepEqual(calls, [{ command: "install_update", args: undefined }]);
    assert.equal(result, undefined);
  });

  it("returns undefined when the native boundary returns a primitive", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke = makeInvoke("ok", calls);

    const result = await installUpdate(invoke);

    assert.deepEqual(calls, [{ command: "install_update", args: undefined }]);
    assert.equal(result, undefined);
  });
});
