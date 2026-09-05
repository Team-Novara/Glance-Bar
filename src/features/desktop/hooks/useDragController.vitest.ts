import { act, renderHook } from "@testing-library/react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const dragMocks = vi.hoisted(() => ({
  getInvoke: vi.fn(),
  persistPosition: vi.fn(),
}));

vi.mock("@/runtime/tauri/tauriRuntime", () => ({
  getTauriInvoke: dragMocks.getInvoke,
}));

vi.mock("@/runtime/window/statusWindowRuntime", () => ({
  persistStatusWindowPosition: dragMocks.persistPosition,
}));

import { useDragController } from "./useDragController";

function makePointerEvent(target: HTMLElement, button = 0) {
  return {
    button,
    target,
    preventDefault: vi.fn(),
  } as unknown as ReactPointerEvent<HTMLElement>;
}

describe("useDragController", () => {
  afterEach(() => {
    dragMocks.getInvoke.mockReset();
    dragMocks.persistPosition.mockReset();
  });

  it("does not start a native drag when position is locked", async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    dragMocks.getInvoke.mockReturnValue(invoke);
    const { result } = renderHook(() => useDragController({ lockPosition: true }));
    const event = makePointerEvent(document.createElement("div"));

    await act(async () => {
      await result.current.handlePointerDown(event);
    });

    expect(invoke).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(result.current.isDraggingRef.current).toBe(false);
  });

  it("starts a drag and persists position exactly once on pointer-up", async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    dragMocks.getInvoke.mockReturnValue(invoke);
    dragMocks.persistPosition.mockResolvedValue(undefined);
    const { result } = renderHook(() => useDragController());
    const event = makePointerEvent(document.createElement("div"));

    await act(async () => {
      await result.current.handlePointerDown(event);
    });
    expect(invoke).toHaveBeenCalledWith("start_window_drag");
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(result.current.isDraggingRef.current).toBe(true);

    window.dispatchEvent(new Event("pointerup"));
    await act(async () => {
      await Promise.resolve();
    });
    window.dispatchEvent(new Event("pointerup"));

    expect(dragMocks.persistPosition).toHaveBeenCalledOnce();
    expect(result.current.isDraggingRef.current).toBe(false);
  });

  it("does not start a drag from an interactive child", async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    dragMocks.getInvoke.mockReturnValue(invoke);
    const { result } = renderHook(() => useDragController());
    const button = document.createElement("button");
    const event = makePointerEvent(button);

    await act(async () => {
      await result.current.handlePointerDown(event);
    });

    expect(invoke).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("clears the drag state when the native start command fails", async () => {
    const invoke = vi.fn().mockRejectedValue(new Error("drag unavailable"));
    dragMocks.getInvoke.mockReturnValue(invoke);
    const { result } = renderHook(() => useDragController());
    const event = makePointerEvent(document.createElement("div"));

    await act(async () => {
      await result.current.handlePointerDown(event);
    });

    expect(result.current.isDraggingRef.current).toBe(false);
  });

  it("does not persist when the shell is unavailable", async () => {
    dragMocks.getInvoke.mockReturnValue(undefined);
    const { result } = renderHook(() => useDragController());
    const event = makePointerEvent(document.createElement("div"));

    await act(async () => {
      await result.current.handlePointerDown(event);
    });
    window.dispatchEvent(new Event("pointerup"));

    expect(dragMocks.persistPosition).not.toHaveBeenCalled();
    expect(result.current.isDraggingRef.current).toBe(false);
  });
});
