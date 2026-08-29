import { AlertTriangle, CheckCircle2, CircleSlash, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  aggregateProviderHealth,
  findDegradedProviders,
  type ProviderHealthSnapshot,
  type ProviderHealthSummary,
} from "@/providers";
import type { ProviderRegistryRecord } from "@/providers";
import type { HubProviderHealth } from "@/providers";

export type ProviderStatusPanelProps = {
  records: ProviderRegistryRecord[];
};

/**
 * Visualizes the live health of every registered provider.
 *
 * Pulls aggregate counters + "needs attention" snapshots from
 * `providerHealthMonitor` and renders them as a Fluent-style section in the
 * settings panel. The full per-provider list lives behind a `<details>`
 * disclosure so the panel stays compact when no operators are investigating.
 */
export function ProviderStatusPanel({ records }: ProviderStatusPanelProps) {
  const { t } = useTranslation();
  const summary: ProviderHealthSummary = aggregateProviderHealth(records);
  const degraded: ProviderHealthSnapshot[] = findDegradedProviders(records);

  return (
    <section className="win11-settings-section" data-testid="provider-status-panel">
      <h3 className="win11-settings-section-title">{t("settings.providers.title")}</h3>
      <div className="win11-settings-card">
        <div className="provider-summary">
          <SummaryItem
            icon={CheckCircle2}
            label={t("settings.providers.healthy")}
            value={summary.healthy}
            tone="green"
          />
          <SummaryItem
            icon={AlertTriangle}
            label={t("settings.providers.degraded")}
            value={summary.degraded}
            tone="amber"
          />
          <SummaryItem
            icon={XCircle}
            label={t("settings.providers.unhealthy")}
            value={summary.unhealthy}
            tone="red"
          />
          <SummaryItem
            icon={CircleSlash}
            label={t("settings.providers.stopped")}
            value={summary.stopped}
            tone="gray"
          />
        </div>

        {degraded.length > 0 && (
          <div className="provider-attention" data-testid="provider-attention">
            <h4 className="provider-attention-title">
              {t("settings.providers.attentionTitle")}
            </h4>
            <ul className="provider-list">
              {degraded.map((snap) => (
                <li
                  key={snap.providerId}
                  className="provider-row"
                  data-testid={`provider-row-${snap.providerId}`}
                >
                  <StatusIcon health={snap.health} />
                  <span className="provider-name">{snap.providerName}</span>
                  <span className="provider-kind">{snap.kind}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <details className="provider-details">
          <summary className="provider-details-summary">
            {t("settings.providers.showAll")}
          </summary>
          <ul className="provider-list">
            {records.map((record) => (
              <li
                key={record.id}
                className="provider-row"
                data-testid={`provider-row-${record.id}`}
              >
                <StatusIcon health={record.status.health} />
                <span className="provider-name">{record.metadata.name}</span>
                <span className="provider-kind">{record.metadata.kind}</span>
                <span className="provider-lifecycle">{record.status.lifecycle}</span>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </section>
  );
}

function SummaryItem({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof CheckCircle2;
  label: string;
  value: number;
  tone: "green" | "amber" | "red" | "gray";
}) {
  return (
    <div className={`provider-summary-item tone-${tone}`}>
      <Icon size={14} strokeWidth={1.8} aria-hidden="true" />
      <span className="provider-summary-value">{value}</span>
      <span className="provider-summary-label">{label}</span>
    </div>
  );
}

function StatusIcon({ health }: { health: HubProviderHealth }) {
  if (health === "Healthy") {
    return (
      <CheckCircle2
        size={12}
        strokeWidth={2}
        className="provider-status-icon is-healthy"
        aria-label="Healthy"
      />
    );
  }
  if (health === "Degraded") {
    return (
      <AlertTriangle
        size={12}
        strokeWidth={2}
        className="provider-status-icon is-degraded"
        aria-label="Degraded"
      />
    );
  }
  if (health === "Unhealthy") {
    return (
      <XCircle
        size={12}
        strokeWidth={2}
        className="provider-status-icon is-unhealthy"
        aria-label="Unhealthy"
      />
    );
  }
  return (
    <CircleSlash
      size={12}
      strokeWidth={2}
      className="provider-status-icon is-unknown"
      aria-label="Unknown"
    />
  );
}
