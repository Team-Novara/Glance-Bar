import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { UpdateStatusTemplate } from "./UpdateStatusTemplate";
import { mockUpdateState } from "../../../shared/test-util/fixtures";

describe("UpdateStatusTemplate", () => {
  it("renders title, subtitle, and detail", () => {
    const state = mockUpdateState();
    render(<UpdateStatusTemplate state={state} />);

    expect(screen.getByText("System Update")).toBeInTheDocument();
    expect(screen.getByText("Ready to Restart")).toBeInTheDocument();
    expect(screen.getByText("KB5039302")).toBeInTheDocument();
  });

  it("shows the source health indicator with fixture quality", () => {
    const state = mockUpdateState();
    render(<UpdateStatusTemplate state={state} />);

    // quality: "fixture" → translates to "Fixture" in English
    expect(screen.getByText("Fixture")).toBeInTheDocument();
  });

  it("renders the eyebrow text", () => {
    const state = mockUpdateState();
    const { container } = render(<UpdateStatusTemplate state={state} />);

    const eyebrow = container.querySelector(".product-status-state-eyebrow");
    expect(eyebrow).toHaveTextContent("Update");
  });

  it("renders the refresh icon with the shared 20/2.2 sizing", () => {
    const { container } = render(<UpdateStatusTemplate state={mockUpdateState()} />);
    const icon = container.querySelector(".product-status-icon svg");
    expect(icon).toBeInTheDocument();
    expect(icon?.getAttribute("width")).toBe("20");
    expect(icon?.getAttribute("height")).toBe("20");
    expect(icon?.getAttribute("stroke-width")).toBe("2.2");
  });

  it("renders the install action icon with the shared 14/2.4 sizing", () => {
    const { container } = render(<UpdateStatusTemplate state={mockUpdateState()} />);
    const btn = screen.getByRole("button", { name: /install now/i });
    const svg = btn.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg?.getAttribute("width")).toBe("14");
    expect(svg?.getAttribute("height")).toBe("14");
    expect(svg?.getAttribute("stroke-width")).toBe("2.4");
  });
});
