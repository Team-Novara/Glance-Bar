import type { HubEvent } from "../status/types";

export type HubProviderLifecycle =
  | "Registered"
  | "Started"
  | "Publishing"
  | "Paused"
  | "Stopped"
  | "Failed";

export type HubProviderHealth = "Healthy" | "Degraded" | "Unhealthy";

export type HubProviderStatus = {
  lifecycle: HubProviderLifecycle;
  health: HubProviderHealth;
};

export type HubProviderKind =
  | "music"
  | "ai"
  | "download"
  | "notification"
  | "media"
  | "clipboard"
  | "focus"
  | "system"
  | "update"
  | "git"
  | "docker"
  | "npm";

export type HubProviderMetadata = {
  id: string;
  name: string;
  kind: HubProviderKind;
  version: string;
  mock: boolean;
};

export type HubProviderCapability = {
  id: HubProviderKind;
  kind: HubProviderKind;
  origin: "mock" | "native" | "real";
  support: "available" | "unsupported" | "preflight";
};

export type HubProviderListener = (events: HubEvent[]) => void;

export type MockProviderOptions = {
  now?: number | (() => number);
};

export type HubProvider = {
  id: string;
  label: string;
  metadata: HubProviderMetadata;
  capabilities: HubProviderCapability[];
  start(): void;
  stop(): void;
  subscribe(listener: HubProviderListener): () => void;
  status(): HubProviderStatus;
};
