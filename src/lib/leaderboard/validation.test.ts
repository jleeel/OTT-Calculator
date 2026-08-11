import { describe, expect, it } from "vitest";
import {
  LIMITS,
  isUuid,
  isValidIsoDate,
  stripHtml,
  validateEntry,
} from "./validation";

describe("isUuid", () => {
  it("accepts a canonical uuid in either case", () => {
    expect(isUuid("a26eeab9-ca89-4527-865e-4c07bb834094")).toBe(true);
    expect(isUuid("A26EEAB9-CA89-4527-865E-4C07BB834094")).toBe(true);
  });

  it("rejects everything that would make a uuid column error", () => {
    expect(isUuid("")).toBe(false);
    expect(isUuid("abc")).toBe(false);
    expect(isUuid("a26eeab9ca894527865e4c07bb834094")).toBe(false); // no dashes
    expect(isUuid("a26eeab9-ca89-4527-865e-4c07bb83409")).toBe(false); // short
    expect(isUuid("a26eeab9-ca89-4527-865e-4c07bb834094 ")).toBe(false); // pad
    expect(isUuid("zzzzzzzz-ca89-4527-865e-4c07bb834094")).toBe(false); // hexless
  });
});

const TODAY = "2025-09-15";

function goodEntry(overrides: Record<string, unknown> = {}) {
  return {
    grower_name: "Dale Marshall",
    location: "Tulare, CA",
    pumpkin_name: "Big Bertha",
    circumference: 180,
    side_to_side: 96,
    end_to_end: 88,
    measured_on: "2025-09-10",
    ...overrides,
  };
}

function errorFor(result: ReturnType<typeof validateEntry>, field: string): string {
  if (result.ok) throw new Error(`expected ${field} to fail validation`);
  const found = result.errors.find((e) => e.field === field);
  if (!found) {
    throw new Error(
      `no error for ${field}; got ${result.errors.map((e) => e.field).join(", ")}`,
    );
  }
  return found.message;
}

describe("stripHtml", () => {
  it("removes tags and keeps the readable text", () => {
    expect(stripHtml("<b>Dale</b> Marshall")).toBe("Dale Marshall");
  });

  it("defuses a script tag", () => {
    expect(stripHtml('<script>alert("x")</script>Dale')).toBe('alert("x") Dale');
  });

  it("removes stray angle brackets that never formed a tag", () => {
    expect(stripHtml("Dale < Marshall > Jr")).toBe("Dale Marshall Jr");
  });

  it("flattens newlines and control characters", () => {
    expect(stripHtml("Dale\n\tMarshall\u0000Jr")).toBe("Dale Marshall Jr");
  });

  it("collapses whitespace and trims", () => {
    expect(stripHtml("   Dale    Marshall   ")).toBe("Dale Marshall");
  });
});

describe("isValidIsoDate", () => {
  it("accepts real dates", () => {
    expect(isValidIsoDate("2025-09-15")).toBe(true);
    expect(isValidIsoDate("2024-02-29")).toBe(true);
  });

  it("rejects dates that only look real", () => {
    expect(isValidIsoDate("2025-02-30")).toBe(false);
    expect(isValidIsoDate("2025-13-01")).toBe(false);
    expect(isValidIsoDate("2025-9-1")).toBe(false);
    expect(isValidIsoDate("last tuesday")).toBe(false);
  });
});

describe("validateEntry", () => {
  it("accepts a well-formed submission", () => {
    const result = validateEntry(goodEntry(), TODAY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.grower_name).toBe("Dale Marshall");
    expect(result.value.circumference).toBe(180);
    expect(result.value.pollination_date).toBeNull();
  });

  it("strips markup out of text before storing it", () => {
    const result = validateEntry(
      goodEntry({ pumpkin_name: "<img src=x onerror=alert(1)>Bertha" }),
      TODAY,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.pumpkin_name).toBe("Bertha");
  });

  it("measures length after stripping, not before", () => {
    // 30 visible characters wrapped in tags that push the raw string over 40.
    const padded = `<span class="a-very-long-class-name">${"B".repeat(30)}</span>`;
    const result = validateEntry(goodEntry({ pumpkin_name: padded }), TODAY);
    expect(result.ok).toBe(true);
  });

  it.each([
    ["circumference", "Circumference"],
    ["side_to_side", "Side to side"],
    ["end_to_end", "End to end"],
  ])("rejects %s below the floor", (field, label) => {
    const result = validateEntry(goodEntry({ [field]: 9.9 }), TODAY);
    expect(errorFor(result, field)).toContain(
      `${label} must be between ${LIMITS.measurementMin} and ${LIMITS.measurementMax}`,
    );
  });

  it("rejects a measurement above the ceiling", () => {
    const result = validateEntry(goodEntry({ circumference: 250.1 }), TODAY);
    expect(errorFor(result, "circumference")).toContain("250");
  });

  it("accepts measurements exactly on the boundaries", () => {
    const result = validateEntry(
      goodEntry({ circumference: 10, side_to_side: 250, end_to_end: 10 }),
      TODAY,
    );
    expect(result.ok).toBe(true);
  });

  it("accepts numeric strings from a form post", () => {
    const result = validateEntry(goodEntry({ circumference: "180.5" }), TODAY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.circumference).toBe(180.5);
  });

  it("rejects a non-numeric measurement", () => {
    const result = validateEntry(goodEntry({ end_to_end: "big" }), TODAY);
    expect(errorFor(result, "end_to_end")).toContain("must be a number");
  });

  it("rejects a measurement date in the future", () => {
    const result = validateEntry(goodEntry({ measured_on: "2025-09-16" }), TODAY);
    expect(errorFor(result, "measured_on")).toContain("cannot be in the future");
  });

  it("accepts a measurement taken today", () => {
    expect(validateEntry(goodEntry({ measured_on: TODAY }), TODAY).ok).toBe(true);
  });

  it("rejects a measurement older than the season window", () => {
    const result = validateEntry(goodEntry({ measured_on: "2025-03-18" }), TODAY);
    expect(errorFor(result, "measured_on")).toContain("more than 180 days old");
  });

  it("accepts a measurement exactly at the age limit", () => {
    // 2025-09-15 minus 180 days.
    const result = validateEntry(goodEntry({ measured_on: "2025-03-19" }), TODAY);
    expect(result.ok).toBe(true);
  });

  it.each([
    ["grower_name", "Grower name", LIMITS.growerNameMax],
    ["location", "Location", LIMITS.locationMax],
    ["pumpkin_name", "Pumpkin name", LIMITS.pumpkinNameMax],
  ])("rejects an over-long %s", (field, label, max) => {
    const result = validateEntry(goodEntry({ [field]: "x".repeat(max + 1) }), TODAY);
    expect(errorFor(result, field)).toContain(`${label} must be ${max} characters`);
  });

  it("accepts text exactly at the length limit", () => {
    const result = validateEntry(
      goodEntry({ pumpkin_name: "x".repeat(LIMITS.pumpkinNameMax) }),
      TODAY,
    );
    expect(result.ok).toBe(true);
  });

  it.each(["grower_name", "location", "pumpkin_name"])(
    "requires %s to be present",
    (field) => {
      const result = validateEntry(goodEntry({ [field]: "   " }), TODAY);
      expect(errorFor(result, field)).toContain("is required");
    },
  );

  it("treats a missing pollination date as not recorded", () => {
    for (const value of [undefined, null, ""]) {
      const result = validateEntry(goodEntry({ pollination_date: value }), TODAY);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.pollination_date).toBeNull();
    }
  });

  it("keeps a valid pollination date", () => {
    const result = validateEntry(
      goodEntry({ pollination_date: "2025-07-04" }),
      TODAY,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.pollination_date).toBe("2025-07-04");
  });

  it("rejects a pollination date after the measurement", () => {
    const result = validateEntry(
      goodEntry({ measured_on: "2025-08-01", pollination_date: "2025-08-02" }),
      TODAY,
    );
    expect(errorFor(result, "pollination_date")).toContain(
      "cannot be after the measurement date",
    );
  });

  it("ignores any weight the client tries to supply", () => {
    const result = validateEntry(
      goodEntry({ estimated_lbs: 99999, ott: 1 }),
      TODAY,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).not.toHaveProperty("estimated_lbs");
    expect(result.value).not.toHaveProperty("ott");
  });

  it("reports every problem at once rather than stopping at the first", () => {
    const result = validateEntry(
      { grower_name: "", location: "", pumpkin_name: "", circumference: 1 },
      TODAY,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const fields = new Set(result.errors.map((e) => e.field));
    expect(fields).toContain("grower_name");
    expect(fields).toContain("location");
    expect(fields).toContain("pumpkin_name");
    expect(fields).toContain("circumference");
    expect(fields).toContain("side_to_side");
    expect(fields).toContain("measured_on");
  });

  it.each([null, undefined, "nope", 42, []])(
    "rejects a non-object body (%s)",
    (body) => {
      expect(validateEntry(body, TODAY).ok).toBe(false);
    },
  );
});
