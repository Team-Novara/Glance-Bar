import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ResidentStatusTemplate } from "./ResidentStatusTemplate";
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
});
