/**
 * Shared mock-state factories for Vitest component tests.
 *
 * Each factory returns a fully-typed state object with sensible defaults
 * that can be overridden per-test via Partial<T>.
 */
import type {
  DesktopClipboardState,
  DesktopDownloadState,
  DesktopFocusState,
  DesktopMediaState,
  DesktopNotificationState,
  DesktopResidentState,
  DesktopUpdateState,
  GuestProviderSourceHealth,
  SystemPerformanceMetric,
} from "@/entities";

// ── Metrics ────────────────────────────────────────────────────────

export function mockMetrics(
  overrides?: Partial<SystemPerformanceMetric>[],
): SystemPerformanceMetric[] {
  const base: SystemPerformanceMetric[] = [
    { id: "cpu", label: "CPU", value: 42, tone: "blue" },
    { id: "memory", label: "Memory", value: 61, tone: "violet" },
    { id: "download", label: "Download", value: 2_457_600, tone: "cyan" },
    { id: "upload", label: "Upload", value: 512_000, tone: "emerald" },
  ];
  if (!overrides) return base;
  return base.map((m, i) => ({ ...m, ...(overrides[i] ?? {}) }));
}

// ── Source health ──────────────────────────────────────────────────

export function mockSourceHealth(
  overrides?: Partial<GuestProviderSourceHealth>,
): GuestProviderSourceHealth {
  return {
    kind: "media",
    quality: "native",
    code: "available",
    safeToDisplay: true,
    lastCheckedAt: Date.now(),
    ...overrides,
  };
}

// ── State factories ────────────────────────────────────────────────

export function mockResidentState(overrides?: Partial<DesktopResidentState>): DesktopResidentState {
  return {
    kind: "resident",
    title: "System Performance",
    subtitle: "Status Center",
    source: "system",
    metrics: mockMetrics(),
    sourceStatus: { quality: "live" },
    ...overrides,
  };
}

export function mockMediaState(overrides?: Partial<DesktopMediaState>): DesktopMediaState {
  return {
    kind: "media",
    title: "Neon Focus",
    subtitle: "Now Playing",
    source: "mock",
    artist: "Cober Player",
    timeLabel: "01:42 / 03:28",
    progress: 48,
    accent: "violet",
    playbackStatus: "playing",
    positionMs: 102_000,
    durationMs: 208_000,
    sourceHealth: mockSourceHealth({ kind: "media", quality: "native" }),
    ...overrides,
  };
}

export function mockClipboardState(
  overrides?: Partial<DesktopClipboardState>,
): DesktopClipboardState {
  return {
    kind: "clipboard",
    title: "Copied Content",
    subtitle: "Clipboard Update",
    source: "mock",
    copiedText: "https://github.com/example",
    detail: "From browser",
    accent: "blue",
    sourceHealth: mockSourceHealth({ kind: "clipboard", quality: "app-owned" }),
    ...overrides,
  };
}

export function mockDownloadState(overrides?: Partial<DesktopDownloadState>): DesktopDownloadState {
  return {
    kind: "download",
    title: "Windows ISO",
    subtitle: "Download Task",
    source: "mock",
    detail: "3.1 GB / 5.4 GB",
    progress: 57,
    accent: "green",
    sourceHealth: mockSourceHealth({ kind: "download", quality: "mock" }),
    ...overrides,
  };
}

export function mockUpdateState(overrides?: Partial<DesktopUpdateState>): DesktopUpdateState {
  return {
    kind: "update",
    title: "System Update",
    subtitle: "Ready to Restart",
    source: "mock",
    detail: "KB5039302",
    progress: 81,
    accent: "orange",
    sourceHealth: mockSourceHealth({ kind: "update", quality: "fixture" }),
    ...overrides,
  };
}

export function mockFocusState(overrides?: Partial<DesktopFocusState>): DesktopFocusState {
  return {
    kind: "focus",
    title: "Focus Mode",
    subtitle: "Active",
    source: "mock",
    sessionLabel: "Deep work 25 min",
    detail: "12 min remaining",
    accent: "pink",
    sourceHealth: mockSourceHealth({ kind: "focus", quality: "native" }),
    ...overrides,
  };
}

export function mockNotificationState(
  overrides?: Partial<DesktopNotificationState>,
): DesktopNotificationState {
  return {
    kind: "notification",
    title: "New message",
    subtitle: "Notification",
    source: "mock",
    app: "Cober",
    sender: "Mock Provider",
    message: "npm run qa passed",
    accent: "orange",
    sourceHealth: mockSourceHealth({ kind: "notification", quality: "mock" }),
    ...overrides,
  };
}
