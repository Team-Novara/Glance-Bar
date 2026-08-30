import { getTauriInvoke, type TauriInvoke } from "../tauri/tauriRuntime";

const INSTALL_UPDATE_COMMAND = "install_update";

export async function installUpdate(
  invoke: TauriInvoke | undefined = getTauriInvoke(),
): Promise<{ success: boolean } | undefined> {
  if (!invoke) {
    return undefined;
  }
  try {
    const result = await invoke(INSTALL_UPDATE_COMMAND);
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
