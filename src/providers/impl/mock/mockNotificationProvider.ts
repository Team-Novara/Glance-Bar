import type { HubEvent } from "@/entities";

import {
  MOCK_NOTIFICATION_DURATION_MS,
  createMockCapabilities,
  createMockMetadata,
  createMockProvider,
  resolveNow,
} from "./shared";
import type {
  HubProvider,
  MockProviderOptions,
} from "../../core/types";


export const createMockNotificationEvent = (options: MockProviderOptions = {}): HubEvent => {
  const createdAt = resolveNow(options);

  return {
    id: `mock-notification-notification-${createdAt}`,
    expiresAt: createdAt + MOCK_NOTIFICATION_DURATION_MS,
    type: "notification",
    source: "notification",
    createdAt,
    payload: {
      app: "Cober",
      sender: "Mock Provider",
      message: "npm run qa passed",
    },
  };
};

export const createMockNotificationProvider = (options: MockProviderOptions = {}): HubProvider =>
  createMockProvider({
    metadata: createMockMetadata("notification", "Mock Notification Provider"),
    capabilities: createMockCapabilities("notification"),
    events: () => [createMockNotificationEvent(options)],
  });
