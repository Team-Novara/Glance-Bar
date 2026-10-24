import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ResidentStatusTemplate, hasMeasuredResidentMetrics } from "./ResidentStatusTemplate";
import { mockResidentState } from "../../../shared/test-util/fixtures";

describe("ResidentStatusTemplate", () => {
  it("renders CPU and memory bars plus network speed display", () => {
    const state = mockResidentState();
    render(<ResidentStatusTemplate state={state} />);

    // CPU and memory should have progress bars
    const progressBars = screen.getAllByRole("progressbar");
    expect(progressBars).toHaveLength(2);

    // CPU and memory labels and values
    expect(screen.getByText("CPU")).toBeInTheDocument();
    expect(screen.getByText("42%")).toBeInTheDocument();
    expect(screen.getByText("Memory")).toBeInTheDocument();
    expect(screen.getByText("61%")).toBeInTheDocument();

    // Network section shows download/upload speed values
    expect(screen.getByText("↓")).toBeInTheDocument();
    expect(screen.getByText("↑")).toBeInTheDocument();
  });

  it("shows the source quality indicator", () => {
    const state = mockResidentState({ sourceStatus: { quality: "live" } });
    render(<ResidentStatusTemplate state={state} />);

    expect(screen.getByText("Live")).toBeInTheDocument();
  });

  it("falls back to Fallback label when quality is undefined", () => {
    const state = mockResidentState({ sourceStatus: undefined });
    render(<ResidentStatusTemplate state={state} />);

    expect(screen.getByText("Fallback")).toBeInTheDocument();
  });

  it("renders CPU progressbar with correct aria-valuenow", () => {
    const state = mockResidentState();
    render(<ResidentStatusTemplate state={state} />);

    const cpuBar = screen.getAllByRole("progressbar")[0];
    expect(cpuBar).toHaveAttribute("aria-valuenow", "42");
    expect(cpuBar).toHaveAttribute("aria-valuemin", "0");
    expect(cpuBar).toHaveAttribute("aria-valuemax", "100");
  });

  it("applies correct CSS class for source quality", () => {
    const state = mockResidentState({ sourceStatus: { quality: "stale" } });
    const { container } = render(<ResidentStatusTemplate state={state} />);

    const indicator = container.querySelector(".product-status-source-health");
    expect(indicator).toHaveClass("is-stale");
  });

  it("renders the CPU icon with the shared 20/2.2 sizing", () => {
    const { container } = render(<ResidentStatusTemplate state={mockResidentState()} />);
    const icon = container.querySelector(".product-status-icon svg");
    expect(icon).toBeInTheDocument();
    expect(icon?.getAttribute("width")).toBe("20");
    expect(icon?.getAttribute("height")).toBe("20");
    expect(icon?.getAttribute("stroke-width")).toBe("2.2");
  });

  // ── Unmeasured source: no concrete values may render (PR #59) ─────

  it("renders no numeric values when the source is unavailable", () => {
    const state = mockResidentState({ sourceStatus: { quality: "unavailable" } });
    render(<ResidentStatusTemplate state={state} />);

    // The honest source chip stays.
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    // Labels stay; concrete placeholder numbers must not.
    expect(screen.getByText("CPU")).toBeInTheDocument();
    expect(screen.queryByText("42%")).not.toBeInTheDocument();
    expect(screen.queryByText("61%")).not.toBeInTheDocument();
    expect(screen.queryByText("2.3 MB/s")).not.toBeInTheDocument();
    expect(screen.queryByText("500.0 KB/s")).not.toBeInTheDocument();

    // Every value slot degrades to the em-dash placeholder
    // (2 percent metrics + download + upload).
    expect(screen.getAllByText("—")).toHaveLength(4);

    // The rails use the shared indeterminate/empty idiom: no aria-valuenow,
    // and the is-indeterminate class that drives the empty-rail CSS.
    const progressBars = screen.getAllByRole("progressbar");
    expect(progressBars).toHaveLength(2);
    for (const bar of progressBars) {
      expect(bar).toHaveClass("is-indeterminate");
      expect(bar).not.toHaveAttribute("aria-valuenow");
      expect(bar).toHaveAttribute("aria-valuemin", "0");
      expect(bar).toHaveAttribute("aria-valuemax", "100");
    }

    // The accessible name must not claim a measured usage either.
    expect(screen.getByRole("progressbar", { name: "CPU usage unavailable" })).toBeInTheDocument();
  });

  it("renders no numeric values when the source is fallback data", () => {
    const state = mockResidentState({ sourceStatus: { quality: "fallback" } });
    render(<ResidentStatusTemplate state={state} />);

    expect(screen.getByText("Fallback")).toBeInTheDocument();
    expect(screen.queryByText("42%")).not.toBeInTheDocument();
    expect(screen.queryByText("61%")).not.toBeInTheDocument();
    expect(screen.queryByText("2.3 MB/s")).not.toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(4);
    for (const bar of screen.getAllByRole("progressbar")) {
      expect(bar).not.toHaveAttribute("aria-valuenow");
    }
  });

  it("renders no numeric values when the source status is absent", () => {
    const state = mockResidentState({ sourceStatus: undefined });
    render(<ResidentStatusTemplate state={state} />);

    expect(screen.queryByText("42%")).not.toBeInTheDocument();
    expect(screen.queryByText("2.3 MB/s")).not.toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(4);
  });

  it("keeps rendering measured values when the source is stale", () => {
    // Stale still carries the last real measurement (bounded freshness
    // window), so the numbers stay — only the chip downgrades.
    const state = mockResidentState({ sourceStatus: { quality: "stale" } });
    render(<ResidentStatusTemplate state={state} />);

    expect(screen.getByText("Stale")).toBeInTheDocument();
    expect(screen.getByText("42%")).toBeInTheDocument();
    expect(screen.getByText("61%")).toBeInTheDocument();
    expect(screen.getByText("2.3 MB/s")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "CPU usage 42%" })).toHaveAttribute(
      "aria-valuenow",
      "42",
    );
    // The measured branch must not pick up the unknown-rail treatment.
    expect(screen.getByRole("progressbar", { name: "CPU usage 42%" })).not.toHaveClass(
      "is-indeterminate",
    );
  });

  it("classifies only live and stale qualities as measured", () => {
    expect(hasMeasuredResidentMetrics("live")).toBe(true);
    expect(hasMeasuredResidentMetrics("stale")).toBe(true);
    expect(hasMeasuredResidentMetrics("fallback")).toBe(false);
    expect(hasMeasuredResidentMetrics("unavailable")).toBe(false);
    expect(hasMeasuredResidentMetrics(undefined)).toBe(false);
  });
});
