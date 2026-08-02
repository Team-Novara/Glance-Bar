export type HubMode = "idle" | "music" | "aiProgress" | "download" | "notification" | "multiTask";

export type HubTaskType =
  | "music"
  | "ai"
  | "download"
  | "notification"
  | "media"
  | "clipboard"
  | "focus"
  | "system";

export type HubEventSource =
  | "mock"
  | "system"
  | "music"
  | "download"
  | "ai"
  | "notification"
  | "media"
  | "clipboard"
  | "focus"
  | "git"
  | "docker"
  | "wsl"
  | "npm";

export type SystemPerformanceMetricId = "cpu" | "memory" | "download" | "upload";

type SystemPerformanceMetricTone = "blue" | "violet" | "cyan" | "emerald";

export type SystemPerformanceMetric = {
  id: SystemPerformanceMetricId;
  label: string;
  value: number;
  tone: SystemPerformanceMetricTone;
};

export type SystemPerformanceSourceQuality = "live" | "fallback" | "stale" | "unavailable";

export type SystemPerformanceSourceStatus = {
  quality: SystemPerformanceSourceQuality;
};

export type SystemPerformanceSnapshot = {
  cpu: number;
  memory: number;
  downloadSpeed: number;
  uploadSpeed: number;
};

export type DesktopStatusKind =
  | "resident"
  | "media"
  | "download"
  | "update"
  | "clipboard"
  | "focus"
  | "notification"
  | "developer";

export type DesktopGuestStatusKind = Exclude<DesktopStatusKind, "resident">;

export type DesktopStatusAttentionReason = "new" | "near-complete" | "completion" | "urgent";

type DesktopStatusSource = "default" | "mock" | "system";

export type GuestProviderSourceQuality =
  | "native"
  | "app-owned"
  | "fixture"
  | "mock"
  | "unavailable";

export type GuestProviderDiagnosticCode =
  | "available"
  | "unsupported"
  | "permission-denied"
  | "not-implemented"
  | "malformed"
  | "timeout"
  | "provider-failed";

export type GuestProviderSourceHealth = {
  kind: DesktopGuestStatusKind;
  quality: GuestProviderSourceQuality;
  code: GuestProviderDiagnosticCode;
  safeToDisplay: boolean;
  lastCheckedAt: number;
};

export type GuestProviderSourceHealthMap = Partial<
  Record<DesktopGuestStatusKind, GuestProviderSourceHealth>
>;

type DesktopStatusAccentTone = "blue" | "violet" | "cyan" | "green" | "orange" | "pink";

export type DesktopStatusTemplateDescriptor = {
  kind: DesktopStatusKind;
  label: string;
  description: string;
  providerHint: string;
};

type DesktopStatusBaseState = {
  kind: DesktopStatusKind;
  title: string;
  subtitle: string;
  source: DesktopStatusSource;
  sourceHealth?: GuestProviderSourceHealth;
};

export type DesktopResidentState = DesktopStatusBaseState & {
  kind: "resident";
  metrics: SystemPerformanceMetric[];
  sourceStatus?: SystemPerformanceSourceStatus;
};

export type DesktopMediaState = DesktopStatusBaseState & {
  kind: "media";
  progress: number;
  artist: string;
  timeLabel: string;
  accent: DesktopStatusAccentTone;
  playbackStatus?: "playing" | "paused" | "unavailable" | "unsupported";
  positionMs?: number;
  durationMs?: number;
};

export type DesktopDownloadState = DesktopStatusBaseState & {
  kind: "download";
  progress: number;
  detail: string;
  accent: DesktopStatusAccentTone;
};

export type DesktopUpdateState = DesktopStatusBaseState & {
  kind: "update";
  progress: number;
  detail: string;
  accent: DesktopStatusAccentTone;
};

export type DesktopClipboardState = DesktopStatusBaseState & {
  kind: "clipboard";
  copiedText: string;
  detail: string;
  accent: DesktopStatusAccentTone;
};

export type DesktopFocusState = DesktopStatusBaseState & {
  kind: "focus";
  sessionLabel: string;
  detail: string;
  accent: DesktopStatusAccentTone;
};

export type DesktopNotificationState = DesktopStatusBaseState & {
  kind: "notification";
  app: string;
  sender: string;
  message: string;
  accent: DesktopStatusAccentTone;
};

export type DesktopDeveloperState = DesktopStatusBaseState & {
  kind: "developer";
  detail: string;
  accent: DesktopStatusAccentTone;
  progress?: number;
};

export type DesktopStatusState =
  | DesktopResidentState
  | DesktopMediaState
  | DesktopDownloadState
  | DesktopUpdateState
  | DesktopClipboardState
  | DesktopFocusState
  | DesktopNotificationState
  | DesktopDeveloperState;

export type DesktopStatusStateMap = {
  resident: DesktopResidentState;
  media: DesktopMediaState;
  download: DesktopDownloadState;
  update: DesktopUpdateState;
  clipboard: DesktopClipboardState;
  focus: DesktopFocusState;
  notification: DesktopNotificationState;
  developer: DesktopDeveloperState;
};

export type DesktopStatusResolverInput = {
  metrics: SystemPerformanceMetric[];
  systemPerformanceSourceStatus?: SystemPerformanceSourceStatus;
  preferredKind?: DesktopStatusKind;
  activeKinds?: DesktopStatusKind[];
  availableKinds?: DesktopStatusKind[];
  states?: Partial<DesktopStatusStateMap>;
  now?: number;
  previousKind?: DesktopStatusKind;
  previousChangedAt?: number;
  preferredUntil?: number;
  activatedAtByKind?: Partial<Record<DesktopStatusKind, number>>;
  attentionByKind?: Partial<Record<DesktopStatusKind, DesktopStatusAttentionReason>>;
  sourceHealthByKind?: GuestProviderSourceHealthMap;
  userInteractedAt?: number;
  lastGuestKind?: DesktopStatusKind;
  lastShownAtByKind?: Partial<Record<DesktopStatusKind, number>>;
};
export type DesktopStatusSchedulerInput = Omit<
  DesktopStatusResolverInput,
  "metrics" | "systemPerformanceSourceStatus" | "states" | "sourceHealthByKind"
>;

export type DesktopStatusScheduleDecision = {
  kind: DesktopStatusKind;
  reason: "preferred" | "priority" | "fallback";
  changed: boolean;
};

export type DesktopStatusAggregationInput = {
  hubState?: HubStoreState;
  events?: HubEvent[];
  now?: number;
  availableKinds?: DesktopStatusKind[];
  sourceHealthByKind?: GuestProviderSourceHealthMap;
  externalActiveKinds?: DesktopStatusKind[];
  externalStates?: Partial<DesktopStatusStateMap>;
};

export type DesktopStatusAggregationResult = {
  activeKinds: DesktopStatusKind[];
  availableKinds?: DesktopStatusKind[];
  states?: Partial<DesktopStatusStateMap>;
  attentionByKind?: Partial<Record<DesktopStatusKind, DesktopStatusAttentionReason>>;
};

export type DesktopStatusPreferenceKey = "alwaysFloat" | "avoidFullscreen" | "lockPosition";

export type DesktopStatusPreferences = Record<DesktopStatusPreferenceKey, boolean>;

export type DesktopStatusMenuActionId =
  | "refresh-data"
  | "always-float"
  | "avoid-fullscreen"
  | "lock-position"
  | "toggle-always-float"
  | "toggle-avoid-fullscreen"
  | "toggle-lock-position"
  | "reset-position"
  | "open-settings"
  | "quit";

export type DesktopStatusPreferencesPayload = {
  preferences: DesktopStatusPreferences;
};

export type HubTask = {
  id: string;
  type: HubTaskType;
  title: string;
  subtitle: string;
  progress?: number;
  accent: "pink" | "blue" | "green" | "cyan";
};

export type MediaSessionPayload = {
  available: boolean;
  playbackStatus: "playing" | "paused" | "unavailable" | "unsupported";
  progress: number;
  positionMs?: number;
  durationMs?: number;
  title?: string;
  artist?: string;
};

export type ClipboardPayload = {
  text: string;
  sourceApp: string;
  copiedAt: number;
};

export type FocusAssistPayload = {
  active: boolean;
  profile: string;
  checkedAt: number;
};

export type SystemPerformancePayload = {
  cpu: number;
  memory: number;
  downloadSpeed: number;
  uploadSpeed: number;
  quality: "live" | "fallback" | "stale" | "unavailable";
};

export type HubEvent = {
  id: string;
  type: HubTaskType;
  source: HubEventSource;
  createdAt: number;
  expiresAt?: number;
  progress?: number;
  payload?:
    | MusicState
    | NotificationState
    | HubTask
    | MediaSessionPayload
    | ClipboardPayload
    | FocusAssistPayload
    | SystemPerformancePayload;
  metadata?: Record<string, unknown>;
};

export type HubStoreState = {
  events: HubEvent[];
  mode: HubMode;
  tasks: HubTask[];
  notification?: NotificationState;
  music?: MusicState;
  clipboard?: ClipboardPayload;
  focus?: FocusAssistPayload;
  systemPerformance?: SystemPerformancePayload;
};

export type MusicState = {
  title: string;
  subtitle: string;
  time: string;
  progress: number;
};

export type NotificationState = {
  app: string;
  sender: string;
  message: string;
};

export type ShowcaseStep = {
  id: string;
  mode: HubMode;
  label: string;
  caption: string;
};
