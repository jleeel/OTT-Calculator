import { describe, expect, it } from "vitest";
import {
  FLAG_NOTE,
  FLAG_RULES,
  ImplausibleGrowthError,
  MAX_LB_PER_DAY,
  computeFlags,
  impliedLbPerDay,
  type FlagInput,
} from "./flags";

function entry(overrides: Partial<FlagInput> = {}): FlagInput {
  return {
    circumference: 180,
    side_to_side: 96,
    end_to_end: 88,
    estimated_lbs: 1114,
    measured_on: "2025-09-10",
    pollination_date: null,
    ...overrides,
  };
}

describe("computeFlags", () => {
  it("flags nothing on an ordinary entry", () => {
    expect(computeFlags(entry())).toEqual([]);
  });

  describe("geometry", () => {
    it("flags one reading dominating the total", () => {
      // 260 of 400 total = 65%.
      expect(
        computeFlags(entry({ circumference: 260, side_to_side: 80, end_to_end: 60 })),
      ).toContain("geometry");
    });

    it("does not flag at exactly 60%", () => {
      // 240 of 400.
      expect(
        computeFlags(entry({ circumference: 240, side_to_side: 100, end_to_end: 60 })),
      ).not.toContain("geometry");
    });

    it("does not flag a normally proportioned fruit", () => {
      expect(computeFlags(entry())).not.toContain("geometry");
    });
  });

  describe("jump", () => {
    const previous = { measured_on: "2025-09-08", estimated_lbs: 900 };

    it("flags an implied gain over 40 lb a day", () => {
      // 1114 - 900 = 214 over 2 days = 107/day.
      expect(computeFlags(entry(), previous)).toContain("jump");
    });

    it("does not flag a strong but believable week", () => {
      // 240 lb over 7 days ≈ 34/day.
      expect(
        computeFlags(entry({ estimated_lbs: 1140 }), {
          measured_on: "2025-09-03",
          estimated_lbs: 900,
        }),
      ).not.toContain("jump");
    });

    it("needs a previous entry to compare against", () => {
      expect(computeFlags(entry())).not.toContain("jump");
      expect(computeFlags(entry(), null)).not.toContain("jump");
    });

    it("ignores entries sharing a date, which would divide by zero", () => {
      expect(
        computeFlags(entry(), { measured_on: "2025-09-10", estimated_lbs: 100 }),
      ).not.toContain("jump");
    });

    it("does not flag a fruit that shrank", () => {
      expect(
        computeFlags(entry({ estimated_lbs: 800 }), previous),
      ).not.toContain("jump");
    });
  });

  describe("ott_extreme", () => {
    it("flags a total beyond anything on record", () => {
      expect(
        computeFlags(entry({ circumference: 220, side_to_side: 160, end_to_end: 160 })),
      ).toContain("ott_extreme");
    });

    it("does not flag a legitimate world-class fruit", () => {
      expect(
        computeFlags(entry({ circumference: 200, side_to_side: 130, end_to_end: 120 })),
      ).not.toContain("ott_extreme");
    });
  });

  describe("early", () => {
    it("flags a big fruit very soon after pollination", () => {
      expect(
        computeFlags(entry({ pollination_date: "2025-09-01" })),
      ).toContain("early");
    });

    it("does not flag once the fruit has had time", () => {
      expect(
        computeFlags(entry({ pollination_date: "2025-07-01" })),
      ).not.toContain("early");
    });

    it("does not flag a small fruit measured early", () => {
      expect(
        computeFlags(
          entry({
            pollination_date: "2025-09-01",
            circumference: 60,
            side_to_side: 40,
            end_to_end: 40,
          }),
        ),
      ).not.toContain("early");
    });

    it("needs a pollination date", () => {
      expect(computeFlags(entry({ pollination_date: null }))).not.toContain("early");
    });
  });

  it("can return several flags at once", () => {
    const flags = computeFlags(
      entry({
        circumference: 400,
        side_to_side: 80,
        end_to_end: 60,
        estimated_lbs: 4000,
        pollination_date: "2025-09-01",
      }),
      { measured_on: "2025-09-08", estimated_lbs: 900 },
    );
    expect(flags).toEqual(
      expect.arrayContaining(["geometry", "jump", "ott_extreme", "early"]),
    );
  });

  it("survives unparseable dates without throwing", () => {
    expect(() =>
      computeFlags(entry({ measured_on: "nonsense", pollination_date: "also-bad" })),
    ).not.toThrow();
  });
});

describe("FLAG_NOTE", () => {
  it("stays neutral and never accuses", () => {
    expect(FLAG_NOTE).toBe("Unusual measurement, double-check the tape.");
    expect(FLAG_NOTE).not.toMatch(/fake|suspicious|invalid|cheat|fraud|wrong|lie/i);
  });
});

describe("impliedLbPerDay", () => {
  const entry = { estimated_lbs: 1000, measured_on: "2025-09-10" };

  it("is the gain divided by the days between", () => {
    expect(
      impliedLbPerDay(entry, { measured_on: "2025-09-05", estimated_lbs: 900 }),
    ).toBeCloseTo(20, 10);
  });

  it("cannot be computed without a prior entry", () => {
    expect(impliedLbPerDay(entry, null)).toBeNull();
    expect(impliedLbPerDay(entry, undefined)).toBeNull();
  });

  it("refuses to divide by zero on a same-day re-measure", () => {
    expect(
      impliedLbPerDay(entry, { measured_on: "2025-09-10", estimated_lbs: 900 }),
    ).toBeNull();
  });

  it("returns null rather than a negative rate for a backwards pair", () => {
    expect(
      impliedLbPerDay(entry, { measured_on: "2025-09-20", estimated_lbs: 900 }),
    ).toBeNull();
  });

  it("goes negative when the fruit shrank, which is not an error", () => {
    expect(
      impliedLbPerDay(entry, { measured_on: "2025-09-05", estimated_lbs: 1100 }),
    ).toBeLessThan(0);
  });

  it("survives an unparseable date", () => {
    expect(
      impliedLbPerDay(entry, { measured_on: "nonsense", estimated_lbs: 900 }),
    ).toBeNull();
  });
});

describe("MAX_LB_PER_DAY", () => {
  it("sits past the record rather than at a plausible number", () => {
    // The best fruit ever grown put on roughly 50-60 lb on their best day, so
    // this refuses corrupt data without refusing a world-class pumpkin.
    expect(MAX_LB_PER_DAY).toBe(70);
    expect(MAX_LB_PER_DAY).toBeGreaterThan(FLAG_RULES.jumpLbPerDay);
  });

  it("leaves a band that is flagged but still accepted", () => {
    // 40-70 is unusual and gets a marker; only past 70 is an entry refused.
    const flagged = impliedLbPerDay(
      { estimated_lbs: 1000, measured_on: "2025-09-10" },
      { measured_on: "2025-09-09", estimated_lbs: 950 },
    );
    expect(flagged).toBeGreaterThan(FLAG_RULES.jumpLbPerDay);
    expect(flagged).toBeLessThan(MAX_LB_PER_DAY);
  });
});

describe("ImplausibleGrowthError", () => {
  it("names the rate and the date it was measured against", () => {
    const error = new ImplausibleGrowthError(214.5, "2025-09-08");
    expect(error.message).toContain("215 lb a day");
    expect(error.message).toContain("2025-09-08");
  });

  it("points at the likely cause instead of accusing anyone", () => {
    const error = new ImplausibleGrowthError(200, "2025-09-08");
    expect(error.message).toMatch(/mistyped date is the usual cause/);
    expect(error.message).not.toMatch(/fake|suspicious|invalid|cheat|fraud|lie/i);
  });
});
