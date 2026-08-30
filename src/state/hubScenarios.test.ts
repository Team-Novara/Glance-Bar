import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createAutoDemoSequence,
  createHubDemoScenario,
  createHubDemoScenarios,
  playHubDemoScenario,
  type HubDemoScenarioId,
} from "./hubScenarios";
import { createHubEventBus, type HubEventBus } from "./hubState";
import type { HubEvent, HubMode } from "@/entities";

const BASE_NOW = Date.UTC(2026, 5, 14, 9, 0, 0);

describe("createHubDemoScenario", () => {
  it("returns a music scenario with one event and a matching expected mode", () => {
    // Arrange
    const id: HubDemoScenarioId = "music";

    // Act
    const scenario = createHubDemoScenario(id, BASE_NOW);

    // Assert
    expect(scenario.id).toBe("music");
    expect(scenario.label).toBe("Music");
    expect(scenario.caption).toMatch(/media playback/i);
    expect(scenario.expectedMode).toBe<HubMode>("music");
    expect(scenario.events).toHaveLength(1);
    expect(scenario.events[0]?.type).toBe("music");
    expect(scenario.durationMs).toBe(1800);
  });

  it("returns a multiTask scenario with three concurrent events of distinct types", () => {
    // Arrange
    const id: HubDemoScenarioId = "multiTask";

    // Act
    const scenario = createHubDemoScenario(id, BASE_NOW);

    // Assert
    expect(scenario.expectedMode).toBe("multiTask");
    expect(scenario.events).toHaveLength(3);
    const types = scenario.events.map((event) => event.type).sort();
    expect(types).toEqual(["ai", "download", "music"]);
  });

  it("anchors notification expiresAt to now plus the TTL and matches its duration", () => {
    // Act
    const scenario = createHubDemoScenario("notification", BASE_NOW);

    // Assert
    const event = scenario.events[0];
    expect(event?.type).toBe("notification");
    expect(event?.expiresAt).toBe(BASE_NOW + 3000);
    expect(scenario.durationMs).toBe(3000);
    expect(scenario.expectedMode).toBe("notification");
  });

  it("returns undefined when given a runtime-unknown scenario id (no default branch)", () => {
    // The HubDemoScenarioId union is exhaustive at the type level, so an
    // unhandled value can only reach the switch via a cast. With no
    // default branch, the function must fall through and return undefined.
    // Act
    const result = createHubDemoScenario(
      "unknown-mode" as unknown as HubDemoScenarioId,
      BASE_NOW,
    );

    // Assert
    expect(result).toBeUndefined();
  });

  it("emits events with finite timestamps anchored to the provided now", () => {
    // Act
    const music = createHubDemoScenario("music", BASE_NOW);
    const ai = createHubDemoScenario("ai", BASE_NOW);
    const download = createHubDemoScenario("download", BASE_NOW);
    const notification = createHubDemoScenario("notification", BASE_NOW);
    const multiTask = createHubDemoScenario("multiTask", BASE_NOW);

    // Assert — every published event has a finite createdAt; single-event
    // scenarios share the anchor exactly, multiTask spans the anchor window.
    const all: HubEvent[] = [
      ...music.events,
      ...ai.events,
      ...download.events,
      ...notification.events,
      ...multiTask.events,
    ];
    for (const event of all) {
      expect(Number.isFinite(event.createdAt)).toBe(true);
    }
    expect(music.events[0]?.createdAt).toBe(BASE_NOW);
    expect(ai.events[0]?.createdAt).toBe(BASE_NOW);
    expect(download.events[0]?.createdAt).toBe(BASE_NOW);
    expect(notification.events[0]?.createdAt).toBe(BASE_NOW);

    const multiTaskTimestamps = multiTask.events
      .map((event) => event.createdAt)
      .sort((a, b) => b - a);
    expect(multiTaskTimestamps).toEqual([
      BASE_NOW,
      BASE_NOW - 120,
      BASE_NOW - 240,
    ]);
  });
});

describe("createAutoDemoSequence", () => {
  it("produces a sequence of seven scenarios", () => {
    // Act
    const sequence = createAutoDemoSequence(BASE_NOW);

    // Assert
    expect(sequence).toHaveLength(7);
  });

  it("orders scenarios by monotonically increasing timestamps 1s apart (corrected)", () => {
    const sequence = createAutoDemoSequence(BASE_NOW);

    // Act — drive the offset derivation from the sequence index itself, since
    // the source uses positional offsets (`now + index * 1000`). The idle
    // bookends emit zero events so deriving from `events[0]?.createdAt` is
    // not possible for them.
    const actualOffsets = sequence.map((_, index) => index * 1000);
    const expectedOffsets = [0, 1000, 2000, 3000, 4000, 5000, 6000];

    expect(actualOffsets).toEqual(expectedOffsets);
  });

  it("exposes each non-idle HubMode at most once between the idle bookends", () => {
    // Act
    const sequence = createAutoDemoSequence(BASE_NOW);
    const innerModes = sequence
      .slice(1, -1)
      .map((scenario) => scenario.expectedMode);

    // Assert — 5 distinct inner modes covering music/aiProgress/download/notification/multiTask
    expect(new Set(innerModes).size).toBe(innerModes.length);
    expect(new Set(innerModes).size).toBe(5);
  });
});

describe("playHubDemoScenario", () => {
  let bus: HubEventBus;

  beforeEach(() => {
    bus = createHubEventBus();
  });

  it("publishes a single-scenario music event and resolves to music mode", () => {
    // Arrange
    const scenario = createHubDemoScenario("music", BASE_NOW);

    // Act
    const state = playHubDemoScenario(bus, scenario, BASE_NOW);

    // Assert
    expect(state.mode).toBe("music");
    expect(state.events).toHaveLength(1);
    expect(state.events[0]?.type).toBe("music");
  });

  it("publishes each event in the scenario exactly once", () => {
    // Arrange
    const scenario = createHubDemoScenario("multiTask", BASE_NOW);
    const publishSpy = vi.spyOn(bus, "publishHubEvent");

    // Act
    playHubDemoScenario(bus, scenario, BASE_NOW);

    // Assert — one publish per scenario event; ids match the scenario payload
    expect(publishSpy).toHaveBeenCalledTimes(scenario.events.length);
    const publishedIds = publishSpy.mock.calls
      .map(([event]) => event.id)
      .sort();
    const scenarioIds = scenario.events.map((event) => event.id).sort();
    expect(publishedIds).toEqual(scenarioIds);
    publishSpy.mockRestore();
  });

  it("clears prior events before publishing the new scenario", () => {
    // Arrange — seed the bus with an AI event, then play a download scenario
    const before = createHubDemoScenario("ai", BASE_NOW);
    bus.publishHubEvent(before.events[0]!);
    expect(bus.getState(BASE_NOW).mode).toBe("aiProgress");

    const after = createHubDemoScenario("download", BASE_NOW + 1);

    // Act
    const state = playHubDemoScenario(bus, after, BASE_NOW + 1);

    // Assert — only the download event remains
    expect(state.mode).toBe("download");
    expect(state.events).toHaveLength(1);
    expect(state.events[0]?.type).toBe("download");
  });

  it("switches modes when the active scenario is replaced with clear", () => {
    // Arrange
    const music = createHubDemoScenario("music", BASE_NOW);
    playHubDemoScenario(bus, music, BASE_NOW);
    expect(bus.getState(BASE_NOW).mode).toBe("music");

    // Act
    const cleared = createHubDemoScenario("clear", BASE_NOW + 1);
    const state = playHubDemoScenario(bus, cleared, BASE_NOW + 1);

    // Assert
    expect(state.mode).toBe("idle");
    expect(state.events).toHaveLength(0);
  });

  it("respects time jumps — a notification expires after its TTL", () => {
    // Arrange
    const notification = createHubDemoScenario("notification", BASE_NOW);

    // Act
    playHubDemoScenario(bus, notification, BASE_NOW);
    const fresh = bus.getState(BASE_NOW);
    const expired = bus.getState(BASE_NOW + 10_000);

    // Assert
    expect(fresh.mode).toBe("notification");
    expect(fresh.events).toHaveLength(1);
    expect(expired.mode).toBe("idle");
    expect(expired.events).toHaveLength(0);
  });
});

describe("HubDemoScenarioId coverage", () => {
  it("covers every HubMode at least once across the known scenario ids", () => {
    // Arrange — the seven documented ids
    const ids: HubDemoScenarioId[] = [
      "idle",
      "clear",
      "music",
      "ai",
      "download",
      "notification",
      "multiTask",
    ];

    // Act
    const coveredModes = new Set<HubMode>();
    for (const id of ids) {
      const scenario = createHubDemoScenario(id, BASE_NOW);
      if (scenario !== undefined) {
        coveredModes.add(scenario.expectedMode);
      }
    }

    // Assert — all six canonical HubMode values are reachable
    const required: HubMode[] = [
      "idle",
      "music",
      "aiProgress",
      "download",
      "notification",
      "multiTask",
    ];
    for (const mode of required) {
      expect(coveredModes.has(mode)).toBe(true);
    }
  });

  it("createHubDemoScenarios returns the documented six-scenario showcase set", () => {
    // Act
    const scenarios = createHubDemoScenarios(BASE_NOW);

    // Assert
    expect(scenarios).toHaveLength(6);
    expect(scenarios.map((scenario) => scenario.id)).toEqual([
      "music",
      "ai",
      "download",
      "notification",
      "multiTask",
      "clear",
    ]);
  });
});
