import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MediaStatusTemplate } from "./MediaStatusTemplate";
import { mockMediaState } from "../../../test/fixtures";

vi.mock("../../../runtime/system/mediaControlRuntime", () => ({
  sendMediaControl: vi.fn().mockResolvedValue({ success: true }),
}));

describe("MediaStatusTemplate", () => {
  it("renders title, subtitle, artist, and time label", () => {
    const state = mockMediaState();
    render(<MediaStatusTemplate state={state} />);

    expect(screen.getByText("Neon Focus")).toBeInTheDocument();
    expect(screen.getByText("Now Playing")).toBeInTheDocument();
    expect(screen.getByText("Cober Player")).toBeInTheDocument();
    // The time label now lives in the new control row, not in the meta
    // eyebrow. The fixture provides positionMs=102_000, durationMs=208_000,
    // which formatMediaTime() renders without zero-padded minute digits
    // (Math.floor(102/60)=1, Math.floor(208/60)=3) — match the live format.
    expect(screen.getByText("1:42 / 3:28")).toBeInTheDocument();
  });

  it("renders three media control buttons", () => {
    const state = mockMediaState();
    render(<MediaStatusTemplate state={state} />);

    expect(screen.getByLabelText("Previous")).toBeInTheDocument();
    // playbackStatus is "playing" by default → shows Pause button
    expect(screen.getByLabelText("Pause")).toBeInTheDocument();
    expect(screen.getByLabelText("Next")).toBeInTheDocument();
  });

  it("renders a progress bar with correct value", () => {
    const state = mockMediaState({ progress: 65 });
    render(<MediaStatusTemplate state={state} />);

    const progressBar = screen.getByRole("progressbar");
    expect(progressBar).toHaveAttribute("aria-valuenow", "65");
  });

  it("calls sendMediaControl when control buttons are clicked", async () => {
    const { sendMediaControl } = await import("../../../runtime/system/mediaControlRuntime");
    const mockSend = vi.mocked(sendMediaControl);
    mockSend.mockClear();

    const state = mockMediaState();
    render(<MediaStatusTemplate state={state} />);

    fireEvent.click(screen.getByLabelText("Pause"));
    expect(mockSend).toHaveBeenCalledWith("play-pause");

    fireEvent.click(screen.getByLabelText("Previous"));
    expect(mockSend).toHaveBeenCalledWith("previous");

    fireEvent.click(screen.getByLabelText("Next"));
    expect(mockSend).toHaveBeenCalledWith("next");
  });

  it("shows Pause icon when playing and Play icon when paused", () => {
    const playingState = mockMediaState({ playbackStatus: "playing" });
    const { unmount } = render(<MediaStatusTemplate state={playingState} />);
    expect(screen.getByLabelText("Pause")).toBeInTheDocument();
    unmount();

    const pausedState = mockMediaState({ playbackStatus: "paused" });
    render(<MediaStatusTemplate state={pausedState} />);
    expect(screen.getByLabelText("Play")).toBeInTheDocument();
  });

  it("shows the source health indicator", () => {
    const state = mockMediaState();
    render(<MediaStatusTemplate state={state} />);

    expect(screen.getByText("Native")).toBeInTheDocument();
  });
});

describe("MediaStatusTemplate UI details", () => {
  it("applies the shared frame class to the state container", () => {
    const { container } = render(<MediaStatusTemplate state={mockMediaState()} />);
    expect(container.querySelector(".product-status-state")).toBeInTheDocument();
  });

  it("adds is-playing class to icon when playback is active", () => {
    const { container } = render(
      <MediaStatusTemplate state={mockMediaState({ playbackStatus: "playing" })} />,
    );
    const icon = container.querySelector(".product-status-icon-media");
    expect(icon).toHaveClass("is-playing");
  });

  it("omits is-playing class when paused", () => {
    const { container } = render(
      <MediaStatusTemplate state={mockMediaState({ playbackStatus: "paused" })} />,
    );
    const icon = container.querySelector(".product-status-icon-media");
    expect(icon).not.toHaveClass("is-playing");
  });

  it("progressbar label includes the i18n 'Media progress' prefix", () => {
    const state = mockMediaState({ progress: 48 });
    render(<MediaStatusTemplate state={state} />);
    const progressBar = screen.getByRole("progressbar");
    expect(progressBar.getAttribute("aria-label")).toBe("Media progress 48%");
  });

  it("media control buttons expose title tooltips for hover", () => {
    render(<MediaStatusTemplate state={mockMediaState({ playbackStatus: "playing" })} />);
    expect(screen.getByLabelText("Previous")).toHaveAttribute("title", "Previous");
    expect(screen.getByLabelText("Pause")).toHaveAttribute("title", "Pause");
    expect(screen.getByLabelText("Next")).toHaveAttribute("title", "Next");
  });

  it("shows the unavailable badge and disables controls when no player is detected", () => {
    const { container } = render(
      <MediaStatusTemplate state={mockMediaState({ playbackStatus: "unavailable" })} />,
    );
    expect(container.querySelector(".product-status-media-unavailable-badge")).toBeInTheDocument();
    const prev = screen.getByLabelText("Previous");
    const next = screen.getByLabelText("Next");
    expect(prev).toBeDisabled();
    expect(next).toBeDisabled();
  });

  it("hides the controls and progressbar when no player is detected", () => {
    const { container } = render(
      <MediaStatusTemplate state={mockMediaState({ playbackStatus: "unavailable" })} />,
    );
    // Controls stay rendered but are disabled when no player is detected
    const playBtn = screen.getByLabelText("Play");
    expect(playBtn).toBeDisabled();
    // Shimmer should be hidden (only active when playing and 0 < value < 100)
    expect(container.querySelector(".product-status-track-shimmer")).not.toBeInTheDocument();
    // Progressbar is still rendered (progress may be 0)
    expect(container.querySelectorAll('[role="progressbar"]').length).toBeGreaterThan(0);
  });
});

describe("MediaStatusTemplate UI tokens", () => {
  it("applies the shared guest-btn / guest-btn-primary class hooks", () => {
    const { container } = render(<MediaStatusTemplate state={mockMediaState()} />);
    const primary = screen.getByLabelText("Pause").closest("button");
    expect(primary).toHaveClass("product-status-guest-btn");
    expect(primary).toHaveClass("product-status-guest-btn-primary");
    const prev = screen.getByLabelText("Previous").closest("button");
    expect(prev).toHaveClass("product-status-guest-btn");
    expect(prev).not.toHaveClass("product-status-guest-btn-primary");
  });

  it("renders the state container, body and meta wrappers consistently with other guest templates", () => {
    const { container } = render(<MediaStatusTemplate state={mockMediaState()} />);
    expect(container.querySelector(".product-status-state")).toBeInTheDocument();
    expect(container.querySelector(".product-status-state-copy")).toBeInTheDocument();
    expect(container.querySelector(".product-status-state-body")).toBeInTheDocument();
    expect(container.querySelector(".product-status-template-meta")).toBeInTheDocument();
  });

  it("disables the primary play/pause button when source is unavailable", () => {
    render(<MediaStatusTemplate state={mockMediaState({ playbackStatus: "unavailable" })} />);
    const playBtn = screen.getByLabelText("Play");
    expect(playBtn).toBeDisabled();
    expect(playBtn).toHaveClass("product-status-guest-btn-primary");
  });

  it("renders the disc icon with the shared 20/2.2 sizing", () => {
    const { container } = render(<MediaStatusTemplate state={mockMediaState()} />);
    const icon = container.querySelector(".product-status-icon svg");
    expect(icon).toBeInTheDocument();
    expect(icon?.getAttribute("width")).toBe("20");
    expect(icon?.getAttribute("height")).toBe("20");
    expect(icon?.getAttribute("stroke-width")).toBe("2.2");
  });

  it("renders the control button icons with the shared 14/2.4 sizing", () => {
    const { container } = render(<MediaStatusTemplate state={mockMediaState()} />);
    const svgs = container.querySelectorAll(".product-status-guest-btn svg");
    expect(svgs.length).toBeGreaterThan(0);
    svgs.forEach((svg) => {
      expect(svg.getAttribute("width")).toBe("14");
      expect(svg.getAttribute("height")).toBe("14");
      expect(svg.getAttribute("stroke-width")).toBe("2.4");
    });
  });
});

describe("MediaStatusTemplate control row + time label", () => {
  it("renders the new control row with control buttons and time label", () => {
    const { container } = render(<MediaStatusTemplate state={mockMediaState()} />);
    const row = container.querySelector(".product-status-media-control-row");
    expect(row).toBeInTheDocument();
    expect(row?.querySelector(".product-status-guest-controls")).toBeInTheDocument();
    const time = row?.querySelector(".product-status-media-time");
    expect(time).toBeInTheDocument();
    expect(time?.textContent).toBe("1:42 / 3:28");
  });

  it("hides the time label when no position / duration is provided", () => {
    // The bar used to fall back to the progress percent here, but the
    // user found the dangling "0%" on the right edge distracting. Now
    // the label only appears when a real time string is available.
    const state = mockMediaState({
      positionMs: undefined,
      durationMs: undefined,
      progress: 42,
    });
    const { container } = render(<MediaStatusTemplate state={state} />);
    const time = container.querySelector(".product-status-media-time");
    expect(time?.textContent).toBe("");
  });

  it("hides the time label when duration is 0", () => {
    const state = mockMediaState({
      positionMs: 0,
      durationMs: 0,
      progress: 7,
    });
    const { container } = render(<MediaStatusTemplate state={state} />);
    const time = container.querySelector(".product-status-media-time");
    expect(time?.textContent).toBe("");
  });

  it("hides the visualizer and meta when the player is unavailable", () => {
    const { container } = render(
      <MediaStatusTemplate state={mockMediaState({ playbackStatus: "unavailable" })} />,
    );
    expect(container.querySelector(".product-status-media-visualizer")).not.toBeInTheDocument();
    expect(container.querySelector(".product-status-media-meta")).not.toBeInTheDocument();
  });

  it("hides the visualizer when paused but keeps the time label", () => {
    const { container } = render(
      <MediaStatusTemplate state={mockMediaState({ playbackStatus: "paused" })} />,
    );
    expect(container.querySelector(".product-status-media-visualizer")).not.toBeInTheDocument();
    expect(container.querySelector(".product-status-media-meta")).toBeInTheDocument();
    expect(container.querySelector(".product-status-media-time")).toBeInTheDocument();
  });

  it("renders the time label with the i18n 'Playback position' aria-label", () => {
    const { container } = render(<MediaStatusTemplate state={mockMediaState()} />);
    const time = container.querySelector(".product-status-media-time");
    expect(time?.getAttribute("aria-label")).toBe("Playback position");
  });
});
