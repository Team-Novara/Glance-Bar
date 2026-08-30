import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";

import { getTauriInvoke } from "@/runtime/tauri/tauriRuntime";
import { correctStatusWindowPosition } from "@/runtime/window/statusWindowRuntime";

const STATUS_WINDOW_DRAG_COMMAND = "start_window_drag";

export type UseDragControllerResult = {
  isDraggingRef: React.MutableRefObject<boolean>;
  lockPositionRef: React.MutableRefObject<boolean>;
  handlePointerDown: (event: ReactPointerEvent<HTMLElement>) => Promise<void>;
};

export type UseDragControllerOptions = {
  /** Current lock-position preference; synced to the drag ref each render. */
  lockPosition?: boolean;
};

export function useDragController({
  lockPosition,
}: UseDragControllerOptions = {}): UseDragControllerResult {
  const isDraggingRef = useRef(false);
  const lockPositionRef = useRef(false);

  // Sync the lock-position preference to the drag controller ref.
  // This is a render-time ref write — it's safe because the drag controller
  // reads the ref lazily inside its event handler, not synchronously during
  // render. Doing it via useEffect would just push the write one frame later
  // and risk a window where the drag controller sees a stale value.
  lockPositionRef.current = lockPosition ?? false;

  const handlePointerDown = useCallback(async (event: ReactPointerEvent<HTMLElement>) => {
    if (lockPositionRef.current || event.button !== 0) {
      return;
    }

    // Skip drag when the pointer target is an interactive element (button,
    // link, input, etc.) so that click events propagate normally.
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, a, input, select, textarea, [role='button']")) {
      return;
    }

    event.preventDefault();
    isDraggingRef.current = true;

    const invoke = getTauriInvoke();
    if (!invoke) {
      isDraggingRef.current = false;
      return;
    }

    const started = await (async () => {
      try {
        await invoke(STATUS_WINDOW_DRAG_COMMAND);
        return true;
      } catch {
        return false;
      }
    })();

    if (!started) {
      isDraggingRef.current = false;
    }
  }, []);

  useEffect(() => {
    function handlePointerUp() {
      if (!isDraggingRef.current) {
        return;
      }

      isDraggingRef.current = false;
      void correctStatusWindowPosition();
    }

    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    window.addEventListener("blur", handlePointerUp);

    return () => {
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      window.removeEventListener("blur", handlePointerUp);
    };
  }, []);

  return { isDraggingRef, lockPositionRef, handlePointerDown };
}
