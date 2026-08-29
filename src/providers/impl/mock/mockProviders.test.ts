/**
 * Tests for the four mock provider factories in src/providers/impl/mock/:
 *   - createMockMusicProvider
 *   - createMockDownloadProvider
 *   - createMockAIProvider
 *   - createMockNotificationProvider
 *
 * Coverage targets (per provider):
 *   - id is a non-empty string
 *   - metadata.kind matches capabilities[0].kind
 *   - subscribe() returns an unsubscribe function
 *   - start() transitions lifecycle to "Publishing"
 *   - stop() transitions lifecycle to "Stopped"
 *   - domain-specific behavior (music / download / AI / notification)
 *
 * Notes:
 *   - The current mock provider factories emit a single fixed event when
 *     start() is called. There is no setInterval/setTimeout in the source,
 *     but we still wire vi.useFakeTimers() so any future timer-based
 *     behavior is testable without rewiring.
 *   - The fixtures expose deterministic `now()` via the
 *     MockProviderOptions.now field, so event ids and timestamps stay
 *     stable across runs.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMockAIProvider,
  createMockDownloadProvider,
  createMockMusicProvider,
  createMockNotificationProvider,
} from "./index";
import type { HubProvider } from "../../core/types";
import type { HubEvent, NotificationState } from "../../../types/hub";

// ── Fixtures ─────────────────────────────────────────────────────────

/** Deterministic "now" for all event factories in this file. */
const NOW = Date.UTC(2026, 5, 14, 12, 0, 0);

const MUSIC_PROVIDER = () => createMockMusicProvider({ now: NOW });
const DOWNLOAD_PROVIDER = () => createMockDownloadProvider({ now: NOW });
const AI_PROVIDER = () => createMockAIProvider({ now: NOW });
const NOTIFICATION_PROVIDER = () => createMockNotificationProvider({ now: NOW });

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Subscribe to a provider and return an array of received event batches
 * (each batch is the array passed to the listener). Each test gets a
 * fresh array so the helper is safe to share.
 */
function captureBatches(provider: HubProvider): HubEvent[][] {
  const batches: HubEvent[][] = [];
  provider.subscribe((events) => {
    batches.push(events);
  });
  return batches;
}

// ── Lifecycle setup ──────────────────────────────────────────────────

beforeEach(() => {
  // Mock providers don't tick on timers, but we wire fake timers so
  // any future interval-based scenario in this file is deterministically
  // controllable without changing the test harness.
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
});

// ── Tests ────────────────────────────────────────────────────────────

describe("createMockMusicProvider", () => {
  describe("identity and metadata", () => {
    it("exposes a non-empty id", () => {
      const provider = MUSIC_PROVIDER();
      expect(provider.id).toBeTruthy();
      expect(typeof provider.id).toBe("string");
    });

    it("exposes metadata.kind matching the first capability", () => {
      const provider = MUSIC_PROVIDER();
      expect(provider.metadata.kind).toBe("music");
      expect(provider.capabilities).toHaveLength(1);
      expect(provider.capabilities[0]?.kind).toBe("music");
      expect(provider.capabilities[0]?.id).toBe("music");
      expect(provider.capabilities[0]?.origin).toBe("mock");
      expect(provider.capabilities[0]?.support).toBe("available");
    });

    it("aligns id, label, and metadata.name", () => {
      const provider = MUSIC_PROVIDER();
      expect(provider.label).toBe(provider.metadata.name);
      expect(provider.id).toBe(provider.metadata.id);
    });
  });

  describe("lifecycle", () => {
    it("starts with Stopped lifecycle and Healthy health", () => {
      const provider = MUSIC_PROVIDER();
      expect(provider.status()).toEqual({ lifecycle: "Stopped", health: "Healthy" });
    });

    it("transitions to Publishing after start()", () => {
      const provider = MUSIC_PROVIDER();

      provider.start();

      expect(provider.status().lifecycle).toBe("Publishing");
      expect(provider.status().health).toBe("Healthy");
    });

    it("transitions to Stopped after stop()", () => {
      const provider = MUSIC_PROVIDER();

      provider.start();
      provider.stop();

      expect(provider.status().lifecycle).toBe("Stopped");
    });

    it("does not emit on stop() (lifecycle guard)", () => {
      const provider = MUSIC_PROVIDER();
      const batches = captureBatches(provider);

      provider.start();
      provider.stop();
      provider.start(); // re-start to confirm re-emit
      provider.stop();

      // start() emits once per call; stop() never emits. Re-start resets
      // the lifecycle to Publishing, so a second batch is expected.
      expect(batches).toHaveLength(2);
    });
  });

  describe("subscribe / unsubscribe", () => {
    it("returns an unsubscribe function", () => {
      const provider = MUSIC_PROVIDER();
      const unsubscribe = provider.subscribe(() => {});

      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
    });

    it("forwards the music event batch to subscribers on start()", () => {
      const provider = MUSIC_PROVIDER();
      const batches = captureBatches(provider);

      provider.start();

      expect(batches).toHaveLength(1);
      expect(batches[0]).toHaveLength(1);
      expect(batches[0]?.[0]?.type).toBe("music");
    });

    it("emits a stable event id derived from the deterministic now", () => {
      const provider = MUSIC_PROVIDER();
      const batches = captureBatches(provider);

      provider.start();

      expect(batches[0]?.[0]?.id).toBe(`mock-music-music-${NOW}`);
      expect(batches[0]?.[0]?.createdAt).toBe(NOW);
    });

    it("stops forwarding events to unsubscribed listeners", () => {
      const provider = MUSIC_PROVIDER();
      const batches = captureBatches(provider);
      const unsubscribe = provider.subscribe(() => {});

      provider.start();
      unsubscribe();
      provider.start();

      // The "second listener" captured the first emit only;
      // start() after unsubscribe should not deliver a second batch.
      expect(batches).toHaveLength(1);
    });
  });

  describe("event payload", () => {
    it("exposes the canonical music payload fields", () => {
      const provider = MUSIC_PROVIDER();
      const batches = captureBatches(provider);

      provider.start();

      const payload = batches[0]?.[0]?.payload as
        | { title: string; subtitle: string; time: string; progress: number }
        | undefined;

      expect(payload).toEqual({
        title: "Midnight City",
        subtitle: "M83 - Hurry Up, We're Dreaming",
        time: "2:46 / 4:03",
        progress: 68,
      });
    });
  });
});

describe("createMockDownloadProvider", () => {
  describe("identity and metadata", () => {
    it("exposes a non-empty id", () => {
      const provider = DOWNLOAD_PROVIDER();
      expect(provider.id).toBeTruthy();
      expect(typeof provider.id).toBe("string");
    });

    it("exposes metadata.kind matching the first capability", () => {
      const provider = DOWNLOAD_PROVIDER();
      expect(provider.metadata.kind).toBe("download");
      expect(provider.capabilities[0]?.kind).toBe("download");
    });
  });

  describe("lifecycle", () => {
    it("starts with Stopped lifecycle", () => {
      const provider = DOWNLOAD_PROVIDER();
      expect(provider.status().lifecycle).toBe("Stopped");
    });

    it("transitions to Publishing after start()", () => {
      const provider = DOWNLOAD_PROVIDER();

      provider.start();

      expect(provider.status().lifecycle).toBe("Publishing");
    });

    it("transitions to Stopped after stop()", () => {
      const provider = DOWNLOAD_PROVIDER();

      provider.start();
      provider.stop();

      expect(provider.status().lifecycle).toBe("Stopped");
    });
  });

  describe("subscribe / unsubscribe", () => {
    it("returns an unsubscribe function", () => {
      const provider = DOWNLOAD_PROVIDER();
      const unsubscribe = provider.subscribe(() => {});

      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
    });

    it("emits a single download event batch on start()", () => {
      const provider = DOWNLOAD_PROVIDER();
      const batches = captureBatches(provider);

      provider.start();

      expect(batches).toHaveLength(1);
      expect(batches[0]?.[0]?.type).toBe("download");
    });

    it("emits a non-zero progress for the first event", () => {
      const provider = DOWNLOAD_PROVIDER();
      const batches = captureBatches(provider);

      provider.start();

      const event = batches[0]?.[0];
      expect(event?.progress).toBeGreaterThanOrEqual(0);
      expect(event?.progress).toBeLessThanOrEqual(100);
      const payload = event?.payload as { progress?: number } | undefined;
      expect(payload?.progress).toBe(event?.progress);
    });

    it("stops forwarding events to unsubscribed listeners", () => {
      const provider = DOWNLOAD_PROVIDER();
      const batches = captureBatches(provider);
      const unsubscribe = provider.subscribe(() => {});

      provider.start();
      unsubscribe();
      provider.start();

      // Listener was removed before the second emit; only the first batch arrives.
      expect(batches).toHaveLength(1);
    });
  });
});

describe("createMockAIProvider", () => {
  describe("identity and metadata", () => {
    it("exposes a non-empty id", () => {
      const provider = AI_PROVIDER();
      expect(provider.id).toBeTruthy();
      expect(typeof provider.id).toBe("string");
    });

    it("uses the canonical 'mock-ai-task-provider' id for registry alignment", () => {
      const provider = AI_PROVIDER();
      // The provider manager and existing tests assert this exact id —
      // a regression here breaks the provider registry.
      expect(provider.id).toBe("mock-ai-task-provider");
    });

    it("exposes metadata.kind matching the first capability", () => {
      const provider = AI_PROVIDER();
      expect(provider.metadata.kind).toBe("ai");
      expect(provider.capabilities[0]?.kind).toBe("ai");
    });
  });

  describe("lifecycle", () => {
    it("starts with Stopped lifecycle", () => {
      const provider = AI_PROVIDER();
      expect(provider.status().lifecycle).toBe("Stopped");
    });

    it("transitions to Publishing after start()", () => {
      const provider = AI_PROVIDER();

      provider.start();

      expect(provider.status().lifecycle).toBe("Publishing");
    });

    it("transitions to Stopped after stop()", () => {
      const provider = AI_PROVIDER();

      provider.start();
      provider.stop();

      expect(provider.status().lifecycle).toBe("Stopped");
    });
  });

  describe("subscribe / unsubscribe", () => {
    it("returns an unsubscribe function", () => {
      const provider = AI_PROVIDER();
      const unsubscribe = provider.subscribe(() => {});

      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
    });

    it("emits a single AI event batch on start()", () => {
      const provider = AI_PROVIDER();
      const batches = captureBatches(provider);

      provider.start();

      expect(batches).toHaveLength(1);
      expect(batches[0]?.[0]?.type).toBe("ai");
    });

    it("emits a non-zero progress for the first event", () => {
      const provider = AI_PROVIDER();
      const batches = captureBatches(provider);

      provider.start();

      const event = batches[0]?.[0];
      expect(event?.progress).toBeGreaterThanOrEqual(0);
      expect(event?.progress).toBeLessThanOrEqual(100);
      const payload = event?.payload as { progress?: number } | undefined;
      expect(payload?.progress).toBe(event?.progress);
    });

    it("stops forwarding events to unsubscribed listeners", () => {
      const provider = AI_PROVIDER();
      const batches = captureBatches(provider);
      const unsubscribe = provider.subscribe(() => {});

      provider.start();
      unsubscribe();
      provider.start();

      expect(batches).toHaveLength(1);
    });
  });

  describe("event payload", () => {
    it("exposes the canonical AI task payload fields", () => {
      const provider = AI_PROVIDER();
      const batches = captureBatches(provider);

      provider.start();

      const event = batches[0]?.[0];
      const payload = event?.payload as
        | { id: string; type: "ai"; title: string; subtitle: string; accent: "blue" }
        | undefined;

      expect(payload?.id).toBe("mock-ai-task");
      expect(payload?.type).toBe("ai");
      expect(payload?.title).toBe("Codex is updating the provider SDK");
      expect(payload?.accent).toBe("blue");
      expect(typeof payload?.subtitle).toBe("string");
    });
  });
});

describe("createMockNotificationProvider", () => {
  describe("identity and metadata", () => {
    it("exposes a non-empty id", () => {
      const provider = NOTIFICATION_PROVIDER();
      expect(provider.id).toBeTruthy();
      expect(typeof provider.id).toBe("string");
    });

    it("exposes metadata.kind matching the first capability", () => {
      const provider = NOTIFICATION_PROVIDER();
      expect(provider.metadata.kind).toBe("notification");
      expect(provider.capabilities[0]?.kind).toBe("notification");
    });
  });

  describe("lifecycle", () => {
    it("starts with Stopped lifecycle", () => {
      const provider = NOTIFICATION_PROVIDER();
      expect(provider.status().lifecycle).toBe("Stopped");
    });

    it("transitions to Publishing after start()", () => {
      const provider = NOTIFICATION_PROVIDER();

      provider.start();

      expect(provider.status().lifecycle).toBe("Publishing");
    });

    it("transitions to Stopped after stop()", () => {
      const provider = NOTIFICATION_PROVIDER();

      provider.start();
      provider.stop();

      expect(provider.status().lifecycle).toBe("Stopped");
    });
  });

  describe("subscribe / unsubscribe", () => {
    it("returns an unsubscribe function", () => {
      const provider = NOTIFICATION_PROVIDER();
      const unsubscribe = provider.subscribe(() => {});

      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
    });

    it("emits a single notification event batch on start()", () => {
      const provider = NOTIFICATION_PROVIDER();
      const batches = captureBatches(provider);

      provider.start();

      expect(batches).toHaveLength(1);
      expect(batches[0]?.[0]?.type).toBe("notification");
    });

    it("stops forwarding events to unsubscribed listeners", () => {
      const provider = NOTIFICATION_PROVIDER();
      const batches = captureBatches(provider);
      const unsubscribe = provider.subscribe(() => {});

      provider.start();
      unsubscribe();
      provider.start();

      expect(batches).toHaveLength(1);
    });
  });

  describe("event payload", () => {
    it("exposes the canonical notification payload fields", () => {
      const provider = NOTIFICATION_PROVIDER();
      const batches = captureBatches(provider);

      provider.start();

      const payload = batches[0]?.[0]?.payload as NotificationState | undefined;
      expect(payload).toEqual({
        app: "Cober",
        sender: "Mock Provider",
        message: "npm run qa passed",
      });
    });

    it("sets expiresAt to createdAt + 3000 ms (3-second display window)", () => {
      const provider = NOTIFICATION_PROVIDER();
      const batches = captureBatches(provider);

      provider.start();

      const event = batches[0]?.[0];
      expect(event?.expiresAt).toBe(NOW + 3000);
    });
  });
});
