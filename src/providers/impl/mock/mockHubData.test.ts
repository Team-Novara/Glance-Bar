import { strict as assert } from "node:assert";
import i18n from "@/i18n";
import {
  getDesktopStatusTemplateDescriptors,
  createDesktopStatusStateTemplates,
  createSystemPerformanceMetricSnapshot,
  getDesktopStatusLabels,
  getDesktopStatusShellCopy,
  getDesktopStatusSettingsCopy,
} from "@/entities/status/config";
import type { SystemPerformanceMetric } from "@/entities/status/performance";

import { describe, it } from "vitest";
describe("mockHubData.test", () => {
  it("runs the file's top-level asserts", () => {});
  const mojibakePattern = /[�锟俙粨鏉ㄨ浣冪彂餃墐敷]/;

  // Collect every i18n-dependent label in one place so the mojibake check
  // covers all strings regardless of which language i18n resolves to.
  const labels = getDesktopStatusLabels();
  const shellCopy = getDesktopStatusShellCopy();
  const settingsCopy = getDesktopStatusSettingsCopy();
  const templates = createDesktopStatusStateTemplates(
    createSystemPerformanceMetricSnapshot({
      cpu: 17,
      memory: 61,
      downloadSpeed: 2_457_600,
      uploadSpeed: 512_000,
    }),
  );

  const valuesToCheck: string[] = [
    // Metric labels — content depends on current i18n language
    labels.cpu,
    labels.memory,
    labels.download,
    labels.upload,
    // Shell / settings copy
    shellCopy.ariaLabel,
    ...Object.values(settingsCopy.actions),
    settingsCopy.panel.title,
    settingsCopy.panel.description,
    settingsCopy.panel.ariaLabel,
    settingsCopy.panel.closeLabel,
    settingsCopy.sections.windowBehavior,
    settingsCopy.sections.statusTemplates,
    ...Object.values(settingsCopy.toggles).flatMap((t) => [
      t.title,
      t.description,
      t.activeLabel,
      t.inactiveLabel,
    ]),
    // Template descriptors
    ...getDesktopStatusTemplateDescriptors().flatMap((d) => [d.label, d.description]),
    // State templates
    ...Object.values(templates).flatMap((t) => [
      t.title,
      t.subtitle,
      ...(t.detail ? [t.detail] : []),
      ...(t.sessionLabel ? [t.sessionLabel] : []),
    ]),
  ];

  for (const value of valuesToCheck) {
    assert.equal(mojibakePattern.test(value), false, `${value} must not be mojibake`);
  }

  // Sanity: labels are non-empty strings in either language.
  for (const value of valuesToCheck) {
    assert.ok(value.length > 0, "label must not be empty");
  }

  console.log("ok desktop status config copy stays readable");
});
