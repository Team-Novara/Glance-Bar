import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { listenMock } = vi.hoisted(() => ({
  listenMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: listenMock,
}));

import { createRealFocusProvider } from "./realFocusProvider";
import type { HubEvent } from "@/entities";
import type { HubProvider } from "../../core/types";
import type { FocusAssistState } from "../../../runtime/system/systemMonitorRuntime";
import type { TauriInvoke } from "../../../runtime/tauri/tauriRuntime";

const PROVIDER_ID = "real-focus-provider";

function captureListen(): {
  unlisten: ReturnType<typeof vi.fn>;
  fire: (payload: unknown) => void;
} {
  const unlisten = vi.fn();
  let captured: ((event: { payload: unknown }) => void) | undefined;

  listenMock.mockImplementation(
    async (_event: string, handler: (event: { payload: unknown }) => void) => {
      captured = handler;
      return unlisten;
    },
  );

  return {
    unlisten,
    fire(payload: unknown) {
      if (!captured) {
        throw new Error("listen handler was not registered");
      }
      captured({ payload });
    },
  };
}

function pendingListen(): { reject: () => void } {
  let rejectFn: ((reason: unknown) => void) | undefined;
  listenMock.mockImplementation(
    () =>
      new Promise<() => void>((_resolve, reject) => {
        rejectFn = reject;
      }),
  );
  return {
    reject() {
      rejectFn?.(new Error("listen failed"));
    },
  };
}

function stubTauriFocus(invoke: TauriInvoke | undefined): void {
  const globalRecord = globalThis as Record<string, unknown>;
  if (invoke) {
    globalRecord.__TAURI__ = { core: { invoke } };
  } else {
    delete globalRecord.__TAURI__;
  }
}

function makeFocusInvoke(state: unknown): TauriInvoke {
  return async (command: string) => {
    if (command !== "get_focus_assist_state") {
      throw new Error(`unexpected command: ${command}`);
    }
    return state;
  };
}

function makeFocusState(overrides: Partial<FocusAssistState> = {}): FocusAssistState {
  return {
    active: true,
    profile: "priority-only",
    code: "available",
    controllable: true,
    checkedAt: 1_780_743_600_000,
    ...overrides,
  };
}

async function flushMicrotasks(times = 4): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve();
  }
}

function collectEvents(provider: HubProvider): HubEvent[] {
  const events: HubEvent[] = [];
  provider.subscribe((batch) => events.push(...batch));
  return events;
}

describe("createRealFocusProvider", () => {
  beforeEach(() => {
    listenMock.mockReset();
    vi.stubGlobal("navigator", { platform: "Win32" });
    stubTauriFocus(makeFocusInvoke(undefined));
  });

  afterEach(() => {
    stubTauriFocus(undefined);
    vi.unstubAllGlobals();
  });

  describe("metadata and capabilities", () => {
    it("identifies itself as the real Focus Assist provider", () => {
      const provider = createRealFocusProvider();

      expect(provider.id).toBe(PROVIDER_ID);
      expect(provider.metadata).toMatchObject({
        id: PROVIDER_ID,
        name: "Focus Assist Provider",
        kind: "focus",
        version: "1.0.0",
        mock: false,
      });
      expect(provider.capabilities).toEqual([
        { id: "focus", kind: "focus", origin: "real", support: "available" },
      ]);
    });
  });

  describe("initial observation", () => {
    it("emits capability facts and a stable event id from the initial native state", async () => {
      captureListen();
      stubTauriFocus(makeFocusInvoke(makeFocusState()));
      const provider = createRealFocusProvider();
      const events = collectEvents(provider);

      provider.start();
      await flushMicrotasks();

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        id: `${PROVIDER_ID}-focus-observation`,
        type: "focus",
        source: "focus",
        origin: "system",
        createdAt: 1_780_743_600_000,
        payload: {
          active: true,
          profile: "priority-only",
          code: "available",
          controllable: true,
          checkedAt: 1_780_743_600_000,
        },
        metadata: {
          code: "available",
          controllable: true,
          checkedAt: 1_780_743_600_000,
        },
      });
      expect(events[0]?.expiresAt).toBeUndefined();
    });

    it("advertises unsupported and does not invent a focus event when the native boundary is unavailable", async () => {
      stubTauriFocus(undefined);
      const provider = createRealFocusProvider();
      const events = collectEvents(provider);

      provider.start();
      await flushMicrotasks();

      expect(events).toHaveLength(0);
      expect(provider.capabilities[0]?.support).toBe("unsupported");
      expect(listenMock).not.toHaveBeenCalled();
      expect(provider.status().health).toBe("Healthy");
    });

    it("does not let a delayed initial snapshot overwrite a newer event", async () => {
      const { fire } = captureListen();
      let resolveInitial!: (value: unknown) => void;
      stubTauriFocus(
        makeFocusInvoke(
          new Promise((resolve) => {
            resolveInitial = resolve;
          }),
        ),
      );
      const provider = createRealFocusProvider();
      const events = collectEvents(provider);
      provider.start();
      await flushMicrotasks();

      fire({
        active: true,
        profile: "alarms-only",
        code: "available",
        controllable: true,
        checkedAt: 1_780_743_600_100,
      });
      resolveInitial(makeFocusState());
      await flushMicrotasks();

      expect(events).toHaveLength(1);
      expect(events[0]?.payload).toMatchObject({ profile: "alarms-only" });
    });

    it("marks native read errors degraded without presenting a fake completion", async () => {
      captureListen();
      stubTauriFocus(
        makeFocusInvoke({
          active: false,
          profile: "",
          code: "error",
          controllable: false,
          checkedAt: 1_780_743_600_000,
        }),
      );
      const provider = createRealFocusProvider();
      const events = collectEvents(provider);

      provider.start();
      await flushMicrotasks();

      expect(events).toHaveLength(0);
      expect(provider.status().health).toBe("Degraded");
    });
  });

  describe("listener lifecycle", () => {
    it("is idempotent and transitions to Publishing", async () => {
      captureListen();
      const provider = createRealFocusProvider();

      provider.start();
      provider.start();
      await flushMicrotasks();

      expect(listenMock).toHaveBeenCalledTimes(1);
      expect(provider.status().lifecycle).toBe("Publishing");
    });

    it("stops and gates subsequent native events", async () => {
      const { fire, unlisten } = captureListen();
      const provider = createRealFocusProvider();
      const events = collectEvents(provider);

      provider.start();
      await flushMicrotasks();
      provider.stop();
      fire(makeFocusState({ checkedAt: 1_780_743_600_100 }));

      expect(provider.status().lifecycle).toBe("Stopped");
      expect(unlisten).toHaveBeenCalledTimes(1);
      expect(events).toHaveLength(0);
    });

    it("unlistens when registration resolves after stop", async () => {
      let resolveListen!: (unlisten: () => void) => void;
      const lateUnlisten = vi.fn();
      listenMock.mockImplementation(
        () =>
          new Promise<() => void>((resolve) => {
            resolveListen = resolve;
          }),
      );
      const provider = createRealFocusProvider();

      provider.start();
      provider.stop();
      resolveListen(lateUnlisten);
      await flushMicrotasks();

      expect(lateUnlisten).toHaveBeenCalledTimes(1);
    });
  });

  describe("event mapping and health", () => {
    it("maps an active-to-inactive transition to a bounded completion event", async () => {
      const { fire } = captureListen();
      const provider = createRealFocusProvider();
      const events = collectEvents(provider);
      provider.start();
      await flushMicrotasks();

      fire(makeFocusState({ checkedAt: 1_780_743_600_000 }));
      fire({
        active: false,
        profile: "off",
        code: "available",
        controllable: true,
        checkedAt: 1_780_743_600_000,
      });

      expect(events).toHaveLength(2);
      expect(events[1]?.expiresAt).toBe(1_780_743_608_000);
      expect(events[1]?.metadata).toMatchObject({ code: "available", controllable: true });
    });

    it("does not invent a completion event for an inactive session never observed active", async () => {
      const { fire } = captureListen();
      const provider = createRealFocusProvider();
      const events = collectEvents(provider);
      provider.start();
      await flushMicrotasks();

      fire({
        active: false,
        profile: "off",
        code: "available",
        controllable: true,
        checkedAt: 1_780_743_600_000,
      });

      expect(events).toHaveLength(0);
    });

    it("marks the provider degraded when native listener registration fails", async () => {
      const { reject } = pendingListen();
      const provider = createRealFocusProvider();

      provider.start();
      reject();
      await flushMicrotasks();

      expect(provider.status().health).toBe("Degraded");
      expect(provider.status().lifecycle).toBe("Publishing");
    });
  });
});
