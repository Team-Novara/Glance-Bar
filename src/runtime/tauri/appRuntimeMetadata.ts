import { getTauriInvoke, type TauriInvoke } from "./tauriRuntime";
import { isRecord } from "../../shared/lib/runtimeGuards";

export const APP_RUNTIME_METADATA_COMMAND = "get_app_runtime_metadata";

export type DiagnosticPlatform = "windows" | "macos" | "linux" | "unknown";
export type DiagnosticRuntime = "tauri" | "browser";

export type AppRuntimeMetadata = {
  appVersion: string;
  platform: DiagnosticPlatform;
  runtime: DiagnosticRuntime;
};

const BROWSER_PREVIEW_METADATA: AppRuntimeMetadata = {
  appVersion: "browser-preview",
  platform: "unknown",
  runtime: "browser",
};

/**
 * Read the minimal build/runtime facts needed by the diagnostics panel.
 * Outside Tauri we return an explicit browser-preview marker rather than
 * inspecting browser system APIs or pretending to know the host platform.
 */
export async function loadAppRuntimeMetadata(
  invoke: TauriInvoke | undefined = getTauriInvoke(),
): Promise<AppRuntimeMetadata> {
  if (!invoke) {
    return BROWSER_PREVIEW_METADATA;
  }

  try {
    const value = await invoke(APP_RUNTIME_METADATA_COMMAND);
    return (
      parseAppRuntimeMetadata(value) ?? {
        ...BROWSER_PREVIEW_METADATA,
        runtime: "tauri",
      }
    );
  } catch {
    return {
      ...BROWSER_PREVIEW_METADATA,
      runtime: "tauri",
    };
  }
}

export function parseAppRuntimeMetadata(value: unknown): AppRuntimeMetadata | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (
    typeof value.appVersion !== "string" ||
    value.appVersion.length === 0 ||
    value.appVersion.length > 64 ||
    !/^[A-Za-z0-9.+_-]+$/.test(value.appVersion) ||
    !isDiagnosticPlatform(value.platform) ||
    value.runtime !== "tauri"
  ) {
    return undefined;
  }

  return {
    appVersion: value.appVersion,
    platform: value.platform,
    runtime: value.runtime,
  };
}

function isDiagnosticPlatform(value: unknown): value is DiagnosticPlatform {
  return value === "windows" || value === "macos" || value === "linux" || value === "unknown";
}
