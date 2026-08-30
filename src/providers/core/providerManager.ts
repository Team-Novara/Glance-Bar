import { connectProviderToEventBus, type ProviderConnection } from "./providerAdapter";
import { createProviderRegistry } from "./providerRegistry";
import type { HubProvider } from "./types";
import type { HubEventBus } from "../../state/hubState";
import {
  createMockMusicProvider,
  createMockDownloadProvider,
  createMockAIProvider,
  createMockNotificationProvider,
} from "../impl/mock/index";
import { createRealClipboardProvider } from "../impl/real/realClipboardProvider";
import { createRealDockerProvider } from "../impl/real/realDockerProvider";
import { createRealDownloadProvider } from "../impl/real/realDownloadProvider";
import { createRealFocusProvider } from "../impl/real/realFocusProvider";
import { createRealGitProvider } from "../impl/real/realGitProvider";
import { createRealMediaSessionProvider } from "../impl/real/realMediaSessionProvider";
import { createRealNpmProvider } from "../impl/real/realNpmProvider";
import { createRealSystemPerformanceProvider } from "../impl/real/realSystemPerformanceProvider";
import { createRealUpdateProvider } from "../impl/real/realUpdateProvider";

export type ProviderManagerOptions = {
  /** When true, register real (Tauri-backed) providers. Default: true. */
  realProviders?: boolean;
  /** When true, register mock providers as fallback. Default: true. */
  mockProviders?: boolean;
};

export type ProviderManager = {
  /** Start all registered providers and connect them to the event bus. */
  start(): void;
  /** Stop all providers and disconnect from the event bus. */
  stop(): void;
  /** Access the underlying registry for introspection. */
  registry: ReturnType<typeof createProviderRegistry>;
  /** List all registered provider IDs. */
  listProviderIds(): string[];
};

/**
 * Creates a unified ProviderManager that registers both real (Tauri-backed)
 * and mock providers, connecting them to a shared HubEventBus.
 *
 * This is the single entry point for the unified data pipeline:
 * all data sources flow through the Provider SDK, producing HubEvents
 * that the aggregation layer consumes.
 */
export function createProviderManager(
  eventBus: HubEventBus,
  options: ProviderManagerOptions = {},
): ProviderManager {
  const { realProviders = true, mockProviders = true } = options;
  const registry = createProviderRegistry();
  const connections: ProviderConnection[] = [];

  // Keep references to the actual provider instances.
  // The registry stores them internally but only exposes snapshots.
  const providerInstances = new Map<string, HubProvider>();

  function registerProvider(provider: HubProvider) {
    const result = registry.register(provider);
    if (result.ok) {
      providerInstances.set(provider.id, provider);
    } else {
      console.warn(`[ProviderManager] Failed to register ${provider.id}: ${result.error}`);
    }
  }

  // Register real providers (Tauri-backed). All eight real providers
  // (clipboard, docker, download, focus, git, media session, system performance,
  // update) go through the unified Provider pipeline. The previous
  // direct-listener path for media in useDesktopStatusRuntime has been
  // removed; media events now flow provider → adapter → HubEventBus →
  // store → aggregation, just like every other guest kind.
  if (realProviders) {
    registerProvider(createRealClipboardProvider());
    registerProvider(createRealDockerProvider());
    registerProvider(createRealDownloadProvider());
    registerProvider(createRealFocusProvider());
    registerProvider(createRealGitProvider());
    registerProvider(createRealMediaSessionProvider());
    registerProvider(createRealNpmProvider());
    registerProvider(createRealSystemPerformanceProvider());
    registerProvider(createRealUpdateProvider());
  }

  // Register mock providers as fallback/demo data sources
  if (mockProviders) {
    registerProvider(createMockMusicProvider());
    registerProvider(createMockDownloadProvider());
    registerProvider(createMockAIProvider());
    registerProvider(createMockNotificationProvider());
  }

  return {
    registry,

    start() {
      // Disconnect any existing connections first to prevent accumulation
      for (const connection of connections) {
        connection.disconnect();
      }
      connections.length = 0;

      for (const record of registry.list()) {
        const provider = providerInstances.get(record.id);
        if (!provider) {
          continue;
        }

        // Connect provider subscriptions to the event bus
        const connection = connectProviderToEventBus(provider, eventBus);
        connections.push(connection);

        // Start the provider
        registry.start(record.id);
      }
    },

    stop() {
      // Stop all providers
      for (const record of registry.list()) {
        registry.stop(record.id);
      }

      // Disconnect all event bus connections
      for (const connection of connections) {
        connection.disconnect();
      }
      connections.length = 0;
    },

    listProviderIds() {
      return registry.list().map((record) => record.id);
    },
  };
}
