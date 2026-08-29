import {
  X,
  Monitor,
  Maximize,
  Lock,
  Power,
  Globe,
  RefreshCw,
  Crosshair,
  Settings,
  Navigation,
  Cpu,
  Music,
  HardDrive,
  Download,
  Clipboard,
  Eye,
  ArrowRight,
  Bell,
  Check,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { ProviderStatusPanel } from "./ProviderStatusPanel";

import {
  getDesktopStatusTemplateDescriptors,
  getDesktopStatusSettingsCopy,
} from "@/data/desktopStatusConfig";
import type { ProviderRegistryRecord } from "@/providers";
import type { DesktopStatusKind, DesktopStatusPreferences } from "@/types/hub";

export type SettingsPanelProps = {
  preferences: DesktopStatusPreferences;
  activeStatusKind: DesktopStatusKind | null;
  autostartEnabled: boolean;
  providerRecords: ProviderRegistryRecord[];
  onToggleAlwaysFloat: () => void;
  onToggleAvoidFullscreen: () => void;
  onToggleLockPosition: () => void;
  onToggleAutostart: () => void;
  onKindSelect: (kind: DesktopStatusKind) => void;
  onRefresh: () => void;
  onResetPosition: () => void;
  onOpenNativeSettings: () => void;
  onRecallStatusCenter: () => void;
  onClose: () => void;
};

const TEMPLATE_ICON_MAP: Record<DesktopStatusKind, LucideIcon> = {
  resident: Cpu,
  media: Music,
  download: Download,
  update: HardDrive,
  clipboard: Clipboard,
  focus: Eye,
  notification: Bell,
  developer: Terminal,
};

/* ─── Win11-style pill toggle switch ─── */
function Win11Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`win11-toggle${checked ? "is-on" : ""}`}
      onClick={onChange}
    >
      <span className="win11-toggle-thumb" />
    </button>
  );
}

/* ─── Main component ─── */
/* eslint-disable react-hooks/exhaustive-deps -- i18n singleton refs are stable */
export function SettingsPanel({
  preferences,
  activeStatusKind,
  autostartEnabled,
  providerRecords,
  onToggleAlwaysFloat,
  onToggleAvoidFullscreen,
  onToggleLockPosition,
  onToggleAutostart,
  onKindSelect,
  onRefresh,
  onResetPosition,
  onOpenNativeSettings,
  onRecallStatusCenter,
  onClose,
}: SettingsPanelProps) {
  const { t, i18n: i18nInstance } = useTranslation();
  const settingsCopy = useMemo(() => getDesktopStatusSettingsCopy(), [i18nInstance.language, t]);
  const templateDescriptors = useMemo(
    () => getDesktopStatusTemplateDescriptors(),
    [i18nInstance.language, t],
  );

  return (
    <aside className="win11-settings-panel" role="dialog" aria-label={settingsCopy.panel.ariaLabel}>
      {/* ── Header ── */}
      <header className="win11-settings-header">
        <div className="win11-settings-header-text">
          <h2>{settingsCopy.panel.title}</h2>
          <p>{settingsCopy.panel.description}</p>
        </div>
        <button
          type="button"
          className="win11-settings-close"
          onClick={onClose}
          aria-label={settingsCopy.panel.closeLabel}
        >
          <X size={14} strokeWidth={2} />
        </button>
      </header>

      {/* ── Scrollable body ── */}
      <div className="win11-settings-body">
        {/* ── Window Behavior ── */}
        <section className="win11-settings-section">
          <h3 className="win11-settings-section-title">{settingsCopy.sections.windowBehavior}</h3>
          <div className="win11-settings-card">
            <SettingRow
              icon={Monitor}
              title={settingsCopy.toggles.alwaysFloat.title}
              description={settingsCopy.toggles.alwaysFloat.description}
            >
              <Win11Toggle
                checked={preferences.alwaysFloat}
                onChange={onToggleAlwaysFloat}
                label={settingsCopy.toggles.alwaysFloat.title}
              />
            </SettingRow>

            <SettingRow
              icon={Maximize}
              title={settingsCopy.toggles.avoidFullscreen.title}
              description={settingsCopy.toggles.avoidFullscreen.description}
            >
              <Win11Toggle
                checked={preferences.avoidFullscreen}
                onChange={onToggleAvoidFullscreen}
                label={settingsCopy.toggles.avoidFullscreen.title}
              />
            </SettingRow>

            <SettingRow
              icon={Lock}
              title={settingsCopy.toggles.lockPosition.title}
              description={settingsCopy.toggles.lockPosition.description}
              isLast
            >
              <Win11Toggle
                checked={preferences.lockPosition}
                onChange={onToggleLockPosition}
                label={settingsCopy.toggles.lockPosition.title}
              />
            </SettingRow>

            <SettingRow
              icon={Power}
              title={t("settings.toggles.autostart.title")}
              description={t("settings.toggles.autostart.description")}
              isLast
            >
              <Win11Toggle
                checked={autostartEnabled}
                onChange={onToggleAutostart}
                label={t("settings.toggles.autostart.title")}
              />
            </SettingRow>
          </div>
        </section>

        {/* ── Status Templates ── */}
        <section className="win11-settings-section">
          <h3 className="win11-settings-section-title">{settingsCopy.sections.statusTemplates}</h3>
          <div className="win11-template-grid">
            {templateDescriptors.map((descriptor) => {
              const isActive = descriptor.kind === activeStatusKind;
              const Icon = TEMPLATE_ICON_MAP[descriptor.kind];
              return (
                <button
                  key={descriptor.kind}
                  type="button"
                  className={`win11-template-card${isActive ? "is-active" : ""}`}
                  onClick={() => onKindSelect(descriptor.kind)}
                >
                  <span className="win11-template-icon-tile">
                    <Icon size={16} strokeWidth={1.8} />
                  </span>
                  <span className="win11-template-label">{descriptor.label}</span>
                  {isActive && (
                    <span className="win11-template-check">
                      <Check size={10} strokeWidth={2.5} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Language ── */}
        <section className="win11-settings-section">
          <h3 className="win11-settings-section-title">{t("settings.language.title")}</h3>
          <div className="win11-settings-card">
            <SettingRow
              icon={Globe}
              title={t("settings.language.zh-CN")}
              description={
                i18nInstance.language === "zh-CN" ? t("common.enabled") : t("common.disabled")
              }
            >
              {i18nInstance.language === "zh-CN" ? (
                <span className="win11-check-badge">
                  <Check size={12} strokeWidth={2.5} />
                </span>
              ) : (
                <ArrowRight size={14} strokeWidth={2} className="win11-row-chevron" />
              )}
              <button
                type="button"
                className="win11-row-overlay"
                onClick={() => void i18nInstance.changeLanguage("zh-CN")}
                aria-label={t("settings.language.zh-CN")}
              />
            </SettingRow>

            <SettingRow
              icon={Globe}
              title={t("settings.language.en")}
              description={
                i18nInstance.language === "en" ? t("common.enabled") : t("common.disabled")
              }
              isLast
            >
              {i18nInstance.language === "en" ? (
                <span className="win11-check-badge">
                  <Check size={12} strokeWidth={2.5} />
                </span>
              ) : (
                <ArrowRight size={14} strokeWidth={2} className="win11-row-chevron" />
              )}
              <button
                type="button"
                className="win11-row-overlay"
                onClick={() => void i18nInstance.changeLanguage("en")}
                aria-label={t("settings.language.en")}
              />
            </SettingRow>
          </div>
        </section>

        {/* ── Provider Status ── */}
        <ProviderStatusPanel records={providerRecords ?? []} />

        {/* ── Quick Controls ── */}
        <section className="win11-settings-section">
          <h3 className="win11-settings-section-title">{settingsCopy.actions.quickPanelTitle}</h3>
          <div className="win11-actions-grid">
            <Win11ActionButton
              icon={RefreshCw}
              label={settingsCopy.actions.refresh}
              onClick={onRefresh}
            />
            <Win11ActionButton
              icon={Crosshair}
              label={settingsCopy.actions.resetPosition}
              onClick={onResetPosition}
            />
            <Win11ActionButton
              icon={Settings}
              label={settingsCopy.actions.openNativeSettings}
              onClick={onOpenNativeSettings}
            />
            <Win11ActionButton
              icon={Navigation}
              label={settingsCopy.actions.recallStatusCenter}
              onClick={onRecallStatusCenter}
            />
          </div>
        </section>
      </div>
    </aside>
  );
}

/* ─── Setting Row (icon | title + desc | right-slot) ─── */
function SettingRow({
  icon: Icon,
  title,
  description,
  children,
  isLast = false,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children: React.ReactNode;
  isLast?: boolean;
}) {
  return (
    <div className={`win11-setting-row${isLast ? "is-last" : ""}`}>
      <span className="win11-setting-icon">
        <Icon size={15} strokeWidth={1.8} />
      </span>
      <div className="win11-setting-content">
        <span className="win11-setting-title">{title}</span>
        <span className="win11-setting-desc">{description}</span>
      </div>
      <div className="win11-setting-action">{children}</div>
    </div>
  );
}

/* ─── Quick Action Button ─── */
function Win11ActionButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="win11-action-btn" onClick={onClick}>
      <Icon size={13} strokeWidth={1.8} />
      <span>{label}</span>
    </button>
  );
}
