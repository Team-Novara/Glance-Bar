import { useEffect, useRef, type RefObject } from "react";

import { getSafeCurrentWindow, type TauriAppWindow } from "@/shared/lib/tauriWindow";

export type UseAppWindowResult = {
  appWindowRef: RefObject<TauriAppWindow | undefined>;
};

/**
 * Owns the Tauri window handle used by the desktop page so the page itself
 * stays pure orchestration (no `useRef` in the component body).
 *
 * The ref is captured once at first render via `getSafeCurrentWindow()` —
 * safe when the Tauri shell has not hydrated yet (returns `undefined`).
 * Lifecycle consumers (`useWindowLifecycle`) receive the ref so the window
 * handle stays stable across renders.
 */
export function useAppWindow(): UseAppWindowResult {
  const appWindowRef = useRef<TauriAppWindow | undefined>(getSafeCurrentWindow());

  // Explicitly disable window shadow from the frontend (backup for Rust DWM calls)
  useEffect(() => {
    const win = appWindowRef.current;
    if (win) {
      void win.setShadow(false);
    }
  }, []);

  return { appWindowRef };
}
