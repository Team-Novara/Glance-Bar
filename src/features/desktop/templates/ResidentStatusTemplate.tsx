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

export function ResidentStatusTemplate({ state }: ResidentStatusTemplateProps) {
  const { t } = useTranslation();
  const sourceLabel = sourceQualityLabel(state.sourceStatus?.quality, t);

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
          const accent = metricAccent(metric);
          const label = t("metrics.usageRate", { label: metric.label, value: metric.value });

          return (
            <div
              className={`product-status-metric product-status-metric-${metric.tone}`}
              key={metric.id}
              aria-label={label}
              title={label}
            >
              <div className="product-status-label">
                <span className="product-status-label-name">{metric.label}</span>
                <strong>{metric.value}%</strong>
              </div>
              <span
                className="product-status-track"
                role="progressbar"
                aria-label={label}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={metric.value}
              >
                <span
                  style={{
                    width: `${visibleMetricValue(metric.value)}%`,
                    background: accent,
                  }}
                />
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
                  {formatSpeed(downloadMetric.value)}
                </strong>
              </div>
            )}
            {uploadMetric && (
              <div className="product-status-net-row">
                <span className="product-status-net-arrow product-status-net-arrow-up">↑</span>
                <span className="product-status-label-name">{uploadMetric.label}</span>
                <strong className="product-status-net-value">
                  {formatSpeed(uploadMetric.value)}
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
