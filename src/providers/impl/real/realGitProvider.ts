import type { HubEvent } from "@/entities";

import { createProviderShell } from "../../core/providerShell";
import type { HubProvider, HubProviderCapability, HubProviderMetadata } from "../../core/types";

const PROVIDER_ID = "real-git-provider";
const POLL_INTERVAL_MS = 5_000;

export type GitStatusCode = "available" | "no-repo" | "no-git-cli" | "not-implemented" | "error";

export type GitStatus = {
  available: boolean;
  modifiedCount: number;
  branch: string | null;
  lastCheckedAt: number;
  code: GitStatusCode;
  diagnostic?: string;
};

export type GitProviderOptions = {
  /**
   * Overrides the status check used for the initial snapshot and every
   * poll. Production never passes this: the default remains the honest
   * `not-implemented` module-local stub below (see #59).
   */
  checker?: () => Promise<GitStatus>;
};

export function gitStatusToEvent(status: GitStatus): HubEvent {
  const createdAt = status.lastCheckedAt;
  return {
    id: `${PROVIDER_ID}-git-${createdAt}`,
    type: "ai",
    source: "git",
    createdAt,
    expiresAt: createdAt + POLL_INTERVAL_MS + 500,
    payload: {
      id: "git-status",
      type: "ai",
      title: status.branch ? `Git: ${status.branch}` : "Git status",
      subtitle: status.available
        ? `${status.modifiedCount} file(s) modified`
        : (status.diagnostic ?? "unavailable"),
      progress: Math.min(100, status.modifiedCount * 10),
      accent: "pink",
    },
    metadata: {
      code: status.code,
    },
  };
}

/**
 * Stage 6 scaffolding: no native source for git repository state exists
 * yet — there is no Tauri shell bridge to run `git status`. The check
 * therefore reports an honest `not-implemented` unavailable result with no
 * fabricated branch or modification counts. Once the shell bridge is
 * available this function should call
 * `git status --porcelain --branch` and parse the output
 * (M/A/D/?/? columns + `## branch...` header) into a GitStatus.
 */
export async function checkGitStatus(): Promise<GitStatus> {
  return {
    available: false,
    modifiedCount: 0,
    branch: null,
    lastCheckedAt: Date.now(),
    code: "not-implemented",
    diagnostic: "git repository observation is not implemented: no native shell bridge exists yet.",
  };
}

export function createRealGitProvider(options: GitProviderOptions = {}): HubProvider {
  // Injection seam for tests. With no options this is exactly the honest
  // module-local stub, so the production call sites behave identically.
  const checkStatus: () => Promise<GitStatus> = options.checker ?? checkGitStatus;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let lastEmitted: GitStatus | undefined;

  const metadata: HubProviderMetadata = {
    id: PROVIDER_ID,
    name: "Real Git Provider",
    kind: "git",
    version: "1.0.0",
    mock: false,
  };

  const capabilities: HubProviderCapability[] = [
    { id: "git", kind: "git", origin: "real", support: "unsupported" },
  ];

  return createProviderShell({
    metadata,
    capabilities,

    async start(handle) {
      const initial = await checkStatus().catch(() => undefined);
      if (!initial) {
        handle.markDegraded();
        return;
      }
      if (!initial.available) {
        // No native source exists yet. Publishing this snapshot would put a
        // fabricated "Git: main" card on the bar, so the provider stays
        // idle and reports nothing. The capability already advertises
        // `unsupported`; the diagnostic vocabulary carries
        // `not-implemented` for the same fact.
        return;
      }

      lastEmitted = initial;
      handle.emit([gitStatusToEvent(initial)]);

      pollTimer = setInterval(async () => {
        const next = await checkStatus().catch(() => undefined);
        if (!next) {
          handle.markDegraded();
          return;
        }
        if (!next.available) {
          // The source went away mid-run: publish nothing rather than a
          // stale or invented snapshot.
          return;
        }

        if (
          lastEmitted &&
          lastEmitted.modifiedCount === next.modifiedCount &&
          lastEmitted.branch === next.branch
        ) {
          return;
        }
        lastEmitted = next;
        handle.emit([gitStatusToEvent(next)]);
      }, POLL_INTERVAL_MS);
    },

    stop() {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = undefined;
      }
    },
  });
}

export const REAL_GIT_POLL_INTERVAL_MS = POLL_INTERVAL_MS;
