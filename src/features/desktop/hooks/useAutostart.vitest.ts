import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const autostartMocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}));

vi.mock("@/runtime/window/autostartRuntime", () => ({
  getAutostartEnabled: autostartMocks.get,
  setAutostartEnabled: autostartMocks.set,
}));

import { useAutostart } from "./useAutostart";

describe("useAutostart", () => {
  afterEach(() => {
    autostartMocks.get.mockReset();
    autostartMocks.set.mockReset();
  });

  it("hydrates the toggle from the native shell", async () => {
    autostartMocks.get.mockResolvedValue(true);

    const { result } = renderHook(() => useAutostart());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.autostartEnabled).toBe(true);
  });

  it("does not flip the toggle when the native update fails", async () => {
    autostartMocks.get.mockResolvedValue(false);
    autostartMocks.set.mockResolvedValue(false);
    const { result } = renderHook(() => useAutostart());

    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await result.current.toggleAutostart();
    });

    expect(autostartMocks.set).toHaveBeenCalledWith(true);
    expect(result.current.autostartEnabled).toBe(false);
  });

  it("does not let a stale initial read overwrite a completed user toggle", async () => {
    let resolveInitialRead!: (value: boolean) => void;
    autostartMocks.get.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveInitialRead = resolve;
      }),
    );
    autostartMocks.set.mockResolvedValue(true);

    const { result } = renderHook(() => useAutostart());

    await act(async () => {
      await result.current.toggleAutostart();
    });
    expect(result.current.autostartEnabled).toBe(true);

    await act(async () => {
      resolveInitialRead(false);
      await Promise.resolve();
    });

    expect(result.current.autostartEnabled).toBe(true);
  });

  it("serializes rapid double-toggles and returns to the original state", async () => {
    autostartMocks.get.mockResolvedValue(false);
    let resolveFirst!: (value: boolean) => void;
    autostartMocks.set
      .mockReturnValueOnce(
        new Promise<boolean>((resolve) => {
          resolveFirst = resolve;
        }),
      )
      .mockResolvedValueOnce(true);

    const { result } = renderHook(() => useAutostart());
    await act(async () => {
      await Promise.resolve();
    });

    let firstToggle!: Promise<void>;
    let secondToggle!: Promise<void>;
    await act(async () => {
      firstToggle = result.current.toggleAutostart();
      await Promise.resolve();
      secondToggle = result.current.toggleAutostart();
      await Promise.resolve();
    });

    expect(autostartMocks.set).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst(true);
      await firstToggle;
      await secondToggle;
    });

    expect(autostartMocks.set).toHaveBeenNthCalledWith(2, false);
    expect(result.current.autostartEnabled).toBe(false);
  });
});
