import {
  parseStatusCenterMenuActionPayload,
  parseStatusCenterSettingsPayload,
} from "./desktopProductRuntime";

import { describe, it } from "vitest";
describe("desktopProductRuntime.test", () => {
  it("accepts canonical status center menu payloads", () => {
    assert.deepEqual(
      parseStatusCenterMenuActionPayload({
        action: "toggle-always-float",
        checked: true,
      }),
      {
        action: "toggle-always-float",
        checked: true,
      },
    );
  });

  it("normalizes legacy menu action ids to canonical toggle actions", () => {
    assert.deepEqual(
      parseStatusCenterMenuActionPayload({
        action: "always-float",
        checked: false,
      }),
      {
        action: "toggle-always-float",
        checked: false,
      },
    );

    assert.deepEqual(
      parseStatusCenterMenuActionPayload({
        action: "avoid-fullscreen",
        checked: true,
      }),
      {
        action: "toggle-avoid-fullscreen",
        checked: true,
      },
    );
  });

  it("rejects malformed menu payloads", () => {
    assert.equal(parseStatusCenterMenuActionPayload(null), undefined);
    assert.equal(parseStatusCenterMenuActionPayload({ action: "bad-action" }), undefined);
  });

  it("accepts canonical status center settings payloads", () => {
    assert.deepEqual(
      parseStatusCenterSettingsPayload({
        preferences: {
          alwaysFloat: true,
          avoidFullscreen: false,
          lockPosition: true,
        },
      }),
      {
        preferences: {
          alwaysFloat: true,
          avoidFullscreen: false,
          lockPosition: true,
        },
      },
    );
  });

  it("clones settings payloads before returning them", () => {
    const input = {
      preferences: {
        alwaysFloat: true,
        avoidFullscreen: false,
        lockPosition: true,
      },
    };

    const parsed = parseStatusCenterSettingsPayload(input);
    assert.notEqual(parsed, input);
    assert.notEqual(parsed?.preferences, input.preferences);
  });

  it("rejects malformed status center settings payloads", () => {
    assert.equal(parseStatusCenterSettingsPayload(null), undefined);
    assert.equal(
      parseStatusCenterSettingsPayload({ preferences: { alwaysFloat: true } }),
      undefined,
    );
  });
});
