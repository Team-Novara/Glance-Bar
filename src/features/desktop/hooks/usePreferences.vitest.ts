import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const preferenceMocks = vi.hoisted(() => ({
  getInvoke: vi.fn(),
  listenSettings: vi.fn(),
}));

vi.mock("@/runtime/tauri/tauriRuntime", () => ({
  getTauriInvoke: preferenceMocks.getInvoke,
}));

vi.mock("@/runtime/tauri/desktopProductRuntime", () => ({
  parseStatusCenterSettingsPayload: (value: unknown) => value,
  listenStatusCenterSettings: preferenceMocks.listenSettings,
}));

import { usePreferences } from "./usePreferences";

const nativePreferences = {
  preferences: {
    alwaysFloat: true,
    avoidFullscreen: true,
    lockPosition: false,
  },
};

describe("usePreferences", () => {
  afterEach(() => {
    preferenceMocks.getInvoke.mockReset();
    preferenceMocks.listenSettings.mockReset();
  });

  it("uses browser defaults when the Tauri boundary is unavailable", () => {
    preferenceMocks.getInvoke.mockReturnValue(undefined);

    const { result } = renderHook(() => usePreferences());

    expect(result.current.preferences).toEqual({
      alwaysFloat: true,
      avoidFullscreen: true,
      lockPosition: false,
    });
  });

  it("hydrates settings and subscribes to native preference changes", async () => {
    const nativeInvoke = vi.fn().mockResolvedValue(nativePreferences);
    preferenceMocks.getInvoke.mockReturnValue(nativeInvoke);
    const unlisten = vi.fn();
    preferenceMocks.listenSettings.mockResolvedValue(unlisten);

    const { result } = renderHook(() => usePreferences());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.preferences).toEqual(nativePreferences.preferences);
    expect(nativeInvoke).toHaveBeenCalledWith("get_status_center_settings");
    expect(preferenceMocks.listenSettings).toHaveBeenCalledOnce();
  });

  it("keeps the preference listener alive when the initial native read fails", async () => {
    const nativeInvoke = vi.fn().mockRejectedValue(new Error("settings read failed"));
    preferenceMocks.getInvoke.mockReturnValue(nativeInvoke);
    let onSettings!: (payload: typeof nativePreferences, event: unknown) => void;
    const unlisten = vi.fn();
    preferenceMocks.listenSettings.mockImplementation(async (handler) => {
      onSettings = handler;
      return unlisten;
    });

    const { result, unmount } = renderHook(() => usePreferences());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(preferenceMocks.listenSettings).toHaveBeenCalledOnce();
    await act(async () => {
      onSettings(
        {
          preferences: {
            alwaysFloat: false,
            avoidFullscreen: true,
            lockPosition: true,
          },
        },
        {},
      );
      await Promise.resolve();
    });

    expect(result.current.preferences).toEqual({
      alwaysFloat: false,
      avoidFullscreen: true,
      lockPosition: true,
    });
    unmount();
    expect(unlisten).toHaveBeenCalledOnce();
  });

  it("sends a merged preference payload and keeps the local change", async () => {
    const nativeInvoke = vi.fn().mockResolvedValue(undefined);
    nativeInvoke.mockImplementation(async (command: string) => {
      if (command === "get_status_center_settings") {
        return nativePreferences;
      }

      return undefined;
    });
    preferenceMocks.getInvoke.mockReturnValue(nativeInvoke);
    preferenceMocks.listenSettings.mockResolvedValue(vi.fn());

    const { result } = renderHook(() => usePreferences());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(result.current.preferences).toEqual(nativePreferences.preferences);
    });

    await act(async () => {
      await result.current.updatePreferences({ lockPosition: true });
    });

    expect(result.current.preferences).toEqual({
      alwaysFloat: true,
      avoidFullscreen: true,
      lockPosition: true,
    });
    expect(nativeInvoke).toHaveBeenCalledWith("set_status_center_preferences", {
      preferences: {
        alwaysFloat: true,
        avoidFullscreen: true,
        lockPosition: true,
      },
    });
  });

  it("does not let a stale initial read overwrite a completed preference change", async () => {
    let resolveInitialRead!: (value: typeof nativePreferences) => void;
    const nativeInvoke = vi.fn((command: string) => {
      if (command === "get_status_center_settings") {
        return new Promise<typeof nativePreferences>((resolve) => {
          resolveInitialRead = resolve;
        });
      }

      return Promise.resolve(undefined);
    });
    preferenceMocks.getInvoke.mockReturnValue(nativeInvoke);
    preferenceMocks.listenSettings.mockResolvedValue(vi.fn());

    const { result } = renderHook(() => usePreferences());

    await act(async () => {
      await result.current.updatePreferences({ alwaysFloat: false });
    });
    expect(result.current.preferences.alwaysFloat).toBe(false);

    await act(async () => {
      resolveInitialRead(nativePreferences);
      await Promise.resolve();
    });

    expect(result.current.preferences.alwaysFloat).toBe(false);
  });

  it("merges rapid patches from the latest preference ref", async () => {
    const nativeInvoke = vi.fn().mockImplementation(async (command: string) => {
      if (command === "get_status_center_settings") {
        return nativePreferences;
      }

      return undefined;
    });
    preferenceMocks.getInvoke.mockReturnValue(nativeInvoke);
    preferenceMocks.listenSettings.mockResolvedValue(vi.fn());

    const { result } = renderHook(() => usePreferences());
    await waitFor(() => {
      expect(result.current.preferences).toEqual(nativePreferences.preferences);
    });

    await act(async () => {
      await Promise.all([
        result.current.updatePreferences({ alwaysFloat: false }),
        result.current.updatePreferences({ lockPosition: true }),
      ]);
    });

    expect(result.current.preferences).toEqual({
      alwaysFloat: false,
      avoidFullscreen: true,
      lockPosition: true,
    });
    expect(nativeInvoke).toHaveBeenNthCalledWith(2, "set_status_center_preferences", {
      preferences: {
        alwaysFloat: false,
        avoidFullscreen: true,
        lockPosition: false,
      },
    });
    expect(nativeInvoke).toHaveBeenNthCalledWith(3, "set_status_center_preferences", {
      preferences: {
        alwaysFloat: false,
        avoidFullscreen: true,
        lockPosition: true,
      },
    });
  });
});
