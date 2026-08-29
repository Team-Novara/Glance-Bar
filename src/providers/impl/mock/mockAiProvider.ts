import {
  MOCK_AI_PROGRESS_STEP,
  MOCK_AI_TICK_MS,
  createMockCapabilities,
  createMockMetadata,
  createTickingProvider,
  resolveNow,
} from "./shared";
import type { HubEvent, HubTask } from "../../../types/hub";
import type {
  HubProvider,
  MockProviderOptions,
} from "../../core/types";

export const createMockAiTaskEvent = (options: MockProviderOptions = {}): HubEvent => {
  const createdAt = resolveNow(options);

  return {
    id: `mock-ai-ai-${createdAt}`,
    type: "ai",
    source: "ai",
    createdAt,
    progress: 72,
    payload: {
      id: "mock-ai-task",
      type: "ai",
      title: "Codex is updating the provider SDK",
      subtitle: "Generating mock provider contract tests",
      progress: 72,
      accent: "blue",
    },
  };
};

type AiPhase = "analyzing" | "generating" | "review";

const resolveAiPhase = (progress: number): AiPhase => {
  if (progress < 30) {
    return "analyzing";
  }

  if (progress < 90) {
    return "generating";
  }

  return "review";
};

const AI_PHASE_SUBTITLES: Record<AiPhase, string> = {
  analyzing: "Inspecting repo context",
  generating: "Generating mock provider contract tests",
  review: "Reviewing and finalizing artifacts",
};

const buildAiEvent = (tick: number, createdAt: number): HubEvent => {
  const capped = Math.min(100, tick * MOCK_AI_PROGRESS_STEP);
  const phase = resolveAiPhase(capped);
  const payload: HubTask = {
    id: "mock-ai-task",
    type: "ai",
    title: "Codex is updating the provider SDK",
    subtitle: AI_PHASE_SUBTITLES[phase],
    progress: capped,
    accent: "blue",
  };

  return {
    id: `mock-ai-ai-${createdAt}`,
    type: "ai",
    source: "ai",
    createdAt,
    progress: capped,
    payload,
    metadata: {
      phase,
    },
  };
};

export const createMockAIProvider = (options: MockProviderOptions = {}): HubProvider =>
  createTickingProvider({
    metadata: createMockMetadata("ai", "Mock AI Provider", "mock-ai-task-provider"),
    capabilities: createMockCapabilities("ai"),
    tickMs: MOCK_AI_TICK_MS,
    buildEvent: buildAiEvent,
    baseNow: resolveNow(options),
  });

export const createMockAiTaskProvider = createMockAIProvider;
