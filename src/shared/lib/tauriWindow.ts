import { getCurrentWindow } from "@tauri-apps/api/window";

export type TauriAppWindow = ReturnType<typeof getCurrentWindow>;

export function getSafeCurrentWindow(): TauriAppWindow | undefined {
  try {
    return getCurrentWindow();
  } catch {
    return undefined;
  }
}
