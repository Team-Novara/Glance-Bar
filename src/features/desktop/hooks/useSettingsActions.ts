import { useCallback, type RefObject } from "react";

import type { DesktopStatusPreferences } from "@/entities";
import { scheduleOverlayStartupReassert } from "@/runtime/window/statusWindowRuntime";
import type { StatusWindowOverlayState } from "@/runtime/window/statusWindowRuntime";

export type UseSettingsActionsOptions = {
  preferences: DesktopStatusPreferences;
  updatePreferences: (patch: Partial<DesktopStatusPreferences>) => Promise<void>;
  overlayStateRef: RefObject<StatusWindowOverlayState>;
  isDraggingRef: RefObject<boolean>;
};

export type UseSettingsActionsResult = {
  toggleAlwaysFloat: () => Promise<void>;
  toggleAvoidFullscreen: () => void;
  toggleLockPosition: () => void;
  toggleFromMenu: (
    action: "toggle-always-float" | "toggle-avoid-fullscreen" | "toggle-lock-position",
    checked: boolean,
  ) => void;
};

/**
 * Encapsulates the three boolean toggle flows for the status center
 * preferences. Extracted from DesktopPage so the page-level component
 * focuses on layout orchestration.
 *
 * The toggle handlers also perform small side effects that don't fit
 * neatly into the preferences hook itself (overlay policy reassert on
 * fullscreen-toggle, drag-state reset on lock-position-toggle) — those
 * stay here so the surface they need (overlayStateRef, isDraggingRef)
 * is co-located with the toggle logic.
 */
export function useSettingsActions({
  preferences,
  updatePreferences,
  overlayStateRef,
  isDraggingRef,
}: UseSettingsActionsOptions): UseSettingsActionsResult {
  const toggleAlwaysFloat = useCallback(async () => {
    await updatePreferences({ alwaysFloat: !preferences.alwaysFloat });
  }, [preferences.alwaysFloat, updatePreferences]);

  const toggleAvoidFullscreen = useCallback(() => {
    void updatePreferences({ avoidFullscreen: !preferences.avoidFullscreen });
    scheduleOverlayStartupReassert(overlayStateRef.current);
  }, [preferences.avoidFullscreen, updatePreferences, overlayStateRef]);

  const toggleLockPosition = useCallback(() => {
    const nextValue = !preferences.lockPosition;
    void updatePreferences({ lockPosition: nextValue });

    if (nextValue && isDraggingRef.current !== undefined) {
      isDraggingRef.current = false;
    }
  }, [preferences.lockPosition, updatePreferences, isDraggingRef]);

  // Native context menu dispatches the toggle actions with the new
  // checked value. We just forward to the same IPC path; the local
  // setState is driven by the resulting status-center-settings event.
  const toggleFromMenu = useCallback(
    (
      action: "toggle-always-float" | "toggle-avoid-fullscreen" | "toggle-lock-position",
      checked: boolean,
    ) => {
      switch (action) {
        case "toggle-always-float":
          void updatePreferences({ alwaysFloat: checked });
          return;
        case "toggle-avoid-fullscreen":
          void updatePreferences({ avoidFullscreen: checked });
          scheduleOverlayStartupReassert(overlayStateRef.current);
          return;
        case "toggle-lock-position":
          void updatePreferences({ lockPosition: checked });
          if (checked && isDraggingRef.current !== undefined) {
            isDraggingRef.current = false;
          }
          return;
      }
    },
    [updatePreferences, overlayStateRef, isDraggingRef],
  );

  return {
    toggleAlwaysFloat,
    toggleAvoidFullscreen,
    toggleLockPosition,
    toggleFromMenu,
  };
}
