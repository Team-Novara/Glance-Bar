import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Hoist: shared by the mock factory and the test body (vitest hoists vi.mock).
const { listenMock } = vi.hoisted(() => ({
  listenMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: listenMock,
}));

import { createRealMediaSessionProvider } from "./realMediaSessionProvider";
import type { HubEvent } from "@/entities";
import type { HubProvider } from "../../core/types";
import type { MediaSessionChangedPayload } from "../../../runtime/system/systemMonitorRuntime";
import type { TauriInvoke } from "../../../runtime/tauri/tauriRuntime";

const PROVIDER_ID = "real-media-session-provider";

/**
 * Configure listenMock to capture the registered handler so tests can
 * `fire(payload)` to simulate a native media-session-changed event.
 */
function captureListen(): { unlisten: ReturnType<typeof vi.fn>; fire: (payload: unknown) => void } {
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

function pendingListen(): { reject: () => void } {
  let rejectFn: ((reason: unknown) => void) | undefined;
  listenMock.mockImplementation(
    () =>
      new Promise<() => void>((_resolve, reject) => {
        rejectFn = reject;
      }),
  );
  return {
    reject() {
      rejectFn?.(new Error("listen failed"));
    },
  };
}

/**
 * Installs a fake `__TAURI__` global for the initial media-session fetch
 * (loadTauriMediaSessionStatus -> getTauriInvoke -> __TAURI__.core.invoke).
 * `get_media_session_status` is answered with `statusPayload`.
 */
function stubTauriMediaSession(invoke: TauriInvoke | undefined): void {
  const globalRecord = globalThis as Record<string, unknown>;
  if (invoke) {
    globalRecord.__TAURI__ = { core: { invoke } };
  } else {
    delete globalRecord.__TAURI__;
  }
}

function makeMediaInvoke(statusPayload: unknown): TauriInvoke {
  return async (command: string) => {
    if (command !== "get_media_session_status") {
      throw new Error(`unexpected command: ${command}`);
    }
    return statusPayload;
  };
}

function makePlayingStatus(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    available: true,
    playbackStatus: "playing",
    progress: 42,
    positionMs: 65_000,
    durationMs: 195_000,
    title: "Track",
    artist: "Artist",
    code: "available",
    checkedAt: 1_780_743_600_000,
    ...overrides,
  };
}

/** The provider registers listeners/fetches asynchronously inside start(). */
async function flushMicrotasks(times = 3): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve();
  }
}

function collectEvents(provider: HubProvider): HubEvent[] {
  const events: HubEvent[] = [];
  provider.subscribe((batch) => {
    events.push(...batch);
  });
  return events;
}

describe("createRealMediaSessionProvider", () => {
  beforeEach(() => {
    listenMock.mockReset();
    // Default: no Tauri runtime so the initial fetch resolves ok:false.
    stubTauriMediaSession(undefined);
  });

  afterEach(() => {
    stubTauriMediaSession(undefined);
  });

  describe("metadata and capabilities", () => {
    it("uses the real-media-session-provider id and version 1.0.0", () => {
      const provider = createRealMediaSessionProvider();
      expect(provider.id).toBe(PROVIDER_ID);
      expect(provider.metadata.name).toBe("Media Session Provider");
      expect(provider.metadata.kind).toBe("media");
      expect(provider.metadata.version).toBe("1.0.0");
      expect(provider.metadata.mock).toBe(false);
    });

    it("advertises a single media capability with origin=real", () => {
      const provider = createRealMediaSessionProvider();
      expect(provider.capabilities).toHaveLength(1);
      expect(provider.capabilities[0]).toEqual({
        id: "media",
        kind: "media",
        origin: "real",
        support: "available",
      });
    });

    it("exposes the documented fallback poll constant (30_000ms)", async () => {
      const { REAL_MEDIA_SESSION_FALLBACK_POLL_MS } = await import("./realMediaSessionProvider");
      expect(REAL_MEDIA_SESSION_FALLBACK_POLL_MS).toBe(30_000);
    });
  });

  describe("lifecycle", () => {
    it("starts Registered and transitions to Publishing on start()", async () => {
      captureListen();
      const provider = createRealMediaSessionProvider();
      expect(provider.status().lifecycle).toBe("Registered");
      provider.start();
      await flushMicrotasks();
      expect(provider.status().lifecycle).toBe("Publishing");
    });

    it("is idempotent: start() called twice registers only one listener", async () => {
      captureListen();
      const provider = createRealMediaSessionProvider();
      provider.start();
      provider.start();
      await flushMicrotasks();

      expect(listenMock).toHaveBeenCalledTimes(1);
      expect(provider.status().lifecycle).toBe("Publishing");
    });

    it("transitions to Stopped on stop() and unwires the native listener", async () => {
      const { unlisten } = captureListen();
      const provider = createRealMediaSessionProvider();
      provider.start();
      await flushMicrotasks();

      provider.stop();
      expect(provider.status().lifecycle).toBe("Stopped");
      expect(unlisten).toHaveBeenCalledTimes(1);
    });

    it("stop() is a no-op when the listener has not registered yet", async () => {
      listenMock.mockImplementation(
        () => new Promise<() => void>(() => undefined),
      );
      const provider = createRealMediaSessionProvider();
      provider.start();
      provider.stop();
      expect(provider.status().lifecycle).toBe("Stopped");
    });
  });

  describe("initial fetch", () => {
    it("emits the current media session on start when native data loads", async () => {
      captureListen();
      stubTauriMediaSession(makeMediaInvoke(makePlayingStatus()));
      const provider = createRealMediaSessionProvider();
      const events = collectEvents(provider);
      provider.start();
      await flushMicrotasks();

      expect(events).toHaveLength(1);
      const event = events[0];
      expect(event?.id).toBe(`${PROVIDER_ID}-media-1780743600000`);
      expect(event?.type).toBe("media");
      expect(event?.source).toBe("media");
      expect(event?.createdAt).toBe(1_780_743_600_000);
      // available sessions get a 30s display window
      expect(event?.expiresAt).toBe(1_780_743_600_000 + 30_000);
      expect(event?.progress).toBe(42);
      expect(event?.payload).toEqual({
        available: true,
        playbackStatus: "playing",
        progress: 42,
        positionMs: 65_000,
        durationMs: 195_000,
        title: "Track",
        artist: "Artist",
      });
      expect(event?.metadata?.timeLabel).toBe("1:05 / 3:15");
      expect(event?.metadata?.code).toBe("available");
    });

    it("collapses expiresAt to createdAt when the session is unavailable", async () => {
      captureListen();
      stubTauriMediaSession(
        makeMediaInvoke(
          makePlayingStatus({
            available: false,
            playbackStatus: "unavailable",
            progress: 0,
            positionMs: undefined,
            durationMs: undefined,
            title: undefined,
            artist: undefined,
            code: "provider-failed",
          }),
        ),
      );
      const provider = createRealMediaSessionProvider();
      const events = collectEvents(provider);
      provider.start();
      await flushMicrotasks();

      expect(events).toHaveLength(1);
      expect(events[0]?.expiresAt).toBe(1_780_743_600_000);
      expect(events[0]?.payload).toMatchObject({ available: false, playbackStatus: "unavailable" });
    });

    it("does not emit when the native fetch reports ok:false (unavailable runtime)", async () => {
      captureListen();
      stubTauriMediaSession(undefined);
      const provider = createRealMediaSessionProvider();
      const events = collectEvents(provider);
      provider.start();
      await flushMicrotasks();

      expect(events).toHaveLength(0);
      expect(provider.status().health).toBe("Healthy");
    });

    it("does not emit or crash when the native fetch rejects", async () => {
      captureListen();
      const failing: TauriInvoke = async () => {
        throw new Error("media session boundary failed");
      };
      stubTauriMediaSession(failing);
      const provider = createRealMediaSessionProvider();
      const events = collectEvents(provider);
      provider.start();
      await flushMicrotasks();

      expect(events).toHaveLength(0);
      expect(provider.status().health).toBe("Healthy");
    });

    it("does not emit when the native payload is malformed", async () => {
      captureListen();
      stubTauriMediaSession(makeMediaInvoke({ available: "yes" }));
      const provider = createRealMediaSessionProvider();
      const events = collectEvents(provider);
      provider.start();
      await flushMicrotasks();

      expect(events).toHaveLength(0);
    });
  });

  describe("listener emissions", () => {
    it("maps a playing payload from the change event to a media HubEvent", async () => {
      const { fire } = captureListen();
      stubTauriMediaSession(undefined);
      const provider = createRealMediaSessionProvider();
      const events = collectEvents(provider);
      provider.start();
      await flushMicrotasks();

      const payload: MediaSessionChangedPayload = {
        available: true,
        playbackStatus: "playing",
        progress: 33,
        positionMs: 30_000,
        durationMs: 90_000,
        title: "Song",
        artist: "Singer",
        code: "available",
        checkedAt: 1_780_743_600_000,
      };
      fire(payload);

      expect(events).toHaveLength(1);
      const event = events[0];
      expect(event?.type).toBe("media");
      expect(event?.progress).toBe(33);
      expect(event?.payload).toMatchObject({ title: "Song", artist: "Singer" });
      expect(event?.metadata?.timeLabel).toBe("0:30 / 1:30");
    });

    it("emits every change (no content dedup) including duplicates", async () => {
      const { fire } = captureListen();
      stubTauriMediaSession(undefined);
      const provider = createRealMediaSessionProvider();
      const events = collectEvents(provider);
      provider.start();
      await flushMicrotasks();

      const payload: MediaSessionChangedPayload = {
        available: true,
        playbackStatus: "playing",
        progress: 33,
        code: "available",
        checkedAt: 1_780_743_600_000,
      };
      fire(payload);
      fire(payload);

      expect(events).toHaveLength(2);
      // Both events share the checkedAt-derived id — dedup is intentionally absent
      expect(events[0]?.id).toBe(events[1]?.id);
    });

    it("emits an empty timeLabel when position/duration are missing", async () => {
      const { fire } = captureListen();
      stubTauriMediaSession(undefined);
      const provider = createRealMediaSessionProvider();
      const events = collectEvents(provider);
      provider.start();
      await flushMicrotasks();

      fire({
        available: true,
        playbackStatus: "paused",
        progress: 10,
        code: "available",
        checkedAt: 1_780_743_600_000,
      });

      expect(events).toHaveLength(1);
      expect(events[0]?.metadata?.timeLabel).toBe("");
    });

    it("falls back to Date.now() when a change event carries checkedAt 0", async () => {
      const { fire } = captureListen();
      stubTauriMediaSession(undefined);
      const provider = createRealMediaSessionProvider();
      const events = collectEvents(provider);
      provider.start();
      await flushMicrotasks();

      const before = Date.now();
      fire({
        available: true,
        playbackStatus: "playing",
        progress: 10,
        code: "available",
        checkedAt: 0,
      });
      const after = Date.now();

      expect(events).toHaveLength(1);
      expect(events[0]?.createdAt).toBeGreaterThanOrEqual(before);
      expect(events[0]?.createdAt).toBeLessThanOrEqual(after);
    });

    it("stop() gates further change-event emissions", async () => {
      const { fire } = captureListen();
      stubTauriMediaSession(undefined);
      const provider = createRealMediaSessionProvider();
      const events = collectEvents(provider);
      provider.start();
      await flushMicrotasks();
      expect(events).toHaveLength(0);

      provider.stop();
      fire({
        available: true,
        playbackStatus: "playing",
        progress: 55,
        code: "available",
        checkedAt: 1_780_743_600_000,
      });
      expect(events).toHaveLength(0);
    });
  });

  describe("degraded marking", () => {
    it("marks the provider Degraded when the native listener registration fails", async () => {
      stubTauriMediaSession(undefined);
      const { reject } = pendingListen();
      const provider = createRealMediaSessionProvider();

      provider.start();
      reject();
      await flushMicrotasks();

      expect(provider.status().health).toBe("Degraded");
      expect(provider.status().lifecycle).toBe("Publishing");
    });

    it("stays Healthy when the native listener registers successfully", async () => {
      captureListen();
      stubTauriMediaSession(undefined);
      const provider = createRealMediaSessionProvider();
      provider.start();
      await flushMicrotasks();

      expect(provider.status().health).toBe("Healthy");
    });
  });
});
