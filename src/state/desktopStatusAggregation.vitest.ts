import { describe, it, expect } from "vitest";
import { aggregateDesktopStatusInput } from "./desktopStatusAggregation";
import type { HubEvent } from "@/entities";
import {
  createMockAiTaskEvent,
  createMockDownloadEvent,
  createMockMusicEvent,
  createMockNotificationEvent,
} from "../providers";

const now = Date.UTC(2026, 5, 9, 12, 0, 0);

function makeDeveloperEvent(code: string, overrides: Partial<HubEvent> = {}): HubEvent {
  return {
    id: `developer-event-${code}`,
    type: "ai",
    source: "npm",
    createdAt: now,
    payload: {
      id: "npm-status",
      type: "ai",
      title: "npm scripts",
      subtitle: "1 running",
      progress: 100,
      accent: "pink",
    },
    metadata: { code },
    ...overrides,
  };
}

describe("aggregateDesktopStatusInput", () => {
  it("returns no active kinds without upstream input", () => {
    const result = aggregateDesktopStatusInput();

    expect(result.activeKinds).toEqual([]);
    expect(result.states).toBeUndefined();
    expect(result.availableKinds).toBeUndefined();
  });

  it("maps mock music input into media state", () => {
    const result = aggregateDesktopStatusInput({
      events: [createMockMusicEvent({ now })],
      now,
    });

    expect(result.activeKinds).toEqual(["media"]);
    expect(result.states?.media?.kind).toBe("media");
    expect(result.states?.media?.title).toBe("Midnight City");
    expect(result.states?.media?.artist).toBe("M83 - Hurry Up, We're Dreaming");
  });

  it("maps mock download input into download state", () => {
    const result = aggregateDesktopStatusInput({
      events: [createMockDownloadEvent({ now })],
      now,
    });

    expect(result.activeKinds).toEqual(["download"]);
    expect(result.states?.download?.kind).toBe("download");
    expect(result.states?.download?.title).toBe("Windows SDK Preview.zip");
    expect(result.states?.download?.detail).toBe("42.8 MB of 96 MB");
  });

  it("maps mock ai task input into update state", () => {
    const result = aggregateDesktopStatusInput({
      events: [createMockAiTaskEvent({ now })],
      now,
    });

    expect(result.activeKinds).toEqual(["update"]);
    expect(result.states?.update?.kind).toBe("update");
    expect(result.states?.update?.title).toBe("Codex is updating the provider SDK");
  });

  it("keeps multiple active kinds without doing priority resolution", () => {
    const result = aggregateDesktopStatusInput({
      events: [
        createMockMusicEvent({ now }),
        createMockDownloadEvent({ now }),
        createMockAiTaskEvent({ now }),
        createMockNotificationEvent({ now }),
      ],
      now,
    });

    expect(result.activeKinds).toEqual(["media", "download", "update", "notification"]);
    expect(result.states?.media?.kind).toBe("media");
    expect(result.states?.download?.kind).toBe("download");
    expect(result.states?.update?.kind).toBe("update");
    expect(result.states?.notification?.kind).toBe("notification");
  });

  it("preserves caller-provided available kinds (deduplicated)", () => {
    const result = aggregateDesktopStatusInput({
      events: [createMockMusicEvent({ now })],
      now,
      availableKinds: ["resident", "media", "resident", "focus"],
    });

    expect(result.availableKinds).toEqual(["resident", "media", "focus"]);
  });

  it("merges external active kinds into the result", () => {
    const result = aggregateDesktopStatusInput({
      events: [createMockMusicEvent({ now })],
      now,
      externalActiveKinds: ["focus"],
    });

    expect(result.activeKinds).toContain("media");
    expect(result.activeKinds).toContain("focus");
  });

  it("merges external states into the result", () => {
    const focusState = {
      kind: "focus" as const,
      title: "Focus Assist",
      subtitle: "Active",
      source: "system" as const,
      sessionLabel: "Priority only",
      detail: "Do not disturb",
      accent: "pink" as const,
    };

    const result = aggregateDesktopStatusInput({
      events: [],
      now,
      externalStates: { focus: focusState },
    });

    expect(result.states?.focus).toBeDefined();
    expect(result.states?.focus?.title).toBe("Focus Assist");
  });

  it("derives developer state only from an event that reports an available source", () => {
    const result = aggregateDesktopStatusInput({
      events: [makeDeveloperEvent("available")],
      now,
    });

    expect(result.activeKinds).toContain("developer");
    expect(result.states?.developer?.kind).toBe("developer");
    expect(result.states?.developer?.title).toBe("npm scripts");
    expect(result.states?.developer?.sourceHealth?.quality).toBe("native");
    expect(result.states?.developer?.sourceHealth?.code).toBe("available");
    expect(result.states?.developer?.sourceHealth?.safeToDisplay).toBe(true);
  });

  it("does not activate the developer kind for a not-implemented developer event", () => {
    const result = aggregateDesktopStatusInput({
      events: [makeDeveloperEvent("not-implemented")],
      now,
    });

    // The developer card must not render fabricated state: no developer
    // state is derived and the kind stays inactive. (The event still flows
    // through the generic ai-task path as an "update", which is the mock
    // AI provider's surface — unrelated to the developer card.)
    expect(result.activeKinds).not.toContain("developer");
    expect(result.states?.developer).toBeUndefined();
  });

  it("does not activate the developer kind for a developer event with an unrecognized code", () => {
    const result = aggregateDesktopStatusInput({
      events: [makeDeveloperEvent("some-unexpected-code")],
      now,
    });

    expect(result.states?.developer).toBeUndefined();
    expect(result.activeKinds).not.toContain("developer");
  });
});
