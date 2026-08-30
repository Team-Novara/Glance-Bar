import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoist: shared by the mock factory and the test body (vitest hoists vi.mock).
const { listenMock } = vi.hoisted(() => ({
  listenMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: listenMock,
}));

import { createRealClipboardProvider } from "./realClipboardProvider";
import type { HubEvent } from "@/entities";
import type { HubProvider } from "../../core/types";
import type { ClipboardChangedPayload } from "../../../runtime/system/systemMonitorRuntime";

const PROVIDER_ID = "real-clipboard-provider";

/**
 * Configure listenMock to capture the registered handler so tests can
 * `fire(payload)` to simulate a native clipboard-changed event.
 */
function captureListen(): { fire: (payload: unknown) => void } {
  let captured: ((event: { payload: unknown }) => void) | undefined;

  listenMock.mockImplementation(
    async (_event: string, handler: (event: { payload: unknown }) => void) => {
      captured = handler;
      return () => {};
    },
  );

  return {
    fire(payload: unknown) {
      if (!captured) {
        throw new Error("listen handler was not registered");
      }
      captured({ payload });
    },
  };
}

/** Point listenMock at a promise the test can reject on demand. */
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

function makePayload(overrides: Partial<ClipboardChangedPayload> = {}): ClipboardChangedPayload {
  return {
    text: "https://github.com/example",
    sourceApp: "TestApp",
    copiedAt: 1_780_743_600_000,
    ...overrides,
  };
}

/**
 * The provider registers its listener asynchronously inside start() and
 * only fires the handler after the listen promise resolves. Flushing the
 * microtask queue once lets the registration settle before assertions.
 */
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function collectEvents(provider: HubProvider): HubEvent[] {
  const events: HubEvent[] = [];
  provider.subscribe((batch) => {
    events.push(...batch);
  });
  return events;
}

describe("createRealClipboardProvider", () => {
  beforeEach(() => {
    listenMock.mockReset();
  });

  describe("metadata and capabilities", () => {
    it("uses the real-clipboard-provider id and version 1.0.0", () => {
      const provider = createRealClipboardProvider();
      expect(provider.id).toBe(PROVIDER_ID);
      expect(provider.metadata.name).toBe("Clipboard Provider");
      expect(provider.metadata.kind).toBe("clipboard");
      expect(provider.metadata.version).toBe("1.0.0");
      expect(provider.metadata.mock).toBe(false);
    });

    it("advertises a single clipboard capability with origin=real", () => {
      const provider = createRealClipboardProvider();
      expect(provider.capabilities).toHaveLength(1);
      expect(provider.capabilities[0]).toEqual({
        id: "clipboard",
        kind: "clipboard",
        origin: "real",
        support: "available",
      });
    });
  });

  describe("lifecycle", () => {
    it("starts Registered and transitions to Publishing on start()", async () => {
      captureListen();
      const provider = createRealClipboardProvider();
      expect(provider.status().lifecycle).toBe("Registered");
      provider.start();
      await flushMicrotasks();
      expect(provider.status().lifecycle).toBe("Publishing");
    });

    it("is idempotent: start() called twice registers only one listener", async () => {
      captureListen();
      const provider = createRealClipboardProvider();
      provider.start();
      provider.start();
      await flushMicrotasks();

      expect(listenMock).toHaveBeenCalledTimes(1);
      expect(provider.status().lifecycle).toBe("Publishing");
    });

    it("transitions to Stopped on stop()", async () => {
      const unlisten = vi.fn();
      listenMock.mockImplementation(async () => unlisten);

      const provider = createRealClipboardProvider();
      provider.start();
      await flushMicrotasks();

      provider.stop();
      expect(provider.status().lifecycle).toBe("Stopped");
      expect(unlisten).toHaveBeenCalledTimes(1);
    });

    it("stop() is a no-op when the listener has not registered yet", async () => {
      // listen() never resolves, so `unlisten` stays undefined through stop()
      listenMock.mockImplementation(
        () => new Promise<() => void>(() => undefined),
      );

      const provider = createRealClipboardProvider();
      provider.start();
      provider.stop();
      expect(provider.status().lifecycle).toBe("Stopped");
    });
  });

  describe("emissions", () => {
    it("maps a clipboard payload to a clipboard HubEvent with a 5s display window", async () => {
      const { fire } = captureListen();
      const provider = createRealClipboardProvider();
      const events = collectEvents(provider);
      provider.start();
      await flushMicrotasks();

      fire(makePayload());

      expect(events).toHaveLength(1);
      const event = events[0];
      expect(event?.type).toBe("clipboard");
      expect(event?.source).toBe("clipboard");
      expect(event?.createdAt).toBe(1_780_743_600_000);
      expect(event?.expiresAt).toBe(1_780_743_600_000 + 5_000);
      expect(event?.id).toBe(`${PROVIDER_ID}-clipboard-1780743600000`);
      expect(event?.payload).toEqual({
        text: "https://github.com/example",
        sourceApp: "TestApp",
        copiedAt: 1_780_743_600_000,
      });
    });

    it("falls back to Date.now() when copiedAt is missing or falsy", async () => {
      const { fire } = captureListen();
      const provider = createRealClipboardProvider();
      const events = collectEvents(provider);
      provider.start();
      await flushMicrotasks();

      const before = Date.now();
      fire({ text: "token", sourceApp: "Browser", copiedAt: 0 });
      const after = Date.now();

      expect(events).toHaveLength(1);
      expect(events[0]?.createdAt).toBeGreaterThanOrEqual(before);
      expect(events[0]?.createdAt).toBeLessThanOrEqual(after);
    });

    it("skips consecutive emissions of the same clipboard text", async () => {
      const { fire } = captureListen();
      const provider = createRealClipboardProvider();
      const events = collectEvents(provider);
      provider.start();
      await flushMicrotasks();

      fire(makePayload({ text: "same-url" }));
      fire(makePayload({ text: "same-url" }));
      fire(makePayload({ text: "same-url", sourceApp: "OtherApp", copiedAt: 2 }));

      expect(events).toHaveLength(1);
    });

    it("emits again when different text is copied in between", async () => {
      const { fire } = captureListen();
      const provider = createRealClipboardProvider();
      const events = collectEvents(provider);
      provider.start();
      await flushMicrotasks();

      fire(makePayload({ text: "first" }));
      fire(makePayload({ text: "second" }));
      fire(makePayload({ text: "first" }));

      expect(events).toHaveLength(3);
      expect(events.map((e) => (e.payload as { text: string }).text)).toEqual([
        "first",
        "second",
        "first",
      ]);
    });

    it("resumes emitting the last text after a different copy in between", async () => {
      const { fire } = captureListen();
      const provider = createRealClipboardProvider();
      const events = collectEvents(provider);
      provider.start();
      await flushMicrotasks();

      fire(makePayload({ text: "a" }));
      fire(makePayload({ text: "b" }));
      fire(makePayload({ text: "a" }));
      fire(makePayload({ text: "a" }));

      expect(events).toHaveLength(3);
    });

    it("stop() gates further emissions (lifecycle Stopped blocks emit)", async () => {
      const { fire } = captureListen();
      const provider = createRealClipboardProvider();
      const events = collectEvents(provider);
      provider.start();
      await flushMicrotasks();
      fire(makePayload());
      expect(events).toHaveLength(1);

      provider.stop();
      fire(makePayload({ text: "after-stop" }));
      expect(events).toHaveLength(1);
    });
  });

  describe("degraded marking", () => {
    it("marks the provider Degraded when the native listener registration fails", async () => {
      const { reject } = pendingListen();
      const provider = createRealClipboardProvider();

      provider.start();
      reject();
      await flushMicrotasks();

      expect(provider.status().health).toBe("Degraded");
      expect(provider.status().lifecycle).toBe("Publishing");
    });

    it("stays Healthy when the native listener registers successfully", async () => {
      captureListen();
      const provider = createRealClipboardProvider();
      provider.start();
      await flushMicrotasks();

      expect(provider.status().health).toBe("Healthy");
    });
  });

  describe("unsubscribe", () => {
    it("stops delivering events to a removed subscriber", async () => {
      const { fire } = captureListen();
      const provider = createRealClipboardProvider();
      const a: HubEvent[] = [];
      const b: HubEvent[] = [];
      const unsubA = provider.subscribe((batch) => a.push(...batch));
      provider.subscribe((batch) => b.push(...batch));
      provider.start();
      await flushMicrotasks();

      fire(makePayload({ text: "one" }));
      unsubA();
      fire(makePayload({ text: "two" }));

      expect(a).toHaveLength(1);
      expect(b).toHaveLength(2);
    });
  });
});
