import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GuestSourceHealthIndicator } from "./GuestSourceHealthIndicator";
import { guestSourceQualityLabel } from "./GuestSourceHealthIndicator";
import type { GuestProviderSourceQuality } from "@/entities";

describe("GuestSourceHealthIndicator", () => {
  it("renders the quality label text", () => {
    render(
      <GuestSourceHealthIndicator
        sourceHealth={{
          kind: "media",
          quality: "native",
          code: "available",
          safeToDisplay: true,
          lastCheckedAt: Date.now(),
        }}
      />,
    );

    expect(screen.getByText("Native")).toBeInTheDocument();
  });

  it("renders Unavailable when sourceHealth is undefined", () => {
    render(<GuestSourceHealthIndicator sourceHealth={undefined} />);

    expect(screen.getByText("Unavailable")).toBeInTheDocument();
  });

  it("applies the correct CSS class for native quality", () => {
    const { container } = render(
      <GuestSourceHealthIndicator
        sourceHealth={{
          kind: "media",
          quality: "native",
          code: "available",
          safeToDisplay: true,
          lastCheckedAt: Date.now(),
        }}
      />,
    );

    const indicator = container.querySelector(".product-status-source-health");
    // native → maps to sourceQualityClassName("live") → "is-live"
    expect(indicator).toHaveClass("is-live");
  });
});

describe("guestSourceQualityLabel", () => {
  const expectedLabels: Record<GuestProviderSourceQuality, string> = {
    native: "Native",
    "app-owned": "App",
    fixture: "Fixture",
    mock: "Mock",
    unavailable: "Unavailable",
  };

  for (const [quality, label] of Object.entries(expectedLabels)) {
    it(`returns "${label}" for quality "${quality}"`, () => {
      expect(guestSourceQualityLabel(quality as GuestProviderSourceQuality)).toBe(label);
    });
  }

  it("returns Unavailable for undefined quality", () => {
    expect(guestSourceQualityLabel(undefined)).toBe("Unavailable");
  });
});
