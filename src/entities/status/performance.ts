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
