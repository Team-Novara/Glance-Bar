import assert from "node:assert/strict";
import i18n from "../../../i18n";
import { sourceQualityClassName, sourceQualityLabel } from "./ResidentStatusTemplate";
import type { SystemPerformanceSourceQuality } from "@/entities";

import { describe, it } from "vitest";
describe("ResidentStatusTemplate.test", () => {
  it("runs the file's top-level asserts", () => {});
  // Ensure English for predictable test labels
  i18n.changeLanguage("en");

  const expectedLabels: Record<SystemPerformanceSourceQuality, string> = {
    live: "Live",
    fallback: "Fallback",
    stale: "Stale",
    unavailable: "Unavailable",
  };

  const expectedClassNames: Record<SystemPerformanceSourceQuality, string> = {
    live: "is-live",
    fallback: "is-fallback",
    stale: "is-stale",
    unavailable: "is-unavailable",
  };

  const allowedLabels = new Set(["Live", "Fallback", "Stale", "Unavailable"]);

  for (const quality of Object.keys(expectedLabels) as SystemPerformanceSourceQuality[]) {
    const label = sourceQualityLabel(quality);
    assert.equal(label, expectedLabels[quality]);
    assert.equal(allowedLabels.has(label), true);
    assert.equal(sourceQualityClassName(quality), expectedClassNames[quality]);
  }

  assert.equal(sourceQualityLabel(undefined), "Fallback");
  assert.equal(sourceQualityClassName(undefined), "is-fallback");

  console.log("ok resident status source health labels stay high-level");
});
