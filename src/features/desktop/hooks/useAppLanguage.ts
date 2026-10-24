import { useCallback, useEffect } from "react";

import type { DesktopStatusLanguage, DesktopStatusPreferences } from "@/entities";
import i18n from "@/i18n";

export type UseAppLanguageOptions = {
  preferences: DesktopStatusPreferences;
  updatePreferences: (patch: Partial<DesktopStatusPreferences>) => Promise<void>;
};

export type UseAppLanguageResult = {
  selectLanguage: (language: DesktopStatusLanguage) => void;
};

/**
 * Keeps the i18next language and the persisted desktop language preference
 * in sync (the same preference drives the native tray menu labels).
 *
 * - Startup / external snapshots: when a stored preference carries a
 *   language, i18next is initialized from it. When the preference is absent
 *   (first run, or the browser diagnostics surface), the i18next browser
 *   detector stays in control — its detection order and localStorage cache
 *   key are untouched.
 * - Switching: the Settings language rows call `selectLanguage`, which
 *   updates i18next immediately and persists the choice through the
 *   preferences runtime path. Components never invoke Tauri directly.
 */
export function useAppLanguage({
  preferences,
  updatePreferences,
}: UseAppLanguageOptions): UseAppLanguageResult {
  useEffect(() => {
    const storedLanguage = preferences.language;
    if (storedLanguage && i18n.language !== storedLanguage) {
      void i18n.changeLanguage(storedLanguage);
    }
  }, [preferences.language]);

  const selectLanguage = useCallback(
    (language: DesktopStatusLanguage) => {
      // changeLanguage also refreshes the detector's localStorage cache,
      // preserving the existing startup detection behavior.
      void i18n.changeLanguage(language);
      void updatePreferences({ language });
    },
    [updatePreferences],
  );

  return { selectLanguage };
}
