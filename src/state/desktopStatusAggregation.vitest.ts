import { describe, it, expect } from "vitest";
import { aggregateDesktopStatusInput } from "./desktopStatusAggregation";
import type { HubEvent, HubStoreState, SystemPerformancePayload } from "@/entities";
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

  // ── System focus-notification fallback ──────────────────────────────
  // The aggregation also derives focus state from legacy system events that
  // carry `metadata.focus === true` (see deriveStateOverrides/deriveActiveKinds).

  it("activates the focus kind from a system focus-notification event when no provider focus state exists", () => {
    const result = aggregateDesktopStatusInput({
      events: [
        {
          id: "system-focus-notification",
          type: "system",
          source: "system",
          createdAt: now,
          metadata: { focus: true, label: "Priority only", detail: "Notifications hidden" },
        },
      ],
      now,
    });

    expect(result.activeKinds).toEqual(["focus"]);
    expect(result.states?.focus?.kind).toBe("focus");
    expect(result.states?.focus?.title).toBe("Focus Mode");
    expect(result.states?.focus?.sessionLabel).toBe("Priority only");
    expect(result.states?.focus?.detail).toBe("Notifications hidden");
    expect(result.states?.focus?.accent).toBe("pink");
  });

  it("falls back to the default focus copy when the system focus event carries no label or detail", () => {
    const result = aggregateDesktopStatusInput({
      events: [
        {
          id: "system-focus-notification-bare",
          type: "system",
          source: "system",
          createdAt: now,
          metadata: { focus: true },
        },
      ],
      now,
    });

    expect(result.states?.focus?.sessionLabel).toBe("Focus mode enabled");
    expect(result.states?.focus?.detail).toBe("Do not disturb");
  });

  it("prefers provider-derived focus state over a system focus-notification fallback", () => {
    const realFocusEvent: HubEvent = {
      id: "real-focus",
      type: "focus",
      source: "focus",
      origin: "system",
      createdAt: now,
      payload: {
        active: true,
        profile: "Microsoft.Windows.Focus_priority-only",
        code: "available",
        controllable: true,
        checkedAt: now,
      },
    };
    const systemFocusEvent: HubEvent = {
      id: "system-focus-notification",
      type: "system",
      source: "system",
      createdAt: now,
      metadata: { focus: true, label: "Legacy label", detail: "Legacy detail" },
    };

    const result = aggregateDesktopStatusInput({
      events: [systemFocusEvent, realFocusEvent],
      now,
    });

    // The real provider observation wins: it carries source health and the
    // provider-derived session label, not the legacy notification copy.
    expect(result.activeKinds).toEqual(["focus"]);
    expect(result.states?.focus?.sessionLabel).toBe("priority-only mode enabled");
    expect(result.states?.focus?.sourceHealth?.quality).toBe("native");
  });

  // ── Real media payload branches ─────────────────────────────────────

  it("maps a paused available media session to the paused fallback copy", () => {
    const result = aggregateDesktopStatusInput({
      events: [
        {
          id: "real-media-paused",
          type: "media",
          source: "media",
          createdAt: now,
          payload: {
            available: true,
            playbackStatus: "paused",
            progress: 40,
          },
          metadata: { code: "available" },
        },
      ],
      now,
    });

    expect(result.states?.media?.title).toBe("Media");
    expect(result.states?.media?.subtitle).toBe("Paused");
    expect(result.states?.media?.sourceHealth?.code).toBe("available");
    expect(result.states?.media?.sourceHealth?.quality).toBe("native");
    expect(result.states?.media?.sourceHealth?.safeToDisplay).toBe(true);
  });

  it("marks an unsupported media session as unavailable and keeps the metadata time label", () => {
    const result = aggregateDesktopStatusInput({
      events: [
        {
          id: "real-media-unsupported",
          type: "media",
          source: "media",
          createdAt: now,
          payload: {
            available: true,
            playbackStatus: "paused",
            progress: 0,
          },
          metadata: { code: "unsupported", timeLabel: "1:02 / 3:28" },
        },
      ],
      now,
    });

    expect(result.states?.media?.timeLabel).toBe("1:02 / 3:28");
    expect(result.states?.media?.sourceHealth?.code).toBe("unsupported");
    expect(result.states?.media?.sourceHealth?.quality).toBe("unavailable");
    expect(result.states?.media?.sourceHealth?.safeToDisplay).toBe(false);
  });

  // ── Clipboard preview branches ──────────────────────────────────────

  it("truncates long clipboard text and falls back to the notification center detail", () => {
    const longText = "a".repeat(120);
    const result = aggregateDesktopStatusInput({
      events: [
        {
          id: "real-clipboard",
          type: "clipboard",
          source: "clipboard",
          origin: "system",
          createdAt: now,
          payload: {
            text: longText,
            sourceApp: "",
            copiedAt: now,
          },
        },
      ],
      now,
    });

    expect(result.activeKinds).toContain("clipboard");
    expect(result.states?.clipboard?.copiedText).toBe(`${"a".repeat(80)}…`);
    expect(result.states?.clipboard?.detail).toBe("Notification Center");
  });

  it("keeps short clipboard text untruncated with the source app as detail", () => {
    const result = aggregateDesktopStatusInput({
      events: [
        {
          id: "real-clipboard-short",
          type: "clipboard",
          source: "clipboard",
          origin: "system",
          createdAt: now,
          payload: {
            text: "npm run test",
            sourceApp: "Terminal",
            copiedAt: now,
          },
        },
      ],
      now,
    });

    expect(result.states?.clipboard?.copiedText).toBe("npm run test");
    expect(result.states?.clipboard?.detail).toBe("Terminal");
  });

  // ── Resident quality passthrough branches ───────────────────────────

  it("keeps live, fallback, and unavailable resident quality values attached to their metrics", () => {
    for (const quality of ["live", "fallback", "unavailable"] as const) {
      const result = aggregateDesktopStatusInput({
        events: [
          {
            id: `real-system-${quality}`,
            type: "system",
            source: "system",
            origin: "system",
            createdAt: now,
            payload: {
              cpu: 11,
              memory: 22,
              downloadSpeed: 33,
              uploadSpeed: 44,
              quality,
              checkedAt: now,
            },
          },
        ],
        now,
      });

      expect(result.states?.resident?.sourceStatus?.quality).toBe(quality);
    }
  });

  it("maps an out-of-vocabulary resident quality to unavailable instead of trusting it", () => {
    // IPC boundaries deliver untyped records; the aggregation must not pass
    // an unrecognized quality through to the resident badge.
    const malformedHubState: HubStoreState = {
      events: [],
      mode: "idle",
      tasks: [],
      systemPerformance: {
        cpu: 1,
        memory: 2,
        downloadSpeed: 3,
        uploadSpeed: 4,
        quality: "totally-bogus" as SystemPerformancePayload["quality"],
        checkedAt: now,
      },
    };

    const result = aggregateDesktopStatusInput({ hubState: malformedHubState, now });

    expect(result.states?.resident?.sourceStatus?.quality).toBe("unavailable");
  });

  // ── Real download metadata branches ─────────────────────────────────

  it("maps real download failure codes onto the shared provider health vocabulary", () => {
    const cases: Array<{
      code: string;
      expectedCode: "permission-denied" | "unsupported" | "provider-failed";
    }> = [
      { code: "permission-denied", expectedCode: "permission-denied" },
      { code: "unsupported", expectedCode: "unsupported" },
      { code: "error", expectedCode: "provider-failed" },
    ];

    for (const { code, expectedCode } of cases) {
      const result = aggregateDesktopStatusInput({
        events: [
          {
            id: `real-download-${code}`,
            type: "download",
            source: "download",
            createdAt: now,
            payload: {
              id: "real-download-task",
              type: "download",
              title: "Downloading",
              subtitle: "In progress",
              accent: "green",
            },
            metadata: { code, checkedAt: now },
          },
        ],
        now,
      });

      expect(result.states?.download?.sourceHealth?.quality).toBe("unavailable");
      expect(result.states?.download?.sourceHealth?.code).toBe(expectedCode);
      expect(result.states?.download?.sourceHealth?.safeToDisplay).toBe(false);
      expect(result.states?.download?.sourceHealth?.lastCheckedAt).toBe(now);
    }
  });

  it("derives mock download state without system source health when the event is mock-originated", () => {
    const result = aggregateDesktopStatusInput({
      events: [
        {
          id: "mock-download-bare",
          type: "download",
          source: "mock",
          origin: "mock",
          createdAt: now,
          progress: 12,
          payload: {
            id: "mock-download-task",
            type: "download",
            title: "Windows SDK Preview.zip",
            subtitle: "",
            accent: "green",
          },
        },
      ],
      now,
    });

    expect(result.states?.download?.source).toBe("mock");
    expect(result.states?.download?.status).toBeUndefined();
    expect(result.states?.download?.progressAccuracy).toBeUndefined();
    expect(result.states?.download?.controllable).toBeUndefined();
    expect(result.states?.download?.observationCode).toBeUndefined();
    expect(result.states?.download?.sourceHealth).toBeUndefined();
    expect(result.states?.download?.detail).toBe("Transferring");
  });

  // ── AI task / developer payload fallback branches ───────────────────

  it("falls back to the processing copy for an ai task without a subtitle", () => {
    const result = aggregateDesktopStatusInput({
      events: [
        {
          id: "mock-ai-bare",
          type: "ai",
          source: "mock",
          origin: "mock",
          createdAt: now,
          progress: 10,
          payload: {
            id: "mock-ai-task",
            type: "ai",
            title: "Codex is updating the provider SDK",
            subtitle: "",
            progress: 10,
            accent: "blue",
          },
        },
      ],
      now,
    });

    expect(result.states?.update?.detail).toBe("System task processing");
  });

  it("falls back to the developer card copy when an available event payload is skeletal", () => {
    const result = aggregateDesktopStatusInput({
      events: [
        makeDeveloperEvent("available", {
          payload: {
            id: "npm-status",
            type: "ai",
            title: "",
            subtitle: "",
            accent: "pink",
          },
        }),
      ],
      now,
    });

    expect(result.activeKinds).toContain("developer");
    expect(result.states?.developer?.title).toBe("Developer");
    expect(result.states?.developer?.detail).toBe("No active developer task detected");
    expect(result.states?.developer?.progress).toBeUndefined();
    expect(result.states?.developer?.sourceHealth?.quality).toBe("native");
  });

  // ── Notification payload fallback branches ──────────────────────────

  it("maps a notification event without a message payload onto the fallback copy", () => {
    const result = aggregateDesktopStatusInput({
      events: [
        {
          id: "mock-notification-bare",
          type: "notification",
          source: "notification",
          origin: "mock",
          createdAt: now,
          // A task-shaped payload without a `message` key: the notification
          // mapper must discard it and use the default notification copy.
          payload: {
            id: "unrelated-task",
            type: "download",
            title: "Not a notification",
            subtitle: "",
            accent: "green",
          },
        },
      ],
      now,
    });

    expect(result.activeKinds).toContain("notification");
    expect(result.states?.notification?.title).toBe("Desktop Notification");
    expect(result.states?.notification?.app).toBe("Notification Center");
    expect(result.states?.notification?.sender).toBe("System Status");
    expect(result.states?.notification?.message).toBe("New notification received");
  });
});
