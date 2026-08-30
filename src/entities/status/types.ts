export type HubMode = "idle" | "music" | "aiProgress" | "download" | "notification" | "multiTask";

export type HubTask = {
  id: string;
  type: "music" | "ai" | "download" | "notification" | "media" | "clipboard" | "focus" | "system";
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
  type: "music" | "ai" | "download" | "notification" | "media" | "clipboard" | "focus" | "system";
  source: "mock" | "system" | "music" | "download" | "ai" | "notification" | "media" | "clipboard" | "focus" | "git" | "docker" | "npm";
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
