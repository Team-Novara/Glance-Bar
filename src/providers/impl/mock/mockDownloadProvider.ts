import {
  MOCK_DOWNLOAD_PROGRESS_STEP,
  MOCK_DOWNLOAD_TICK_MS,
  createMockCapabilities,
  createMockMetadata,
  createTickingProvider,
  resolveNow,
} from "./shared";
import type { HubEvent, HubTask } from "@/entities";
import type {
  HubProvider,
  MockProviderOptions,
} from "../../core/types";

export const createMockDownloadEvent = (options: MockProviderOptions = {}): HubEvent => {
  const createdAt = resolveNow(options);

  return {
    id: `mock-download-download-${createdAt}`,
    type: "download",
    source: "download",
    createdAt,
    progress: 45,
    payload: {
      id: "mock-download-task",
      type: "download",
      title: "Windows SDK Preview.zip",
      subtitle: "42.8 MB of 96 MB",
      progress: 45,
      accent: "green",
    },
  };
};

type DownloadStatus = "downloading" | "completed";

const buildDownloadEvent = (tick: number, createdAt: number): HubEvent => {
  const rawProgress = tick * MOCK_DOWNLOAD_PROGRESS_STEP;
  const capped = Math.min(100, rawProgress);
  const isCompleted = rawProgress >= 100;
  const status: DownloadStatus = isCompleted ? "completed" : "downloading";
  const payload: HubTask = {
    id: "mock-download-task",
    type: "download",
    title: "Windows SDK Preview.zip",
    subtitle: "42.8 MB of 96 MB",
    progress: capped,
    accent: "green",
  };

  return {
    id: `mock-download-download-${createdAt}`,
    type: "download",
    source: "download",
    createdAt,
    progress: capped,
    payload,
    metadata: {
      status,
    },
  };
};

export const createMockDownloadProvider = (options: MockProviderOptions = {}): HubProvider =>
  createTickingProvider({
    metadata: createMockMetadata("download", "Mock Download Provider"),
    capabilities: createMockCapabilities("download"),
    tickMs: MOCK_DOWNLOAD_TICK_MS,
    buildEvent: buildDownloadEvent,
    baseNow: resolveNow(options),
  });
