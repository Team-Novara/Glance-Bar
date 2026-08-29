import { getTauriInvoke, type TauriInvoke } from "../tauri/tauriRuntime";

const PAUSE_COMMAND = "pause_download";
const RESUME_COMMAND = "resume_download";
const CANCEL_COMMAND = "cancel_download";

export type DownloadAction = "pause" | "resume" | "cancel";

export type DownloadControlResult = {
  success: boolean;
};

async function invokeDownloadCommand(
  command: string,
  invoke: TauriInvoke | undefined = getTauriInvoke(),
): Promise<DownloadControlResult | undefined> {
  if (!invoke) {
    return undefined;
  }
  try {
    const result = await invoke(command);
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

export function sendDownloadControl(
  action: DownloadAction,
  invoke: TauriInvoke | undefined = getTauriInvoke(),
): Promise<DownloadControlResult | undefined> {
  const command =
    action === "pause" ? PAUSE_COMMAND : action === "resume" ? RESUME_COMMAND : CANCEL_COMMAND;
  return invokeDownloadCommand(command, invoke);
}
