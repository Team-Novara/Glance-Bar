import type { HubEvent, MusicState } from "@/entities";

import {
  MOCK_MUSIC_PROGRESS_STEP,
  MOCK_MUSIC_TICK_MS,
  createEventId,
  createMockCapabilities,
  createMockMetadata,
  createTickingProvider,
  resolveNow,
} from "./shared";
import type {
  HubProvider,
  HubProviderCapability,
  HubProviderMetadata,
  MockProviderOptions,
} from "../../core/types";


export const createMockMusicEvent = (options: MockProviderOptions = {}): HubEvent => {
  const createdAt = resolveNow(options);

  return {
    id: createEventId("mock-music", "music", createdAt),
    type: "music",
    source: "music",
    createdAt,
    progress: 68,
    payload: {
      title: "Midnight City",
      subtitle: "M83 - Hurry Up, We're Dreaming",
      time: "2:46 / 4:03",
      progress: 68,
    },
  };
};

const buildMusicEvent = (tick: number, createdAt: number): HubEvent => {
  const progress = (tick * MOCK_MUSIC_PROGRESS_STEP + 68) % 100;
  const payload: MusicState = {
    title: "Midnight City",
    subtitle: "M83 - Hurry Up, We're Dreaming",
    time: "2:46 / 4:03",
    progress,
  };

  return {
    id: `mock-music-music-${createdAt}`,
    type: "music",
    source: "music",
    createdAt,
    progress,
    payload,
  };
};

export const createMockMusicProvider = (options: MockProviderOptions = {}): HubProvider =>
  createTickingProvider({
    metadata: createMockMetadata("music", "Mock Music Provider"),
    capabilities: createMockCapabilities("music"),
    tickMs: MOCK_MUSIC_TICK_MS,
    buildEvent: buildMusicEvent,
    baseNow: resolveNow(options),
  });

// Re-export for compat with code importing the capability/metadata helpers.
export { type HubProviderCapability, type HubProviderMetadata };
