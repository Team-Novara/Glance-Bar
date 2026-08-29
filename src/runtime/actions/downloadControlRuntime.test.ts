import { sendDownloadControl, type DownloadAction } from "./downloadControlRuntime";
import type { TauriInvoke } from "../tauri/tauriRuntime";

import { describe, it } from "vitest";
describe("downloadControlRuntime.test", () => {
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
    const result = await sendDownloadControl("pause", undefined);

    assert.equal(result, undefined);
  });

  it("invokes pause_download when action is pause", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke = makeInvoke({ success: true }, calls);

    const result = await sendDownloadControl("pause", invoke);

    assert.deepEqual(calls, [{ command: "pause_download", args: undefined }]);
    assert.deepEqual(result, { success: true });
  });

  it("invokes resume_download when action is resume", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke = makeInvoke({ success: true }, calls);

    const result = await sendDownloadControl("resume", invoke);

    assert.deepEqual(calls, [{ command: "resume_download", args: undefined }]);
    assert.deepEqual(result, { success: true });
  });

  it("invokes cancel_download when action is cancel", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke = makeInvoke({ success: true }, calls);

    const result = await sendDownloadControl("cancel", invoke);

    assert.deepEqual(calls, [{ command: "cancel_download", args: undefined }]);
    assert.deepEqual(result, { success: true });
  });

  it("propagates success: false from the native boundary", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke = makeInvoke({ success: false }, calls);

    const result = await sendDownloadControl("pause", invoke);

    assert.deepEqual(result, { success: false });
  });

  it("returns undefined when the native boundary rejects", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke: TauriInvoke = async (command, args) => {
      calls.push({ command, args });
      throw new Error("download control failed");
    };

    const result = await sendDownloadControl("pause", invoke);

    assert.deepEqual(calls, [{ command: "pause_download", args: undefined }]);
    assert.equal(result, undefined);
  });

  it("returns undefined when the native boundary returns a malformed payload", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke = makeInvoke({ ok: true }, calls);

    const result = await sendDownloadControl("pause", invoke);

    assert.deepEqual(calls, [{ command: "pause_download", args: undefined }]);
    assert.equal(result, undefined);
  });

  it("returns undefined when the native boundary returns a primitive", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke = makeInvoke(true, calls);

    const result = await sendDownloadControl("pause", invoke);

    assert.deepEqual(calls, [{ command: "pause_download", args: undefined }]);
    assert.equal(result, undefined);
  });

  it("exhaustively maps every DownloadAction to its dedicated command", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke = makeInvoke({ success: true }, calls);

    const actions: DownloadAction[] = ["pause", "resume", "cancel"];
    const expectedCommands = ["pause_download", "resume_download", "cancel_download"];

    for (const [index, action] of actions.entries()) {
      await sendDownloadControl(action, invoke);
      assert.equal(calls[index]?.command, expectedCommands[index]);
    }

    assert.equal(calls.length, actions.length);
  });
});
