import { describe, expect, it } from "vitest";

import {
  APP_RUNTIME_METADATA_COMMAND,
  loadAppRuntimeMetadata,
  parseAppRuntimeMetadata,
} from "./appRuntimeMetadata";

const canonical = {
  appVersion: "1.0.0",
  platform: "windows",
  runtime: "tauri",
} as const;

describe("app runtime metadata", () => {
  it("parses bounded native build facts", () => {
    expect(parseAppRuntimeMetadata(canonical)).toEqual(canonical);
  });

  it("rejects malformed or unsafe metadata", () => {
    expect(parseAppRuntimeMetadata({ ...canonical, appVersion: "1.0.0\nsecret" })).toBeUndefined();
    expect(
      parseAppRuntimeMetadata({ ...canonical, platform: "Windows 11 / user" }),
    ).toBeUndefined();
    expect(parseAppRuntimeMetadata({ ...canonical, runtime: "browser" })).toBeUndefined();
  });

  it("returns an explicit browser fallback without invoking Tauri", async () => {
    await expect(loadAppRuntimeMetadata(undefined)).resolves.toEqual({
      appVersion: "browser-preview",
      platform: "unknown",
      runtime: "browser",
    });
  });

  it("loads native metadata through the bounded command", async () => {
    const calls: string[] = [];
    const result = await loadAppRuntimeMetadata(async (command) => {
      calls.push(command);
      return canonical;
    });

    expect(calls).toEqual([APP_RUNTIME_METADATA_COMMAND]);
    expect(result).toEqual(canonical);
  });

  it("does not surface raw invoke failures", async () => {
    await expect(
      loadAppRuntimeMetadata(async () => {
        throw new Error("C:\\Users\\private\\token");
      }),
    ).resolves.toEqual({
      appVersion: "browser-preview",
      platform: "unknown",
      runtime: "tauri",
    });
  });

  it("rejects non-record payloads", () => {
    expect(parseAppRuntimeMetadata(null)).toBeUndefined();
    expect(parseAppRuntimeMetadata(42)).toBeUndefined();
    expect(parseAppRuntimeMetadata(["1.0.0"])).toBeUndefined();
  });

  it("rejects empty, oversized, or invalid appVersion fields", () => {
    expect(parseAppRuntimeMetadata({ ...canonical, appVersion: "" })).toBeUndefined();
    expect(parseAppRuntimeMetadata({ ...canonical, appVersion: "1".repeat(65) })).toBeUndefined();
    expect(
      parseAppRuntimeMetadata({ ...canonical, appVersion: "1 0 with spaces" }),
    ).toBeUndefined();
  });

  it("accepts the four diagnostic platform markers", () => {
    for (const platform of ["windows", "macos", "linux", "unknown"] as const) {
      expect(parseAppRuntimeMetadata({ ...canonical, platform })).toEqual({
        appVersion: "1.0.0",
        platform,
        runtime: "tauri",
      });
    }
  });

  it("falls back to a tauri-flavored browser-preview marker on malformed metadata", async () => {
    await expect(loadAppRuntimeMetadata(async () => ({ runtime: "browser" }))).resolves.toEqual({
      appVersion: "browser-preview",
      platform: "unknown",
      runtime: "tauri",
    });
  });
});
