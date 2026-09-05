import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FocusStatusTemplate } from "./FocusStatusTemplate";
import { mockFocusState } from "../../../shared/test-util/fixtures";

describe("FocusStatusTemplate", () => {
  it("renders title, subtitle, session label, and detail", () => {
    const state = mockFocusState();
    render(<FocusStatusTemplate state={state} />);

    expect(screen.getByText("Focus Mode")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Deep work 25 min")).toBeInTheDocument();
    expect(screen.getByText("12 min remaining")).toBeInTheDocument();
  });

  it("shows the source health indicator with native quality", () => {
    const state = mockFocusState();
    render(<FocusStatusTemplate state={state} />);

    // quality: "native" → translates to "Native" in English
    expect(screen.getByText("Native")).toBeInTheDocument();
  });

  it("renders the eyebrow text", () => {
    const state = mockFocusState();
    const { container } = render(<FocusStatusTemplate state={state} />);

    const eyebrow = container.querySelector(".product-status-state-eyebrow");
    expect(eyebrow).toHaveTextContent("Focus");
  });

  it("reflects custom state overrides", () => {
    const state = mockFocusState({
      title: "Do Not Disturb",
      subtitle: "Windows Focus Assist",
      sessionLabel: "Priority only",
      detail: "Until 6:00 PM",
    });
    render(<FocusStatusTemplate state={state} />);

    expect(screen.getByText("Do Not Disturb")).toBeInTheDocument();
    expect(screen.getByText("Windows Focus Assist")).toBeInTheDocument();
    expect(screen.getByText("Priority only")).toBeInTheDocument();
    expect(screen.getByText("Until 6:00 PM")).toBeInTheDocument();
  });

  it("renders the moon icon with the shared 20/2.2 sizing", () => {
    const { container } = render(<FocusStatusTemplate state={mockFocusState()} />);
    const icon = container.querySelector(".product-status-icon svg");
    expect(icon).toBeInTheDocument();
    expect(icon?.getAttribute("width")).toBe("20");
    expect(icon?.getAttribute("height")).toBe("20");
    expect(icon?.getAttribute("stroke-width")).toBe("2.2");
  });

  it("renders the stop-focus action icon with the shared 14/2.4 sizing", () => {
    const { container } = render(
      <FocusStatusTemplate state={mockFocusState({ controllable: true })} />,
    );
    const btn = screen.getByRole("button", { name: /stop session/i });
    const svg = btn.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg?.getAttribute("width")).toBe("14");
    expect(svg?.getAttribute("height")).toBe("14");
    expect(svg?.getAttribute("stroke-width")).toBe("2.4");
  });

  it("hides the stop action when the native observation is not controllable", () => {
    render(
      <FocusStatusTemplate
        state={mockFocusState({
          source: "system",
          controllable: false,
          observationCode: "unsupported",
          sourceHealth: {
            kind: "focus",
            quality: "unavailable",
            code: "unsupported",
            safeToDisplay: false,
            lastCheckedAt: 1,
          },
        })}
      />,
    );

    expect(screen.queryByRole("button", { name: /stop session/i })).not.toBeInTheDocument();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
  });

  it("hides the stop action after the focus session ends", () => {
    render(
      <FocusStatusTemplate
        state={mockFocusState({
          source: "system",
          active: false,
          controllable: true,
          observationCode: "available",
        })}
      />,
    );

    expect(screen.queryByRole("button", { name: /stop session/i })).not.toBeInTheDocument();
  });
});
