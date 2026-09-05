import { useCallback, useEffect, useState } from "react";

import type { DesktopStatusPreferences } from "@/entities";
import {
  listenStatusCenterSettings,
  parseStatusCenterSettingsPayload,
} from "@/runtime/tauri/desktopProductRuntime";
import { getTauriInvoke } from "@/runtime/tauri/tauriRuntime";

const STATUS_CENTER_SETTINGS_COMMAND = "get_status_center_settings";
const SET_STATUS_CENTER_PREFERENCES_COMMAND = "set_status_center_preferences";
const STATUS_WINDOW_FLOATING_COMMAND = "set_status_window_floating";

const DEFAULT_PREFERENCES: DesktopStatusPreferences = {
  alwaysFloat: true,
  avoidFullscreen: true,
  lockPosition: false,
};

export type UsePreferencesResult = {
  preferences: DesktopStatusPreferences;
  updatePreferences: (patch: Partial<DesktopStatusPreferences>) => Promise<void>;
};

export function usePreferences(): UsePreferencesResult {
  const [preferences, setPreferences] = useState<DesktopStatusPreferences>(DEFAULT_PREFERENCES);

  const updatePreferences = useCallback(
    async (patch: Partial<DesktopStatusPreferences>) => {
      // Capture the merged value here so the IPC call below uses the SAME
      // value the local state updater just committed. The previous
      // implementation read `preferences` from a closure that could lag
      // one render behind the setState call, and dispatched the IPC with
      // a stale snapshot when the user double-clicked a toggle quickly.
      let nextValue: DesktopStatusPreferences = preferences;
      setPreferences((prev) => {
        nextValue = { ...prev, ...patch };
        return nextValue;
      });

      const invoke = getTauriInvoke();
      if (invoke) {
        await invoke(SET_STATUS_CENTER_PREFERENCES_COMMAND, {
          preferences: nextValue,
        });
        if (typeof patch.alwaysFloat === "boolean") {
          await invoke(STATUS_WINDOW_FLOATING_COMMAND, {
            floating: nextValue.alwaysFloat,
          });
        }
      }
    },
    [preferences],
  );

  // Load initial settings + subscribe to external settings changes
  useEffect(() => {
    const invoke = getTauriInvoke();
    if (!invoke) {
      return;
    }

    let disposed = false;
    let offSettings: (() => void) | undefined;

    void (async () => {
      try {
        const settingsResult = parseStatusCenterSettingsPayload(
          await invoke(STATUS_CENTER_SETTINGS_COMMAND),
        );
        if (!disposed && settingsResult) {
          setPreferences(settingsResult.preferences);
        }

        offSettings = await listenStatusCenterSettings((payload) => {
          if (!disposed) {
            setPreferences({ ...payload.preferences });
          }
        });
      } catch {
        // Keep browser diagnostics usable when the native product event bridge is absent.
      }
    })();

    return () => {
      disposed = true;
      offSettings?.();
    };
  }, []);

  return { preferences, updatePreferences };
}
