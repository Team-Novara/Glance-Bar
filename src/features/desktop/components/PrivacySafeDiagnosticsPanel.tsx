import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { HubEvent } from "@/entities";
import { buildPrivacySafeDiagnostics, type PrivacySafeDiagnostics } from "@/providers";
import type { ProviderRegistryRecord } from "@/providers";
import {
  loadAppRuntimeMetadata,
  type AppRuntimeMetadata,
} from "@/runtime/tauri/appRuntimeMetadata";

export type PrivacySafeDiagnosticsPanelProps = {
  records: ProviderRegistryRecord[];
  events: HubEvent[];
};

const DEFAULT_METADATA: AppRuntimeMetadata = {
  appVersion: "browser-preview",
  platform: "unknown",
  runtime: "browser",
};

/**
 * Displays only the bounded diagnostics projection. This component never
 * renders HubEvent payloads or arbitrary metadata, so clipboard text, media
 * titles, paths, usernames, and credentials cannot enter the support view.
 */
export function PrivacySafeDiagnosticsPanel({ records, events }: PrivacySafeDiagnosticsPanelProps) {
  const { t } = useTranslation();
  const separator = t("settings.diagnostics.separator");
  const [metadata, setMetadata] = useState<AppRuntimeMetadata>(DEFAULT_METADATA);

  useEffect(() => {
    let disposed = false;
    void loadAppRuntimeMetadata().then((next) => {
      if (!disposed) {
        setMetadata(next);
      }
    });

    return () => {
      disposed = true;
    };
  }, []);

  const diagnostics = useMemo<PrivacySafeDiagnostics>(
    () =>
      buildPrivacySafeDiagnostics({
        records,
        events,
        appVersion: metadata.appVersion,
        platform: metadata.platform,
        runtime: metadata.runtime,
      }),
    [events, metadata, records],
  );

  return (
    <section className="win11-settings-section" data-testid="diagnostics-panel">
      <h3 className="win11-settings-section-title">{t("settings.diagnostics.title")}</h3>
      <div className="win11-settings-card diagnostics-card">
        <p className="diagnostics-description">{t("settings.diagnostics.description")}</p>
        <dl className="diagnostics-facts">
          <DiagnosticFact
            label={t("settings.diagnostics.appVersion")}
            value={diagnostics.appVersion}
          />
          <DiagnosticFact label={t("settings.diagnostics.platform")} value={diagnostics.platform} />
          <DiagnosticFact label={t("settings.diagnostics.runtime")} value={diagnostics.runtime} />
          <DiagnosticFact
            label={t("settings.diagnostics.generatedAt")}
            value={formatTimestamp(diagnostics.generatedAt, t("settings.diagnostics.unknown"))}
          />
        </dl>

        <h4 className="diagnostics-provider-title">{t("settings.diagnostics.providers")}</h4>
        {diagnostics.providers.length === 0 ? (
          <p className="diagnostics-empty">{t("settings.diagnostics.noProviders")}</p>
        ) : (
          <ul className="diagnostics-provider-list">
            {diagnostics.providers.map((provider, index) => (
              <li className="diagnostics-provider" key={`${provider.kind}-${index}`}>
                <div className="diagnostics-provider-heading">
                  <span className="diagnostics-provider-kind">{provider.kind}</span>
                  <span className="diagnostics-provider-health">
                    {provider.health}
                    {separator}
                    {provider.lifecycle}
                  </span>
                </div>
                <div className="diagnostics-provider-capabilities">
                  {provider.capabilities.map((capability) => (
                    <span
                      className="diagnostics-capability"
                      key={`${capability.kind}-${capability.origin}-${capability.support}`}
                    >
                      {capability.kind}
                      {separator}
                      {capability.origin}
                      {separator}
                      {capability.support}
                    </span>
                  ))}
                </div>
                <dl className="diagnostics-provider-facts">
                  <DiagnosticFact
                    label={t("settings.diagnostics.lastError")}
                    value={provider.lastErrorCode ?? t("settings.diagnostics.none")}
                  />
                  <DiagnosticFact
                    label={t("settings.diagnostics.lastChecked")}
                    value={formatTimestamp(
                      provider.lastCheckedAt,
                      t("settings.diagnostics.unknown"),
                    )}
                  />
                </dl>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function DiagnosticFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="diagnostics-fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function formatTimestamp(value: number | null, fallback: string): string {
  if (value === null || !Number.isSafeInteger(value) || value < 0) {
    return fallback;
  }
  return new Date(value).toISOString();
}
