import { describe, it, expect } from "vitest";
import {
  clampProgress,
  dedupeKinds,
  dedupeKindsOrEmpty,
  isFiniteNumber,
  isHubEventSource,
  isHubEventType,
  isOptionalNumber,
  isOptionalRecord,
  isRecord,
  parseHubEvent,
  parseHubEvents,
  snapshotHubEvent,
} from "./runtimeGuards";
import type { HubEvent } from "@/entities";

describe("isRecord", () => {
  it("returns true for plain objects", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ id: "evt-1", progress: 50 })).toBe(true);
  });

  it("returns false for null and undefined", () => {
    expect(isRecord(null)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
  });

  it("returns false for primitive values", () => {
    expect(isRecord(0)).toBe(false);
    expect(isRecord("hello")).toBe(false);
    expect(isRecord(true)).toBe(false);
  });

  it("returns false for arrays", () => {
    expect(isRecord([])).toBe(false);
    expect(isRecord([1, 2, 3])).toBe(false);
  });
});

describe("isFiniteNumber", () => {
  it("returns true for finite numeric values", () => {
    expect(isFiniteNumber(0)).toBe(true);
    expect(isFiniteNumber(-7.5)).toBe(true);
    expect(isFiniteNumber(42)).toBe(true);
  });

  it("returns false for NaN and Infinity", () => {
    expect(isFiniteNumber(Number.NaN)).toBe(false);
    expect(isFiniteNumber(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isFiniteNumber(Number.NEGATIVE_INFINITY)).toBe(false);
  });

  it("returns false for non-number values", () => {
    expect(isFiniteNumber("42")).toBe(false);
    expect(isFiniteNumber(null)).toBe(false);
    expect(isFiniteNumber(undefined)).toBe(false);
    expect(isFiniteNumber({})).toBe(false);
    expect(isFiniteNumber([])).toBe(false);
  });
});

describe("isOptionalNumber", () => {
  it("returns true for undefined", () => {
    expect(isOptionalNumber(undefined)).toBe(true);
  });

  it("returns true for finite numbers", () => {
    expect(isOptionalNumber(0)).toBe(true);
    expect(isOptionalNumber(99.99)).toBe(true);
    expect(isOptionalNumber(-1)).toBe(true);
  });

  it("returns false for NaN and Infinity", () => {
    expect(isOptionalNumber(Number.NaN)).toBe(false);
    expect(isOptionalNumber(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isOptionalNumber(Number.NEGATIVE_INFINITY)).toBe(false);
  });

  it("returns false for non-number values", () => {
    expect(isOptionalNumber("42")).toBe(false);
    expect(isOptionalNumber(null)).toBe(false);
    expect(isOptionalNumber({})).toBe(false);
  });
});

describe("isOptionalRecord", () => {
  it("returns true for undefined", () => {
    expect(isOptionalRecord(undefined)).toBe(true);
  });

  it("returns true for plain objects", () => {
    expect(isOptionalRecord({})).toBe(true);
    expect(isOptionalRecord({ key: "value" })).toBe(true);
  });

  it("returns false for null, primitives, and arrays", () => {
    expect(isOptionalRecord(null)).toBe(false);
    expect(isOptionalRecord("string")).toBe(false);
    expect(isOptionalRecord(42)).toBe(false);
    expect(isOptionalRecord([])).toBe(false);
  });
});

describe("isHubEventType", () => {
  it("returns true for known event types", () => {
    expect(isHubEventType("music")).toBe(true);
    expect(isHubEventType("ai")).toBe(true);
    expect(isHubEventType("download")).toBe(true);
    expect(isHubEventType("notification")).toBe(true);
    expect(isHubEventType("media")).toBe(true);
    expect(isHubEventType("clipboard")).toBe(true);
    expect(isHubEventType("focus")).toBe(true);
    expect(isHubEventType("system")).toBe(true);
  });

  it("returns false for unknown event types", () => {
    expect(isHubEventType("unknown")).toBe(false);
    expect(isHubEventType("")).toBe(false);
  });

  it("returns false for non-string values", () => {
    expect(isHubEventType(1)).toBe(false);
    expect(isHubEventType(null)).toBe(false);
    expect(isHubEventType(undefined)).toBe(false);
    expect(isHubEventType({})).toBe(false);
  });
});

describe("isHubEventSource", () => {
  it("returns true for known event sources", () => {
    expect(isHubEventSource("mock")).toBe(true);
    expect(isHubEventSource("system")).toBe(true);
    expect(isHubEventSource("music")).toBe(true);
    expect(isHubEventSource("download")).toBe(true);
    expect(isHubEventSource("ai")).toBe(true);
    expect(isHubEventSource("notification")).toBe(true);
    expect(isHubEventSource("media")).toBe(true);
    expect(isHubEventSource("clipboard")).toBe(true);
    expect(isHubEventSource("focus")).toBe(true);
    expect(isHubEventSource("git")).toBe(true);
    expect(isHubEventSource("docker")).toBe(true);
    expect(isHubEventSource("npm")).toBe(true);
  });

  it("returns false for unknown event sources", () => {
    expect(isHubEventSource("nope")).toBe(false);
    expect(isHubEventSource("")).toBe(false);
  });

  it("returns false for non-string values", () => {
    expect(isHubEventSource(0)).toBe(false);
    expect(isHubEventSource(null)).toBe(false);
    expect(isHubEventSource(undefined)).toBe(false);
    expect(isHubEventSource([])).toBe(false);
  });
});

describe("parseHubEvent", () => {
  const baseEvent = {
    id: "evt-1",
    type: "music" as const,
    source: "music" as const,
    createdAt: 1_700_000_000_000,
  };

  it("parses a minimal valid event", () => {
    const result = parseHubEvent({ ...baseEvent });

    expect(result).toEqual({
      id: "evt-1",
      type: "music",
      source: "music",
      createdAt: 1_700_000_000_000,
    });
  });

  it("parses a full event with optional fields", () => {
    const result = parseHubEvent({
      ...baseEvent,
      expiresAt: 1_700_000_500_000,
      progress: 75,
      payload: { foo: "bar" },
      metadata: { source: "test" },
    });

    expect(result).toEqual({
      id: "evt-1",
      type: "music",
      source: "music",
      createdAt: 1_700_000_000_000,
      expiresAt: 1_700_000_500_000,
      progress: 75,
      payload: { foo: "bar" },
      metadata: { source: "test" },
    });
  });

  it("returns undefined for non-record values", () => {
    expect(parseHubEvent(null)).toBeUndefined();
    expect(parseHubEvent(undefined)).toBeUndefined();
    expect(parseHubEvent("not an event")).toBeUndefined();
    expect(parseHubEvent(42)).toBeUndefined();
    expect(parseHubEvent([])).toBeUndefined();
  });

  it("returns undefined when id is missing or not a string", () => {
    expect(parseHubEvent({ ...baseEvent, id: undefined })).toBeUndefined();
    expect(parseHubEvent({ ...baseEvent, id: 42 })).toBeUndefined();
    expect(parseHubEvent({ ...baseEvent, id: null })).toBeUndefined();
  });

  it("returns undefined when type is unknown or not a string", () => {
    expect(parseHubEvent({ ...baseEvent, type: "bogus" })).toBeUndefined();
    expect(parseHubEvent({ ...baseEvent, type: 1 })).toBeUndefined();
  });

  it("returns undefined when source is unknown or not a string", () => {
    expect(parseHubEvent({ ...baseEvent, source: "bogus" })).toBeUndefined();
    expect(parseHubEvent({ ...baseEvent, source: null })).toBeUndefined();
  });

  it("returns undefined when createdAt is not a finite number", () => {
    expect(parseHubEvent({ ...baseEvent, createdAt: "now" })).toBeUndefined();
    expect(parseHubEvent({ ...baseEvent, createdAt: Number.NaN })).toBeUndefined();
    expect(parseHubEvent({ ...baseEvent, createdAt: Number.POSITIVE_INFINITY })).toBeUndefined();
  });

  it("returns undefined when expiresAt is not optional-number compatible", () => {
    expect(parseHubEvent({ ...baseEvent, expiresAt: "soon" })).toBeUndefined();
    expect(parseHubEvent({ ...baseEvent, expiresAt: Number.NaN })).toBeUndefined();
  });

  it("returns undefined when progress is not optional-number compatible", () => {
    expect(parseHubEvent({ ...baseEvent, progress: "fifty" })).toBeUndefined();
    expect(parseHubEvent({ ...baseEvent, progress: Number.POSITIVE_INFINITY })).toBeUndefined();
  });

  it("returns undefined when payload is not an optional record", () => {
    expect(parseHubEvent({ ...baseEvent, payload: "raw" })).toBeUndefined();
    expect(parseHubEvent({ ...baseEvent, payload: 42 })).toBeUndefined();
  });

  it("returns undefined when metadata is not an optional record", () => {
    expect(parseHubEvent({ ...baseEvent, metadata: "raw" })).toBeUndefined();
    expect(parseHubEvent({ ...baseEvent, metadata: 0 })).toBeUndefined();
  });
});

describe("parseHubEvents", () => {
  const validEvent = {
    id: "evt-1",
    type: "music",
    source: "music",
    createdAt: 1_700_000_000_000,
  };

  it("parses an array of valid events", () => {
    const result = parseHubEvents([
      validEvent,
      { ...validEvent, id: "evt-2" },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe("evt-1");
    expect(result[1]?.id).toBe("evt-2");
  });

  it("filters out invalid events while keeping valid ones", () => {
    const result = parseHubEvents([
      validEvent,
      null,
      { ...validEvent, type: "bogus" },
      { ...validEvent, id: "evt-3", source: "system" },
      "not an event",
      42,
    ]);

    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe("evt-1");
    expect(result[1]?.id).toBe("evt-3");
  });

  it("returns an empty array when given an empty array", () => {
    expect(parseHubEvents([])).toEqual([]);
  });

  it("returns an empty array when every event is invalid", () => {
    expect(parseHubEvents([null, undefined, "no", 42])).toEqual([]);
  });
});

describe("snapshotHubEvent", () => {
  it("returns a top-level shallow clone", () => {
    const original: HubEvent = {
      id: "evt-1",
      type: "music",
      source: "music",
      createdAt: 1_700_000_000_000,
    };

    const snapshot = snapshotHubEvent(original);

    expect(snapshot).toEqual(original);
    expect(snapshot).not.toBe(original);
  });

  it("shallow-clones payload and metadata so mutations do not leak back", () => {
    const originalPayload = { title: "Track", progress: 50 };
    const originalMetadata = { traceId: "abc" };
    const original: HubEvent = {
      id: "evt-1",
      type: "music",
      source: "music",
      createdAt: 1_700_000_000_000,
      payload: originalPayload,
      metadata: originalMetadata,
    };

    const snapshot = snapshotHubEvent(original);

    expect(snapshot.payload).toEqual(originalPayload);
    expect(snapshot.payload).not.toBe(originalPayload);
    expect(snapshot.metadata).toEqual(originalMetadata);
    expect(snapshot.metadata).not.toBe(originalMetadata);

    if (
      typeof snapshot.payload === "object" &&
      snapshot.payload !== null &&
      "title" in snapshot.payload
    ) {
      (snapshot.payload as { title: string }).title = "Mutated";
    }
    expect(originalPayload.title).toBe("Track");
  });

  it("preserves undefined payload and metadata without inventing empty objects", () => {
    const original: HubEvent = {
      id: "evt-1",
      type: "music",
      source: "music",
      createdAt: 1_700_000_000_000,
    };

    const snapshot = snapshotHubEvent(original);

    expect(snapshot.payload).toBeUndefined();
    expect(snapshot.metadata).toBeUndefined();
  });
});

describe("dedupeKinds", () => {
  it("removes duplicates while preserving first-occurrence order", () => {
    expect(dedupeKinds(["a", "b", "a", "c", "b"])).toEqual(["a", "b", "c"]);
  });

  it("returns an empty array for empty input", () => {
    expect(dedupeKinds([])).toEqual([]);
  });

  it("returns the same items when there are no duplicates", () => {
    expect(dedupeKinds(["x", "y", "z"])).toEqual(["x", "y", "z"]);
  });

  it("treats identical object references as duplicates", () => {
    const a = { id: 1 };
    const b = { id: 2 };
    expect(dedupeKinds([a, b, a])).toEqual([a, b]);
  });
});

describe("dedupeKindsOrEmpty", () => {
  it("returns an empty array for undefined input", () => {
    expect(dedupeKindsOrEmpty(undefined)).toEqual([]);
  });

  it("returns an empty array for empty input", () => {
    expect(dedupeKindsOrEmpty([])).toEqual([]);
  });

  it("deduplicates a populated array", () => {
    expect(dedupeKindsOrEmpty(["a", "b", "a"])).toEqual(["a", "b"]);
  });
});

describe("clampProgress", () => {
  it("clamps values above 100 down to 100", () => {
    expect(clampProgress(150)).toBe(100);
    expect(clampProgress(100.5)).toBe(100);
  });

  it("clamps values below 0 up to 0", () => {
    expect(clampProgress(-5)).toBe(0);
    expect(clampProgress(-0.0001)).toBe(0);
  });

  it("preserves values inside the 0-100 range", () => {
    expect(clampProgress(0)).toBe(0);
    expect(clampProgress(50)).toBe(50);
    expect(clampProgress(100)).toBe(100);
  });

  it("falls back to the default when value is undefined or non-finite", () => {
    expect(clampProgress(undefined)).toBe(0);
    expect(clampProgress(Number.NaN)).toBe(0);
    expect(clampProgress(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("uses a custom fallback when supplied", () => {
    expect(clampProgress(undefined, 42)).toBe(42);
    expect(clampProgress(Number.NaN, 7)).toBe(7);
  });
});
