import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DownloadStatusTemplate } from "./DownloadStatusTemplate";
import { mockDownloadState } from "../../../shared/test-util/fixtures";

describe("DownloadStatusTemplate", () => {
  it("renders title, subtitle, and detail", () => {
    const state = mockDownloadState();
    render(<DownloadStatusTemplate state={state} />);

    expect(screen.getByText("Windows ISO")).toBeInTheDocument();
    expect(screen.getByText("Download Task")).toBeInTheDocument();
    expect(screen.getByText("3.1 GB / 5.4 GB")).toBeInTheDocument();
    expect(screen.getByText("57%")).toBeInTheDocument();
  });

  it("renders a progress bar with correct value", () => {
    const state = mockDownloadState({ progress: 75 });
    render(<DownloadStatusTemplate state={state} />);

    const progressBar = screen.getByRole("progressbar");
    expect(progressBar).toHaveAttribute("aria-valuenow", "75");
    expect(progressBar).toHaveAttribute("aria-valuemin", "0");
    expect(progressBar).toHaveAttribute("aria-valuemax", "100");
  });

  it("shows the source health indicator", () => {
    const state = mockDownloadState();
    render(<DownloadStatusTemplate state={state} />);

    // quality: "mock" → translates to "Mock" in English
    expect(screen.getByText("Mock")).toBeInTheDocument();
  });

  it("clamps progress bar fill width between 12% and 100%", () => {
    const state = mockDownloadState({ progress: 5 });
    const { container } = render(<DownloadStatusTemplate state={state} />);

    const trackFill = container.querySelector(".product-status-track > span") as HTMLElement;
    // Math.max(12, Math.min(100, 5)) = 12
    expect(trackFill.style.width).toBe("12%");
  });

  it("renders the download icon with the shared 20/2.2 sizing", () => {
    const { container } = render(<DownloadStatusTemplate state={mockDownloadState()} />);
    const icon = container.querySelector(".product-status-icon svg");
    expect(icon).toBeInTheDocument();
    expect(icon?.getAttribute("width")).toBe("20");
    expect(icon?.getAttribute("height")).toBe("20");
    expect(icon?.getAttribute("stroke-width")).toBe("2.2");
  });

  it("renders the action button icons with the shared 14/2.4 sizing", () => {
    const { container } = render(<DownloadStatusTemplate state={mockDownloadState()} />);
    const svgs = container.querySelectorAll(".product-status-guest-btn svg");
    expect(svgs.length).toBeGreaterThan(0);
    svgs.forEach((svg) => {
      expect(svg.getAttribute("width")).toBe("14");
      expect(svg.getAttribute("height")).toBe("14");
      expect(svg.getAttribute("stroke-width")).toBe("2.4");
    });
  });
});
