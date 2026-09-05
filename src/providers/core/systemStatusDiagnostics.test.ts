import { strict as assert } from "node:assert";
import {
  SYSTEM_STATUS_DIAGNOSTIC_CODES,
  type SystemStatusDiagnosticCode,
} from "../../runtime/system/systemPerformanceRuntime";

import { describe, it } from "vitest";
describe("systemStatusDiagnostics.test", () => {
  it("runs the file's top-level asserts", () => {});
  type SystemStatusFacts = {
    cpuLoadRange?: "low" | "medium" | "high" | "critical" | "unknown";
    memoryPressure?: "normal" | "elevated" | "high" | "critical" | "unknown";
    batteryState?: "charging" | "discharging" | "full" | "low" | "critical" | "unknown";
    networkAvailability?: "offline" | "online" | "limited" | "metered" | "unknown";
  };

  type SystemStatusDiagnosticFixture = {
    surface: "systemStatusPreflight";
    code: SystemStatusDiagnosticCode;
    factShape: "coarse-enum";
    redacted: true;
    retryable: boolean;
    windowsProviders: false;
    capability: {
      id: "system-status";
      kind: "system-status";
      origin: "native";
      support: "preflight";
    };
    facts: SystemStatusFacts;
  };

  const systemStatusCapabilityPreflight = {
    id: "system-status",
    kind: "system-status",
    origin: "native",
    support: "preflight",
  } as const;

  const systemStatusDiagnostics: SystemStatusDiagnosticFixture[] = [
    {
      surface: "systemStatusPreflight",
      code: "available",
      factShape: "coarse-enum",
      redacted: true,
      retryable: false,
      windowsProviders: false,
      capability: systemStatusCapabilityPreflight,
      facts: {
        cpuLoadRange: "unknown",
        memoryPressure: "unknown",
        batteryState: "unknown",
        networkAvailability: "unknown",
      },
    },
    {
      surface: "systemStatusPreflight",
      code: "unsupported",
      factShape: "coarse-enum",
      redacted: true,
      retryable: false,
      windowsProviders: false,
      capability: systemStatusCapabilityPreflight,
      facts: {
        cpuLoadRange: "unknown",
        memoryPressure: "unknown",
        batteryState: "unknown",
        networkAvailability: "unknown",
      },
    },
    {
      surface: "systemStatusPreflight",
      code: "unavailable",
      factShape: "coarse-enum",
      redacted: true,
      retryable: true,
      windowsProviders: false,
      capability: systemStatusCapabilityPreflight,
      facts: {
        cpuLoadRange: "unknown",
        memoryPressure: "unknown",
        batteryState: "unknown",
        networkAvailability: "unknown",
      },
    },
    {
      surface: "systemStatusPreflight",
      code: "permission-denied",
      factShape: "coarse-enum",
      redacted: true,
      retryable: false,
      windowsProviders: false,
      capability: systemStatusCapabilityPreflight,
      facts: {
        cpuLoadRange: "unknown",
        memoryPressure: "unknown",
        batteryState: "unknown",
        networkAvailability: "unknown",
      },
    },
    {
      surface: "systemStatusPreflight",
      code: "malformed",
      factShape: "coarse-enum",
      redacted: true,
      retryable: false,
      windowsProviders: false,
      capability: systemStatusCapabilityPreflight,
      facts: {
        cpuLoadRange: "unknown",
        memoryPressure: "unknown",
        batteryState: "unknown",
        networkAvailability: "unknown",
      },
    },
    {
      surface: "systemStatusPreflight",
      code: "timeout",
      factShape: "coarse-enum",
      redacted: true,
      retryable: true,
      windowsProviders: false,
      capability: systemStatusCapabilityPreflight,
      facts: {
        cpuLoadRange: "unknown",
        memoryPressure: "unknown",
        batteryState: "unknown",
        networkAvailability: "unknown",
      },
    },
    {
      surface: "systemStatusPreflight",
      code: "invoke-failed",
      factShape: "coarse-enum",
      redacted: true,
      retryable: false,
      windowsProviders: false,
      capability: systemStatusCapabilityPreflight,
      facts: {
        cpuLoadRange: "unknown",
        memoryPressure: "unknown",
        batteryState: "unknown",
        networkAvailability: "unknown",
      },
    },
  ];

  const expectedDiagnosticCodes: SystemStatusDiagnosticCode[] = [...SYSTEM_STATUS_DIAGNOSTIC_CODES];

  const allowedFactValues = new Set([
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
  ]);

  const allowedDiagnosticStrings = new Set<string>([
    "systemStatusPreflight",
    "coarse-enum",
    "system-status",
    "native",
    "preflight",
    ...expectedDiagnosticCodes,
    ...allowedFactValues,
  ]);

  const forbiddenKeys = new Set([
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
    "content",
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
    "rawNetworkDetails",
    "ipAddress",
    "macAddress",
    "hostname",
    "machineIdentifier",
    "deviceIdentifier",
    "stableIdentifier",
    "provider",
    "providerExport",
    "lifecycle",
    "start",
    "subscribe",
    "emit",
    "event",
    "eventBus",
    "store",
    "resolver",
    "runtimeProviderWiring",
    "windowsApi",
    "osObservation",
    "available",
    "ready",
    "connected",
    "active",
    "implemented",
    "productionCapable",
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

  function assertFactsOnly(diagnostic: SystemStatusDiagnosticFixture) {
    for (const key of collectKeys(diagnostic)) {
      assert.equal(forbiddenKeys.has(key), false, `${key} must not appear in diagnostics`);
    }

    for (const value of collectPrimitiveValues(diagnostic)) {
      if (typeof value === "string") {
        assert.equal(allowedDiagnosticStrings.has(value), true, `${value} must be bounded`);
        assert.equal(value.length <= 32, true, `${value} must stay short`);
      } else {
        assert.equal(typeof value, "boolean", `${String(value)} must be boolean or short code`);
      }
    }
  }

  test("system status diagnostics cover every planned local category", () => {
    assert.deepEqual(
      systemStatusDiagnostics.map((diagnostic) => diagnostic.code),
      expectedDiagnosticCodes,
    );
  });

  test("system status diagnostics stay bounded, redacted, and facts-only", () => {
    for (const diagnostic of systemStatusDiagnostics) {
      assert.equal(diagnostic.surface, "systemStatusPreflight");
      assert.equal(diagnostic.factShape, "coarse-enum");
      assert.equal(diagnostic.redacted, true);
      assert.equal(diagnostic.windowsProviders, false);
      assert.deepEqual(diagnostic.capability, systemStatusCapabilityPreflight);
      assertFactsOnly(diagnostic);
    }
  });

  test("system status diagnostics do not imply Windows API, OS observation, provider export, or runtime-provider wiring", () => {
    for (const diagnostic of systemStatusDiagnostics) {
      assert.equal("windowsApi" in diagnostic, false);
      assert.equal("osObservation" in diagnostic, false);
      assert.equal("providerExport" in diagnostic, false);
      assert.equal("runtimeProviderWiring" in diagnostic, false);
      assert.equal("provider" in diagnostic, false);
      assert.equal("lifecycle" in diagnostic, false);
      assert.equal("event" in diagnostic, false);
      assert.equal("emit" in diagnostic, false);
    }
  });

  test("system status diagnostics do not expose readiness or availability claims", () => {
    for (const diagnostic of systemStatusDiagnostics) {
      assert.equal(diagnostic.capability.origin, "native");
      assert.equal(diagnostic.capability.support, "preflight");
      assert.equal("available" in diagnostic, false);
      assert.equal("ready" in diagnostic, false);
      assert.equal("connected" in diagnostic, false);
      assert.equal("active" in diagnostic, false);
      assert.equal("implemented" in diagnostic, false);
      assert.equal("production-capable" in diagnostic, false);
    }
  });
});
