import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { ProviderStatusPanel } from "./ProviderStatusPanel";
import type { ProviderRegistryRecord } from "@/providers";
import type {
  HubProviderCapability,
  HubProviderHealth,
  HubProviderKind,
  HubProviderLifecycle,
  HubProviderMetadata,
} from "@/providers";

function makeMetadata(overrides: Partial<HubProviderMetadata> = {}): HubProviderMetadata {
  return {
    id: overrides.id ?? "music-prod",
    name: overrides.name ?? "Music Provider",
    kind: overrides.kind ?? ("music" as HubProviderKind),
    version: "1.0.0",
    mock: overrides.mock ?? false,
    ...overrides,
  };
}

function makeRecord(
  id: string,
  name: string,
  kind: HubProviderKind,
  lifecycle: HubProviderLifecycle,
  health: HubProviderHealth,
  order: number,
): ProviderRegistryRecord {
  const metadata = makeMetadata({ id, name, kind });
  const capabilities: HubProviderCapability[] = [
    {
      id: kind,
      kind,
      origin: "real",
      support: "available",
    },
  ];
  return {
    id,
    name,
    kind,
    metadata,
    capabilities,
    status: { lifecycle, health },
    registrationOrder: order,
  };
}

describe("ProviderStatusPanel", () => {
  it("renders without crashing when no records are supplied", () => {
    render(<ProviderStatusPanel records={[]} />);

    const panel = screen.getByTestId("provider-status-panel");
    expect(panel).toBeInTheDocument();
    expect(screen.getByText("Provider Status")).toBeInTheDocument();
  });

  it("renders the section title and summary counters from i18n", () => {
    const records: ProviderRegistryRecord[] = [
      makeRecord("music", "Music", "music", "Publishing", "Healthy", 0),
      makeRecord("clipboard", "Clipboard", "clipboard", "Started", "Healthy", 1),
    ];

    render(<ProviderStatusPanel records={records} />);

    // SummaryItem renders the label next to a counter.
    const healthy = screen.getByText("Healthy");
    const degraded = screen.getByText("Degraded");
    const unhealthy = screen.getByText("Unhealthy");
    const stopped = screen.getByText("Stopped");

    expect(healthy).toBeInTheDocument();
    expect(degraded).toBeInTheDocument();
    expect(unhealthy).toBeInTheDocument();
    expect(stopped).toBeInTheDocument();
  });

  it("shows the correct healthy / degraded / unhealthy / stopped counts", () => {
    const records: ProviderRegistryRecord[] = [
      makeRecord("a", "Provider A", "music", "Publishing", "Healthy", 0),
      makeRecord("b", "Provider B", "clipboard", "Started", "Healthy", 1),
      makeRecord("c", "Provider C", "download", "Started", "Degraded", 2),
      makeRecord("d", "Provider D", "focus", "Stopped", "Unhealthy", 3),
      makeRecord("e", "Provider E", "update", "Stopped", "Healthy", 4),
    ];

    render(<ProviderStatusPanel records={records} />);

    // The four summary items each render a "value" cell with the integer
    // count. Use the surrounding tone-* class to disambiguate.
    const greenItem = document.querySelector(".provider-summary-item.tone-green");
    const amberItem = document.querySelector(".provider-summary-item.tone-amber");
    const redItem = document.querySelector(".provider-summary-item.tone-red");
    const grayItem = document.querySelector(".provider-summary-item.tone-gray");

    expect(within(greenItem as HTMLElement).getByText("3")).toBeInTheDocument();
    expect(within(amberItem as HTMLElement).getByText("1")).toBeInTheDocument();
    expect(within(redItem as HTMLElement).getByText("1")).toBeInTheDocument();
    expect(within(grayItem as HTMLElement).getByText("2")).toBeInTheDocument();
  });

  it("hides the Needs Attention block when no provider is degraded or unhealthy", () => {
    const records: ProviderRegistryRecord[] = [
      makeRecord("ok-1", "Healthy A", "music", "Publishing", "Healthy", 0),
      makeRecord("ok-2", "Healthy B", "clipboard", "Started", "Healthy", 1),
    ];

    render(<ProviderStatusPanel records={records} />);

    expect(screen.queryByTestId("provider-attention")).not.toBeInTheDocument();
    expect(screen.queryByText("Needs Attention")).not.toBeInTheDocument();
  });

  it("shows the Needs Attention block listing only degraded and unhealthy providers", () => {
    const records: ProviderRegistryRecord[] = [
      makeRecord("ok", "Healthy One", "music", "Publishing", "Healthy", 0),
      makeRecord("warn-1", "Slow Download", "download", "Started", "Degraded", 1),
      makeRecord("ok-2", "Healthy Two", "clipboard", "Started", "Healthy", 2),
      makeRecord("dead", "Broken Clipboard", "clipboard", "Stopped", "Unhealthy", 3),
    ];

    render(<ProviderStatusPanel records={records} />);

    const attention = screen.getByTestId("provider-attention");
    expect(attention).toBeInTheDocument();
    expect(within(attention).getByText("Needs Attention")).toBeInTheDocument();

    // The attention list should include only the two flagged providers,
    // never the healthy ones.
    expect(within(attention).getByTestId("provider-row-warn-1")).toBeInTheDocument();
    expect(within(attention).getByTestId("provider-row-dead")).toBeInTheDocument();
    expect(within(attention).queryByTestId("provider-row-ok")).not.toBeInTheDocument();
    expect(within(attention).queryByTestId("provider-row-ok-2")).not.toBeInTheDocument();
  });

  it("preserves input ordering for the Needs Attention list", () => {
    const records: ProviderRegistryRecord[] = [
      makeRecord("first-degraded", "First", "download", "Started", "Degraded", 0),
      makeRecord("healthy", "Healthy", "music", "Publishing", "Healthy", 1),
      makeRecord("second-unhealthy", "Second", "focus", "Stopped", "Unhealthy", 2),
    ];

    render(<ProviderStatusPanel records={records} />);

    const attention = screen.getByTestId("provider-attention");
    const items = within(attention).getAllByRole("listitem");
    expect(items[0]).toHaveAttribute("data-testid", "provider-row-first-degraded");
    expect(items[1]).toHaveAttribute("data-testid", "provider-row-second-unhealthy");
  });

  it("renders the Show All disclosure with one row per record", () => {
    const records: ProviderRegistryRecord[] = [
      makeRecord("a", "Alpha", "music", "Publishing", "Healthy", 0),
      makeRecord("b", "Beta", "download", "Started", "Degraded", 1),
      makeRecord("c", "Gamma", "system", "Stopped", "Healthy", 2),
    ];

    render(<ProviderStatusPanel records={records} />);

    // The disclosure summary text comes from i18n (`settings.providers.showAll`).
    // Multiple rows may exist in the DOM (attention list + details), so we
    // scope the row assertions to the details block.
    const details = document.querySelector(".provider-details") as HTMLElement;
    expect(details).not.toBeNull();
    expect(within(details).getByText("Show All Providers")).toBeInTheDocument();
    expect(within(details).getByTestId("provider-row-a")).toBeInTheDocument();
    expect(within(details).getByTestId("provider-row-b")).toBeInTheDocument();
    expect(within(details).getByTestId("provider-row-c")).toBeInTheDocument();
  });

  it("exposes each provider's lifecycle inside the Show All disclosure", () => {
    const records: ProviderRegistryRecord[] = [
      makeRecord("p1", "Publisher", "music", "Publishing", "Healthy", 0),
      makeRecord("p2", "Stopper", "system", "Stopped", "Healthy", 1),
    ];

    const { container } = render(<ProviderStatusPanel records={records} />);

    // The details block holds the full registry list. Walk the DOM and
    // confirm the lifecycle string lives next to the matching row.
    const details = container.querySelector(".provider-details");
    expect(details).not.toBeNull();
    const publisherRow = within(details as HTMLElement).getByTestId("provider-row-p1");
    const stopperRow = within(details as HTMLElement).getByTestId("provider-row-p2");
    expect(within(publisherRow).getByText("Publishing")).toBeInTheDocument();
    expect(within(stopperRow).getByText("Stopped")).toBeInTheDocument();
  });

  it("applies the correct tone class to each summary item", () => {
    render(<ProviderStatusPanel records={[]} />);

    expect(document.querySelector(".provider-summary-item.tone-green")).toBeInTheDocument();
    expect(document.querySelector(".provider-summary-item.tone-amber")).toBeInTheDocument();
    expect(document.querySelector(".provider-summary-item.tone-red")).toBeInTheDocument();
    expect(document.querySelector(".provider-summary-item.tone-gray")).toBeInTheDocument();
  });
});
