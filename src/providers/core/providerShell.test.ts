/**
 * Tests for createProviderShell -- the shared factory that encapsulates
 * common provider boilerplate (lifecycle, listener set, emit/subscribe).
 *
 * Coverage targets:
 *  - start() / stop() hook invocation
 *  - emit() fan-out to subscribers
 *  - markDegraded() health state
 *  - lifecycle transitions
 *  - idempotent start() / stop()
 *  - unsubscribe
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProviderShell } from "./providerShell";
import type { HubEvent } from "../../types/hub";
import type { HubProviderMetadata } from "./types";

// ── Helpers ──────────────────────────────────────────────────────────

const MINIMAL_METADATA: HubProviderMetadata = {
  id: "test-provider",
  name: "Test Provider",
  kind: "system",
  version: "1.0.0",
  mock: true,
};

/** Factory for a simple HubEvent with an incrementing id. */
let nextEventId = 0;
function makeEvent(overrides?: Partial<HubEvent>): HubEvent {
  return {
    id: `evt-${nextEventId++}`,
    type: "system",
    source: "mock",
    createdAt: Date.now(),
    ...overrides,
  };
}

/** Reset the event counter between tests. */
beforeEach(() => {
  nextEventId = 0;
});

// ── Tests ────────────────────────────────────────────────────────────

describe("createProviderShell", () => {
  describe("start()", () => {
    it("calls config.start with a valid handle", () => {
      const configStart = vi.fn();
      const provider = createProviderShell({
        metadata: MINIMAL_METADATA,
        capabilities: [],
        start: configStart,
        stop: () => {},
      });

      provider.start();

      expect(configStart).toHaveBeenCalledTimes(1);
      // The handle is the first argument -- verify it has emit and markDegraded.
      const handle = configStart.mock.calls[0][0];
      expect(handle).toHaveProperty("emit");
      expect(typeof handle.emit).toBe("function");
      expect(handle).toHaveProperty("markDegraded");
      expect(typeof handle.markDegraded).toBe("function");
    });

    it("is idempotent -- multiple calls do not start again", () => {
      const configStart = vi.fn();
      const provider = createProviderShell({
        metadata: MINIMAL_METADATA,
        capabilities: [],
        start: configStart,
        stop: () => {},
      });

      provider.start();
      provider.start();
      provider.start();

      // config.start should only have been invoked once
      expect(configStart).toHaveBeenCalledTimes(1);
    });
  });

  describe("stop()", () => {
    it("calls config.stop", () => {
      const configStop = vi.fn();
      const provider = createProviderShell({
        metadata: MINIMAL_METADATA,
        capabilities: [],
        start: () => {},
        stop: configStop,
      });

      provider.stop();

      expect(configStop).toHaveBeenCalledTimes(1);
    });

    it("is idempotent -- multiple calls do not throw", () => {
      const configStop = vi.fn();
      const provider = createProviderShell({
        metadata: MINIMAL_METADATA,
        capabilities: [],
        start: () => {},
        stop: configStop,
      });

      // Should not throw on repeated stop calls
      expect(() => {
        provider.stop();
        provider.stop();
        provider.stop();
      }).not.toThrow();

      expect(configStop).toHaveBeenCalledTimes(3);
    });

    it("still calls config.stop even when it was never started", () => {
      const configStop = vi.fn();
      const provider = createProviderShell({
        metadata: MINIMAL_METADATA,
        capabilities: [],
        start: () => {},
        stop: configStop,
      });

      provider.stop();
      expect(configStop).toHaveBeenCalledTimes(1);
    });
  });

  describe("emit()", () => {
    it("forwards events to all subscribers", () => {
      const provider = createProviderShell({
        metadata: MINIMAL_METADATA,
        capabilities: [],
        start: (handle) => {
          handle.emit([makeEvent({ type: "system" })]);
        },
        stop: () => {},
      });

      const listener = vi.fn();
      provider.subscribe(listener);
      provider.start();

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0]).toHaveLength(1);
      expect(listener.mock.calls[0][0][0].type).toBe("system");
    });

    it("does nothing when lifecycle is not Publishing", () => {
      let capturedHandle: Parameters<typeof provider.start> extends []
        ? { emit(events: HubEvent[]): void; markDegraded(): void }
        : never = undefined as never;
      const provider = createProviderShell({
        metadata: MINIMAL_METADATA,
        capabilities: [],
        start: (handle) => {
          capturedHandle = handle;
        },
        stop: () => {},
      });

      const listener = vi.fn();
      provider.subscribe(listener);

      // Start, capture the handle, then stop so emit is called outside Publishing
      provider.start();
      provider.stop();
      capturedHandle.emit([makeEvent()]);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("markDegraded()", () => {
    it("updates provider health to Degraded", () => {
      let capturedHandle: any;
      const provider = createProviderShell({
        metadata: MINIMAL_METADATA,
        capabilities: [],
        start: (handle) => {
          capturedHandle = handle;
        },
        stop: () => {},
      });

      expect(provider.status().health).toBe("Healthy");

      provider.start();
      capturedHandle.markDegraded();

      expect(provider.status().health).toBe("Degraded");
    });
  });

  describe("status() / lifecycle transitions", () => {
    it("starts as Registered", () => {
      const provider = createProviderShell({
        metadata: MINIMAL_METADATA,
        capabilities: [],
        start: () => {},
        stop: () => {},
      });

      expect(provider.status().lifecycle).toBe("Registered");
      expect(provider.status().health).toBe("Healthy");
    });

    it("transitions to Publishing after start()", () => {
      const provider = createProviderShell({
        metadata: MINIMAL_METADATA,
        capabilities: [],
        start: () => {},
        stop: () => {},
      });

      provider.start();

      expect(provider.status().lifecycle).toBe("Publishing");
    });

    it("transitions to Stopped after stop()", () => {
      const provider = createProviderShell({
        metadata: MINIMAL_METADATA,
        capabilities: [],
        start: () => {},
        stop: () => {},
      });

      provider.start();
      provider.stop();

      expect(provider.status().lifecycle).toBe("Stopped");
    });
  });

  describe("subscribe()", () => {
    it("returns an unsubscribe function", () => {
      const provider = createProviderShell({
        metadata: MINIMAL_METADATA,
        capabilities: [],
        start: () => {},
        stop: () => {},
      });

      const unsub = provider.subscribe(() => {});
      expect(typeof unsub).toBe("function");
    });

    it("unsubscribed listener no longer receives events", () => {
      let capturedHandle: any;
      const provider = createProviderShell({
        metadata: MINIMAL_METADATA,
        capabilities: [],
        start: (handle) => {
          capturedHandle = handle;
        },
        stop: () => {},
      });

      const listener = vi.fn();
      const unsub = provider.subscribe(listener);

      provider.start();

      // Emit before unsubscribe -- listener should be called
      capturedHandle.emit([makeEvent()]);
      expect(listener).toHaveBeenCalledTimes(1);

      // Unsubscribe and emit again
      unsub();
      capturedHandle.emit([makeEvent()]);

      // Listener should still have been called only once
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("supports multiple subscribers independently", () => {
      let capturedHandle: any;
      const provider = createProviderShell({
        metadata: MINIMAL_METADATA,
        capabilities: [],
        start: (handle) => {
          capturedHandle = handle;
        },
        stop: () => {},
      });

      const listenerA = vi.fn();
      const listenerB = vi.fn();

      provider.subscribe(listenerA);
      const unsubB = provider.subscribe(listenerB);
      provider.start();

      capturedHandle.emit([makeEvent()]);
      expect(listenerA).toHaveBeenCalledTimes(1);
      expect(listenerB).toHaveBeenCalledTimes(1);

      // Unsubscribe B only
      unsubB();
      capturedHandle.emit([makeEvent()]);

      expect(listenerA).toHaveBeenCalledTimes(2);
      expect(listenerB).toHaveBeenCalledTimes(1);
    });

    it("does not forward events to listeners that throw", () => {
      let capturedHandle: any;
      const provider = createProviderShell({
        metadata: MINIMAL_METADATA,
        capabilities: [],
        start: (handle) => {
          capturedHandle = handle;
        },
        stop: () => {},
      });

      const goodListener = vi.fn();
      const badListener = vi.fn(() => {
        throw new Error("listener failure");
      });

      provider.subscribe(goodListener);
      provider.subscribe(badListener);
      provider.start();

      // Should not throw, and goodListener should still be called
      expect(() => {
        capturedHandle.emit([makeEvent()]);
      }).not.toThrow();

      expect(goodListener).toHaveBeenCalledTimes(1);
    });
  });

  describe("metadata and capabilities passthrough", () => {
    it("exposes metadata and capabilities from config", () => {
      const provider = createProviderShell({
        metadata: MINIMAL_METADATA,
        capabilities: [
          {
            id: "system",
            kind: "system",
            origin: "mock",
            support: "available",
          },
        ],
        start: () => {},
        stop: () => {},
      });

      expect(provider.id).toBe("test-provider");
      expect(provider.label).toBe("Test Provider");
      expect(provider.metadata).toEqual(MINIMAL_METADATA);
      expect(provider.capabilities).toHaveLength(1);
      expect(provider.capabilities[0].id).toBe("system");
    });
  });
});
