import { describe, it, expect } from "vitest";
import { aggregateDesktopStatusInput } from "./desktopStatusAggregation";
import {
  createMockAiTaskEvent,
  createMockDownloadEvent,
  createMockMusicEvent,
  createMockNotificationEvent,
} from "../providers";

const now = Date.UTC(2026, 5, 9, 12, 0, 0);

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
});
