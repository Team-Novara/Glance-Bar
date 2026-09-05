// Framework barrel — system split
export * from './systemPerformanceRuntime';
export * from './mediaControlRuntime';
// systemMonitorRuntime shares CLIPBOARD_CHANGED_EVENT with mediaControlRuntime —
// re-export its named exports explicitly to avoid a duplicate-export collision.
export {
  FOCUS_ASSIST_CHANGED_EVENT,
  MEDIA_SESSION_CHANGED_EVENT,
  NOTIFICATIONS_CHANGED_EVENT,
  type ClipboardChangedPayload,
  type FocusAssistState,
  type MediaSessionChangedPayload,
  type NotificationSummary,
  getFocusAssistState,
  getNotificationSummary,
  onClipboardChanged,
  onFocusAssistChanged,
  onMediaSessionChanged,
  onNotificationsChanged,
  parseMediaSessionChangedPayload,
} from './systemMonitorRuntime';
