import { getTauriInvoke, type TauriInvoke } from "../tauri/tauriRuntime";

const STOP_FOCUS_COMMAND = "stop_focus_session";

export async function stopFocusSession(
  invoke: TauriInvoke | undefined = getTauriInvoke(),
): Promise<{ success: boolean } | undefined> {
  if (!invoke) {
    return undefined;
  }
  try {
    const result = await invoke(STOP_FOCUS_COMMAND);
    if (
      typeof result === "object" &&
      result !== null &&
      typeof (result as Record<string, unknown>).success === "boolean"
    ) {
      return { success: (result as Record<string, unknown>).success as boolean };
    }
    return undefined;
  } catch {
    return undefined;
  }
}
