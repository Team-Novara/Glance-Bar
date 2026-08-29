import { getTauriInvoke, type TauriInvoke } from "../tauri/tauriRuntime";

const CLIPBOARD_SET_COMMAND = "set_clipboard_content";
const CLIPBOARD_CHANGED_EVENT = "status-center://clipboard-changed";
const MEDIA_CONTROL_COMMAND = "media_control";

export type ClipboardContentPayload = {
  text: string;
  sourceApp: string;
  copiedAt: number;
};

export type MediaActionResult = {
  success: boolean;
};

export type MediaControlAction = "play-pause" | "next" | "previous";

export async function setClipboardContent(
  text: string,
  invoke: TauriInvoke | undefined = getTauriInvoke(),
): Promise<boolean> {
  if (!invoke) {
    return false;
  }

  try {
    await invoke(CLIPBOARD_SET_COMMAND, { text });
    return true;
  } catch {
    return false;
  }
}

export async function sendMediaControl(
  action: MediaControlAction,
  invoke: TauriInvoke | undefined = getTauriInvoke(),
): Promise<MediaActionResult | undefined> {
  if (!invoke) {
    return undefined;
  }

  try {
    const result = await invoke(MEDIA_CONTROL_COMMAND, { action });
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

export { CLIPBOARD_CHANGED_EVENT };
