import { getTauriInvoke, type TauriInvoke } from "../tauri/tauriRuntime";

const DISMISS_NOTIFICATION_COMMAND = "dismiss_notification";

/**
 * Dismiss the active notification through the Tauri backend.
 *
 * The Rust side exposes a dedicated `dismiss_notification` IPC. The current
 * notification payload is a synthetic summary derived from Focus Assist
 * state (see `read_notification_summary` in lib.rs), so the backend returns
 * success without mutating any OS-level state. A future native notification
 * provider can replace this with real Windows Toast dismissal. When the
 * backend is unreachable, the runtime returns { success: false } so the UI
 * can surface feedback.
 */
export async function dismissNotification(
  invoke: TauriInvoke | undefined = getTauriInvoke(),
): Promise<{ success: boolean } | undefined> {
  if (!invoke) {
    return undefined;
  }
  try {
    const result = await invoke(DISMISS_NOTIFICATION_COMMAND);
    if (
      typeof result === "object" &&
      result !== null &&
      typeof (result as Record<string, unknown>).success === "boolean"
    ) {
      return { success: (result as Record<string, unknown>).success as boolean };
    }
    return { success: false };
  } catch {
    return { success: false };
  }
}
