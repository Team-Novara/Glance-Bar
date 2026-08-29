import { sendMediaControl, type MediaControlAction } from "./mediaControlRuntime";
import type { TauriInvoke } from "../tauri/tauriRuntime";

import { describe, it } from "vitest";
describe("mediaControlRuntime.test", () => {
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
    const result = await sendMediaControl("play-pause", undefined);

    assert.equal(result, undefined);
  });

  it("invokes media_control with play-pause action and returns success", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke = makeInvoke({ success: true }, calls);

    const result = await sendMediaControl("play-pause", invoke);

    assert.deepEqual(calls, [{ command: "media_control", args: { action: "play-pause" } }]);
    assert.deepEqual(result, { success: true });
  });

  it("invokes media_control with next action and returns success", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke = makeInvoke({ success: true }, calls);

    const result = await sendMediaControl("next", invoke);

    assert.deepEqual(calls, [{ command: "media_control", args: { action: "next" } }]);
    assert.deepEqual(result, { success: true });
  });

  it("invokes media_control with previous action and returns success", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke = makeInvoke({ success: true }, calls);

    const result = await sendMediaControl("previous", invoke);

    assert.deepEqual(calls, [{ command: "media_control", args: { action: "previous" } }]);
    assert.deepEqual(result, { success: true });
  });

  it("propagates success: false from the native boundary", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke = makeInvoke({ success: false }, calls);

    const result = await sendMediaControl("play-pause", invoke);

    assert.deepEqual(calls, [{ command: "media_control", args: { action: "play-pause" } }]);
    assert.deepEqual(result, { success: false });
  });

  it("returns undefined when the native boundary rejects", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke: TauriInvoke = async (command, args) => {
      calls.push({ command, args });
      throw new Error("media control failed");
    };

    const result = await sendMediaControl("play-pause", invoke);

    assert.deepEqual(calls, [{ command: "media_control", args: { action: "play-pause" } }]);
    assert.equal(result, undefined);
  });

  it("returns undefined when the native boundary returns a malformed payload", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke = makeInvoke({ action: "play-pause" }, calls);

    const result = await sendMediaControl("play-pause", invoke);

    assert.deepEqual(calls, [{ command: "media_control", args: { action: "play-pause" } }]);
    assert.equal(result, undefined);
  });

  it("returns undefined when the native boundary returns a primitive", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke = makeInvoke(true, calls);

    const result = await sendMediaControl("play-pause", invoke);

    assert.deepEqual(calls, [{ command: "media_control", args: { action: "play-pause" } }]);
    assert.equal(result, undefined);
  });

  it("exhaustively maps every MediaControlAction to its action argument", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke = makeInvoke({ success: true }, calls);

    const actions: MediaControlAction[] = ["play-pause", "next", "previous"];

    for (const action of actions) {
      await sendMediaControl(action, invoke);
    }

    assert.deepEqual(
      calls.map((call) => ({ command: call.command, args: call.args })),
      [
        { command: "media_control", args: { action: "play-pause" } },
        { command: "media_control", args: { action: "next" } },
        { command: "media_control", args: { action: "previous" } },
      ],
    );
  });
});
