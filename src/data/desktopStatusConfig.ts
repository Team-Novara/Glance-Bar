import i18n from "../i18n";
import type {
  DesktopStatusKind,
  DesktopStatusStateMap,
  DesktopStatusTemplateDescriptor,
  SystemPerformanceMetric,
  SystemPerformanceMetricId,
} from "../types/hub";

const DESKTOP_STATUS_METRIC_TONES: Record<
  SystemPerformanceMetricId,
  SystemPerformanceMetric["tone"]
> = {
  cpu: "blue",
  memory: "violet",
  download: "cyan",
  upload: "emerald",
};

export const DESKTOP_STATUS_TEMPLATE_ORDER: DesktopStatusKind[] = [
  "resident",
  "media",
  "download",
  "update",
  "clipboard",
  "focus",
  "notification",
  "developer",
];

export const DESKTOP_STATUS_PRIORITY_ORDER: DesktopStatusKind[] = [
  "focus",
  "developer",
  "update",
  "notification",
  "download",
  "media",
  "clipboard",
  "resident",
];

export function getDesktopStatusTemplateDescriptors(): DesktopStatusTemplateDescriptor[] {
  const t = i18n.t.bind(i18n);
  return DESKTOP_STATUS_TEMPLATE_ORDER.map((kind) => ({
    kind,
    label: t(`template.${kind}.label`),
    description: t(`template.${kind}.description`),
    providerHint: kind,
  }));
}

export function getDesktopStatusLabels(): Record<SystemPerformanceMetricId, string> {
  const t = i18n.t.bind(i18n);
  return {
    cpu: t("metrics.cpu"),
    memory: t("metrics.memory"),
    download: t("metrics.download"),
    upload: t("metrics.upload"),
  };
}

export function createSystemPerformanceMetricSnapshot(snapshot: {
  cpu: number;
  memory: number;
  downloadSpeed: number;
  uploadSpeed: number;
}): SystemPerformanceMetric[] {
  const labels = getDesktopStatusLabels();

  return [
    { id: "cpu", label: labels.cpu, value: snapshot.cpu, tone: DESKTOP_STATUS_METRIC_TONES.cpu },
    {
      id: "memory",
      label: labels.memory,
      value: snapshot.memory,
      tone: DESKTOP_STATUS_METRIC_TONES.memory,
    },
    {
      id: "download",
      label: labels.download,
      value: snapshot.downloadSpeed,
      tone: DESKTOP_STATUS_METRIC_TONES.download,
    },
    {
      id: "upload",
      label: labels.upload,
      value: snapshot.uploadSpeed,
      tone: DESKTOP_STATUS_METRIC_TONES.upload,
    },
  ];
}

export function createDesktopStatusStateTemplates(
  metrics: SystemPerformanceMetric[],
): DesktopStatusStateMap {
  const t = i18n.t.bind(i18n);
  return {
    resident: {
      kind: "resident",
      title: t("states.resident.title"),
      subtitle: t("states.resident.subtitle"),
      source: "system",
      metrics: metrics.map((metric) => ({ ...metric })),
    },
    media: {
      kind: "media",
      title: t("states.media.title"),
      subtitle: t("states.media.subtitle"),
      source: "mock",
      artist: t("states.media.artist"),
      timeLabel: t("states.media.timeLabel"),
      progress: 48,
      accent: "violet",
      playbackStatus: "playing",
    },
    download: {
      kind: "download",
      title: t("states.download.title"),
      subtitle: t("states.download.subtitle"),
      source: "mock",
      detail: t("states.download.detail"),
      progress: 57,
      accent: "green",
    },
    update: {
      kind: "update",
      title: t("states.update.title"),
      subtitle: t("states.update.subtitle"),
      source: "mock",
      detail: t("states.update.detail"),
      progress: 81,
      accent: "orange",
    },
    clipboard: {
      kind: "clipboard",
      title: t("states.clipboard.title"),
      subtitle: t("states.clipboard.subtitle"),
      source: "mock",
      copiedText: t("states.clipboard.copiedText"),
      detail: t("states.clipboard.detail"),
      accent: "blue",
    },
    focus: {
      kind: "focus",
      title: t("states.focus.title"),
      subtitle: t("states.focus.subtitle"),
      source: "mock",
      sessionLabel: t("states.focus.sessionLabel"),
      detail: t("states.focus.detail"),
      accent: "pink",
    },
    notification: {
      kind: "notification",
      title: t("states.notification.title"),
      subtitle: t("states.notification.subtitle"),
      source: "mock",
      app: t("states.notification.app"),
      sender: t("states.notification.sender"),
      message: t("states.notification.message"),
      accent: "orange",
    },
    developer: {
      kind: "developer",
      title: t("states.developer.title"),
      subtitle: t("states.developer.subtitle"),
      source: "system",
      detail: t("states.developer.detail"),
      accent: "cyan",
    },
  };
}

export function getDesktopStatusTemplateChromeCopy() {
  const t = i18n.t.bind(i18n);
  return {
    residentEyebrow: t("template.resident.eyebrow"),
    mediaEyebrow: t("template.media.eyebrow"),
    downloadEyebrow: t("template.download.eyebrow"),
    updateEyebrow: t("template.update.eyebrow"),
    clipboardEyebrow: t("template.clipboard.eyebrow"),
    focusEyebrow: t("template.focus.eyebrow"),
    notificationEyebrow: t("template.notification.eyebrow"),
    developerEyebrow: t("template.developer.eyebrow"),
    mediaProgress: t("template.media.progress"),
    downloadProgress: t("template.download.progress"),
    updateProgress: t("template.update.progress"),
    developerProgress: t("template.developer.progress"),
  };
}

export function getDesktopStatusShellCopy() {
  const t = i18n.t.bind(i18n);
  return {
    ariaLabel: t("shell.ariaLabel"),
  };
}

export function getDesktopStatusSettingsCopy() {
  const t = i18n.t.bind(i18n);
  return {
    panel: {
      ariaLabel: t("settings.panel.ariaLabel"),
      title: t("settings.panel.title"),
      description: t("settings.panel.description"),
      closeLabel: t("settings.panel.closeLabel"),
    },
    sections: {
      windowBehavior: t("settings.sections.windowBehavior"),
      statusTemplates: t("settings.sections.statusTemplates"),
      quickActions: t("settings.sections.quickActions"),
    },
    toggles: {
      alwaysFloat: {
        title: t("settings.toggles.alwaysFloat.title"),
        description: t("settings.toggles.alwaysFloat.description"),
        activeLabel: t("settings.toggles.alwaysFloat.activeLabel"),
        inactiveLabel: t("settings.toggles.alwaysFloat.inactiveLabel"),
      },
      avoidFullscreen: {
        title: t("settings.toggles.avoidFullscreen.title"),
        description: t("settings.toggles.avoidFullscreen.description"),
        activeLabel: t("settings.toggles.avoidFullscreen.activeLabel"),
        inactiveLabel: t("settings.toggles.avoidFullscreen.inactiveLabel"),
      },
      lockPosition: {
        title: t("settings.toggles.lockPosition.title"),
        description: t("settings.toggles.lockPosition.description"),
        activeLabel: t("settings.toggles.lockPosition.activeLabel"),
        inactiveLabel: t("settings.toggles.lockPosition.inactiveLabel"),
      },
    },
    actions: {
      refresh: t("settings.actions.refresh"),
      resetPosition: t("settings.actions.resetPosition"),
      openNativeSettings: t("settings.actions.openNativeSettings"),
      recallStatusCenter: t("settings.actions.recallStatusCenter"),
      quickPanelTitle: t("settings.actions.quickPanelTitle"),
      quickPanelDescription: t("settings.actions.quickPanelDescription"),
    },
  };
}
