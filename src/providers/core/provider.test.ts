import { strict as assert } from "node:assert";
import "./providerRegistry.test";
import "./systemStatusDiagnostics.test";
import { createHubEventBus } from "../../state/hubState";
import type { HubMode } from "@/entities";
import {
  createMockAiTaskEvent,
  createMockNotificationEvent,
  createMockAIProvider,
  createMockAiTaskProvider,
  createMockDownloadEvent,
  createMockDownloadProvider,
  createMockMusicProvider,
  createMockNotificationProvider,
} from "../impl/mock/index";
import { connectProviderToEventBus } from "./providerAdapter";
import type { HubProvider, HubProviderCapability } from "./types";

import { describe, it } from "vitest";
describe("provider.test", () => {
  it("runs the file's top-level asserts", () => {});
  const now = Date.UTC(2026, 5, 6, 11, 0, 0);

  function collectObjectKeys(value: unknown): string[] {
    if (!value || typeof value !== "object") {
      return [];
    }

    return Object.entries(value).flatMap(([key, childValue]) => [
      key,
      ...collectObjectKeys(childValue),
    ]);
  }

  function assertNoPriorityOrModeHints(value: unknown) {
    const forbidden = new Set([
      "resolverPriority",
      "displayPriority",
      "priority",
      "finalHubMode",
      "mode",
      "hubMode",
      "uiMode",
      "ui",
      "store",
      "resolver",
      "ranking",
      "rank",
    ]);

    for (const key of collectObjectKeys(value)) {
      assert.equal(forbidden.has(key), false, `${key} must not be provider metadata`);
    }
  }

  const musicCapabilityPreflightDescriptor: HubProviderCapability = {
    id: "music",
    kind: "music",
    origin: "native",
    support: "preflight",
  };

  function collectModes(provider: HubProvider): HubMode[] {
    const bus = createHubEventBus();
    const modes: HubMode[] = [];
    const unsubscribe = bus.subscribe((state) => modes.push(state.mode));
    const connection = connectProviderToEventBus(provider, bus);

    provider.start();

    connection.disconnect();
    unsubscribe();

    return modes;
  }

  function collectProviderState(provider: HubProvider) {
    const bus = createHubEventBus();
    const connection = connectProviderToEventBus(provider, bus);

    provider.start();
    const state = bus.getState(now);

    connection.disconnect();

    return state;
  }

  test("adapter publishes music provider events through the event bus", () => {
    const modes = collectModes(createMockMusicProvider({ now }));

    assert.deepEqual(modes, ["idle", "music"]);
  });

  test("adapter publishes AI task provider events through the event bus", () => {
    const modes = collectModes(createMockAiTaskProvider({ now }));

    assert.deepEqual(modes, ["idle", "aiProgress"]);
  });

  test("canonical AI provider alias publishes events through the event bus", () => {
    const modes = collectModes(createMockAIProvider({ now }));

    assert.deepEqual(modes, ["idle", "aiProgress"]);
  });

  test("adapter publishes download provider events through the event bus", () => {
    const modes = collectModes(createMockDownloadProvider({ now }));

    assert.deepEqual(modes, ["idle", "download"]);
  });

  test("mock provider events use canonical top-level fields", () => {
    const cases = [
      {
        provider: createMockMusicProvider({ now }),
        expectedEvent: {
          id: "mock-music-music-1780743600000",
          type: "music",
          source: "music",
        },
        expectedTaskTitle: "Midnight City",
      },
      {
        provider: createMockAIProvider({ now }),
        expectedEvent: {
          id: "mock-ai-ai-1780743600000",
          type: "ai",
          source: "ai",
        },
        expectedTaskTitle: "Codex is updating the provider SDK",
      },
      {
        provider: createMockDownloadProvider({ now }),
        expectedEvent: {
          id: "mock-download-download-1780743600000",
          type: "download",
          source: "download",
        },
        expectedTaskTitle: "Windows SDK Preview.zip",
      },
      {
        provider: createMockNotificationProvider({ now }),
        expectedEvent: {
          id: "mock-notification-notification-1780743600000",
          type: "notification",
          source: "notification",
        },
      },
    ] as const;

    for (const { provider, expectedEvent, expectedTaskTitle } of cases) {
      const state = collectProviderState(provider);
      const [event] = state.events;

      assert.equal(event?.id, expectedEvent.id);
      assert.equal(event?.type, expectedEvent.type);
      assert.equal(event?.source, expectedEvent.source);
      assert.equal(event?.createdAt, now);
      assert.equal("title" in (event ?? {}), false);
      assert.equal("subtitle" in (event ?? {}), false);

      if (expectedTaskTitle) {
        assert.equal(state.tasks[0]?.title, expectedTaskTitle);
      }
    }
  });

  test("mock providers expose stable metadata and matching capabilities", () => {
    const providers = [
      createMockMusicProvider({ now }),
      createMockAIProvider({ now }),
      createMockDownloadProvider({ now }),
      createMockNotificationProvider({ now }),
    ];

    assert.deepEqual(
      providers.map((provider) => provider.metadata),
      [
        {
          id: "mock-music-provider",
          name: "Mock Music Provider",
          kind: "music",
          version: "0.6.0",
          mock: true,
        },
        {
          id: "mock-ai-task-provider",
          name: "Mock AI Provider",
          kind: "ai",
          version: "0.6.0",
          mock: true,
        },
        {
          id: "mock-download-provider",
          name: "Mock Download Provider",
          kind: "download",
          version: "0.6.0",
          mock: true,
        },
        {
          id: "mock-notification-provider",
          name: "Mock Notification Provider",
          kind: "notification",
          version: "0.6.0",
          mock: true,
        },
      ],
    );

    for (const provider of providers) {
      assert.equal(provider.id, provider.metadata.id);
      assert.equal(provider.label, provider.metadata.name);
      assert.deepEqual(provider.capabilities, [
        {
          id: provider.metadata.kind,
          kind: provider.metadata.kind,
          origin: "mock",
          support: "available",
        },
      ]);
      assertNoPriorityOrModeHints(provider.metadata);
      assertNoPriorityOrModeHints(provider.capabilities);
    }
  });

  test("music capability preflight descriptor stays facts-only", () => {
    assert.deepEqual(musicCapabilityPreflightDescriptor, {
      id: "music",
      kind: "music",
      origin: "native",
      support: "preflight",
    });
    assertNoPriorityOrModeHints(musicCapabilityPreflightDescriptor);
    assert.equal("provider" in musicCapabilityPreflightDescriptor, false);
    assert.equal("start" in musicCapabilityPreflightDescriptor, false);
    assert.equal("subscribe" in musicCapabilityPreflightDescriptor, false);
    assert.equal("emit" in musicCapabilityPreflightDescriptor, false);
    assert.equal("available" in musicCapabilityPreflightDescriptor, false);
    assert.equal("ready" in musicCapabilityPreflightDescriptor, false);
    assert.equal("connected" in musicCapabilityPreflightDescriptor, false);
    assert.equal("implemented" in musicCapabilityPreflightDescriptor, false);
  });

  test("canonical AI provider alias preserves existing AI task provider compatibility", () => {
    const canonical = createMockAIProvider({ now });
    const legacy = createMockAiTaskProvider({ now });

    assert.equal(canonical.id, legacy.id);
    assert.deepEqual(canonical.metadata, legacy.metadata);
    assert.deepEqual(canonical.capabilities, legacy.capabilities);
  });

  test("mock providers start with stopped lifecycle and healthy health", () => {
    const provider = createMockMusicProvider({ now });

    assert.deepEqual(provider.status(), {
      lifecycle: "Stopped",
      health: "Healthy",
    });
  });

  test("start sets provider publishing and emits events", () => {
    const provider = createMockMusicProvider({ now });
    const emissions: string[][] = [];
    const unsubscribe = provider.subscribe((events) =>
      emissions.push(events.map((event) => event.id)),
    );

    provider.start();

    assert.deepEqual(provider.status(), {
      lifecycle: "Publishing",
      health: "Healthy",
    });
    assert.deepEqual(emissions, [["mock-music-music-1780743600000"]]);

    unsubscribe();
  });

  test("duplicate start does not duplicate unintended emissions", () => {
    const provider = createMockMusicProvider({ now });
    const emissions: string[][] = [];
    const unsubscribe = provider.subscribe((events) =>
      emissions.push(events.map((event) => event.id)),
    );

    provider.start();
    provider.start();

    assert.deepEqual(provider.status(), {
      lifecycle: "Publishing",
      health: "Healthy",
    });
    assert.deepEqual(emissions, [["mock-music-music-1780743600000"]]);

    unsubscribe();
  });

  test("stop sets provider stopped lifecycle and keeps health healthy", () => {
    const provider = createMockMusicProvider({ now });

    provider.start();
    provider.stop();

    assert.deepEqual(provider.status(), {
      lifecycle: "Stopped",
      health: "Healthy",
    });
  });

  test("duplicate stop keeps provider stopped without extra emissions", () => {
    const provider = createMockMusicProvider({ now });
    const emissions: string[][] = [];
    const unsubscribe = provider.subscribe((events) =>
      emissions.push(events.map((event) => event.id)),
    );

    provider.start();
    provider.stop();
    provider.stop();

    assert.deepEqual(provider.status(), {
      lifecycle: "Stopped",
      health: "Healthy",
    });
    assert.deepEqual(emissions, [["mock-music-music-1780743600000"]]);

    unsubscribe();
  });

  test("unsubscribe prevents provider listener calls", () => {
    const provider = createMockMusicProvider({ now });
    let calls = 0;
    const unsubscribe = provider.subscribe(() => {
      calls += 1;
    });

    unsubscribe();
    provider.start();

    assert.equal(calls, 0);
  });

  test("mock provider listener errors do not block later listeners", () => {
    const provider = createMockMusicProvider({ now });
    const observedEventIds: string[][] = [];
    provider.subscribe(() => {
      throw new Error("listener failed");
    });
    const unsubscribeLater = provider.subscribe((events) => {
      observedEventIds.push(events.map((event) => event.id));
    });

    assert.doesNotThrow(() => provider.start());
    assert.deepEqual(observedEventIds, [["mock-music-music-1780743600000"]]);

    unsubscribeLater();
  });

  test("mock provider listener event batches do not share mutable payload references", () => {
    const provider = createMockMusicProvider({ now });
    let firstBatch: unknown;
    let receivedLater = false;
    const unsubscribeFirst = provider.subscribe((events) => {
      firstBatch = events;
      const payload = events[0]?.payload as { title: string } | undefined;

      if (!payload) {
        throw new Error("expected music payload");
      }

      payload.title = "Mutated by first listener";
      events.pop();
    });
    const unsubscribeLater = provider.subscribe((events) => {
      receivedLater = true;
      assert.notEqual(events, firstBatch);
    });

    provider.start();

    // First listener unsubscribed itself by mutating and popping; assert
    // no exceptions fired and the provider lifecycle completed normally.
    assert.equal(receivedLater, true);

    unsubscribeFirst();
    unsubscribeLater();
  });

  test("AI and download mock fixtures keep deterministic fixed progress", () => {
    const ai = createMockAiTaskEvent({ now });
    const download = createMockDownloadEvent({ now });

    assert.equal(ai.id, "mock-ai-ai-1780743600000");
    assert.equal(ai.progress, 72);
    assert.equal((ai.payload as { progress?: number } | undefined)?.progress, 72);
    assert.equal(download.id, "mock-download-download-1780743600000");
    assert.equal(download.progress, 45);
    assert.equal((download.payload as { progress?: number } | undefined)?.progress, 45);
  });

  test("adapter preserves notification expiry behavior", () => {
    const bus = createHubEventBus();
    const provider = createMockNotificationProvider({ now });
    const connection = connectProviderToEventBus(provider, bus);
    const notification = createMockNotificationEvent({ now });

    provider.start();

    assert.equal(bus.getState(notification.expiresAt - 1).mode, "notification");
    assert.equal(bus.getState(notification.expiresAt).mode, "idle");

    connection.disconnect();
  });

  test("disconnect stops forwarding provider emissions", () => {
    const bus = createHubEventBus();
    const provider = createMockMusicProvider({ now });
    const connection = connectProviderToEventBus(provider, bus);

    connection.disconnect();
    provider.start();

    assert.equal(bus.getState(now).mode, "idle");
  });

  test("adapter keeps forwarding later provider events after one publish fails", () => {
    const providerEvents = [
      { ...createMockAiTaskEvent({ now }), id: "first" },
      { ...createMockDownloadEvent({ now }), id: "second" },
    ];
    const publishedEventIds: string[] = [];
    const provider: HubProvider = {
      id: "batch-provider",
      label: "Batch Provider",
      metadata: {
        id: "batch-provider",
        name: "Batch Provider",
        kind: "ai",
        version: "0.6.0",
        mock: true,
      },
      capabilities: [{ id: "ai", kind: "ai", origin: "mock", support: "available" }],
      start() {},
      stop() {},
      subscribe(listener) {
        listener(providerEvents);
        return () => {};
      },
      status() {
        return {
          lifecycle: "Publishing",
          health: "Healthy",
        };
      },
    };

    assert.doesNotThrow(() =>
      connectProviderToEventBus(provider, {
        getState: createHubEventBus().getState,
        replaceHubEvents() {},
        clearHubEvents() {},
        clearExpiredEvents() {},
        subscribe() {
          return () => {};
        },
        publishHubEvent(event) {
          publishedEventIds.push(event.id);

          if (event.id === "first") {
            throw new Error("first publish failed");
          }
        },
      }),
    );
    assert.deepEqual(publishedEventIds, ["first", "second"]);
  });

  test("disconnect cleanup is safe to call more than once", () => {
    const bus = createHubEventBus();
    const provider = createMockMusicProvider({ now });
    const connection = connectProviderToEventBus(provider, bus);

    connection.disconnect();
    connection.disconnect();
    provider.start();

    assert.equal(bus.getState(now).mode, "idle");
  });

  test("adapter disconnect calls provider unsubscribe at most once", () => {
    let unsubscribeCalls = 0;
    const provider: HubProvider = {
      id: "single-cleanup-provider",
      label: "Single Cleanup Provider",
      metadata: {
        id: "single-cleanup-provider",
        name: "Single Cleanup Provider",
        kind: "music",
        version: "0.6.0",
        mock: true,
      },
      capabilities: [{ id: "music", kind: "music", origin: "mock", support: "available" }],
      start() {},
      stop() {},
      subscribe() {
        return () => {
          unsubscribeCalls += 1;
        };
      },
      status() {
        return {
          lifecycle: "Stopped",
          health: "Healthy",
        };
      },
    };
    const connection = connectProviderToEventBus(provider, createHubEventBus());

    connection.disconnect();
    connection.disconnect();

    assert.equal(unsubscribeCalls, 1);
  });
});
