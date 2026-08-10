import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROOT_DEPTH_INCHES,
  KC_CURVE,
  MAD,
  SOIL_AWC_IN_PER_FT,
  canopyDefaultIsSafe,
  daysUntilIrrigation,
  etcInches,
  gallonsToInches,
  inchesToGallons,
  kcForDap,
  runBalance,
  splitAt,
  totalAvailableWater,
  triggerDepletion,
  type IrrigationEvent,
} from "./balance";

describe("kcForDap", () => {
  it("hits every published point exactly", () => {
    for (const [dap, kc] of KC_CURVE) {
      expect(kcForDap(dap)).toBeCloseTo(kc, 10);
    }
  });

  it("interpolates linearly between points", () => {
    // Halfway from day 0 (0.60) to day 15 (0.90).
    expect(kcForDap(7.5)).toBeCloseTo(0.75, 10);
    // Halfway from day 30 (1.05) to day 60 (1.00).
    expect(kcForDap(45)).toBeCloseTo(1.025, 10);
    // Two thirds from day 60 (1.00) to day 90 (0.80).
    expect(kcForDap(80)).toBeCloseTo(0.8667, 3);
  });

  it("holds flat outside the curve rather than extrapolating to nonsense", () => {
    expect(kcForDap(-40)).toBe(0.6);
    expect(kcForDap(200)).toBe(0.8);
  });

  it("falls back to the start of the curve when DAP is unknown", () => {
    expect(kcForDap(Number.NaN)).toBe(0.6);
  });

  it("peaks at canopy closure, not at the end", () => {
    expect(kcForDap(30)).toBeGreaterThan(kcForDap(0));
    expect(kcForDap(30)).toBeGreaterThan(kcForDap(90));
  });
});

describe("etcInches", () => {
  it("is the product of the three terms", () => {
    expect(etcInches(0.25, 1.05, 1)).toBeCloseTo(0.2625, 10);
    expect(etcInches(0.25, 1.05, 0.5)).toBeCloseTo(0.13125, 10);
  });

  it("clamps canopy to 0..1 rather than trusting a stray slider value", () => {
    expect(etcInches(0.25, 1, 5)).toBeCloseTo(0.25, 10);
    expect(etcInches(0.25, 1, -1)).toBe(0);
  });

  it("returns zero for a missing or negative reference", () => {
    expect(etcInches(0, 1, 1)).toBe(0);
    expect(etcInches(-1, 1, 1)).toBe(0);
    expect(etcInches(Number.NaN, 1, 1)).toBe(0);
  });
});

describe("soil capacity", () => {
  it("uses the published holding capacities", () => {
    expect(SOIL_AWC_IN_PER_FT).toEqual({ sand: 1.0, loam: 2.0, clay: 2.4 });
  });

  it("scales capacity by root depth", () => {
    // Loam at 18in: 2.0 x 1.5ft = 3.0in of water in the root zone.
    expect(totalAvailableWater("loam", DEFAULT_ROOT_DEPTH_INCHES)).toBeCloseTo(3, 10);
    expect(totalAvailableWater("sand", 12)).toBeCloseTo(1, 10);
    expect(totalAvailableWater("clay", 24)).toBeCloseTo(4.8, 10);
  });

  it("does not go negative on a nonsense depth", () => {
    expect(totalAvailableWater("loam", -10)).toBe(0);
    expect(totalAvailableWater("loam", Number.NaN)).toBe(0);
  });

  it("triggers at half of capacity", () => {
    expect(MAD).toBe(0.5);
    expect(triggerDepletion(3)).toBeCloseTo(1.5, 10);
    expect(triggerDepletion(0)).toBe(0);
  });

  it("makes sand need water more often than clay", () => {
    const sand = triggerDepletion(totalAvailableWater("sand", 18));
    const clay = triggerDepletion(totalAvailableWater("clay", 18));
    expect(sand).toBeLessThan(clay);
  });
});

describe("canopyDefaultIsSafe", () => {
  it("only trusts full cover once the plant has had time to get there", () => {
    expect(canopyDefaultIsSafe(45)).toBe(true);
    expect(canopyDefaultIsSafe(31)).toBe(true);
    expect(canopyDefaultIsSafe(30)).toBe(false);
    expect(canopyDefaultIsSafe(10)).toBe(false);
  });

  it("does not assume anything without a pollination date", () => {
    expect(canopyDefaultIsSafe(null)).toBe(false);
    expect(canopyDefaultIsSafe(Number.NaN)).toBe(false);
  });
});

describe("runBalance", () => {
  const base = {
    events: [] as IrrigationEvent[],
    pollinationDate: "2026-07-01",
    canopyFraction: 1,
    soil: "loam" as const,
    rootDepthInches: 18,
  };

  function series(dates: string[], inches: (number | null)[]) {
    return dates.map((date, i) => ({ date, etoInches: inches[i] }));
  }

  it("accumulates ETc as depletion", () => {
    const result = runBalance({
      ...base,
      days: series(["2026-08-01", "2026-08-02"], [0.2, 0.2]),
    });
    // DAP 31 and 32, Kc just under 1.05, canopy 1.
    expect(result.depletionInches).toBeCloseTo(
      0.2 * kcForDap(31) + 0.2 * kcForDap(32),
      10,
    );
    expect(result.taw).toBeCloseTo(3, 10);
    expect(result.trigger).toBeCloseTo(1.5, 10);
  });

  it("a full refill zeroes the depletion that day", () => {
    const result = runBalance({
      ...base,
      days: series(["2026-08-01", "2026-08-02"], [0.2, 0.2]),
      events: [{ id: "a", date: "2026-08-02", kind: "refill" }],
    });
    expect(result.depletionInches).toBe(0);
  });

  it("applies measured inches against the depletion", () => {
    const result = runBalance({
      ...base,
      days: series(["2026-08-01"], [0.5]),
      events: [{ id: "a", date: "2026-08-01", kind: "inches", inches: 0.2 }],
    });
    expect(result.depletionInches).toBeCloseTo(0.5 * kcForDap(31) - 0.2, 10);
  });

  it("takes ET off before putting water on, so a hot day does not eat it", () => {
    const result = runBalance({
      ...base,
      days: series(["2026-08-01"], [0.1]),
      events: [{ id: "a", date: "2026-08-01", kind: "inches", inches: 1 }],
    });
    // One inch applied against roughly a tenth of an inch of demand: full.
    expect(result.depletionInches).toBe(0);
  });

  it("floors at zero — over-irrigating does not bank credit", () => {
    const result = runBalance({
      ...base,
      days: series(["2026-08-01", "2026-08-02"], [0.1, 0.3]),
      events: [{ id: "a", date: "2026-08-01", kind: "inches", inches: 10 }],
    });
    expect(result.depletionInches).toBeCloseTo(0.3 * kcForDap(32), 10);
  });

  it("adds up several events on the same day", () => {
    const result = runBalance({
      ...base,
      days: series(["2026-08-01"], [0.5]),
      events: [
        { id: "a", date: "2026-08-01", kind: "inches", inches: 0.1 },
        { id: "b", date: "2026-08-01", kind: "inches", inches: 0.1 },
      ],
    });
    expect(result.depletionInches).toBeCloseTo(0.5 * kcForDap(31) - 0.2, 10);
  });

  it("lets a refill win over inches logged the same day", () => {
    const result = runBalance({
      ...base,
      days: series(["2026-08-01"], [0.5]),
      events: [
        { id: "a", date: "2026-08-01", kind: "inches", inches: 0.01 },
        { id: "b", date: "2026-08-01", kind: "refill" },
      ],
    });
    expect(result.depletionInches).toBe(0);
  });

  it("treats a missing ETo day as unknown, not as zero use", () => {
    const result = runBalance({
      ...base,
      days: series(["2026-08-01", "2026-08-02"], [0.2, null]),
    });
    expect(result.missingDays).toBe(1);
    expect(result.days[1].etcInches).toBe(0);
    expect(result.days[1].missingEto).toBe(true);
  });

  it("sorts the series before walking it", () => {
    const jumbled = runBalance({
      ...base,
      days: [
        { date: "2026-08-02", etoInches: 0.2 },
        { date: "2026-08-01", etoInches: 0.2 },
      ],
      events: [{ id: "a", date: "2026-08-01", kind: "refill" }],
    });
    // The refill lands on day one, so only day two's use remains.
    expect(jumbled.depletionInches).toBeCloseTo(0.2 * kcForDap(32), 10);
  });

  it("still runs without a pollination date, at the start of the curve", () => {
    const result = runBalance({
      ...base,
      pollinationDate: null,
      days: series(["2026-08-01"], [0.2]),
    });
    expect(result.days[0].kc).toBe(0.6);
  });

  it("ignores an unparseable pollination date rather than throwing", () => {
    expect(() =>
      runBalance({
        ...base,
        pollinationDate: "not-a-date",
        days: series(["2026-08-01"], [0.2]),
      }),
    ).not.toThrow();
  });

  it("uses less water at half canopy", () => {
    const days = series(["2026-08-01"], [0.3]);
    const full = runBalance({ ...base, days });
    const half = runBalance({ ...base, days, canopyFraction: 0.5 });
    expect(half.depletionInches).toBeCloseTo(full.depletionInches / 2, 10);
  });
});

describe("daysUntilIrrigation", () => {
  it("counts forecast days until the trigger is reached", () => {
    expect(daysUntilIrrigation(1.0, 1.5, [0.2, 0.2, 0.2])).toBe(3);
  });

  it("returns zero when already at or past the trigger", () => {
    expect(daysUntilIrrigation(1.5, 1.5, [0.2])).toBe(0);
    expect(daysUntilIrrigation(2.0, 1.5, [0.2])).toBe(0);
  });

  it("returns null when the forecast runs out first", () => {
    // Genuinely different from "a long time" — the UI says so.
    expect(daysUntilIrrigation(0.1, 1.5, [0.2, 0.2])).toBeNull();
  });

  it("returns null when there is no capacity to speak of", () => {
    expect(daysUntilIrrigation(0, 0, [0.2])).toBeNull();
  });

  it("skips days with no forecast value instead of ending the count", () => {
    expect(
      daysUntilIrrigation(1.0, 1.5, [Number.NaN, 0.3, 0.3]),
    ).toBe(3);
  });
});

describe("splitAt", () => {
  const days = [
    { date: "2026-08-01" },
    { date: "2026-08-02" },
    { date: "2026-08-03" },
  ] as Parameters<typeof splitAt>[0];

  it("counts today as past, since its ET has been spent", () => {
    const { past, forecast } = splitAt(days, "2026-08-02");
    expect(past.map((d) => d.date)).toEqual(["2026-08-01", "2026-08-02"]);
    expect(forecast.map((d) => d.date)).toEqual(["2026-08-03"]);
  });

  it("handles today falling outside the window", () => {
    expect(splitAt(days, "2026-07-01").past).toHaveLength(0);
    expect(splitAt(days, "2026-09-01").forecast).toHaveLength(0);
  });
});

describe("volume conversion", () => {
  it("uses the standard inch-acre-equivalent per square foot", () => {
    // 1 in over 1 sq ft = 144 cu in = 0.6233 US gal.
    expect(inchesToGallons(1, 1)).toBeCloseTo(0.6234, 4);
  });

  it("converts a realistic irrigation over a real patch", () => {
    // Half an inch over a 400 sq ft patch is about 125 gallons.
    expect(inchesToGallons(0.5, 400)).toBeCloseTo(124.68, 2);
  });

  it("round-trips", () => {
    expect(gallonsToInches(inchesToGallons(0.75, 600), 600)).toBeCloseTo(0.75, 10);
  });

  it("does not divide by a zero-area patch", () => {
    expect(gallonsToInches(100, 0)).toBe(0);
    expect(inchesToGallons(1, 0)).toBe(0);
  });

  it("treats nonsense as zero rather than NaN", () => {
    expect(inchesToGallons(Number.NaN, 400)).toBe(0);
    expect(gallonsToInches(100, Number.NaN)).toBe(0);
    expect(inchesToGallons(-1, 400)).toBe(0);
  });
});
