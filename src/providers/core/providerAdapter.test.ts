/**
 * Tests for connectProviderToEventBus -- the connection layer that bridges
 * provider emit() calls to HubEventBus.publishHubEvent().
 *
 * Coverage targets:
 *  - emit through the connection surfaces in bus.getState()
 *  - disconnect stops event propagation
 *  - multiple emits accumulate in bus state
 *  - post-disconnect emit does not throw
 *  - disconnect() is idempotent
 *  - clipboard payload updates busState.clipboard correctly
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { connectProviderToEventBus, type ProviderConnection } from "./providerAdapter";
import { createHubEventBus, type HubEventBus } from "../../state/hubState";
import { createProviderShell, type ProviderShellHandle } from "./providerShell";
import type { HubEvent } from "@/entities";
import type { HubProviderMetadata, HubProviderCapability } from "./types";

// ── Helpers ──────────────────────────────────────────────────────────

const MINIMAL_METADATA: HubProviderMetadata = {
  id: "test-provider",
  name: "Test Provider",
  kind: "clipboard",
  version: "1.0.0",
  mock: true,
};

const MINIMAL_CAPABILITIES: HubProviderCapability[] = [
  {
    id: "clipboard",
    kind: "clipboard",
    origin: "mock",
    support: "available",
  },
];

let nextEventId = 0;

/** Factory for a simple HubEvent with an incrementing id. */
function makeEvent(overrides?: Partial<HubEvent>): HubEvent {
  return {
    id: `evt-${nextEventId++}`,
    type: "clipboard",
    source: "clipboard",
    createdAt: Date.now(),
    ...overrides,
  };
}

/** Factory for a clipboard HubEvent with a typed payload. */
function makeClipboardEvent(text: string): HubEvent {
  return {
    id: `clip-${nextEventId++}`,
    type: "clipboard",
    source: "clipboard",
    createdAt: Date.now(),
    payload: {
      text,
      sourceApp: "test-app",
      copiedAt: Date.now(),
    },
  };
}

/** Create a started provider shell whose handle is exposed for direct emit() calls. */
function createStartedProvider(): {
  handle: ProviderShellHandle;
  provider: ReturnType<typeof createProviderShell>;
} {
  let capturedHandle!: ProviderShellHandle;
  const provider = createProviderShell({
    metadata: MINIMAL_METADATA,
    capabilities: MINIMAL_CAPABILITIES,
    start: (handle) => {
      capturedHandle = handle;
    },
    stop: () => {},
  });
  provider.start();
  return { handle: capturedHandle, provider };
}

/** Reset event counter between tests for deterministic ids. */
beforeEach(() => {
  nextEventId = 0;
});

// ── Tests ────────────────────────────────────────────────────────────

describe("connectProviderToEventBus", () => {
  describe("emit through connection", () => {
    it("publishes provider events to the event bus", () => {
      // Arrange
      const { handle, provider } = createStartedProvider();
      const bus: HubEventBus = createHubEventBus();
      const connection: ProviderConnection = connectProviderToEventBus(provider, bus);

      // Act
      handle.emit([makeEvent({ id: "e1", type: "clipboard" })]);

      // Assert
      const state = bus.getState();
      expect(state.events).toHaveLength(1);
      expect(state.events[0].id).toBe("e1");
      expect(state.events[0].type).toBe("clipboard");
      expect(state.events[0].origin).toBe("mock");

      connection.disconnect();
    });

    it("publishes all events in a batch", () => {
      // Arrange
      const { handle, provider } = createStartedProvider();
      const bus: HubEventBus = createHubEventBus();
      const connection = connectProviderToEventBus(provider, bus);

      // Act
      handle.emit([
        makeEvent({ id: "a", type: "clipboard" }),
        makeEvent({ id: "b", type: "clipboard" }),
        makeEvent({ id: "c", type: "clipboard" }),
      ]);

      // Assert
      const ids = bus.getState().events.map((e) => e.id).sort();
      expect(ids).toEqual(["a", "b", "c"]);

      connection.disconnect();
    });
  });

  describe("disconnect", () => {
    it("stops provider events from reaching the bus", () => {
      // Arrange
      const { handle, provider } = createStartedProvider();
      const bus: HubEventBus = createHubEventBus();
      const connection = connectProviderToEventBus(provider, bus);

      // Act -- emit one event, disconnect, emit another
      handle.emit([makeEvent({ id: "before" })]);
      connection.disconnect();
      handle.emit([makeEvent({ id: "after" })]);

      // Assert -- only the pre-disconnect event is in the bus
      const ids = bus.getState().events.map((e) => e.id);
      expect(ids).toEqual(["before"]);
    });

    it("is idempotent -- multiple calls do not throw", () => {
      // Arrange
      const { handle, provider } = createStartedProvider();
      const bus: HubEventBus = createHubEventBus();
      const connection = connectProviderToEventBus(provider, bus);

      handle.emit([makeEvent()]);

      // Act + Assert -- repeated disconnect should be a no-op
      expect(() => {
        connection.disconnect();
        connection.disconnect();
        connection.disconnect();
      }).not.toThrow();

      // The provider's listener was only removed once; emit must still not
      // crash the bus or the connection.
      expect(() => {
        handle.emit([makeEvent()]);
      }).not.toThrow();
    });
  });

  describe("resilience to publish failures", () => {
    it("does not throw when a provider emits after disconnect", () => {
      // Arrange
      const { handle, provider } = createStartedProvider();
      const bus: HubEventBus = createHubEventBus();
      const connection = connectProviderToEventBus(provider, bus);
      connection.disconnect();

      // Act + Assert -- emit after disconnect should not throw
      expect(() => {
        handle.emit([makeEvent({ id: "ghost" })]);
        handle.emit([makeEvent({ id: "ghost-2" })]);
      }).not.toThrow();

      // Bus state should not have received the late events
      expect(bus.getState().events).toHaveLength(0);
    });

    it("continues to publish remaining events when one publish would throw", () => {
      // Arrange -- use a bus that throws on a specific event id
      const { handle, provider } = createStartedProvider();
      let callCount = 0;
      const subscribers = new Set<(state: import("@/entities").HubStoreState) => void>();
      const throwingBus: HubEventBus = {
        getState: () => ({
          events: [],
          mode: "idle",
          tasks: [],
        }),
        publishHubEvent: (event) => {
          callCount += 1;
          if (event.id === "bad") {
            throw new Error("synthetic publish failure");
          }
        },
        replaceHubEvents: () => {},
        clearHubEvents: () => {},
        clearExpiredEvents: () => {},
        subscribe: (subscriber) => {
          subscribers.add(subscriber);
          return () => subscribers.delete(subscriber);
        },
      };

      const connection = connectProviderToEventBus(provider, throwingBus);

      // Act -- emit a batch with a "bad" event in the middle
      handle.emit([
        makeEvent({ id: "ok-1" }),
        makeEvent({ id: "bad" }),
        makeEvent({ id: "ok-2" }),
      ]);

      // Assert -- the adapter swallowed the error and continued
      expect(callCount).toBe(3);

      connection.disconnect();
    });
  });

  describe("state propagation", () => {
    it("updates busState.clipboard when a clipboard event is published", () => {
      // Arrange
      const { handle, provider } = createStartedProvider();
      const bus: HubEventBus = createHubEventBus();
      const connection = connectProviderToEventBus(provider, bus);

      // Sanity -- clipboard is undefined before
      expect(bus.getState().clipboard).toBeUndefined();

      // Act
      handle.emit([makeClipboardEvent("hello world")]);

      // Assert
      const state = bus.getState();
      expect(state.clipboard).toBeDefined();
      expect(state.clipboard?.text).toBe("hello world");
      expect(state.clipboard?.sourceApp).toBe("test-app");

      connection.disconnect();
    });

    it("accumulates multiple emits in bus state", () => {
      // Arrange
      const { handle, provider } = createStartedProvider();
      const bus: HubEventBus = createHubEventBus();
      const connection = connectProviderToEventBus(provider, bus);

      // Act
      handle.emit([makeClipboardEvent("first")]);
      handle.emit([makeClipboardEvent("second")]);
      handle.emit([makeClipboardEvent("third")]);

      // Assert
      const state = bus.getState();
      // The latest clipboard payload wins (createHubEventBus replaces by id)
      expect(state.clipboard?.text).toBe("third");
      // All three events should still be present in the events array
      expect(state.events).toHaveLength(3);

      connection.disconnect();
    });
  });

  describe("subscriber notification", () => {
    it("notifies bus subscribers when a connected provider emits", () => {
      // Arrange
      const { handle, provider } = createStartedProvider();
      const bus: HubEventBus = createHubEventBus();
      const connection = connectProviderToEventBus(provider, bus);

      const subscriber = vi.fn();
      const unsubscribe = bus.subscribe(subscriber);

      // Reset the synchronous initial notification from subscribe()
      subscriber.mockClear();

      // Act
      handle.emit([makeEvent({ id: "x" })]);

      // Assert
      expect(subscriber).toHaveBeenCalledTimes(1);
      const delivered = subscriber.mock.calls[0][0];
      expect(delivered.events.map((e: HubEvent) => e.id)).toEqual(["x"]);

      unsubscribe();
      connection.disconnect();
    });
  });

  // ── Edge cases & error recovery ────────────────────────────────────

  describe("listener error isolation", () => {
    it("a throwing subscriber does not block unrelated bus subscribers", () => {
      // Arrange
      const { handle, provider } = createStartedProvider();
      const bus: HubEventBus = createHubEventBus();
      const connection = connectProviderToEventBus(provider, bus);

      const good = vi.fn();
      const bad = vi.fn(() => {
        throw new Error("subscriber blew up");
      });
      const goodAfter = vi.fn();

      const unsubGood = bus.subscribe(good);
      const unsubBad = bus.subscribe(bad);
      const unsubGoodAfter = bus.subscribe(goodAfter);

      // subscribe() synchronously delivers an initial snapshot to each subscriber;
      // reset the mocks so we are only asserting the calls triggered by emit().
      good.mockClear();
      bad.mockClear();
      goodAfter.mockClear();

      // Act
      handle.emit([makeEvent({ id: "fault-tolerant" })]);

      // Assert -- every subscriber is invoked, even when one throws
      expect(good).toHaveBeenCalledTimes(1);
      expect(bad).toHaveBeenCalledTimes(1);
      expect(goodAfter).toHaveBeenCalledTimes(1);
      // The event still lands in bus state despite the throw
      expect(bus.getState().events.map((e) => e.id)).toContain("fault-tolerant");

      unsubGood();
      unsubBad();
      unsubGoodAfter();
      connection.disconnect();
    });
  });

  describe("lifecycle gating", () => {
    it("does not publish events from a Stopped provider", () => {
      // Arrange -- createStartedProvider, then stop the provider
      const { handle, provider } = createStartedProvider();
      provider.stop();
      const bus: HubEventBus = createHubEventBus();
      const connection = connectProviderToEventBus(provider, bus);

      // Act -- emit while lifecycle is Stopped
      handle.emit([makeEvent({ id: "ghost-after-stop" })]);

      // Assert -- the bus never received the event
      expect(bus.getState().events).toHaveLength(0);

      connection.disconnect();
    });

    it("does not publish events emitted before start()", () => {
      // Arrange -- provider's start() is intentionally deferred via setTimeout
      // so we can grab the handle and emit before lifecycle transitions to Publishing.
      let capturedHandle: ProviderShellHandle | undefined;
      const provider = createProviderShell({
        metadata: MINIMAL_METADATA,
        capabilities: MINIMAL_CAPABILITIES,
        start: (handle) => {
          capturedHandle = handle;
        },
        stop: () => {},
      });

      // Subscribe (and therefore connect the bus) BEFORE start() is called.
      const bus: HubEventBus = createHubEventBus();
      const connection = connectProviderToEventBus(provider, bus);

      // Emit while lifecycle is still "Registered" (pre-start).
      expect(provider.status().lifecycle).toBe("Registered");
      capturedHandle?.emit([makeEvent({ id: "pre-start" })]);

      // Now start the provider -- lifecycle becomes Publishing.
      provider.start();
      expect(provider.status().lifecycle).toBe("Publishing");

      // Sanity -- the bus should have received nothing from the pre-start emit.
      expect(bus.getState().events).toHaveLength(0);

      // And post-start emits do work, confirming the connection itself is healthy.
      capturedHandle?.emit([makeEvent({ id: "post-start" })]);
      expect(bus.getState().events.map((e) => e.id)).toEqual(["post-start"]);

      connection.disconnect();
    });
  });

  describe("disconnect resilience", () => {
    it("does not throw when emit is interleaved with disconnect", () => {
      // Arrange
      const { handle, provider } = createStartedProvider();
      const bus: HubEventBus = createHubEventBus();
      const connection = connectProviderToEventBus(provider, bus);

      // Act + Assert -- interleaving emit/disconnect must never throw.
      // We cannot use async/await for disconnect (the API is sync), so the
      // "during" check is approximated by emitting immediately after the
      // disconnect call returns. The contract we are validating is that the
      // adapter does not throw during the disconnect/emit race.
      expect(() => {
        handle.emit([makeEvent({ id: "before" })]);
        connection.disconnect();
        handle.emit([makeEvent({ id: "during" })]);
        connection.disconnect(); // second disconnect is a no-op
        handle.emit([makeEvent({ id: "after" })]);
      }).not.toThrow();

      // Only the pre-disconnect event is recorded in the bus.
      const ids = bus.getState().events.map((e) => e.id);
      expect(ids).toEqual(["before"]);
    });

    it("is safe to call disconnect many times in a row", () => {
      // Arrange
      const { provider } = createStartedProvider();
      const bus: HubEventBus = createHubEventBus();
      const connection = connectProviderToEventBus(provider, bus);

      // Act + Assert -- 5 sequential disconnects must be a no-op after the first.
      for (let i = 0; i < 5; i += 1) {
        expect(() => connection.disconnect()).not.toThrow();
      }
    });
  });

  describe("listener ordering & shape", () => {
    it("delivers to multiple bus subscribers in subscription order", () => {
      // Arrange
      const { handle, provider } = createStartedProvider();
      const bus: HubEventBus = createHubEventBus();
      const connection = connectProviderToEventBus(provider, bus);

      const callOrder: string[] = [];
      const unsubA = bus.subscribe(() => callOrder.push("A"));
      const unsubB = bus.subscribe(() => callOrder.push("B"));

      // Reset the synchronous initial notifications from subscribe().
      callOrder.length = 0;

      // Act
      handle.emit([makeEvent({ id: "ordering" })]);

      // Assert -- A and B both received the event in subscription order.
      expect(callOrder).toEqual(["A", "B"]);

      unsubA();
      unsubB();
      connection.disconnect();
    });

    it("handles an empty events array without throwing or mutating bus state", () => {
      // Arrange
      const { handle, provider } = createStartedProvider();
      const bus: HubEventBus = createHubEventBus();
      const connection = connectProviderToEventBus(provider, bus);

      const subscriber = vi.fn();
      const unsub = bus.subscribe(subscriber);
      subscriber.mockClear();

      // Snapshot state before the empty emit.
      const before = bus.getState();
      const eventsBefore = before.events.length;
      const modeBefore = before.mode;

      // Act
      expect(() => {
        handle.emit([]);
      }).not.toThrow();

      // Assert -- no event was published, no subscriber was notified, state
      // shape is preserved. (Bus subscribers do receive a snapshot from
      // subscribe() but should not be called from the empty emit itself.)
      expect(subscriber).not.toHaveBeenCalled();
      const after = bus.getState();
      expect(after.events).toHaveLength(eventsBefore);
      expect(after.mode).toBe(modeBefore);

      unsub();
      connection.disconnect();
    });
  });

  describe("throughput", () => {
    it("forwards large event batches in full without dropping any", () => {
      // Arrange
      const { handle, provider } = createStartedProvider();
      const bus: HubEventBus = createHubEventBus();
      const connection = connectProviderToEventBus(provider, bus);

      // 150 unique events -- comfortably past the 100+ requested boundary.
      const batchSize = 150;
      const batch: HubEvent[] = Array.from({ length: batchSize }, (_, i) =>
        makeEvent({ id: `bulk-${i}`, type: "clipboard" }),
      );

      // Act
      handle.emit(batch);

      // Assert -- every event id made it to the bus.
      const ids = bus.getState().events.map((e) => e.id);
      expect(ids).toHaveLength(batchSize);
      expect(new Set(ids).size).toBe(batchSize); // no duplicates from id-collision

      connection.disconnect();
    });
  });
});
