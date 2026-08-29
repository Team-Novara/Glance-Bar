import { getAutostartEnabled, setAutostartEnabled } from "./autostartRuntime";
import type { TauriInvoke } from "../tauri/tauriRuntime";

import { describe, it } from "vitest";
describe("autostartRuntime.test", () => {
  function makeInvoke(
    result: unknown,
    calls: Array<{ command: string; args?: Record<string, unknown> }>,
  ): TauriInvoke {
    return async (command, args) => {
      calls.push({ command, args });
      return result;
    };
  }

  it("getAutostartEnabled returns false when no Tauri invoke is available", async () => {
    const result = await getAutostartEnabled(undefined);

    assert.equal(result, false);
  });

  it("getAutostartEnabled returns true when the native boundary reports true", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke = makeInvoke(true, calls);

    const result = await getAutostartEnabled(invoke);

    assert.deepEqual(calls, [{ command: "get_autostart_enabled", args: undefined }]);
    assert.equal(result, true);
  });

  it("getAutostartEnabled returns false when the native boundary reports false", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke = makeInvoke(false, calls);

    const result = await getAutostartEnabled(invoke);

    assert.deepEqual(calls, [{ command: "get_autostart_enabled", args: undefined }]);
    assert.equal(result, false);
  });

  it("getAutostartEnabled returns false for truthy-but-not-true payloads", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke = makeInvoke("yes", calls);

    const result = await getAutostartEnabled(invoke);

    assert.deepEqual(calls, [{ command: "get_autostart_enabled", args: undefined }]);
    assert.equal(result, false);
  });

  it("getAutostartEnabled returns false for object payloads", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke = makeInvoke({ enabled: true }, calls);

    const result = await getAutostartEnabled(invoke);

    assert.deepEqual(calls, [{ command: "get_autostart_enabled", args: undefined }]);
    assert.equal(result, false);
  });

  it("getAutostartEnabled returns false when the native boundary rejects", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke: TauriInvoke = async (command, args) => {
      calls.push({ command, args });
      throw new Error("autostart status failed");
    };

    const result = await getAutostartEnabled(invoke);

    assert.deepEqual(calls, [{ command: "get_autostart_enabled", args: undefined }]);
    assert.equal(result, false);
  });

  it("setAutostartEnabled returns false when no Tauri invoke is available", async () => {
    const result = await setAutostartEnabled(true, undefined);

    assert.equal(result, false);
  });

  it("setAutostartEnabled(true) invokes set_autostart_enabled with { enabled: true } and returns true", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke = makeInvoke(undefined, calls);

    const result = await setAutostartEnabled(true, invoke);

    assert.deepEqual(calls, [{ command: "set_autostart_enabled", args: { enabled: true } }]);
    assert.equal(result, true);
  });

  it("setAutostartEnabled(false) invokes set_autostart_enabled with { enabled: false } and returns true", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke = makeInvoke(undefined, calls);

    const result = await setAutostartEnabled(false, invoke);

    assert.deepEqual(calls, [{ command: "set_autostart_enabled", args: { enabled: false } }]);
    assert.equal(result, true);
  });

  it("setAutostartEnabled returns false when the native boundary rejects", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke: TauriInvoke = async (command, args) => {
      calls.push({ command, args });
      throw new Error("autostart toggle failed");
    };

    const result = await setAutostartEnabled(true, invoke);

    assert.deepEqual(calls, [{ command: "set_autostart_enabled", args: { enabled: true } }]);
    assert.equal(result, false);
  });

  it("setAutostartEnabled returns true even if the native boundary returns a malformed payload", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke = makeInvoke({ ok: false }, calls);

    const result = await setAutostartEnabled(true, invoke);

    assert.deepEqual(calls, [{ command: "set_autostart_enabled", args: { enabled: true } }]);
    assert.equal(result, true);
  });
});
