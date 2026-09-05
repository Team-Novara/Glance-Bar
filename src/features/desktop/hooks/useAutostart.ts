import { useCallback, useEffect, useRef, useState } from "react";

import {
  getAutostartEnabled,
  setAutostartEnabled as applyAutostart,
} from "@/runtime/window/autostartRuntime";

export type UseAutostartResult = {
  autostartEnabled: boolean;
  toggleAutostart: () => Promise<void>;
};

/**
 * Owns the launch-at-login toggle: the persisted native autostart flag
 * and the optimistic flip the settings panel performs on top of it.
 *
 * Extracted from DesktopPage so the page-level component keeps no
 * direct runtime imports — window/IPC access lives in infrastructure
 * hooks (STRUCTURE_REFACTOR_PLAN.md §4 Rule 2).
 */
export function useAutostart(): UseAutostartResult {
  const [autostartEnabled, setAutostartEnabled] = useState(false);
  const mutationVersionRef = useRef(0);
  const nativeAutostartRef = useRef(false);
  const requestedAutostartRef = useRef(false);
  const toggleQueueRef = useRef(Promise.resolve());

  const commitAutostartEnabled = useCallback((value: boolean) => {
    nativeAutostartRef.current = value;
    requestedAutostartRef.current = value;
    setAutostartEnabled(value);
  }, []);

  // Load the initial autostart state from the native shell. The IPC
  // layer falls back to `false` when Tauri is unavailable, so the
  // settings panel simply shows the toggle off in mock/browser mode.
  useEffect(() => {
    let disposed = false;
    const readVersion = mutationVersionRef.current;

    void getAutostartEnabled().then((value) => {
      // A user can toggle the setting while the initial native read is still
      // in flight. Do not let that stale read roll back the user's choice.
      if (!disposed && mutationVersionRef.current === readVersion) {
        commitAutostartEnabled(value);
      }
    });

    return () => {
      disposed = true;
    };
  }, [commitAutostartEnabled]);

  const toggleAutostart = useCallback(async () => {
    const nextValue = !requestedAutostartRef.current;
    requestedAutostartRef.current = nextValue;
    const mutationVersion = ++mutationVersionRef.current;
    // Keep native writes ordered. This makes a rapid double-toggle represent
    // two user intents instead of two writes derived from the same render.
    const operation = toggleQueueRef.current.then(async () => {
      const success = await applyAutostart(nextValue);
      if (success) {
        nativeAutostartRef.current = nextValue;
      }
      return success;
    });
    toggleQueueRef.current = operation.then(
      () => undefined,
      () => undefined,
    );
    const success = await operation;
    // Commit the local state only when the native shell accepted the
    // change — keeps the toggle honest on IPC failure. Ignore late results
    // from an older click so a rapid double-toggle cannot undo a newer one.
    if (mutationVersion === mutationVersionRef.current) {
      commitAutostartEnabled(success ? nextValue : nativeAutostartRef.current);
    }
  }, [commitAutostartEnabled]);

  return { autostartEnabled, toggleAutostart };
}
