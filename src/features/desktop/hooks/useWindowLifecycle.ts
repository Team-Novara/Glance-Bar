import { useCallback, type RefObject } from "react";

import { getTauriInvoke } from "@/runtime/tauri/tauriRuntime";
import {
  correctStatusWindowPosition,
  STATUS_WINDOW_CORRECT_POSITION_COMMAND,
  resetStatusWindowPosition,
} from "@/runtime/window/statusWindowRuntime";
import { getSafeCurrentWindow, type TauriAppWindow } from "@/shared/lib/tauriWindow";

const QUIT_STATUS_CENTER_COMMAND = "quit_status_center";
const SHOW_STATUS_CENTER_WINDOW_COMMAND = "show_status_center_window";

export type UseWindowLifecycleOptions = {
  appWindowRef: RefObject<TauriAppWindow | undefined>;
};

export type UseWindowLifecycleResult = {
  resetPosition: () => Promise<void>;
  quitStatusCenter: () => Promise<void>;
  recallStatusCenter: () => Promise<void>;
};

/**
 * Window-level commands that have no preference and no provider behind
 * them — purely the Tauri shell. Extracted from DesktopPage so the
 * page-level component doesn't carry raw IPC command strings around.
 *
 * The `appWindowRef` indirection lets the caller keep the window handle
 * stable across renders; we fall back to `getSafeCurrentWindow()` if the
 * ref is empty (which happens during SSR or first render before the
 * Tauri shell has hydrated).
 */
export function useWindowLifecycle({
  appWindowRef,
}: UseWindowLifecycleOptions): UseWindowLifecycleResult {
  const resetPosition = useCallback(async () => {
    const invoke = getTauriInvoke();
    if (!invoke) {
      return;
    }

    await resetStatusWindowPosition(invoke);
  }, []);

  const quitStatusCenter = useCallback(async () => {
    const invoke = getTauriInvoke();
    if (!invoke) {
      await appWindowRef.current?.hide();
      return;
    }

    try {
      await invoke(QUIT_STATUS_CENTER_COMMAND);
    } catch {
      await appWindowRef.current?.hide();
    }
  }, [appWindowRef]);

  const recallStatusCenter = useCallback(async () => {
    const invoke = getTauriInvoke();
    if (!invoke) {
      const win = appWindowRef.current ?? getSafeCurrentWindow();
      await win?.show();
      await win?.setFocus();
      return;
    }

    await invoke(SHOW_STATUS_CENTER_WINDOW_COMMAND);
  }, [appWindowRef]);

  return { resetPosition, quitStatusCenter, recallStatusCenter };
}

// Re-export for callers that still need the raw shell helpers.
export {
  correctStatusWindowPosition,
  resetStatusWindowPosition,
  STATUS_WINDOW_CORRECT_POSITION_COMMAND,
};
