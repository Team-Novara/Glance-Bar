import { getTauriInvoke, type TauriInvoke } from "../tauri/tauriRuntime";

const GET_AUTOSTART_COMMAND = "get_autostart_enabled";
const SET_AUTOSTART_COMMAND = "set_autostart_enabled";

export async function getAutostartEnabled(
  invoke: TauriInvoke | undefined = getTauriInvoke(),
): Promise<boolean> {
  if (!invoke) {
    return false;
  }

  try {
    const result = await invoke(GET_AUTOSTART_COMMAND);
    return result === true;
  } catch {
    return false;
  }
}

export async function setAutostartEnabled(
  enabled: boolean,
  invoke: TauriInvoke | undefined = getTauriInvoke(),
): Promise<boolean> {
  if (!invoke) {
    return false;
  }

  try {
    await invoke(SET_AUTOSTART_COMMAND, { enabled });
    return true;
  } catch {
    return false;
  }
}
