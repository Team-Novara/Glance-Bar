import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { HubEvent } from "@/entities";
import type { ProviderRegistryRecord } from "@/providers";

import { PrivacySafeDiagnosticsPanel } from "./PrivacySafeDiagnosticsPanel";

function makeRecord(): ProviderRegistryRecord {
  return {
    id: "private-provider-id",
    name: "Private Provider Name",
    kind: "media",
    metadata: {
      id: "private-provider-id",
      name: "Private Provider Name",
      kind: "media",
      version: "1.0.0",
      mock: false,
    },
    capabilities: [{ id: "media", kind: "media", origin: "native", support: "available" }],
    status: { lifecycle: "Publishing", health: "Healthy" },
    registrationOrder: 0,
  };
}

describe("PrivacySafeDiagnosticsPanel", () => {
  it("renders bounded app/provider facts and excludes private event payloads", () => {
    const event: HubEvent = {
      id: "media-event",
      type: "media",
      source: "media",
      createdAt: 1_000,
      payload: {
        available: true,
        playbackStatus: "playing",
        progress: 50,
        title: "Private title",
        artist: "Private artist",
      },
      metadata: { code: "provider-failed", checkedAt: 1_000 },
    };

    render(<PrivacySafeDiagnosticsPanel records={[makeRecord()]} events={[event]} />);

    expect(screen.getByTestId("diagnostics-panel")).toBeInTheDocument();
    expect(screen.getByText("Privacy-safe Diagnostics")).toBeInTheDocument();
    expect(screen.getByText("media · native · available")).toBeInTheDocument();
    expect(screen.getByText("provider-failed")).toBeInTheDocument();
    expect(screen.queryByText("Private title")).not.toBeInTheDocument();
    expect(screen.queryByText("Private artist")).not.toBeInTheDocument();
  });

  it("makes an empty provider registry explicit", () => {
    render(<PrivacySafeDiagnosticsPanel records={[]} events={[]} />);

    expect(screen.getByText("No providers registered")).toBeInTheDocument();
  });
});
