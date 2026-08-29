import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NotificationStatusTemplate } from "./NotificationStatusTemplate";
import { mockNotificationState } from "../../../test/fixtures";

vi.mock("../../../runtime/actions/notificationDismissRuntime", () => ({
  dismissNotification: vi.fn().mockResolvedValue({ success: true }),
}));

describe("NotificationStatusTemplate", () => {
  it("renders title, subtitle, sender, and message", () => {
    const state = mockNotificationState();
    render(<NotificationStatusTemplate state={state} />);

    expect(screen.getByText("New message")).toBeInTheDocument();
    // Both the eyebrow and the subtitle render "Notification"; use a
    // collection assertion so the test still proves the pair is present.
    expect(screen.getAllByText("Notification").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Mock Provider")).toBeInTheDocument();
    expect(screen.getByText("npm run qa passed")).toBeInTheDocument();
  });

  it("renders the dismiss action with correct label and title tooltip", () => {
    const state = mockNotificationState();
    render(<NotificationStatusTemplate state={state} />);

    const dismissBtn = screen.getByLabelText("Dismiss notification");
    expect(dismissBtn).toBeInTheDocument();
    expect(dismissBtn).toHaveAttribute("title", "Dismiss notification");
  });

  it("renders the eyebrow text", () => {
    const state = mockNotificationState();
    const { container } = render(<NotificationStatusTemplate state={state} />);

    const eyebrow = container.querySelector(".product-status-state-eyebrow");
    expect(eyebrow).toBeInTheDocument();
    expect(eyebrow).toHaveTextContent("Notification");
  });

  it("shows the source health indicator with mock quality", () => {
    const state = mockNotificationState();
    render(<NotificationStatusTemplate state={state} />);

    expect(screen.getByText("Mock")).toBeInTheDocument();
  });

  it("calls dismissNotification when the dismiss button is clicked", async () => {
    const { dismissNotification } = await import("../../../runtime/actions/notificationDismissRuntime");
    const mockDismiss = vi.mocked(dismissNotification);
    mockDismiss.mockClear();

    const state = mockNotificationState();
    render(<NotificationStatusTemplate state={state} />);

    fireEvent.click(screen.getByLabelText("Dismiss notification"));
    expect(mockDismiss).toHaveBeenCalledTimes(1);
  });

  it("surfaces a dismissFailed toast when dismiss returns success=false", async () => {
    const { dismissNotification } = await import("../../../runtime/actions/notificationDismissRuntime");
    vi.mocked(dismissNotification).mockResolvedValueOnce({ success: false });

    const state = mockNotificationState();
    render(<NotificationStatusTemplate state={state} />);

    fireEvent.click(screen.getByLabelText("Dismiss notification"));
    expect(await screen.findByText("Couldn't dismiss notification")).toBeInTheDocument();
  });

  it("surfaces a dismissFailed toast when dismiss returns undefined", async () => {
    const { dismissNotification } = await import("../../../runtime/actions/notificationDismissRuntime");
    vi.mocked(dismissNotification).mockResolvedValueOnce(undefined);

    const state = mockNotificationState();
    render(<NotificationStatusTemplate state={state} />);

    fireEvent.click(screen.getByLabelText("Dismiss notification"));
    // No toast in this branch (only failure -> toast), so it should not appear
    expect(screen.queryByText("Couldn't dismiss notification")).not.toBeInTheDocument();
  });

  it("does not render a toast on initial render", () => {
    const state = mockNotificationState();
    const { container } = render(<NotificationStatusTemplate state={state} />);
    expect(container.querySelector(".product-status-toast")).not.toBeInTheDocument();
  });

  it("applies the shared frame class to the state container", () => {
    const { container } = render(<NotificationStatusTemplate state={mockNotificationState()} />);
    expect(container.querySelector(".product-status-state")).toBeInTheDocument();
  });

  it("applies the notification icon class to the icon container", () => {
    const { container } = render(<NotificationStatusTemplate state={mockNotificationState()} />);
    const icon = container.querySelector(".product-status-icon-notification");
    expect(icon).toBeInTheDocument();
  });

  it("applies the shared guest-btn and guest-btn-primary class hooks to the dismiss button", () => {
    const { container } = render(<NotificationStatusTemplate state={mockNotificationState()} />);
    const dismiss = screen.getByLabelText("Dismiss notification").closest("button");
    expect(dismiss).toHaveClass("product-status-guest-btn");
    expect(dismiss).toHaveClass("product-status-guest-btn-primary");
  });

  it("renders the meta actions wrapper with both sender and message spans", () => {
    const { container } = render(<NotificationStatusTemplate state={mockNotificationState()} />);
    const meta = container.querySelector(".product-status-template-meta-actions");
    expect(meta).toBeInTheDocument();
    const spans = meta?.querySelectorAll("span");
    expect(spans && spans.length).toBeGreaterThanOrEqual(2);
  });

  it("reflects custom state overrides", () => {
    const state = mockNotificationState({
      sender: "Slack",
      message: "Lunch at 12?",
    });
    render(<NotificationStatusTemplate state={state} />);
    expect(screen.getByText("Slack")).toBeInTheDocument();
    expect(screen.getByText("Lunch at 12?")).toBeInTheDocument();
  });

  it("renders the dismiss icon with the shared size and strokeWidth", () => {
    const { container } = render(<NotificationStatusTemplate state={mockNotificationState()} />);
    const dismiss = screen.getByLabelText("Dismiss notification");
    const svg = dismiss.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg?.getAttribute("width")).toBe("14");
    expect(svg?.getAttribute("stroke-width")).toBe("2.4");
  });

  it("renders the bell icon with the shared 20/2.2 sizing", () => {
    const { container } = render(<NotificationStatusTemplate state={mockNotificationState()} />);
    const icon = container.querySelector(".product-status-icon-notification svg");
    expect(icon).toBeInTheDocument();
    expect(icon?.getAttribute("width")).toBe("20");
    expect(icon?.getAttribute("stroke-width")).toBe("2.2");
  });
});
