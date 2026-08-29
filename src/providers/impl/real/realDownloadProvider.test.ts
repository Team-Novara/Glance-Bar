import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  REAL_DOWNLOAD_TICK_INTERVAL_MS,
  REAL_DOWNLOAD_PROGRESS_INCREMENT,
  applyDownloadControl,
  createRealDownloadProvider,
  dispatchDownloadControl,
  type DownloadProviderStatus,
} from "./realDownloadProvider";
import type { HubEvent } from "../../../types/hub";

function collectEvents(provider: ReturnType<typeof createRealDownloadProvider>): HubEvent[] {
  const events: HubEvent[] = [];
  provider.subscribe((batch) => {
    events.push(...batch);
  });
  return events;
}

describe("createRealDownloadProvider", () => {
  describe("metadata and capabilities", () => {
    it("uses the real-download-provider id and version 1.0.0", () => {
      const provider = createRealDownloadProvider();
      expect(provider.id).toBe("real-download-provider");
      expect(provider.metadata.id).toBe("real-download-provider");
      expect(provider.metadata.version).toBe("1.0.0");
      expect(provider.metadata.kind).toBe("download");
      expect(provider.metadata.mock).toBe(false);
    });

    it("advertises a single download capability with origin=real", () => {
      const provider = createRealDownloadProvider();
      expect(provider.capabilities).toHaveLength(1);
      expect(provider.capabilities[0]).toEqual({
        id: "download",
        kind: "download",
        origin: "real",
        support: "available",
      });
    });
  });

  describe("lifecycle", () => {
    it("starts Registered and transitions to Publishing on start()", () => {
      const provider = createRealDownloadProvider();
      expect(provider.status().lifecycle).toBe("Registered");
      provider.start();
      expect(provider.status().lifecycle).toBe("Publishing");
    });

    it("is idempotent: start() called twice does not start a second timer", () => {
      const provider = createRealDownloadProvider();
      const events = collectEvents(provider);
      provider.start();
      provider.start();
      expect(provider.status().lifecycle).toBe("Publishing");
      expect(events).toHaveLength(0);
    });

    it("transitions to Stopped on stop()", () => {
      const provider = createRealDownloadProvider();
      provider.start();
      provider.stop();
      expect(provider.status().lifecycle).toBe("Stopped");
    });
  });

  describe("progress simulation", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("emits a download event after one tick with progress = 5", () => {
      const provider = createRealDownloadProvider();
      const events = collectEvents(provider);
      provider.start();

      vi.advanceTimersByTime(REAL_DOWNLOAD_TICK_INTERVAL_MS);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("download");
      expect(events[0].progress).toBe(REAL_DOWNLOAD_PROGRESS_INCREMENT);
      expect(events[0].metadata?.status).toBe("downloading");
    });

    it("increments progress by 5 per tick for the first 4 ticks", () => {
      const provider = createRealDownloadProvider();
      const events = collectEvents(provider);
      provider.start();

      vi.advanceTimersByTime(REAL_DOWNLOAD_TICK_INTERVAL_MS * 4);

      expect(events).toHaveLength(4);
      expect(events.map((e) => e.progress)).toEqual([5, 10, 15, 20]);
      expect(events.every((e) => e.metadata?.status === "downloading")).toBe(true);
    });

    it("reaches 100% and switches status to completed after 20 ticks", () => {
      const provider = createRealDownloadProvider();
      const events = collectEvents(provider);
      provider.start();

      vi.advanceTimersByTime(REAL_DOWNLOAD_TICK_INTERVAL_MS * 20);

      expect(events).toHaveLength(20);
      expect(events[events.length - 1].progress).toBe(100);
      expect(events[events.length - 1].metadata?.status).toBe("completed");
    });

    it("stays at 100% on subsequent ticks (does not roll over past completion)", () => {
      const provider = createRealDownloadProvider();
      const events = collectEvents(provider);
      provider.start();

      vi.advanceTimersByTime(REAL_DOWNLOAD_TICK_INTERVAL_MS * 22);

      const last = events[events.length - 1];
      expect(last.progress).toBe(100);
      expect(last.metadata?.status).toBe("completed");
    });

    it("stop() prevents further emissions", () => {
      const provider = createRealDownloadProvider();
      const events = collectEvents(provider);
      provider.start();
      vi.advanceTimersByTime(REAL_DOWNLOAD_TICK_INTERVAL_MS * 2);
      expect(events).toHaveLength(2);

      provider.stop();
      vi.advanceTimersByTime(REAL_DOWNLOAD_TICK_INTERVAL_MS * 5);
      expect(events).toHaveLength(2);
    });
  });
});

describe("applyDownloadControl", () => {
  it("transitions downloading -> paused on pause", () => {
    const state: { status: DownloadProviderStatus } = { status: "downloading" };
    expect(applyDownloadControl(state, "pause")).toBe(true);
    expect(state.status).toBe("paused");
  });

  it("is a no-op when pausing an already paused download", () => {
    const state: { status: DownloadProviderStatus } = { status: "paused" };
    expect(applyDownloadControl(state, "pause")).toBe(false);
    expect(state.status).toBe("paused");
  });

  it("transitions paused -> downloading on resume", () => {
    const state: { status: DownloadProviderStatus } = { status: "paused" };
    expect(applyDownloadControl(state, "resume")).toBe(true);
    expect(state.status).toBe("downloading");
  });

  it("is a no-op when resuming an already downloading download", () => {
    const state: { status: DownloadProviderStatus } = { status: "downloading" };
    expect(applyDownloadControl(state, "resume")).toBe(false);
    expect(state.status).toBe("downloading");
  });

  it("transitions to cancelled on cancel from downloading or paused", () => {
    const downloading: { status: DownloadProviderStatus } = { status: "downloading" };
    expect(applyDownloadControl(downloading, "cancel")).toBe(true);
    expect(downloading.status).toBe("cancelled");

    const paused: { status: DownloadProviderStatus } = { status: "paused" };
    expect(applyDownloadControl(paused, "cancel")).toBe(true);
    expect(paused.status).toBe("cancelled");
  });

  it("is a no-op when cancelling an already cancelled or completed download", () => {
    const cancelled: { status: DownloadProviderStatus } = { status: "cancelled" };
    expect(applyDownloadControl(cancelled, "cancel")).toBe(false);

    const completed: { status: DownloadProviderStatus } = { status: "completed" };
    expect(applyDownloadControl(completed, "cancel")).toBe(false);
  });
});

describe("dispatchDownloadControl", () => {
  it("transitions state and emits when the action changes state", async () => {
    const emit = vi.fn();
    const state = { progress: 30, status: "downloading" as DownloadProviderStatus };
    const result = await dispatchDownloadControl(state, "pause", emit);
    expect(result).toBe("paused");
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it("emits a new event when the action changes state", async () => {
    const emit = vi.fn();
    const state = { progress: 30, status: "downloading" as DownloadProviderStatus };
    await dispatchDownloadControl(state, "cancel", emit);
    expect(state.status).toBe("cancelled");
    expect(emit).toHaveBeenCalledTimes(1);
  });
});
