import { Cpu } from "lucide-react";
import { useTranslation } from "react-i18next";

import type {
  DesktopResidentState,
  SystemPerformanceMetric,
  SystemPerformanceSourceQuality,
} from "@/entities";

import i18n from "../../../i18n";

type ResidentStatusTemplateProps = {
  state: DesktopResidentState;
};

function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond >= 1_073_741_824) return `${(bytesPerSecond / 1_073_741_824).toFixed(1)} GB/s`;
  if (bytesPerSecond >= 1_048_576) return `${(bytesPerSecond / 1_048_576).toFixed(1)} MB/s`;
  if (bytesPerSecond >= 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  return `${Math.round(bytesPerSecond)} B/s`;
}

/**
 * Placeholder rendered in place of a numeric value the card did not measure.
 * Concrete-looking numbers next to an "Unavailable"/"Fallback" source chip
 * invite misreading (PR #59): the card must not render specific values it
 * did not measure, so every value slot degrades to this dash instead.
 */
const UNMEASURED_VALUE_PLACEHOLDER = "—";

/**
 * A resident metric value may only render when the native source actually
 * measured it: "live" is the native observation and "stale" carries the last
 * real measurement (bounded by the provider's freshness window). Every other
 * quality — "unavailable", "fallback" (mock/fixture data), or an absent
 * source status — means the numbers on the state are placeholders, and the
 * template must render the unknown-value idiom instead of percentages/rates.
 */
export function hasMeasuredResidentMetrics(
  quality: SystemPerformanceSourceQuality | undefined,
): boolean {
  return quality === "live" || quality === "stale";
}

export function ResidentStatusTemplate({ state }: ResidentStatusTemplateProps) {
  const { t } = useTranslation();
  const sourceLabel = sourceQualityLabel(state.sourceStatus?.quality, t);
  const metricsMeasured = hasMeasuredResidentMetrics(state.sourceStatus?.quality);

  const percentMetrics = state.metrics.filter((m) => m.id === "cpu" || m.id === "memory");
  const downloadMetric = state.metrics.find((m) => m.id === "download");
  const uploadMetric = state.metrics.find((m) => m.id === "upload");

  return (
    <>
      <div className="product-status-icon product-status-icon-resident" aria-hidden="true">
        <Cpu size={20} strokeWidth={2.2} />
        <span
          className={`product-status-source-health ${sourceQualityClassName(state.sourceStatus?.quality)}`}
          aria-label={`${sourceLabel}`}
          title={sourceLabel}
        >
          <span />
          <span className="product-status-source-health-label">{sourceLabel}</span>
        </span>
      </div>

      <div className="product-status-metrics">
        {percentMetrics.map((metric) => {
          // The aria label must not carry a value the card did not measure —
          // the unknown branch reuses the media rail's "…unavailable" wording.
          const label = metricsMeasured
            ? t("metrics.usageRate", { label: metric.label, value: metric.value })
            : t("metrics.usageUnavailable", { label: metric.label });
          const fillStyle = metricsMeasured
            ? { width: `${visibleMetricValue(metric.value)}%`, background: metricAccent(metric) }
            : undefined;
          // Built via join so prettier-plugin-tailwindcss cannot rewrite the
          // interpolated class token (it strips the semantic leading space
          // inside template literals — see MediaStatusTemplate).
          const trackClassName = [
            "product-status-track",
            metricsMeasured ? null : "is-indeterminate",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <div
              className={`product-status-metric product-status-metric-${metric.tone}`}
              key={metric.id}
              aria-label={label}
              title={label}
            >
              <div className="product-status-label">
                <span className="product-status-label-name">{metric.label}</span>
                <strong>
                  {metricsMeasured ? `${metric.value}%` : UNMEASURED_VALUE_PLACEHOLDER}
                </strong>
              </div>
              <span
                className={trackClassName}
                role="progressbar"
                aria-label={label}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={metricsMeasured ? metric.value : undefined}
              >
                <span style={fillStyle} />
              </span>
            </div>
          );
        })}

        {(downloadMetric || uploadMetric) && (
          <div
            className="product-status-metric product-status-metric-network"
            aria-label="Network speed"
          >
            {downloadMetric && (
              <div className="product-status-net-row">
                <span className="product-status-net-arrow product-status-net-arrow-down">↓</span>
                <span className="product-status-label-name">{downloadMetric.label}</span>
                <strong className="product-status-net-value">
                  {metricsMeasured
                    ? formatSpeed(downloadMetric.value)
                    : UNMEASURED_VALUE_PLACEHOLDER}
                </strong>
              </div>
            )}
            {uploadMetric && (
              <div className="product-status-net-row">
                <span className="product-status-net-arrow product-status-net-arrow-up">↑</span>
                <span className="product-status-label-name">{uploadMetric.label}</span>
                <strong className="product-status-net-value">
                  {metricsMeasured ? formatSpeed(uploadMetric.value) : UNMEASURED_VALUE_PLACEHOLDER}
                </strong>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function visibleMetricValue(value: number) {
  return value <= 0 ? 10 : Math.max(value, 10);
}

type TranslationFn = (key: string) => string;

export function sourceQualityLabel(
  quality: SystemPerformanceSourceQuality | undefined,
  t?: TranslationFn,
) {
  const translate = t ?? i18n.t.bind(i18n);
  switch (quality) {
    case "live":
      return translate("diagnostics.live");
    case "stale":
      return translate("diagnostics.stale");
    case "unavailable":
      return translate("diagnostics.unavailable");
    case "fallback":
    default:
      return translate("diagnostics.fallback");
  }
}

export function sourceQualityClassName(quality: SystemPerformanceSourceQuality | undefined) {
  switch (quality) {
    case "live":
      return "is-live";
    case "stale":
      return "is-stale";
    case "unavailable":
      return "is-unavailable";
    case "fallback":
    default:
      return "is-fallback";
  }
}

function metricAccent(metric: SystemPerformanceMetric) {
  if (metric.value > 80) {
    return "linear-gradient(90deg, #f97316 0%, #ef4444 100%)";
  }

  if (metric.value >= 50) {
    switch (metric.tone) {
      case "blue":
        return "linear-gradient(90deg, #2f8fed 0%, #7dd3fc 100%)";
      case "violet":
        return "linear-gradient(90deg, #7c6cff 0%, #c084fc 100%)";
      case "cyan":
        return "linear-gradient(90deg, #0891b2 0%, #2dd4bf 100%)";
      case "emerald":
        return "linear-gradient(90deg, #16a34a 0%, #4ade80 100%)";
    }
  }

  switch (metric.tone) {
    case "blue":
      return "linear-gradient(90deg, #0f6cbd 0%, #60a5fa 100%)";
    case "violet":
      return "linear-gradient(90deg, #6d5dfc 0%, #a78bfa 100%)";
    case "cyan":
      return "linear-gradient(90deg, #0f766e 0%, #2dd4bf 100%)";
    case "emerald":
      return "linear-gradient(90deg, #16a34a 0%, #86efac 100%)";
  }
}
