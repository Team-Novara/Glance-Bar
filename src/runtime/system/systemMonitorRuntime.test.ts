import { describe, it, vi, beforeEach } from "vitest";

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
  CLIPBOARD_CHANGED_EVENT,
  FOCUS_ASSIST_CHANGED_EVENT,
  MEDIA_SESSION_CHANGED_EVENT,
  NOTIFICATIONS_CHANGED_EVENT,
  onClipboardChanged,
  onFocusAssistChanged,
  onMediaSessionChanged,
  onNotificationsChanged,
  type ClipboardChangedPayload,
  type FocusAssistState,
  type MediaSessionChangedPayload,
  type NotificationSummary,
} from "./systemMonitorRuntime";

/**
 * Configure listenMock to capture the registered handler and return a
 * spy for the unlisten function. Tests use `fire(payload)` to simulate
 * a native event being emitted.
 */
function captureListen(): {
  unlisten: ReturnType<typeof vi.fn>;
  fire: (payload: unknown) => void;
} {
  const unlisten = vi.fn();
  let captured: ((event: { payload: unknown }) => void) | undefined;

  listenMock.mockImplementation(
    async (_event: string, handler: (event: { payload: unknown }) => void) => {
      captured = handler;
      return unlisten;
    },
  );

  return {
    unlisten,
    fire(payload: unknown) {
      if (!captured) {
        throw new Error("listen handler was not registered");
      }
      captured({ payload });
    },
  };
}

describe("systemMonitorRuntime.test", () => {
  beforeEach(() => {
    listenMock.mockReset();
  });

  // ── Event-name constants ─────────────────────────────────────

  it("exports the four status-center event names", () => {
    assert.equal(CLIPBOARD_CHANGED_EVENT, "status-center://clipboard-changed");
    assert.equal(FOCUS_ASSIST_CHANGED_EVENT, "status-center://focus-assist-changed");
    assert.equal(MEDIA_SESSION_CHANGED_EVENT, "status-center://media-session-changed");
    assert.equal(NOTIFICATIONS_CHANGED_EVENT, "status-center://notifications-changed");
  });

  // ── onClipboardChanged ───────────────────────────────────────

  describe("onClipboardChanged", () => {
    it("returns a Promise<UnlistenFn>", async () => {
      const { unlisten } = captureListen();

      const result = onClipboardChanged(() => {});

      assert.equal(result instanceof Promise, true);
      const fn = await result;
      assert.equal(fn, unlisten);
    });

    it("subscribes to the clipboard-changed event name", async () => {
      captureListen();
      await onClipboardChanged(() => {});

      assert.equal(listenMock.mock.calls.length, 1);
      assert.equal(listenMock.mock.calls[0]?.[0], CLIPBOARD_CHANGED_EVENT);
    });

    it("forwards the event payload to the handler", async () => {
      const { fire } = captureListen();
      const received: ClipboardChangedPayload[] = [];
      await onClipboardChanged((content) => received.push(content));

      const payload: ClipboardChangedPayload = {
        text: "https://github.com/example",
        sourceApp: "TestApp",
        copiedAt: 1_780_743_600_000,
      };
      fire(payload);

      assert.equal(received.length, 1);
      assert.deepEqual(received[0], payload);
    });

    it("forwards the payload fields without mutation", async () => {
      const { fire } = captureListen();
      const received: ClipboardChangedPayload[] = [];
      await onClipboardChanged((content) => received.push(content));

      fire({ text: "secret-token", sourceApp: "Browser", copiedAt: 12345 });

      const first = received[0];
      if (!first) {
        throw new Error("expected payload to be forwarded");
      }
      assert.equal(first.text, "secret-token");
      assert.equal(first.sourceApp, "Browser");
      assert.equal(first.copiedAt, 12345);
    });

    it("returns the unlisten function for cleanup", async () => {
      const { unlisten } = captureListen();

      const unlistenFn = await onClipboardChanged(() => {});

      assert.equal(typeof unlistenFn, "function");
      unlistenFn();
      assert.equal(unlisten.mock.calls.length, 1);
    });

    it("propagates rejection when Tauri listen fails (no graceful fallback)", async () => {
      listenMock.mockRejectedValue(new Error("not in tauri environment"));

      let rejected = false;
      try {
        await onClipboardChanged(() => {});
      } catch {
        rejected = true;
      }
      assert.equal(rejected, true);
    });
  });

  // ── onFocusAssistChanged ─────────────────────────────────────

  describe("onFocusAssistChanged", () => {
    it("returns a Promise<UnlistenFn>", async () => {
      const { unlisten } = captureListen();

      const unlistenFn = await onFocusAssistChanged(() => {});

      assert.equal(unlistenFn, unlisten);
    });

    it("subscribes to the focus-assist event name", async () => {
      captureListen();
      await onFocusAssistChanged(() => {});

      assert.equal(listenMock.mock.calls[0]?.[0], FOCUS_ASSIST_CHANGED_EVENT);
    });

    it("forwards an active focus-assist payload to the handler", async () => {
      const { fire } = captureListen();
      const received: FocusAssistState[] = [];
      await onFocusAssistChanged((state) => received.push(state));

      const payload: FocusAssistState = {
        active: true,
        profile: "alarms-only",
        checkedAt: 1_780_743_600_000,
      };
      fire(payload);

      assert.equal(received.length, 1);
      assert.deepEqual(received[0], payload);
    });

    it("forwards an inactive focus-assist payload to the handler", async () => {
      const { fire } = captureListen();
      const received: FocusAssistState[] = [];
      await onFocusAssistChanged((state) => received.push(state));

      fire({ active: false, profile: "off", checkedAt: 0 });

      const first = received[0];
      if (!first) {
        throw new Error("expected payload to be forwarded");
      }
      assert.equal(first.active, false);
      assert.equal(first.profile, "off");
      assert.equal(first.checkedAt, 0);
    });

    it("returns the unlisten function for cleanup", async () => {
      const { unlisten } = captureListen();

      const unlistenFn = await onFocusAssistChanged(() => {});

      assert.equal(typeof unlistenFn, "function");
      unlistenFn();
      assert.equal(unlisten.mock.calls.length, 1);
    });

    it("propagates rejection when Tauri listen fails", async () => {
      listenMock.mockRejectedValue(new Error("not in tauri environment"));

      let rejected = false;
      try {
        await onFocusAssistChanged(() => {});
      } catch {
        rejected = true;
      }
      assert.equal(rejected, true);
    });
  });

  // ── onMediaSessionChanged ────────────────────────────────────

  describe("onMediaSessionChanged", () => {
    it("returns a Promise<UnlistenFn>", async () => {
      const { unlisten } = captureListen();

      const unlistenFn = await onMediaSessionChanged(() => {});

      assert.equal(unlistenFn, unlisten);
    });

    it("subscribes to the media-session event name", async () => {
      captureListen();
      await onMediaSessionChanged(() => {});

      assert.equal(listenMock.mock.calls[0]?.[0], MEDIA_SESSION_CHANGED_EVENT);
    });

    it("forwards a playing payload to the handler", async () => {
      const { fire } = captureListen();
      const received: MediaSessionChangedPayload[] = [];
      await onMediaSessionChanged((status) => received.push(status));

      const payload: MediaSessionChangedPayload = {
        available: true,
        playbackStatus: "playing",
        progress: 42,
        positionMs: 65_000,
        durationMs: 195_000,
        title: "Track",
        artist: "Artist",
        code: "available",
        checkedAt: 1_780_743_600_000,
      };
      fire(payload);

      assert.equal(received.length, 1);
      assert.deepEqual(received[0], payload);
    });

    it("forwards an unavailable payload without optional fields", async () => {
      const { fire } = captureListen();
      const received: MediaSessionChangedPayload[] = [];
      await onMediaSessionChanged((status) => received.push(status));

      const payload: MediaSessionChangedPayload = {
        available: false,
        playbackStatus: "unavailable",
        progress: 0,
        code: "provider-failed",
        checkedAt: 1_780_743_600_000,
      };
      fire(payload);

      const first = received[0];
      if (!first) {
        throw new Error("expected payload to be forwarded");
      }
      assert.equal(first.available, false);
      assert.equal(first.playbackStatus, "unavailable");
      assert.equal(first.title, undefined);
      assert.equal(first.positionMs, undefined);
    });

    it("forwards a paused payload to the handler", async () => {
      const { fire } = captureListen();
      const received: MediaSessionChangedPayload[] = [];
      await onMediaSessionChanged((status) => received.push(status));

      fire({
        available: true,
        playbackStatus: "paused",
        progress: 50,
        code: "available",
        checkedAt: 1_780_743_600_000,
      });

      const first = received[0];
      if (!first) {
        throw new Error("expected payload to be forwarded");
      }
      assert.equal(first.playbackStatus, "paused");
      assert.equal(first.progress, 50);
    });

    it("returns the unlisten function for cleanup", async () => {
      const { unlisten } = captureListen();

      const unlistenFn = await onMediaSessionChanged(() => {});

      assert.equal(typeof unlistenFn, "function");
      unlistenFn();
      assert.equal(unlisten.mock.calls.length, 1);
    });

    it("propagates rejection when Tauri listen fails", async () => {
      listenMock.mockRejectedValue(new Error("not in tauri environment"));

      let rejected = false;
      try {
        await onMediaSessionChanged(() => {});
      } catch {
        rejected = true;
      }
      assert.equal(rejected, true);
    });
  });

  // ── onNotificationsChanged (sister listener, same contract) ──

  describe("onNotificationsChanged", () => {
    it("returns a Promise<UnlistenFn>", async () => {
      const { unlisten } = captureListen();
      const unlistenFn = await onNotificationsChanged(() => {});
      assert.equal(unlistenFn, unlisten);
    });

    it("subscribes to the notifications event name", async () => {
      captureListen();
      await onNotificationsChanged(() => {});
      assert.equal(listenMock.mock.calls[0]?.[0], NOTIFICATIONS_CHANGED_EVENT);
    });

    it("forwards the summary payload to the handler", async () => {
      const { fire } = captureListen();
      const received: NotificationSummary[] = [];
      await onNotificationsChanged((summary) => received.push(summary));

      const payload: NotificationSummary = {
        focusAssistActive: true,
        checkedAt: 1_780_743_600_000,
      };
      fire(payload);

      assert.equal(received.length, 1);
      assert.deepEqual(received[0], payload);
    });

    it("returns the unlisten function for cleanup", async () => {
      const { unlisten } = captureListen();
      const unlistenFn = await onNotificationsChanged(() => {});
      assert.equal(typeof unlistenFn, "function");
      unlistenFn();
      assert.equal(unlisten.mock.calls.length, 1);
    });
  });
});
