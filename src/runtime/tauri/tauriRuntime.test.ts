import {
  emitTauriFixtureEvents,
  getTauriInvoke,
  loadTauriGuestProviderCapabilities,
  loadTauriMediaSessionStatus,
  loadTauriRuntimeCapabilities,
  publishTauriFixtureEvents,
  publishTauriFixtureEvents,
  TAURI_EMIT_FIXTURE_EVENTS_COMMAND,
  TAURI_FIXTURE_COMMAND,
  TAURI_GUEST_PROVIDER_CAPABILITIES_COMMAND,
  TAURI_MEDIA_SESSION_STATUS_COMMAND,
  TAURI_RUNTIME_CAPABILITIES_COMMAND,
  type TauriRuntimeDiagnostic,
  type TauriInvoke,
} from "./tauriRuntime";
import {
  SYSTEM_STATUS_DIAGNOSTIC_CODES,
  type SystemStatusDiagnosticCode,
} from "../system/systemPerformanceRuntime";
import type { HubEvent } from "../../types/hub";
import type { HubProviderCapability } from "../../providers/types";

import { describe, it } from "vitest";
describe("tauriRuntime.test", () => {
  const canonicalRuntimeCapabilities = {
    runtime: "tauri",
    fixtureIpc: true,
    tray: true,
    alwaysOnTop: true,
    windowsProviders: true,
    configuredShellWindow: {
      configured: true,
      title: "Cober Windows Bar",
      width: 350,
      height: 70,
      minWidth: 350,
      minHeight: 70,
      resizable: false,
      centered: true,
    },
  } as const;

  const canonicalGuestProviderCapabilities = [
    {
      kind: "update",
      quality: "app-owned",
      code: "available",
      safeToDisplay: true,
      lastCheckedAt: 1_780_743_600_000,
    },
    {
      kind: "focus",
      quality: "unavailable",
      code: "not-implemented",
      safeToDisplay: false,
      lastCheckedAt: 1_780_743_600_000,
    },
    {
      kind: "media",
      quality: "unavailable",
      code: "not-implemented",
      safeToDisplay: false,
      lastCheckedAt: 1_780_743_600_000,
    },
    {
      kind: "download",
      quality: "unavailable",
      code: "not-implemented",
      safeToDisplay: false,
      lastCheckedAt: 1_780_743_600_000,
    },
    {
      kind: "clipboard",
      quality: "unavailable",
      code: "not-implemented",
      safeToDisplay: false,
      lastCheckedAt: 1_780_743_600_000,
    },
  ] as const;

  type SystemStatusRuntimePayloadFixture = {
    surface: "runtimeCapabilities";
    command: typeof TAURI_RUNTIME_CAPABILITIES_COMMAND;
    payloadShape: "coarse-runtime-payload";
    redacted: true;
    windowsProviders: false;
    capability: {
      id: "system-status";
      kind: "system-status";
      origin: "native";
      support: "preflight";
    };
    facts: {
      cpuRange: "low" | "medium" | "high" | "critical" | "unknown";
      memoryPressure: "normal" | "elevated" | "high" | "critical" | "unknown";
      batteryState: "charging" | "discharging" | "full" | "low" | "critical" | "unknown";
      networkAvailability: "offline" | "online" | "limited" | "metered" | "unknown";
    };
    diagnosticCodes: SystemStatusDiagnosticCode[];
  };

  const systemStatusRuntimePayloadFixture: SystemStatusRuntimePayloadFixture = {
    surface: "runtimeCapabilities",
    command: TAURI_RUNTIME_CAPABILITIES_COMMAND,
    payloadShape: "coarse-runtime-payload",
    redacted: true,
    windowsProviders: false,
    capability: {
      id: "system-status",
      kind: "system-status",
      origin: "native",
      support: "preflight",
    },
    facts: {
      cpuRange: "medium",
      memoryPressure: "normal",
      batteryState: "charging",
      networkAvailability: "online",
    },
    diagnosticCodes: [...SYSTEM_STATUS_DIAGNOSTIC_CODES],
  };

  const allowedSystemStatusRuntimePayloadValues = new Set<string>([
    "runtimeCapabilities",
    TAURI_RUNTIME_CAPABILITIES_COMMAND,
    "coarse-runtime-payload",
    "system-status",
    "native",
    "preflight",
    "low",
    "medium",
    "high",
    "critical",
    "unknown",
    "normal",
    "elevated",
    "charging",
    "discharging",
    "full",
    "offline",
    "online",
    "limited",
    "metered",
    ...SYSTEM_STATUS_DIAGNOSTIC_CODES,
  ]);

  const forbiddenSystemStatusRuntimePayloadKeys = new Set([
    "secret",
    "secrets",
    "token",
    "credential",
    "credentials",
    "password",
    "path",
    "paths",
    "filePath",
    "folderPath",
    "rawContent",
    "rawSource",
    "rawSourcePayload",
    "rawOsData",
    "rawOperatingSystemData",
    "commandOutput",
    "stdout",
    "stderr",
    "username",
    "userName",
    "user",
    "appIdentity",
    "appIdentities",
    "process",
    "processes",
    "processList",
    "processId",
    "pid",
    "windowTitle",
    "networkDetails",
    "rawNetworkData",
    "rawNetworkDetails",
    "ipAddress",
    "macAddress",
    "hostname",
    "machineIdentifier",
    "deviceIdentifier",
    "stableIdentifier",
    "provider",
    "providerAvailability",
    "providerLifecycle",
    "lifecycle",
    "event",
    "emit",
    "hubEvents",
    "eventEmission",
    "runtimeProviderWiring",
    "uiExposure",
    "nativeCollection",
    "windowsApi",
    "osObservation",
    "providerExport",
    "polling",
    "available",
    "ready",
    "connected",
    "active",
    "implemented",
    "productionCapable",
    "alreadyWired",
  ]);

  function collectKeys(value: unknown): string[] {
    if (!value || typeof value !== "object") {
      return [];
    }

    if (Array.isArray(value)) {
      return value.flatMap(collectKeys);
    }

    return Object.entries(value).flatMap(([key, childValue]) => [key, ...collectKeys(childValue)]);
  }

  function collectPrimitiveValues(value: unknown): unknown[] {
    if (!value || typeof value !== "object") {
      return [value];
    }

    if (Array.isArray(value)) {
      return value.flatMap(collectPrimitiveValues);
    }

    return Object.values(value).flatMap(collectPrimitiveValues);
  }

  function fixtureEvent(overrides: Partial<HubEvent> = {}): HubEvent {
    return {
      id: "tauri-fixture-ai",
      type: "ai",
      source: "mock",
      createdAt: 1780743600000,
      progress: 64,
      payload: {
        id: "tauri-fixture-ai-task",
        type: "ai",
        title: "Tauri IPC fixture",
        subtitle: "Boundary smoke event from native fixture command",
        progress: 64,
        accent: "blue",
      },
      metadata: {
        runtime: "tauri",
        fixture: true,
      },
      ...overrides,
    };
  }

  function assertDiagnosticContext(
    diagnostic: TauriRuntimeDiagnostic,
    expected: Pick<TauriRuntimeDiagnostic, "surface" | "command">,
  ) {
    assert.equal(diagnostic.surface, expected.surface);
    assert.equal(diagnostic.command, expected.command);
  }

  function assertSystemStatusRuntimePayloadFixture(value: SystemStatusRuntimePayloadFixture) {
    assert.equal(value.surface, "runtimeCapabilities");
    assert.equal(value.command, TAURI_RUNTIME_CAPABILITIES_COMMAND);
    assert.equal(value.payloadShape, "coarse-runtime-payload");
    assert.equal(value.redacted, true);
    assert.equal(value.windowsProviders, false);
    assert.deepEqual(value.capability, {
      id: "system-status",
      kind: "system-status",
      origin: "native",
      support: "preflight",
    });
    assert.deepEqual(Object.keys(value.facts).sort(), [
      "batteryState",
      "cpuRange",
      "memoryPressure",
      "networkAvailability",
    ]);
    assert.deepEqual(value.diagnosticCodes, [...SYSTEM_STATUS_DIAGNOSTIC_CODES]);

    for (const key of collectKeys(value)) {
      assert.equal(
        forbiddenSystemStatusRuntimePayloadKeys.has(key),
        false,
        `${key} must not appear in future system status runtime payload fixtures`,
      );
    }

    for (const primitiveValue of collectPrimitiveValues(value)) {
      if (typeof primitiveValue === "string") {
        assert.equal(
          allowedSystemStatusRuntimePayloadValues.has(primitiveValue),
          true,
          `${primitiveValue} must stay in the approved coarse runtime payload vocabulary`,
        );
        assert.equal(primitiveValue.length <= 32, true, `${primitiveValue} must stay short`);
      } else {
        assert.equal(
          typeof primitiveValue,
          "boolean",
          `${String(primitiveValue)} must be boolean or an approved short code`,
        );
      }
    }
  }

  it("detects unavailable Tauri invoke", async () => {
    const eventBus = { publishHubEvent: () => {} };
    const result = await publishTauriFixtureEvents(eventBus);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostic.code, "unavailable");
    assertDiagnosticContext(result.diagnostic, {
      surface: "fixtureEvents",
      command: TAURI_FIXTURE_COMMAND,
    });
  });

  it("finds global Tauri core invoke when present", () => {
    const invoke: TauriInvoke = async () => [];

    assert.equal(getTauriInvoke({ __TAURI__: { core: { invoke } } }), invoke);
  });

  it("returns malformed diagnostic for non-canonical fixture payloads", async () => {
    const eventBus = { publishHubEvent: () => {} };
    const result = await publishTauriFixtureEvents(eventBus, {
      invoke: async () => [
        {
          id: "bad",
          type: "unknown",
          source: "mock",
          createdAt: Date.now(),
        },
      ],
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostic.code, "malformed");
    assertDiagnosticContext(result.diagnostic, {
      surface: "fixtureEvents",
      command: TAURI_FIXTURE_COMMAND,
    });
  });

  it("returns malformed diagnostic for non-finite fixture numbers", async () => {
    const eventBus = { publishHubEvent: () => {} };
    const result = await publishTauriFixtureEvents(eventBus, {
      invoke: async () => [
        fixtureEvent({ createdAt: Number.NaN, progress: Number.POSITIVE_INFINITY }),
      ],
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostic.code, "malformed");
    assertDiagnosticContext(result.diagnostic, {
      surface: "fixtureEvents",
      command: TAURI_FIXTURE_COMMAND,
    });
  });

  it("returns invoke-failed diagnostic when command rejects", async () => {
    const eventBus = { publishHubEvent: () => {} };
    const result = await publishTauriFixtureEvents(eventBus, {
      invoke: async () => {
        throw new Error("native boundary failed");
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostic.code, "invoke-failed");
    assertDiagnosticContext(result.diagnostic, {
      surface: "fixtureEvents",
      command: TAURI_FIXTURE_COMMAND,
    });
    assert.equal(result.diagnostic.detail, "native boundary failed");
  });

  it("loads canonical fixture events through the configured command", async () => {
    const calls: string[] = [];
    const eventBus = { publishHubEvent: () => {} };
    const result = await publishTauriFixtureEvents(eventBus, {
      invoke: async (command) => {
        calls.push(command);
        return [fixtureEvent()];
      },
    });

    assert.equal(result.ok, true);
    assert.deepEqual(calls, [TAURI_FIXTURE_COMMAND]);

    if (result.ok) {
      assert.equal(result.events[0]?.type, "ai");
      assert.equal(result.events[0]?.source, "mock");
      assert.equal(result.events[0]?.metadata?.runtime, "tauri");
    }
  });

  it("loaded fixture events do not expose mutable invoke payload references", async () => {
    const fixture = fixtureEvent();
    const payload = fixture.payload as { title: string };
    const metadata = fixture.metadata as { runtime: string };
    const eventBus = { publishHubEvent: () => {} };
    const result = await publishTauriFixtureEvents(eventBus, {
      invoke: async () => [fixture],
    });

    assert.equal(result.ok, true);

    if (result.ok) {
      const snapshotPayload = result.events[0]?.payload as { title: string } | undefined;
      const snapshotMetadata = result.events[0]?.metadata as { runtime: string } | undefined;

      if (!snapshotPayload || !snapshotMetadata) {
        throw new Error("expected fixture snapshot payload and metadata");
      }

      snapshotPayload.title = "Mutated outside runtime";
      snapshotMetadata.runtime = "mutated";

      assert.equal(payload.title, "Tauri IPC fixture");
      assert.equal(metadata.runtime, "tauri");
    }
  });

  it("publishes canonical fixture events through the event bus boundary", async () => {
    const publishedEvents: HubEvent[] = [];
    const result = await publishTauriFixtureEvents(
      {
        publishHubEvent(event) {
          publishedEvents.push(event);
        },
      },
      {
        invoke: async () => [fixtureEvent()],
      },
    );

    assert.equal(result.ok, true);
    assert.equal(publishedEvents.length, 1);
    assert.equal(publishedEvents[0]?.id, "tauri-fixture-ai");
    assert.equal(publishedEvents[0]?.type, "ai");
    assert.equal(publishedEvents[0]?.source, "mock");
    assert.equal(publishedEvents[0]?.metadata?.runtime, "tauri");
  });

  it("published fixture event snapshots do not expose mutable result payload references", async () => {
    const result = await publishTauriFixtureEvents(
      {
        publishHubEvent(event) {
          const payload = event.payload as { title: string } | undefined;
          const metadata = event.metadata as { runtime: string } | undefined;

          if (!payload || !metadata) {
            throw new Error("expected fixture payload and metadata");
          }

          payload.title = "Mutated by event bus";
          metadata.runtime = "mutated";
        },
      },
      {
        invoke: async () => [fixtureEvent()],
      },
    );

    assert.equal(result.ok, true);

    if (result.ok) {
      assert.equal(
        (result.events[0]?.payload as { title?: string } | undefined)?.title,
        "Tauri IPC fixture",
      );
      assert.equal(result.events[0]?.metadata?.runtime, "tauri");
    }
  });

  it("keeps publishing later fixture events after one event bus publish fails", async () => {
    const fixtureEvents = [
      fixtureEvent({ id: "first-fixture" }),
      fixtureEvent({ id: "second-fixture" }),
    ];
    const publishedEventIds: string[] = [];
    const result = await publishTauriFixtureEvents(
      {
        publishHubEvent(event) {
          publishedEventIds.push(event.id);

          if (event.id === "first-fixture") {
            throw new Error("first fixture publish failed");
          }
        },
      },
      {
        invoke: async () => fixtureEvents,
      },
    );

    assert.equal(result.ok, true);
    assert.deepEqual(publishedEventIds, ["first-fixture", "second-fixture"]);
  });

  it("does not publish when Tauri invoke is unavailable", async () => {
    const publishedEvents: HubEvent[] = [];
    const eventBus = { publishHubEvent: () => {} };
    const result = await publishTauriFixtureEvents(eventBus, {
      publishHubEvent(event) {
        publishedEvents.push(event);
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostic.code, "unavailable");
    assert.equal(publishedEvents.length, 0);
  });

  it("does not publish malformed fixture payloads", async () => {
    const publishedEvents: HubEvent[] = [];
    const result = await publishTauriFixtureEvents(
      {
        publishHubEvent(event) {
          publishedEvents.push(event);
        },
      },
      {
        invoke: async () => [fixtureEvent({ type: "unknown" as HubEvent["type"] })],
      },
    );

    assert.equal(result.ok, false);
    assert.equal(result.diagnostic.code, "malformed");
    assert.equal(publishedEvents.length, 0);
  });

  it("does not publish when fixture command fails", async () => {
    const publishedEvents: HubEvent[] = [];
    const result = await publishTauriFixtureEvents(
      {
        publishHubEvent(event) {
          publishedEvents.push(event);
        },
      },
      {
        invoke: async () => {
          throw new Error("native boundary failed");
        },
      },
    );

    assert.equal(result.ok, false);
    assert.equal(result.diagnostic.code, "invoke-failed");
    assert.equal(publishedEvents.length, 0);
  });

  it("emits native fixture events through the explicit refresh boundary", async () => {
    let invokedCommand: string | undefined;
    const result = await emitTauriFixtureEvents({
      invoke: async (command) => {
        invokedCommand = command;
        return 3;
      },
    });

    assert.equal(invokedCommand, TAURI_EMIT_FIXTURE_EVENTS_COMMAND);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.emitted, 3);
    }
  });

  it("reports unavailable diagnostic when explicit fixture emit invoke is absent", async () => {
    const result = await emitTauriFixtureEvents();

    assert.equal(result.ok, false);
    assert.equal(result.diagnostic.code, "unavailable");
    assertDiagnosticContext(result.diagnostic, {
      surface: "fixtureEvents",
      command: TAURI_EMIT_FIXTURE_EVENTS_COMMAND,
    });
  });

  it("reports malformed diagnostic when explicit fixture emit count is not numeric", async () => {
    const result = await emitTauriFixtureEvents({
      invoke: async () => "three",
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostic.code, "malformed");
    assertDiagnosticContext(result.diagnostic, {
      surface: "fixtureEvents",
      command: TAURI_EMIT_FIXTURE_EVENTS_COMMAND,
    });
  });

  it("reports invoke-failed diagnostic when explicit fixture emit rejects", async () => {
    const result = await emitTauriFixtureEvents({
      invoke: async () => {
        throw new Error("emit failed");
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostic.code, "invoke-failed");
    assertDiagnosticContext(result.diagnostic, {
      surface: "fixtureEvents",
      command: TAURI_EMIT_FIXTURE_EVENTS_COMMAND,
    });
  });

  it("detects unavailable Tauri capability invoke", async () => {
    const result = await loadTauriRuntimeCapabilities();

    assert.equal(result.ok, false);
    assert.equal(result.diagnostic.code, "unavailable");
    assertDiagnosticContext(result.diagnostic, {
      surface: "runtimeCapabilities",
      command: TAURI_RUNTIME_CAPABILITIES_COMMAND,
    });
  });

  it("returns malformed diagnostic for non-canonical capability payloads", async () => {
    const result = await loadTauriRuntimeCapabilities({
      invoke: async () => ({
        ...canonicalRuntimeCapabilities,
        tray: false,
      }),
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostic.code, "malformed");
    assertDiagnosticContext(result.diagnostic, {
      surface: "runtimeCapabilities",
      command: TAURI_RUNTIME_CAPABILITIES_COMMAND,
    });
  });

  it("returns malformed diagnostic for non-canonical shell window facts", async () => {
    const result = await loadTauriRuntimeCapabilities({
      invoke: async () => ({
        ...canonicalRuntimeCapabilities,
        configuredShellWindow: {
          ...canonicalRuntimeCapabilities.configuredShellWindow,
          configured: false,
        },
      }),
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostic.code, "malformed");
    assertDiagnosticContext(result.diagnostic, {
      surface: "runtimeCapabilities",
      command: TAURI_RUNTIME_CAPABILITIES_COMMAND,
    });
  });

  it("returns malformed diagnostic for non-finite shell window numbers", async () => {
    const result = await loadTauriRuntimeCapabilities({
      invoke: async () => ({
        ...canonicalRuntimeCapabilities,
        configuredShellWindow: {
          ...canonicalRuntimeCapabilities.configuredShellWindow,
          width: Number.POSITIVE_INFINITY,
        },
      }),
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostic.code, "malformed");
    assertDiagnosticContext(result.diagnostic, {
      surface: "runtimeCapabilities",
      command: TAURI_RUNTIME_CAPABILITIES_COMMAND,
    });
  });

  it("returns invoke-failed diagnostic when capability command rejects", async () => {
    const result = await loadTauriRuntimeCapabilities({
      invoke: async () => {
        throw new Error("capability boundary failed");
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostic.code, "invoke-failed");
    assertDiagnosticContext(result.diagnostic, {
      surface: "runtimeCapabilities",
      command: TAURI_RUNTIME_CAPABILITIES_COMMAND,
    });
    assert.equal(result.diagnostic.detail, "capability boundary failed");
  });

  it("loads canonical runtime capability facts through the configured command", async () => {
    const calls: string[] = [];
    const result = await loadTauriRuntimeCapabilities({
      invoke: async (command) => {
        calls.push(command);
        return canonicalRuntimeCapabilities;
      },
    });

    assert.equal(result.ok, true);
    assert.deepEqual(calls, [TAURI_RUNTIME_CAPABILITIES_COMMAND]);

    if (result.ok) {
      assert.deepEqual(result.capabilities, canonicalRuntimeCapabilities);
    }
  });

  it("loaded runtime capabilities do not expose mutable invoke payload references", async () => {
    const capabilities = {
      ...canonicalRuntimeCapabilities,
      configuredShellWindow: { ...canonicalRuntimeCapabilities.configuredShellWindow },
    };
    const result = await loadTauriRuntimeCapabilities({
      invoke: async () => capabilities,
    });

    assert.equal(result.ok, true);

    if (result.ok) {
      result.capabilities.configuredShellWindow.title = "Mutated outside runtime";
      assert.equal(capabilities.configuredShellWindow.title, "Cober Windows Bar");
    }
  });

  it("keeps runtime Windows provider facts compatible with music preflight diagnostics", async () => {
    const result = await loadTauriRuntimeCapabilities({
      invoke: async () => canonicalRuntimeCapabilities,
    });
    const musicPreflightDiagnostic: HubProviderCapability = {
      id: "music",
      kind: "music",
      origin: "native",
      support: "preflight",
    };

    assert.equal(result.ok, true);

    if (result.ok) {
      assert.equal(result.capabilities.windowsProviders, true);
      assert.deepEqual(musicPreflightDiagnostic, {
        id: "music",
        kind: "music",
        origin: "native",
        support: "preflight",
      });
      assert.notEqual(musicPreflightDiagnostic.support, "available");
      assert.equal("ready" in musicPreflightDiagnostic, false);
      assert.equal("connected" in musicPreflightDiagnostic, false);
      assert.equal("implemented" in musicPreflightDiagnostic, false);
      assert.equal("active" in musicPreflightDiagnostic, false);
    }
  });

  it("future system status runtime payload fixture stays coarse, redacted, and local", () => {
    assertSystemStatusRuntimePayloadFixture(systemStatusRuntimePayloadFixture);
  });

  it("current runtime capabilities do not expose future system status payload behavior", async () => {
    const result = await loadTauriRuntimeCapabilities({
      invoke: async () => canonicalRuntimeCapabilities,
    });

    assert.equal(result.ok, true);

    if (result.ok) {
      const capabilities = result.capabilities as Record<string, unknown>;

      assert.equal(result.capabilities.windowsProviders, true);
      assert.equal("systemStatus" in capabilities, false);
      assert.equal("systemStatusPayload" in capabilities, false);
      assert.equal("systemStatusRuntimePayload" in capabilities, false);
      assert.equal("provider" in capabilities, false);
      assert.equal("providerAvailability" in capabilities, false);
      assert.equal("providerLifecycle" in capabilities, false);
      assert.equal("lifecycle" in capabilities, false);
      assert.equal("event" in capabilities, false);
      assert.equal("emit" in capabilities, false);
      assert.equal("hubEvents" in capabilities, false);
      assert.equal("eventEmission" in capabilities, false);
      assert.equal("store" in capabilities, false);
      assert.equal("resolver" in capabilities, false);
      assert.equal("ui" in capabilities, false);
      assert.equal("nativeCollection" in capabilities, false);
      assert.equal("runtimeProviderWiring" in capabilities, false);
      assert.equal("windowsApi" in capabilities, false);
      assert.equal("osObservation" in capabilities, false);
      assert.equal("providerExport" in capabilities, false);
      assert.equal("polling" in capabilities, false);
      assert.equal("available" in capabilities, false);
      assert.equal("ready" in capabilities, false);
      assert.equal("connected" in capabilities, false);
      assert.equal("active" in capabilities, false);
      assert.equal("implemented" in capabilities, false);
      assert.equal("production-capable" in capabilities, false);
    }
  });

  it("detects unavailable guest provider capability invoke", async () => {
    const result = await loadTauriGuestProviderCapabilities({
      invoke: undefined,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostic.code, "unavailable");
    assertDiagnosticContext(result.diagnostic, {
      surface: "guestProviderCapabilities",
      command: TAURI_GUEST_PROVIDER_CAPABILITIES_COMMAND,
    });
  });

  it("loads canonical guest provider source health through the configured command", async () => {
    const calls: string[] = [];
    const result = await loadTauriGuestProviderCapabilities({
      invoke: async (command) => {
        calls.push(command);
        return { providers: canonicalGuestProviderCapabilities };
      },
    });

    assert.equal(result.ok, true);
    assert.deepEqual(calls, [TAURI_GUEST_PROVIDER_CAPABILITIES_COMMAND]);

    if (result.ok) {
      assert.deepEqual(result.sourceHealthByKind.update, canonicalGuestProviderCapabilities[0]);
      assert.equal(result.sourceHealthByKind.update?.quality, "app-owned");
      assert.equal(result.sourceHealthByKind.update?.safeToDisplay, true);
      assert.equal(result.sourceHealthByKind.focus?.quality, "unavailable");
      assert.equal(result.sourceHealthByKind.focus?.safeToDisplay, false);
    }
  });

  it("returns malformed diagnostic for unsafe guest provider capability payloads", async () => {
    const result = await loadTauriGuestProviderCapabilities({
      invoke: async () => ({
        providers: [
          {
            ...canonicalGuestProviderCapabilities[0],
            path: "C:/Users/jay/private.txt",
          },
        ],
      }),
    });

    assert.equal(result.ok, true);

    if (result.ok) {
      assert.equal("path" in result.sourceHealthByKind.update!, false);
    }

    const malformed = await loadTauriGuestProviderCapabilities({
      invoke: async () => ({
        providers: [
          {
            ...canonicalGuestProviderCapabilities[0],
            quality: "connected",
          },
        ],
      }),
    });

    assert.equal(malformed.ok, false);
    assert.equal(malformed.diagnostic.code, "malformed");
    assertDiagnosticContext(malformed.diagnostic, {
      surface: "guestProviderCapabilities",
      command: TAURI_GUEST_PROVIDER_CAPABILITIES_COMMAND,
    });
  });

  it("maps guest provider capability timeout to unavailable source health", async () => {
    const result = await loadTauriGuestProviderCapabilities({
      invoke: async () => new Promise(() => {}),
      timeoutMs: 1,
    });

    assert.equal(result.ok, true);

    if (result.ok) {
      assert.equal(result.sourceHealthByKind.update?.quality, "unavailable");
      assert.equal(result.sourceHealthByKind.update?.code, "timeout");
      assert.equal(result.sourceHealthByKind.update?.safeToDisplay, false);
      assert.equal(result.sourceHealthByKind.clipboard?.code, "timeout");
    }
  });

  it("returns invoke-failed diagnostic when guest provider capability command rejects", async () => {
    const result = await loadTauriGuestProviderCapabilities({
      invoke: async () => {
        throw new Error("guest provider boundary failed");
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostic.code, "invoke-failed");
    assertDiagnosticContext(result.diagnostic, {
      surface: "guestProviderCapabilities",
      command: TAURI_GUEST_PROVIDER_CAPABILITIES_COMMAND,
    });
    assert.equal(result.diagnostic.detail, "guest provider boundary failed");
  });

  it("loads native media session status as a privacy-safe music event", async () => {
    const calls: string[] = [];
    const result = await loadTauriMediaSessionStatus({
      invoke: async (command) => {
        calls.push(command);
        return {
          available: true,
          playbackStatus: "playing",
          progress: 33.6,
          positionMs: 65_000,
          durationMs: 195_000,
          code: "available",
          checkedAt: 1_780_743_600_000,
          title: "Private video title",
          app: "Private browser",
        };
      },
    });

    assert.equal(result.ok, true);
    assert.deepEqual(calls, [TAURI_MEDIA_SESSION_STATUS_COMMAND]);

    if (result.ok) {
      assert.equal(result.status.available, true);
      assert.equal(result.status.progress, 34);
      assert.equal(result.event?.type, "music");
      assert.equal(result.event?.source, "music");
      assert.equal(result.event?.payload?.title, "Media session");
      assert.equal(result.event?.payload?.subtitle, "Playing");
      assert.equal(
        result.event?.payload && "time" in result.event.payload ? result.event.payload.time : "",
        "1:05 / 3:15",
      );
      assert.equal(result.event?.metadata?.provider, "windows-media-session");
      assert.equal(result.event?.metadata?.privacy, "coarse");
      // event.payload uses a placeholder title, never the real media title
      assert.equal(result.event?.payload?.title, "Media session");
      assert.notEqual(result.event?.payload?.title, "Private video title");
      // event.payload never carries the app identifier
      assert.equal("app" in (result.event?.payload ?? {}), false);
    }
  });

  it("creates a privacy-safe media event when a native media session is paused", async () => {
    const result = await loadTauriMediaSessionStatus({
      invoke: async () => ({
        available: true,
        playbackStatus: "paused",
        progress: 40,
        code: "available",
        checkedAt: 1_780_743_600_000,
      }),
    });

    assert.equal(result.ok, true);

    if (result.ok) {
      assert.equal(result.event?.type, "music");
      assert.equal(result.event?.payload?.title, "Media session");
      assert.equal(result.event?.payload?.subtitle, "Media ready");
    }
  });

  it("does not create a media event when native media is unavailable", async () => {
    const result = await loadTauriMediaSessionStatus({
      invoke: async () => ({
        available: false,
        playbackStatus: "unavailable",
        progress: 0,
        code: "provider-failed",
        checkedAt: 1_780_743_600_000,
      }),
    });

    assert.equal(result.ok, true);

    if (result.ok) {
      assert.equal(result.event, undefined);
    }
  });

  it("returns malformed diagnostic for invalid native media session payloads", async () => {
    const result = await loadTauriMediaSessionStatus({
      invoke: async () => ({
        available: true,
        playbackStatus: "connected",
        progress: 42,
        code: "available",
        checkedAt: 1_780_743_600_000,
      }),
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostic.code, "malformed");
    assertDiagnosticContext(result.diagnostic, {
      surface: "mediaSession",
      command: TAURI_MEDIA_SESSION_STATUS_COMMAND,
    });
  });
});
