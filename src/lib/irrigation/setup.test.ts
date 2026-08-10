import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETUP,
  hasLocation,
  parseEvents,
  parseIrrigation,
  parseSetup,
} from "./setup";

describe("parseSetup", () => {
  it("reads a complete setup back", () => {
    const stored = {
      latitude: 36.2077,
      longitude: -119.3473,
      soil: "clay",
      patchAreaSqFt: 400,
      rootDepthInches: 24,
      canopyPercent: 70,
    };
    expect(parseSetup(stored)).toEqual(stored);
  });

  it("falls back to defaults for anything absent", () => {
    expect(parseSetup({})).toEqual(DEFAULT_SETUP);
    expect(parseSetup(null)).toEqual(DEFAULT_SETUP);
    expect(parseSetup("nonsense")).toEqual(DEFAULT_SETUP);
  });

  it("rejects coordinates that are not coordinates", () => {
    // A wrong latitude would fetch ETo for the wrong hemisphere rather than
    // failing, so it is dropped rather than clamped.
    expect(parseSetup({ latitude: 91 }).latitude).toBeNull();
    expect(parseSetup({ latitude: "36.2" }).latitude).toBeNull();
    expect(parseSetup({ longitude: -181 }).longitude).toBeNull();
    expect(parseSetup({ latitude: Number.NaN }).latitude).toBeNull();
  });

  it("keeps a legitimate zero coordinate", () => {
    // Null Island is a real place to a validator; 0 must not read as absent.
    expect(parseSetup({ latitude: 0, longitude: 0 }).latitude).toBe(0);
    expect(parseSetup({ latitude: 0, longitude: 0 }).longitude).toBe(0);
  });

  it("only accepts a soil type the balance knows", () => {
    expect(parseSetup({ soil: "sand" }).soil).toBe("sand");
    expect(parseSetup({ soil: "silt" }).soil).toBe(DEFAULT_SETUP.soil);
    expect(parseSetup({ soil: 3 }).soil).toBe(DEFAULT_SETUP.soil);
  });

  it("refuses a root depth that would make the balance meaningless", () => {
    expect(parseSetup({ rootDepthInches: 0 }).rootDepthInches).toBe(18);
    expect(parseSetup({ rootDepthInches: -5 }).rootDepthInches).toBe(18);
    expect(parseSetup({ rootDepthInches: 36 }).rootDepthInches).toBe(36);
  });

  it("keeps canopy inside 0..100", () => {
    expect(parseSetup({ canopyPercent: 0 }).canopyPercent).toBe(0);
    expect(parseSetup({ canopyPercent: 55 }).canopyPercent).toBe(55);
    expect(parseSetup({ canopyPercent: 140 }).canopyPercent).toBe(100);
    expect(parseSetup({ canopyPercent: -1 }).canopyPercent).toBe(100);
  });
});

describe("hasLocation", () => {
  it("needs both halves of a coordinate", () => {
    expect(hasLocation(DEFAULT_SETUP)).toBe(false);
    expect(hasLocation({ ...DEFAULT_SETUP, latitude: 36.2 })).toBe(false);
    expect(hasLocation({ ...DEFAULT_SETUP, latitude: 36.2, longitude: -119.3 })).toBe(
      true,
    );
  });

  it("counts zero as a location", () => {
    expect(hasLocation({ ...DEFAULT_SETUP, latitude: 0, longitude: 0 })).toBe(true);
  });
});

describe("parseEvents", () => {
  it("reads both kinds back, in date order", () => {
    expect(
      parseEvents([
        { id: "b", date: "2026-08-05", kind: "refill" },
        { id: "a", date: "2026-08-01", kind: "inches", inches: 0.5 },
      ]),
    ).toEqual([
      { id: "a", date: "2026-08-01", kind: "inches", inches: 0.5 },
      { id: "b", date: "2026-08-05", kind: "refill" },
    ]);
  });

  it("drops anything without a usable date", () => {
    expect(parseEvents([{ id: "a", date: "yesterday", kind: "refill" }])).toEqual([]);
    expect(parseEvents([{ id: "a", kind: "refill" }])).toEqual([]);
    expect(parseEvents([{ id: "a", date: "2026-8-1", kind: "refill" }])).toEqual([]);
  });

  it("drops an inches event with no usable amount", () => {
    // Zero inches applied is not an irrigation; it would silently do nothing.
    expect(parseEvents([{ date: "2026-08-01", kind: "inches", inches: 0 }])).toEqual([]);
    expect(parseEvents([{ date: "2026-08-01", kind: "inches", inches: -1 }])).toEqual([]);
    expect(parseEvents([{ date: "2026-08-01", kind: "inches" }])).toEqual([]);
  });

  it("drops an unknown kind rather than guessing", () => {
    expect(parseEvents([{ date: "2026-08-01", kind: "sprinkle" }])).toEqual([]);
  });

  it("invents an id when one is missing, so React keys stay stable", () => {
    const events = parseEvents([{ date: "2026-08-01", kind: "refill" }]);
    expect(events[0].id).toBeTruthy();
  });

  it("returns empty for anything that is not a list", () => {
    expect(parseEvents(null)).toEqual([]);
    expect(parseEvents({})).toEqual([]);
    expect(parseEvents("[]")).toEqual([]);
  });
});

describe("parseIrrigation", () => {
  it("returns null for a fruit saved before irrigation existed", () => {
    // The caller leaves the key absent rather than writing defaults over
    // every fruit the grower already owns.
    expect(parseIrrigation(undefined)).toBeNull();
    expect(parseIrrigation(null)).toBeNull();
  });

  it("fills in defaults for a partially written blob", () => {
    expect(parseIrrigation({})).toEqual({ setup: DEFAULT_SETUP, events: [] });
  });

  it("reads a full blob", () => {
    const state = parseIrrigation({
      setup: { latitude: 36.2, longitude: -119.3, soil: "sand" },
      events: [{ id: "a", date: "2026-08-01", kind: "refill" }],
    });
    expect(state?.setup.soil).toBe("sand");
    expect(state?.setup.latitude).toBe(36.2);
    expect(state?.events).toHaveLength(1);
  });
});
