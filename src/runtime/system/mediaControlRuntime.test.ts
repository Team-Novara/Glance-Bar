import {
  CLIPBOARD_CHANGED_EVENT,
  sendMediaControl,
  setClipboardContent,
  type MediaControlAction,
} from "./mediaControlRuntime";
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

describe("setClipboardContent", () => {
  function makeInvoke(
    result: unknown,
    calls: Array<{ command: string; args?: Record<string, unknown> }>,
  ): TauriInvoke {
    return async (command, args) => {
      calls.push({ command, args });
      return result;
    };
  }

  it("exports the clipboard-changed event name for subscribers", () => {
    assert.equal(CLIPBOARD_CHANGED_EVENT, "status-center://clipboard-changed");
  });

  it("returns false when no Tauri invoke is available", async () => {
    const result = await setClipboardContent("https://example.com", undefined);

    assert.equal(result, false);
  });

  it("invokes set_clipboard_content with the text argument and returns true", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke = makeInvoke(null, calls);

    const result = await setClipboardContent("https://example.com", invoke);

    assert.deepEqual(calls, [
      { command: "set_clipboard_content", args: { text: "https://example.com" } },
    ]);
    assert.equal(result, true);
  });

  it("returns true even when the native boundary answers with a non-object payload", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke = makeInvoke(true, calls);

    const result = await setClipboardContent("plain text", invoke);

    assert.deepEqual(calls, [
      { command: "set_clipboard_content", args: { text: "plain text" } },
    ]);
    assert.equal(result, true);
  });

  it("returns false when the native boundary rejects", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke: TauriInvoke = async (command, args) => {
      calls.push({ command, args });
      throw new Error("clipboard write denied");
    };

    const result = await setClipboardContent("secret", invoke);

    assert.deepEqual(calls, [{ command: "set_clipboard_content", args: { text: "secret" } }]);
    assert.equal(result, false);
  });

  it("forwards an empty string without substituting arguments", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke = makeInvoke(null, calls);

    const result = await setClipboardContent("", invoke);

    assert.deepEqual(calls, [{ command: "set_clipboard_content", args: { text: "" } }]);
    assert.equal(result, true);
  });
});
