import i18n from "../../i18n";
import {
  loadSystemPerformance,
  loadSystemPerformanceStatus,
  normalizeSystemStatusDiagnostic,
} from "./systemPerformanceRuntime";
import type { SystemPerformanceMetric } from "@/entities";

import { describe, it } from "vitest";
describe("systemPerformanceRuntime.test", () => {
  it("keeps readable labels when native system data loads", async () => {
    const metrics = await loadSystemPerformance({
      invoke: async () => ({
        cpu: 17,
        memory: 61,
        downloadSpeed: 2_457_600,
        uploadSpeed: 512_000,
      }),
    });

    assert.deepEqual(
      metrics.map((metric) => ({ id: metric.id, label: metric.label, value: metric.value })),
      [
        { id: "cpu", label: "CPU", value: 17 },
        { id: "memory", label: i18n.t("metrics.memory"), value: 61 },
        { id: "download", label: i18n.t("metrics.download"), value: 2_457_600 },
        { id: "upload", label: i18n.t("metrics.upload"), value: 512_000 },
      ],
    );
  });

  it("falls back without introducing mojibake when native data is malformed", async () => {
    const metrics = await loadSystemPerformance({
      invoke: async () => ({
        cpu: "bad",
        memory: 61,
        downloadSpeed: 1000,
        uploadSpeed: 500,
      }),
    });

    for (const label of metrics.map((metric) => metric.label)) {
      assert.equal(/\uFFFD/.test(label), false, `${label} must not be mojibake`);
    }
  });

  it("Tauri capability unavailable returns unavailable diagnostic", async () => {
    const result = await loadSystemPerformanceStatus();

    assert.deepEqual(result.diagnostic, {
      quality: "unavailable",
      code: "unavailable",
      source: "preflight",
    });
    assert.equal(result.metrics.length, 4);
  });

  it("unsupported platform returns unavailable unsupported diagnostic", async () => {
    const result = await loadSystemPerformanceStatus({
      invoke: async () => {
        throw { code: "unsupported" };
      },
    });

    assert.deepEqual(result.diagnostic, {
      quality: "unavailable",
      code: "unsupported",
      source: "preflight",
    });
  });

  it("permission denied returns safe permission diagnostic without private detail", async () => {
    const result = await loadSystemPerformanceStatus({
      invoke: async () => {
        throw {
          code: "permission-denied",
          path: "C:\\Users\\private",
          commandOutput: "secret output",
        };
      },
    });

    assert.deepEqual(result.diagnostic, {
      quality: "unavailable",
      code: "permission-denied",
      source: "preflight",
    });
    assert.equal("path" in result.diagnostic, false);
    assert.equal("commandOutput" in result.diagnostic, false);
  });

  it("malformed native payload returns unavailable malformed without contaminating safe metrics", async () => {
    const fallbackMetrics: SystemPerformanceMetric[] = [
      { id: "cpu", label: "CPU", value: 11, tone: "blue" },
      { id: "memory", label: "Memory", value: 22, tone: "violet" },
      { id: "download", label: "Download", value: 1024, tone: "cyan" },
      { id: "upload", label: "Upload", value: 512, tone: "emerald" },
    ];
    const result = await loadSystemPerformanceStatus({
      fallbackMetrics,
      invoke: async () => ({
        snapshot: {
          cpu: 92,
          memory: "bad",
          downloadSpeed: 2048,
          uploadSpeed: 1024,
        },
        diagnostic: {
          quality: "live",
          code: "unavailable",
          source: "preflight",
        },
      }),
    });

    assert.deepEqual(result.diagnostic, {
      quality: "unavailable",
      code: "malformed",
      source: "preflight",
    });
    assert.deepEqual(
      result.metrics.map((metric) => metric.value),
      [11, 22, 1024, 512],
    );
  });

  it("timeout returns unavailable timeout diagnostic", async () => {
    const result = await loadSystemPerformanceStatus({
      timeoutMs: 1,
      invoke: async () => new Promise(() => undefined),
    });

    assert.deepEqual(result.diagnostic, {
      quality: "unavailable",
      code: "timeout",
      source: "preflight",
    });
  });

  it("rejected invoke maps provider bug to invoke-failed diagnostic", async () => {
    const result = await loadSystemPerformanceStatus({
      invoke: async () => {
        throw new Error("C:\\Users\\private\\provider failed");
      },
    });

    assert.deepEqual(result.diagnostic, {
      quality: "unavailable",
      code: "invoke-failed",
      source: "preflight",
    });
    assert.equal("detail" in result.diagnostic, false);
  });

  it("last known safe data is surfaced only as stale with last successful source", async () => {
    const result = await loadSystemPerformanceStatus({
      lastSuccessfulSource: "tauri-fixture",
      invoke: async () => {
        throw { code: "timeout" };
      },
    });

    assert.deepEqual(result.diagnostic, {
      quality: "stale",
      code: "timeout",
      source: "preflight",
      lastSuccessfulSource: "tauri-fixture",
    });
  });

  it("legacy native metrics are treated as fixture fallback rather than real live provider", async () => {
    const result = await loadSystemPerformanceStatus({
      invoke: async () => ({
        cpu: 17,
        memory: 61,
        downloadSpeed: 2048,
        uploadSpeed: 1024,
      }),
    });

    assert.deepEqual(result.diagnostic, {
      quality: "fallback",
      code: "unavailable",
      source: "tauri-fixture",
    });
  });

  it("explicit preflight envelope can carry future live quality without raw payload fields", async () => {
    const result = await loadSystemPerformanceStatus({
      invoke: async () => ({
        snapshot: {
          cpu: 17,
          memory: 61,
          downloadSpeed: 2048,
          uploadSpeed: 1024,
        },
        diagnostic: {
          quality: "live",
          source: "preflight",
        },
        rawSourcePayload: {
          path: "C:\\Users\\private",
        },
      }),
    });

    assert.deepEqual(result.diagnostic, {
      quality: "live",
      code: "unavailable",
      source: "preflight",
    });
    assert.equal("rawSourcePayload" in result.diagnostic, false);
  });

  it("normalizes only approved diagnostic fields and values", () => {
    assert.equal(
      normalizeSystemStatusDiagnostic({
        quality: "live",
        code: "provider-bug",
        source: "preflight",
      }),
      undefined,
    );
    assert.deepEqual(
      normalizeSystemStatusDiagnostic({
        quality: "stale",
        code: "malformed",
        source: "preflight",
        lastSuccessfulSource: "tauri-event",
        path: "C:\\Users\\private",
      }),
      {
        quality: "stale",
        code: "malformed",
        source: "preflight",
        lastSuccessfulSource: "tauri-event",
      },
    );
  });

  it("rejects last successful source unless diagnostic quality explains fallback or stale state", async () => {
    for (const quality of ["live", "unavailable"] as const) {
      assert.equal(
        normalizeSystemStatusDiagnostic({
          quality,
          code: "unavailable",
          source: "preflight",
          lastSuccessfulSource: "tauri-event",
        }),
        undefined,
      );
    }

    for (const quality of ["fallback", "stale"] as const) {
      assert.deepEqual(
        normalizeSystemStatusDiagnostic({
          quality,
          code: "timeout",
          source: "preflight",
          lastSuccessfulSource: "tauri-event",
        }),
        {
          quality,
          code: "timeout",
          source: "preflight",
          lastSuccessfulSource: "tauri-event",
        },
      );
    }

    const fallbackMetrics: SystemPerformanceMetric[] = [
      { id: "cpu", label: "CPU", value: 11, tone: "blue" },
      { id: "memory", label: "Memory", value: 22, tone: "violet" },
      { id: "download", label: "Download", value: 1024, tone: "cyan" },
      { id: "upload", label: "Upload", value: 512, tone: "emerald" },
    ];

    const result = await loadSystemPerformanceStatus({
      fallbackMetrics,
      invoke: async () => ({
        snapshot: {
          cpu: 17,
          memory: 61,
          downloadSpeed: 2048,
          uploadSpeed: 1024,
        },
        diagnostic: {
          quality: "live",
          code: "unavailable",
          source: "preflight",
          lastSuccessfulSource: "tauri-event",
        },
      }),
    });

    assert.deepEqual(result.diagnostic, {
      quality: "unavailable",
      code: "malformed",
      source: "preflight",
    });
    assert.deepEqual(
      result.metrics.map((metric) => metric.value),
      [11, 22, 1024, 512],
    );
  });
});
