import type { SystemPerformanceMetric, SystemPerformanceSourceStatus } from "./performance";
import type {
  DownloadObservationCode,
  DownloadObservationStatus,
  DownloadProgressAccuracy,
  HubEvent,
  HubStoreState,
  ProgressAccuracy,
} from "./types";

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
  progressAccuracy?: ProgressAccuracy;
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
  progressAccuracy?: DownloadProgressAccuracy;
  status?: DownloadObservationStatus;
  controllable?: boolean;
  observationCode?: DownloadObservationCode;
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
  active?: boolean;
  sessionLabel: string;
  detail: string;
  accent: DesktopStatusAccentTone;
  controllable?: boolean;
  observationCode?: "available" | "unsupported" | "permission-denied" | "error";
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
  attentionByKind?: Partial<Record<DesktopStatusKind, "new" | "near-complete" | "completion" | "urgent">>;
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
  attentionByKind?: Partial<Record<DesktopStatusKind, "new" | "near-complete" | "completion" | "urgent">>;
};

export type DesktopStatusPreferences = Record<"alwaysFloat" | "avoidFullscreen" | "lockPosition", boolean>;

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
