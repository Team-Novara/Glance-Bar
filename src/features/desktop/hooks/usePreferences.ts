import { useCallback, useEffect, useRef, useState } from "react";

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
  const preferencesRef = useRef(DEFAULT_PREFERENCES);
  const mutationVersionRef = useRef(0);

  const updatePreferences = useCallback(async (patch: Partial<DesktopStatusPreferences>) => {
    ++mutationVersionRef.current;
    // Compute from a ref so the IPC call and React state receive the same
    // snapshot even when React defers functional state updaters.
    const nextValue: DesktopStatusPreferences = { ...preferencesRef.current, ...patch };
    preferencesRef.current = nextValue;
    setPreferences(nextValue);

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
  }, []);

  // Load initial settings + subscribe to external settings changes
  useEffect(() => {
    const invoke = getTauriInvoke();
    if (!invoke) {
      return;
    }

    let disposed = false;
    let offSettings: (() => void) | undefined;
    const readVersion = mutationVersionRef.current;

    void (async () => {
      try {
        const unlisten = await listenStatusCenterSettings((payload) => {
          if (!disposed) {
            preferencesRef.current = payload.preferences;
            setPreferences({ ...payload.preferences });
          }
        });

        if (disposed) {
          unlisten();
        } else {
          offSettings = unlisten;
        }
      } catch {
        // A failed listener registration should not prevent the initial
        // preference read below from hydrating the shell state.
      }

      try {
        const settingsResult = parseStatusCenterSettingsPayload(
          await invoke(STATUS_CENTER_SETTINGS_COMMAND),
        );
        // A user can change a preference before the initial native read
        // resolves. Keep that local mutation instead of rolling it back to
        // an older persisted snapshot.
        if (!disposed && mutationVersionRef.current === readVersion && settingsResult) {
          preferencesRef.current = settingsResult.preferences;
          setPreferences(settingsResult.preferences);
        }
      } catch {
        // Keep browser diagnostics usable when the native product bridge is absent.
      }
    })();

    return () => {
      disposed = true;
      offSettings?.();
    };
  }, []);

  return { preferences, updatePreferences };
}
