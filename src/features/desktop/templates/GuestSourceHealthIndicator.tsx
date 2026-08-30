import { useTranslation } from "react-i18next";

import type { GuestProviderSourceHealth, GuestProviderSourceQuality } from "@/entities";

import { sourceQualityClassName } from "./ResidentStatusTemplate";
import i18n from "../../../i18n";


type GuestSourceHealthIndicatorProps = {
  sourceHealth?: GuestProviderSourceHealth;
};

export function GuestSourceHealthIndicator({ sourceHealth }: GuestSourceHealthIndicatorProps) {
  const { t } = useTranslation();
  const label = guestSourceQualityLabel(sourceHealth?.quality, t);

  return (
    <span
      className={`product-status-source-health ${guestSourceQualityClassName(sourceHealth?.quality)}`}
      aria-label={label}
      title={label}
    >
      <span />
      <span className="product-status-source-health-label">{label}</span>
    </span>
  );
}

type TranslationFn = (key: string) => string;

export function guestSourceQualityLabel(
  quality: GuestProviderSourceQuality | undefined,
  t?: TranslationFn,
) {
  const translate = t ?? i18n.t.bind(i18n);
  switch (quality) {
    case "native":
      return translate("diagnostics.native");
    case "app-owned":
      return translate("diagnostics.app");
    case "fixture":
      return translate("diagnostics.fixture");
    case "mock":
      return translate("diagnostics.mock");
    case "unavailable":
    default:
      return translate("diagnostics.unavailable");
  }
}

function guestSourceQualityClassName(quality: GuestProviderSourceQuality | undefined) {
  switch (quality) {
    case "native":
      return sourceQualityClassName("live");
    case "app-owned":
      return "is-app";
    case "fixture":
    case "mock":
      return sourceQualityClassName("fallback");
    case "unavailable":
    default:
      return sourceQualityClassName("unavailable");
  }
}
