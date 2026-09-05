import { describe, expect, it } from "vitest";

import type { HubEvent } from "@/entities";

import {
  buildPrivacySafeDiagnostics,
  projectPrivacySafeDiagnosticEvents,
} from "./privacySafeDiagnostics";
import type { ProviderRegistryRecord } from "./providerRegistry";

const record: ProviderRegistryRecord = {
  id: "private-provider-id",
  name: "Private Provider Name",
  kind: "media",
  metadata: {
    id: "private-provider-id",
    name: "Private Provider Name",
    kind: "media",
    version: "1.0.0",
    mock: false,
  },
  capabilities: [{ id: "media", kind: "media", origin: "native", support: "available" }],
  status: { lifecycle: "Publishing", health: "Healthy" },
  registrationOrder: 0,
};

describe("buildPrivacySafeDiagnostics", () => {
  it("projects capabilities, health, bounded error code, and timestamp", () => {
    const event: HubEvent = {
      id: "media-event",
      type: "media",
      source: "media",
      createdAt: 1_000,
      payload: {
        available: true,
        playbackStatus: "playing",
        progress: 20,
        title: "Private song title",
        artist: "Private artist",
      },
      metadata: {
        code: "provider-failed",
        checkedAt: 1_000,
        path: "C:\\Users\\private\\secret.mp3",
      },
    };

    const diagnostics = buildPrivacySafeDiagnostics({
      records: [record],
      events: [event],
      appVersion: "1.0.0",
      platform: "windows",
      runtime: "tauri",
      now: 2_000,
    });

    expect(diagnostics).toEqual({
      schemaVersion: 1,
      appVersion: "1.0.0",
      platform: "windows",
      runtime: "tauri",
      generatedAt: 2_000,
      providers: [
        {
          kind: "media",
          lifecycle: "Publishing",
          health: "Healthy",
          capabilities: [{ kind: "media", origin: "native", support: "available" }],
          lastErrorCode: "provider-failed",
          lastCheckedAt: 1_000,
        },
      ],
    });

    const serialized = JSON.stringify(diagnostics);
    expect(serialized).not.toContain("Private song title");
    expect(serialized).not.toContain("Private artist");
    expect(serialized).not.toContain("private\\secret.mp3");
    expect(serialized).not.toContain("private-provider-id");
    expect(serialized).not.toContain("Private Provider Name");
  });

  it("keeps unsupported and missing observations explicit without inventing a timestamp", () => {
    const unsupported = {
      ...record,
      kind: "download" as const,
      capabilities: [
        {
          id: "download" as const,
          kind: "download" as const,
          origin: "real" as const,
          support: "unsupported" as const,
        },
      ],
      status: { lifecycle: "Stopped" as const, health: "Degraded" as const },
    };

    const diagnostics = buildPrivacySafeDiagnostics({
      records: [unsupported],
      events: [],
      appVersion: "bad version\n",
      platform: "unknown",
      runtime: "browser",
      now: 10_000,
    });

    expect(diagnostics.appVersion).toBe("unknown");
    expect(diagnostics.providers[0]).toMatchObject({
      kind: "download",
      lifecycle: "Stopped",
      health: "Degraded",
      lastErrorCode: null,
      lastCheckedAt: null,
      capabilities: [{ support: "unsupported" }],
    });
  });

  it("ignores arbitrary or future event metadata", () => {
    const event: HubEvent = {
      id: "unsafe",
      type: "media",
      source: "media",
      createdAt: 100_000_000,
      metadata: { code: "C:\\Users\\private", checkedAt: 100_000_000 },
      payload: {
        available: false,
        playbackStatus: "unsupported",
        progress: 0,
        title: "should never escape",
      },
    };

    const diagnostics = buildPrivacySafeDiagnostics({
      records: [record],
      events: [event],
      appVersion: "1.0.0",
      platform: "windows",
      runtime: "tauri",
      now: 1_000,
    });

    expect(diagnostics.providers[0]?.lastErrorCode).toBe(null);
    expect(diagnostics.providers[0]?.lastCheckedAt).toBe(null);
  });

  it("matches provider observations by source for providers with shared event types", () => {
    const gitRecord: ProviderRegistryRecord = {
      ...record,
      id: "real-git-provider",
      name: "Git Provider",
      kind: "git",
      metadata: { ...record.metadata, id: "real-git-provider", name: "Git Provider", kind: "git" },
      capabilities: [{ id: "git", kind: "git", origin: "real", support: "available" }],
    };

    const diagnostics = buildPrivacySafeDiagnostics({
      records: [gitRecord],
      events: [
        {
          id: "git-observation",
          type: "ai",
          source: "git",
          createdAt: 2_000,
          metadata: { code: "available" },
        },
      ],
      appVersion: "1.0.0",
      platform: "windows",
      runtime: "tauri",
      now: 3_000,
    });

    expect(diagnostics.providers[0]).toMatchObject({
      kind: "git",
      lastErrorCode: null,
      lastCheckedAt: 2_000,
    });
  });

  it("strips payloads and arbitrary metadata before retaining diagnostic history", () => {
    const projected = projectPrivacySafeDiagnosticEvents(
      [
        {
          id: "clipboard-event",
          type: "clipboard",
          source: "clipboard",
          createdAt: 2_000,
          payload: {
            text: "private clipboard value",
            sourceApp: "Private App",
            copiedAt: 2_000,
          },
          metadata: {
            code: "provider-failed",
            checkedAt: 2_000,
            path: "C:\\Users\\private\\secret.txt",
          },
        },
      ],
      3_000,
    );

    expect(projected).toEqual([
      {
        id: "clipboard-event",
        type: "clipboard",
        source: "clipboard",
        createdAt: 2_000,
        origin: undefined,
        metadata: { code: "provider-failed", checkedAt: 2_000 },
      },
    ]);
    const serialized = JSON.stringify(projected);
    expect(serialized).not.toContain("private clipboard value");
    expect(serialized).not.toContain("Private App");
    expect(serialized).not.toContain("secret.txt");
  });
});
