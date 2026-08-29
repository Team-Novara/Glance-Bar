import type {
  HubProvider,
  HubProviderCapability,
  HubProviderKind,
  HubProviderMetadata,
  HubProviderStatus,
} from "./types";

export type ProviderRegistryRecord = {
  id: string;
  name: string;
  kind: HubProviderKind;
  metadata: HubProviderMetadata;
  capabilities: HubProviderCapability[];
  status: HubProviderStatus;
  registrationOrder: number;
};

type ProviderRegistryRegisterResult =
  | {
      ok: true;
      record: ProviderRegistryRecord;
    }
  | {
      ok: false;
      error: "duplicate-provider-id";
      id: string;
    };

export type ProviderRegistryCapabilitySupportRecord = {
  providerId: string;
  providerName: string;
  providerKind: HubProviderKind;
  registrationOrder: number;
  capability: HubProviderCapability;
};

type ProviderRegistryCapabilitySupportSummary = {
  kind: HubProviderCapability["kind"];
  origin: HubProviderCapability["origin"];
  support: HubProviderCapability["support"];
  capabilityCount: number;
  providerCount: number;
  providerIds: string[];
};

type ProviderRegistryEntry = {
  provider: HubProvider;
  registrationOrder: number;
};

function snapshotProvider(entry: ProviderRegistryEntry): ProviderRegistryRecord {
  const { provider, registrationOrder } = entry;

  return {
    id: provider.id,
    name: provider.metadata.name,
    kind: provider.metadata.kind,
    metadata: { ...provider.metadata },
    capabilities: provider.capabilities.map((capability) => ({ ...capability })),
    status: { ...provider.status() },
    registrationOrder,
  };
}

function snapshotCapabilitySupport(
  entry: ProviderRegistryEntry,
): ProviderRegistryCapabilitySupportRecord[] {
  const { provider, registrationOrder } = entry;

  return provider.capabilities.map((capability) => ({
    providerId: provider.id,
    providerName: provider.metadata.name,
    providerKind: provider.metadata.kind,
    registrationOrder,
    capability: { ...capability },
  }));
}

function summarizeCapabilitySupportRecords(
  records: ProviderRegistryCapabilitySupportRecord[],
): ProviderRegistryCapabilitySupportSummary[] {
  const summaries = new Map<string, ProviderRegistryCapabilitySupportSummary>();

  records.forEach((record) => {
    const { capability } = record;
    const key = `${capability.kind}:${capability.origin}:${capability.support}`;
    const existing = summaries.get(key) ?? {
      kind: capability.kind,
      origin: capability.origin,
      support: capability.support,
      capabilityCount: 0,
      providerCount: 0,
      providerIds: [] as string[],
    };

    existing.capabilityCount += 1;

    if (!existing.providerIds.includes(record.providerId)) {
      existing.providerIds.push(record.providerId);
      existing.providerCount += 1;
    }

    summaries.set(key, existing);
  });

  return [...summaries.values()].map((summary) => ({
    ...summary,
    providerIds: [...summary.providerIds],
  }));
}

function sortByOrigin(
  records: ProviderRegistryCapabilitySupportRecord[],
): ProviderRegistryCapabilitySupportRecord[] {
  const order: Record<string, number> = { real: 0, native: 1, mock: 2 };

  return [...records].sort((a, b) => {
    const aOrder = order[a.capability.origin] ?? 99;
    const bOrder = order[b.capability.origin] ?? 99;

    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }

    return a.providerId.localeCompare(b.providerId);
  });
}

export function createProviderRegistry() {
  const entries = new Map<string, ProviderRegistryEntry>();
  let nextRegistrationOrder = 0;

  function getEntry(providerId: string) {
    return entries.get(providerId);
  }

  function listCapabilitySupport() {
    return [...entries.values()].flatMap(snapshotCapabilitySupport);
  }

  return {
    register(provider: HubProvider): ProviderRegistryRegisterResult {
      if (entries.has(provider.id)) {
        return {
          ok: false,
          error: "duplicate-provider-id",
          id: provider.id,
        };
      }

      const entry = {
        provider,
        registrationOrder: nextRegistrationOrder,
      };

      nextRegistrationOrder += 1;
      entries.set(provider.id, entry);

      return {
        ok: true,
        record: snapshotProvider(entry),
      };
    },

    get(providerId: string) {
      const entry = getEntry(providerId);

      return entry ? snapshotProvider(entry) : undefined;
    },

    list() {
      return [...entries.values()].map(snapshotProvider);
    },

    listCapabilitySupport,

    summarizeCapabilitySupport() {
      return summarizeCapabilitySupportRecords(listCapabilitySupport());
    },

    listProvidersByKind(kind: HubProviderKind): ProviderRegistryRecord[] {
      return [...entries.values()]
        .filter((e) => e.provider.metadata.kind === kind)
        .map(snapshotProvider)
        .sort((a, b) => a.registrationOrder - b.registrationOrder);
    },

    listRealProviders(): ProviderRegistryRecord[] {
      return [...entries.values()]
        .filter((e) =>
          e.provider.capabilities.some(
            (c) => c.origin === "real" || c.origin === "native",
          ),
        )
        .map(snapshotProvider);
    },

    listMockProviders(): ProviderRegistryRecord[] {
      return [...entries.values()]
        .filter((e) => e.provider.capabilities.every((c) => c.origin === "mock"))
        .map(snapshotProvider);
    },

    listAvailableCapabilities(): ProviderRegistryCapabilitySupportRecord[] {
      return sortByOrigin(
        [...entries.values()]
          .flatMap(snapshotCapabilitySupport)
          .filter((r) => r.capability.support === "available"),
      );
    },

    unregister(providerId: string) {
      const entry = getEntry(providerId);

      if (!entry) {
        return false;
      }

      const lifecycle = entry.provider.status().lifecycle;

      if (lifecycle === "Started" || lifecycle === "Publishing" || lifecycle === "Paused") {
        entry.provider.stop();
      }

      entries.delete(providerId);

      return true;
    },

    start(providerId: string) {
      const entry = getEntry(providerId);

      if (!entry) {
        return undefined;
      }

      entry.provider.start();

      return snapshotProvider(entry);
    },

    stop(providerId: string) {
      const entry = getEntry(providerId);

      if (!entry) {
        return undefined;
      }

      entry.provider.stop();

      return snapshotProvider(entry);
    },
  };
}
