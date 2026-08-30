import { useCallback } from "react";

import type { DesktopStatusKind, DesktopStatusState } from "@/entities";
import { getDesktopStatusShellCopy } from "@/entities/status/config";

import { SettingsPanel } from "./components/SettingsPanel";
import {
  useAppWindow,
  useAutostart,
  useContextMenu,
  useDesktopStatusRuntime,
  useDragController,
  useOverlayPolicy,
  usePreferences,
  useRefreshAction,
  useSettingsActions,
  useSettingsUI,
  useSystemPerformance,
  useWindowLifecycle,
} from "./hooks";
import { ClipboardStatusTemplate } from "./templates/ClipboardStatusTemplate";
import { DeveloperStatusTemplate } from "./templates/DeveloperStatusTemplate";
import { DownloadStatusTemplate } from "./templates/DownloadStatusTemplate";
import { FocusStatusTemplate } from "./templates/FocusStatusTemplate";
import { MediaStatusTemplate } from "./templates/MediaStatusTemplate";
import { NotificationStatusTemplate } from "./templates/NotificationStatusTemplate";
import { ResidentStatusTemplate } from "./templates/ResidentStatusTemplate";
import { UpdateStatusTemplate } from "./templates/UpdateStatusTemplate";


function renderDesktopStatusTemplate(state: DesktopStatusState) {
  switch (state.kind) {
    case "resident":
      return <ResidentStatusTemplate state={state} />;
    case "media":
      return <MediaStatusTemplate state={state} />;
    case "download":
      return <DownloadStatusTemplate state={state} />;
    case "update":
      return <UpdateStatusTemplate state={state} />;
    case "clipboard":
      return <ClipboardStatusTemplate state={state} />;
    case "focus":
      return <FocusStatusTemplate state={state} />;
    case "notification":
      return <NotificationStatusTemplate state={state} />;
    case "developer":
      return <DeveloperStatusTemplate state={state} />;
  }
}

export function DesktopPage() {
  const shellCopy = getDesktopStatusShellCopy();

  // Tauri window handle (shadow-disable backup for Rust DWM calls)
  const { appWindowRef } = useAppWindow();

  // Launch-at-login toggle — the native autostart IPC stays inside the
  // hook; the page must not import runtime modules directly.
  const { autostartEnabled, toggleAutostart } = useAutostart();

  // Preferences
  const { preferences, updatePreferences } = usePreferences();

  // Drag controller (lock-position preference synced inside the hook)
  const { isDraggingRef, handlePointerDown } = useDragController({
    lockPosition: preferences.lockPosition,
  });

  // System performance polling
  const { metrics, diagnostic, refreshMetrics } = useSystemPerformance();

  // Desktop status runtime + aggregation + state resolution.
  // Preferred-kind timer expiry is handled inside this hook as well.
  // Unified Provider pipeline handles media, clipboard, focus, and system perf.
  const {
    resolvedState,
    activeStatusKind,
    setActiveStatusKind,
    setPreferredUntil,
    refreshRuntime,
    preferredWindowMs,
    providerRecords,
  } = useDesktopStatusRuntime(metrics, diagnostic.quality);

  // Overlay policy (fullscreen avoidance + floating)
  const { overlayStateRef } = useOverlayPolicy({
    avoidFullscreen: preferences.avoidFullscreen,
    isDraggingRef,
  });

  // Settings actions (preference toggles + menu forwarding)
  const { toggleAlwaysFloat, toggleAvoidFullscreen, toggleLockPosition } =
    useSettingsActions({
      preferences,
      updatePreferences,
      overlayStateRef,
      isDraggingRef,
    });

  // Window lifecycle (reset, quit, recall)
  const { resetPosition, recallStatusCenter } = useWindowLifecycle({
    appWindowRef,
  });

  // -- Action handlers (memoized in hooks to prevent unnecessary child re-renders) --

  // Manual refresh: fixture replay over IPC, then metrics + runtime resync.
  // Runtime access stays in the hook per the features boundary rule.
  const { refresh } = useRefreshAction({
    isDraggingRef,
    refreshMetrics,
    refreshRuntime,
  });

  // Settings panel open state + native context menu + native settings launch
  const { settingsOpen, closeSettings, showNativeContextMenu, handleOpenSettingsClick } =
    useSettingsUI({ isDraggingRef });

  const handleKindSelect = useCallback(
    (kind: DesktopStatusKind) => {
      setActiveStatusKind(kind);
      setPreferredUntil(Date.now() + preferredWindowMs);
    },
    [preferredWindowMs, setActiveStatusKind, setPreferredUntil],
  );

  // Global context menu + Escape key
  useContextMenu({ settingsOpen, closeSettings, showNativeContextMenu });

  return (
    <main
      className="product-status-window"
      data-testid="desktop-preview"
      onPointerDownCapture={handlePointerDown}
    >
      <section className="product-status-center" aria-label={shellCopy.ariaLabel}>
        {renderDesktopStatusTemplate(resolvedState)}
      </section>

      {settingsOpen ? (
        <SettingsPanel
          preferences={preferences}
          activeStatusKind={activeStatusKind}
          autostartEnabled={autostartEnabled}
          providerRecords={providerRecords}
          onToggleAlwaysFloat={toggleAlwaysFloat}
          onToggleAvoidFullscreen={toggleAvoidFullscreen}
          onToggleLockPosition={toggleLockPosition}
          onToggleAutostart={toggleAutostart}
          onKindSelect={handleKindSelect}
          onRefresh={refresh}
          onResetPosition={resetPosition}
          onOpenNativeSettings={handleOpenSettingsClick}
          onRecallStatusCenter={recallStatusCenter}
          onClose={closeSettings}
        />
      ) : null}
    </main>
  );
}
