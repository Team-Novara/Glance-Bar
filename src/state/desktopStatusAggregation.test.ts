import { strict as assert } from "node:assert";
import i18n from "../i18n";
import {
  createMockAiTaskEvent,
  createMockDownloadEvent,
  createMockMusicEvent,
  createMockNotificationEvent,
} from "../providers";
import { aggregateDesktopStatusInput } from "./desktopStatusAggregation";

import { describe, it } from "vitest";
describe("desktopStatusAggregation.test", () => {
  it("runs the file's top-level asserts", () => {});
  const now = Date.UTC(2026, 5, 9, 12, 0, 0);

  test("desktop status aggregation safely returns no active kinds without upstream input", () => {
    const result = aggregateDesktopStatusInput();

    assert.deepEqual(result.activeKinds, []);
    assert.equal(result.states, undefined);
    assert.equal(result.availableKinds, undefined);
  });

  test("desktop status aggregation maps mock music input into media state", () => {
    const result = aggregateDesktopStatusInput({
      events: [createMockMusicEvent({ now })],
      now,
    });

    assert.deepEqual(result.activeKinds, ["media"]);
    assert.equal(result.states?.media?.kind, "media");
    assert.equal(result.states?.media?.title, "Midnight City");
    assert.equal(result.states?.media?.subtitle, i18n.t("aggregation.nowPlaying"));
    assert.equal(result.states?.media?.artist, "M83 - Hurry Up, We're Dreaming");
  });

  test("desktop status aggregation maps mock download input into download state", () => {
    const result = aggregateDesktopStatusInput({
      events: [createMockDownloadEvent({ now })],
      now,
    });

    assert.deepEqual(result.activeKinds, ["download"]);
    assert.equal(result.states?.download?.kind, "download");
    assert.equal(result.states?.download?.title, "Windows SDK Preview.zip");
    assert.equal(result.states?.download?.subtitle, i18n.t("aggregation.downloadTask"));
    assert.equal(result.states?.download?.detail, "42.8 MB of 96 MB");
  });

  test("desktop status aggregation preserves real download observation facts", () => {
    const result = aggregateDesktopStatusInput({
      events: [
        {
          id: "real-download",
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
          metadata: {
            status: "active",
            progressAccuracy: "none",
            controllable: false,
            code: "available",
            activeDownloads: 1,
          },
        },
      ],
      now,
    });

    assert.equal(result.states?.download?.source, "system");
    assert.equal(result.states?.download?.progressAccuracy, "none");
    assert.equal(result.states?.download?.controllable, false);
    assert.equal(result.states?.download?.sourceHealth?.quality, "native");
    assert.equal(result.states?.download?.sourceHealth?.safeToDisplay, true);
  });

  test("desktop status aggregation marks a native media timeline as indeterminate", () => {
    const result = aggregateDesktopStatusInput({
      events: [
        {
          id: "real-media-no-timeline",
          type: "media",
          source: "media",
          createdAt: now,
          payload: {
            available: true,
            playbackStatus: "playing",
            progress: 0,
          },
          metadata: {
            code: "no-timeline",
          },
        },
      ],
      now,
    });

    assert.equal(result.states?.media?.progressAccuracy, "none");
    assert.equal(result.states?.media?.sourceHealth?.quality, "native");
    assert.equal(result.states?.media?.sourceHealth?.safeToDisplay, true);
  });

  test("desktop status aggregation maps mock ai task input into update state", () => {
    const result = aggregateDesktopStatusInput({
      events: [createMockAiTaskEvent({ now })],
      now,
    });

    assert.deepEqual(result.activeKinds, ["update"]);
    assert.equal(result.states?.update?.kind, "update");
    assert.equal(result.states?.update?.title, "Codex is updating the provider SDK");
    assert.equal(result.states?.update?.subtitle, i18n.t("aggregation.inProgress"));
  });

  test("desktop status aggregation keeps multiple active kinds without doing priority resolution", () => {
    const result = aggregateDesktopStatusInput({
      events: [
        createMockMusicEvent({ now }),
        createMockDownloadEvent({ now }),
        createMockAiTaskEvent({ now }),
        createMockNotificationEvent({ now }),
      ],
      now,
    });

    assert.deepEqual(result.activeKinds, ["media", "download", "update", "notification"]);
    assert.equal(result.states?.media?.kind, "media");
    assert.equal(result.states?.download?.kind, "download");
    assert.equal(result.states?.update?.kind, "update");
    assert.equal(result.states?.notification?.kind, "notification");
    assert.equal(result.states?.notification?.subtitle, i18n.t("aggregation.recentMessage"));
  });

  test("desktop status aggregation preserves caller-provided available kinds as scheduler input", () => {
    const result = aggregateDesktopStatusInput({
      events: [createMockMusicEvent({ now })],
      now,
      availableKinds: ["resident", "media", "resident", "focus"],
    });

    assert.deepEqual(result.availableKinds, ["resident", "media", "focus"]);
  });
});
