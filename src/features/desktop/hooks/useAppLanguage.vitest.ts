import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DesktopStatusPreferences } from "@/entities";
import i18n from "@/i18n";

import { useAppLanguage } from "./useAppLanguage";

const BASE_PREFERENCES: DesktopStatusPreferences = {
  alwaysFloat: true,
  avoidFullscreen: true,
  lockPosition: false,
};

async function setI18nLanguage(language: "en" | "zh-CN") {
  await act(async () => {
    await i18n.changeLanguage(language);
  });
}

describe("useAppLanguage", () => {
  afterEach(async () => {
    await setI18nLanguage("en");
    vi.restoreAllMocks();
  });

  it("initializes i18next from the stored preference at startup", async () => {
    await setI18nLanguage("en");

    renderHook(() =>
      useAppLanguage({
        preferences: { ...BASE_PREFERENCES, language: "zh-CN" },
        updatePreferences: vi.fn(),
      }),
    );

    await waitFor(() => {
      expect(i18n.language).toBe("zh-CN");
    });
  });

  it("keeps the browser-detected language when no preference is stored", async () => {
    await setI18nLanguage("en");
    const changeLanguageSpy = vi.spyOn(i18n, "changeLanguage");

    renderHook(() =>
      useAppLanguage({
        preferences: { ...BASE_PREFERENCES },
        updatePreferences: vi.fn(),
      }),
    );

    // Give the effect cycle a turn to prove no re-initialization fires.
    await act(async () => {
      await Promise.resolve();
    });

    expect(i18n.language).toBe("en");
    expect(changeLanguageSpy).not.toHaveBeenCalled();
  });

  it("persists a language switch through the preferences path and updates i18next", async () => {
    await setI18nLanguage("en");
    const updatePreferences = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAppLanguage({
        preferences: { ...BASE_PREFERENCES },
        updatePreferences,
      }),
    );

    await act(async () => {
      result.current.selectLanguage("zh-CN");
      await Promise.resolve();
    });

    expect(updatePreferences).toHaveBeenCalledWith({ language: "zh-CN" });
    await waitFor(() => {
      expect(i18n.language).toBe("zh-CN");
    });
  });

  it("re-syncs i18next when a later preference snapshot carries a different language", async () => {
    await setI18nLanguage("en");

    const { rerender } = renderHook(
      ({ preferences }: { preferences: DesktopStatusPreferences }) =>
        useAppLanguage({ preferences, updatePreferences: vi.fn() }),
      { initialProps: { preferences: { ...BASE_PREFERENCES, language: "en" } } },
    );

    expect(i18n.language).toBe("en");

    // Simulates a settings event hydrating an externally changed preference.
    await act(async () => {
      rerender({ preferences: { ...BASE_PREFERENCES, language: "zh-CN" } });
    });

    await waitFor(() => {
      expect(i18n.language).toBe("zh-CN");
    });
  });
});
