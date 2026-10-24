// Hoist: shared by both the mock factory and the test body so
// `vi.mock` can reference the same spy as the test assertions.
const { listenMock } = vi.hoisted(() => ({
  listenMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: listenMock,
}));

// Imports must come AFTER vi.mock so they pick up the mocked module.
import {
  STATUS_CENTER_SETTINGS_EVENT,
  listenStatusCenterSettings,
  parseStatusCenterMenuActionPayload,
  parseStatusCenterSettingsPayload,
} from "./desktopProductRuntime";

import { beforeEach, describe, it, vi } from "vitest";

/**
 * Configure listenMock to capture the registered handler and return a
 * spy for the unlisten function. Tests use `fire(payload)` to simulate
 * a native status-center settings event being emitted.
 */
function captureSettingsListen(): {
  unlisten: ReturnType<typeof vi.fn>;
  fire: (payload: unknown) => Promise<void>;
} {
  const unlisten = vi.fn();
  let captured: ((event: { payload: unknown }) => Promise<void>) | undefined;

  listenMock.mockImplementation(
    async (_event: string, handler: (event: { payload: unknown }) => Promise<void>) => {
      captured = handler;
      return unlisten;
    },
  );

  return {
    unlisten,
    async fire(payload: unknown) {
      if (!captured) {
        throw new Error("listen handler was not registered");
      }
      await captured({ payload });
    },
  };
}

describe("desktopProductRuntime.test", () => {
  beforeEach(() => {
    listenMock.mockReset();
  });

  it("accepts canonical status center menu payloads", () => {
    assert.deepEqual(
      parseStatusCenterMenuActionPayload({
        action: "toggle-always-float",
        checked: true,
      }),
      {
        action: "toggle-always-float",
        checked: true,
      },
    );
  });

  it("normalizes legacy menu action ids to canonical toggle actions", () => {
    assert.deepEqual(
      parseStatusCenterMenuActionPayload({
        action: "always-float",
        checked: false,
      }),
      {
        action: "toggle-always-float",
        checked: false,
      },
    );

    assert.deepEqual(
      parseStatusCenterMenuActionPayload({
        action: "avoid-fullscreen",
        checked: true,
      }),
      {
        action: "toggle-avoid-fullscreen",
        checked: true,
      },
    );
  });

  it("accepts every shell menu action used by the tray and context menu", () => {
    const actions = [
      "refresh-data",
      "toggle-always-float",
      "toggle-avoid-fullscreen",
      "toggle-lock-position",
      "reset-position",
      "open-settings",
      "quit",
    ] as const;

    for (const action of actions) {
      assert.deepEqual(parseStatusCenterMenuActionPayload({ action }), { action });
    }
  });

  it("drops malformed checked values instead of widening the shell contract", () => {
    assert.deepEqual(
      parseStatusCenterMenuActionPayload({ action: "open-settings", checked: "true" }),
      { action: "open-settings", checked: undefined },
    );
  });

  it("rejects malformed menu payloads", () => {
    assert.equal(parseStatusCenterMenuActionPayload(null), undefined);
    assert.equal(parseStatusCenterMenuActionPayload({ action: "bad-action" }), undefined);
  });

  it("accepts canonical status center settings payloads", () => {
    assert.deepEqual(
      parseStatusCenterSettingsPayload({
        preferences: {
          alwaysFloat: true,
          avoidFullscreen: false,
          lockPosition: true,
        },
      }),
      {
        preferences: {
          alwaysFloat: true,
          avoidFullscreen: false,
          lockPosition: true,
        },
      },
    );
  });

  it("accepts and clones an optional persisted window position", () => {
    const input = {
      preferences: {
        alwaysFloat: true,
        avoidFullscreen: false,
        lockPosition: true,
        windowPosition: {
          x: 120,
          y: 640,
          workAreaX: 0,
          workAreaY: 0,
          workAreaWidth: 1920,
          workAreaHeight: 1040,
          scaleFactorMilli: 1250,
        },
      },
    };

    const parsed = parseStatusCenterSettingsPayload(input);

    assert.deepEqual(parsed, input);
    assert.notEqual(parsed?.preferences.windowPosition, input.preferences.windowPosition);
  });

  it("accepts the persisted language preference for both supported languages", () => {
    for (const language of ["en", "zh-CN"] as const) {
      assert.deepEqual(
        parseStatusCenterSettingsPayload({
          preferences: {
            alwaysFloat: true,
            avoidFullscreen: false,
            lockPosition: true,
            language,
          },
        }),
        {
          preferences: {
            alwaysFloat: true,
            avoidFullscreen: false,
            lockPosition: true,
            language,
          },
        },
      );
    }
  });

  it("drops unknown language values instead of widening the shell contract", () => {
    const parsed = parseStatusCenterSettingsPayload({
      preferences: {
        alwaysFloat: true,
        avoidFullscreen: false,
        lockPosition: true,
        language: "fr",
      },
    });

    assert.deepEqual(parsed, {
      preferences: {
        alwaysFloat: true,
        avoidFullscreen: false,
        lockPosition: true,
      },
    });
  });

  it("clones settings payloads before returning them", () => {
    const input = {
      preferences: {
        alwaysFloat: true,
        avoidFullscreen: false,
        lockPosition: true,
      },
    };

    const parsed = parseStatusCenterSettingsPayload(input);
    assert.notEqual(parsed, input);
    assert.notEqual(parsed?.preferences, input.preferences);
  });

  it("rejects malformed status center settings payloads", () => {
    assert.equal(parseStatusCenterSettingsPayload(null), undefined);
    assert.equal(
      parseStatusCenterSettingsPayload({ preferences: { alwaysFloat: true } }),
      undefined,
    );
    assert.equal(
      parseStatusCenterSettingsPayload({
        preferences: {
          alwaysFloat: true,
          avoidFullscreen: true,
          lockPosition: false,
          windowPosition: { x: 0, y: 0 },
        },
      }),
      undefined,
    );
  });

  it("normalizes the legacy lock-position menu action id", () => {
    assert.deepEqual(parseStatusCenterMenuActionPayload({ action: "lock-position" }), {
      action: "toggle-lock-position",
      checked: undefined,
    });
  });

  it("subscribes to the status-center settings event and returns the unlisten fn", async () => {
    const { unlisten } = captureSettingsListen();

    const registered = listenStatusCenterSettings(() => {});

    assert.equal(registered instanceof Promise, true);
    assert.equal(await registered, unlisten);
    assert.equal(listenMock.mock.calls.length, 1);
    assert.equal(listenMock.mock.calls[0]?.[0], STATUS_CENTER_SETTINGS_EVENT);
  });

  it("forwards parsed status center settings payloads to the handler", async () => {
    const { fire } = captureSettingsListen();
    const received: Array<{ payload: unknown; event: unknown }> = [];
    await listenStatusCenterSettings(async (payload, event) => {
      received.push({ payload, event });
    });

    const preferences = { alwaysFloat: true, avoidFullscreen: false, lockPosition: true };
    await fire({ preferences });

    assert.equal(received.length, 1);
    assert.deepEqual(received[0]?.payload, { preferences });
    assert.deepEqual(received[0]?.event, { payload: { preferences } });
  });

  it("drops malformed settings events without invoking the handler", async () => {
    const { fire } = captureSettingsListen();
    const received: unknown[] = [];
    await listenStatusCenterSettings(async (payload) => {
      received.push(payload);
    });

    await fire(null);
    await fire({ preferences: { alwaysFloat: "yes" } });
    await fire({
      preferences: {
        alwaysFloat: true,
        avoidFullscreen: true,
        lockPosition: true,
        windowPosition: { x: 0 },
      },
    });

    assert.equal(received.length, 0);
  });
});
