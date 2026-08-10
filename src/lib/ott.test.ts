import { describe, expect, it } from "vitest";
import { daysBetween, lbPerDay, ottWeight, totalOtt, weightRange } from "./ott";

/**
 * Anchors read off the published 2025 GPC Atlantic Giant OTT chart. The chart
 * is tabulated in whole inches and rounded pounds, so we assert against a 2%
 * band rather than an exact match — tighter than the +/-5% the estimate itself
 * carries, loose enough to survive the chart's own rounding.
 */
const CHART_ANCHORS: ReadonlyArray<{ ott: number; lbs: number }> = [
  { ott: 150, lbs: 80 },
  { ott: 207, lbs: 208 },
  { ott: 250, lbs: 365 },
  { ott: 350, lbs: 1000 },
];

describe("ottWeight", () => {
  it.each(CHART_ANCHORS)(
    'matches the chart at $ott" (~$lbs lb)',
    ({ ott, lbs }) => {
      const actual = ottWeight(ott);
      const relativeError = Math.abs(actual - lbs) / lbs;
      expect(
        relativeError,
        `${ott}" gave ${actual.toFixed(1)} lb, chart says ~${lbs} lb`,
      ).toBeLessThan(0.02);
    },
  );

  // Pinned to the current implementation so a formula edit has to be deliberate.
  it.each([
    { ott: 150, lbs: 81.2948 },
    { ott: 207, lbs: 208.2185 },
    { ott: 250, lbs: 366.6495 },
    { ott: 350, lbs: 996.3243 },
  ])('is stable at $ott"', ({ ott, lbs }) => {
    expect(ottWeight(ott)).toBeCloseTo(lbs, 4);
  });

  it("increases monotonically across the growing season", () => {
    const weights = [120, 150, 200, 250, 300, 350, 400, 500].map(ottWeight);
    for (let i = 1; i < weights.length; i++) {
      expect(weights[i]).toBeGreaterThan(weights[i - 1]);
    }
  });

  it("clamps to zero instead of going negative on tiny fruit", () => {
    // The -10 offset outruns both terms below roughly 70 inches.
    expect(ottWeight(20)).toBe(0);
    expect(ottWeight(1)).toBe(0);
  });

  it("returns 0 for non-positive and non-finite input", () => {
    expect(ottWeight(0)).toBe(0);
    expect(ottWeight(-100)).toBe(0);
    expect(ottWeight(Number.NaN)).toBe(0);
    expect(ottWeight(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("totalOtt", () => {
  it("sums the three tape measurements", () => {
    expect(totalOtt(100, 60, 47)).toBe(207);
  });

  it("is 0 until something has been measured", () => {
    expect(totalOtt(0, 0, 0)).toBe(0);
    expect(totalOtt(Number.NaN, 60, 47)).toBe(0);
  });
});

describe("weightRange", () => {
  it("brackets the estimate by +/-5%", () => {
    const { low, high } = weightRange(1000);
    expect(low).toBeCloseTo(950, 6);
    expect(high).toBeCloseTo(1050, 6);
  });

  it("accepts a custom tolerance", () => {
    const { low, high } = weightRange(200, 0.1);
    expect(low).toBeCloseTo(180, 6);
    expect(high).toBeCloseTo(220, 6);
  });
});

describe("daysBetween", () => {
  it("counts whole days forward", () => {
    expect(daysBetween("2025-07-01", "2025-07-08")).toBe(7);
  });

  it("spans months and leap days", () => {
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2);
    expect(daysBetween("2025-08-30", "2025-09-02")).toBe(3);
  });

  it("is 0 for the same day and negative going backwards", () => {
    expect(daysBetween("2025-07-01", "2025-07-01")).toBe(0);
    expect(daysBetween("2025-07-08", "2025-07-01")).toBe(-7);
  });

  it("is 0 for unparseable dates", () => {
    expect(daysBetween("not-a-date", "2025-07-01")).toBe(0);
  });
});

describe("lbPerDay", () => {
  it("spreads the gain across the days between entries", () => {
    const rate = lbPerDay(
      { date: "2025-07-01", lbs: 300 },
      { date: "2025-07-08", lbs: 461 },
    );
    expect(rate).toBeCloseTo(23, 6);
  });

  it("reports shrinkage as a negative rate", () => {
    const rate = lbPerDay(
      { date: "2025-09-01", lbs: 900 },
      { date: "2025-09-03", lbs: 890 },
    );
    expect(rate).toBeCloseTo(-5, 6);
  });

  it("is null when two entries share a date or run backwards", () => {
    const sameDay = { date: "2025-07-01", lbs: 300 };
    expect(lbPerDay(sameDay, { date: "2025-07-01", lbs: 320 })).toBeNull();
    expect(
      lbPerDay({ date: "2025-07-08", lbs: 400 }, { date: "2025-07-01", lbs: 300 }),
    ).toBeNull();
  });
});
