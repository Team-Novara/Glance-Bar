import { useCallback, useEffect, useState } from "react";

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

  // Load the initial autostart state from the native shell. The IPC
  // layer falls back to `false` when Tauri is unavailable, so the
  // settings panel simply shows the toggle off in mock/browser mode.
  useEffect(() => {
    void getAutostartEnabled().then(setAutostartEnabled);
  }, []);

  const toggleAutostart = useCallback(async () => {
    const nextValue = !autostartEnabled;
    const success = await applyAutostart(nextValue);
    // Commit the local state only when the native shell accepted the
    // change — keeps the toggle honest on IPC failure.
    if (success) {
      setAutostartEnabled(nextValue);
    }
  }, [autostartEnabled]);

  return { autostartEnabled, toggleAutostart };
}
