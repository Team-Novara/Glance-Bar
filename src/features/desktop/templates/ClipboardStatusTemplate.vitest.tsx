import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ClipboardStatusTemplate } from "./ClipboardStatusTemplate";
import { mockClipboardState } from "../../../shared/test-util/fixtures";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

describe("ClipboardStatusTemplate", () => {
  it("renders title and copied text", () => {
    const state = mockClipboardState();
    render(<ClipboardStatusTemplate state={state} />);

    expect(screen.getByText("Copied Content")).toBeInTheDocument();
    expect(screen.getByText("https://github.com/example")).toBeInTheDocument();
  });

  it("shows an Open in browser button for URL content", () => {
    const state = mockClipboardState();
    render(<ClipboardStatusTemplate state={state} />);

    const openButton = screen.getByRole("button", { name: /open in browser/i });
    expect(openButton).toBeInTheDocument();
  });

  it("calls invoke with the URL when Open in browser is clicked", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const mockInvoke = vi.mocked(invoke);
    mockInvoke.mockClear();

    const state = mockClipboardState();
    render(<ClipboardStatusTemplate state={state} />);

    fireEvent.click(screen.getByRole("button", { name: /open in browser/i }));
    expect(mockInvoke).toHaveBeenCalledWith("open_url_in_browser", {
      url: "https://github.com/example",
    });
  });

  it("hides the Open in browser button for non-URL content", () => {
    const state = mockClipboardState({ copiedText: "hello world" });
    render(<ClipboardStatusTemplate state={state} />);

    expect(screen.queryByRole("button", { name: /open in browser/i })).not.toBeInTheDocument();
  });

  it("shows source health indicator with app-owned quality", () => {
    const state = mockClipboardState();
    render(<ClipboardStatusTemplate state={state} />);

    expect(screen.getByText("App")).toBeInTheDocument();
  });

  it("renders the clipboard icon with the shared 20/2.2 sizing", () => {
    const { container } = render(<ClipboardStatusTemplate state={mockClipboardState()} />);
    const icon = container.querySelector(".product-status-icon svg");
    expect(icon).toBeInTheDocument();
    expect(icon?.getAttribute("width")).toBe("20");
    expect(icon?.getAttribute("height")).toBe("20");
    expect(icon?.getAttribute("stroke-width")).toBe("2.2");
  });

  it("renders the open-in-browser icon with the shared 14/2.4 sizing", () => {
    const { container } = render(<ClipboardStatusTemplate state={mockClipboardState()} />);
    const btn = screen.getByRole("button", { name: /open in browser/i });
    const svg = btn.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg?.getAttribute("width")).toBe("14");
    expect(svg?.getAttribute("height")).toBe("14");
    expect(svg?.getAttribute("stroke-width")).toBe("2.4");
  });
});
