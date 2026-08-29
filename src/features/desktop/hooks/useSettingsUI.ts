import { useCallback, useState, type RefObject } from "react";

import { getTauriInvoke } from "@/runtime/tauri/tauriRuntime";

const STATUS_CENTER_CONTEXT_MENU_COMMAND = "show_status_center_context_menu";
const OPEN_STATUS_CENTER_SETTINGS_COMMAND = "open_status_center_settings";

export type UseSettingsUIOptions = {
  isDraggingRef: RefObject<boolean>;
};

export type UseSettingsUIResult = {
  settingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
  showNativeContextMenu: (x: number, y: number) => Promise<void>;
  handleOpenSettingsClick: () => Promise<void>;
};

/**
 * Encapsulates the settings panel open/close state and the two native
 * Tauri bridges that surround it: the global context menu invocation
 * and the native settings-window launch. Extracted from DesktopPage so
 * the page-level component focuses on layout orchestration.
 *
 * Drag-while-invoking is suppressed because the native context menu
 * can swallow the up-event and leave the drag controller stuck.
 */
export function useSettingsUI({ isDraggingRef }: UseSettingsUIOptions): UseSettingsUIResult {
  const [settingsOpen, setSettingsOpen] = useState(false);

  const openSettings = useCallback(() => {
    setSettingsOpen(true);
  }, []);

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
  }, []);

  const showNativeContextMenu = useCallback(
    async (x: number, y: number) => {
      const invoke = getTauriInvoke();
      if (!invoke || isDraggingRef.current) {
        return;
      }

      await invoke(STATUS_CENTER_CONTEXT_MENU_COMMAND, { x, y });
    },
    [isDraggingRef],
  );

  const handleOpenSettingsClick = useCallback(async () => {
    const invoke = getTauriInvoke();
    if (!invoke) {
      openSettings();
      return;
    }

    await invoke(OPEN_STATUS_CENTER_SETTINGS_COMMAND);
  }, [openSettings]);

  return {
    settingsOpen,
    openSettings,
    closeSettings,
    showNativeContextMenu,
    handleOpenSettingsClick,
  };
}
