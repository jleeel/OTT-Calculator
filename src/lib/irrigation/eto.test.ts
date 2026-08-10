import { describe, expect, it } from "vitest";
import {
  ETO_FORECAST_DAYS,
  ETO_PAST_DAYS,
  EtoShapeError,
  EtoUnitError,
  MM_PER_INCH,
  buildEtoUrl,
  cacheIsFresh,
  mmToInches,
  parseEtoResponse,
} from "./eto";

/**
 * A body shaped the way Open-Meteo documents this endpoint. It could not be
 * captured from the live API — the network policy where this was written
 * rejects api.open-meteo.com — so it is built from the documented shape, and
 * the parser checks units at runtime rather than trusting this fixture.
 */
function body(
  values: (number | null)[],
  overrides: Record<string, unknown> = {},
) {
  return {
    latitude: 36.25,
    longitude: -119.25,
    timezone: "America/Los_Angeles",
    daily_units: {
      time: "iso8601",
      et0_fao_evapotranspiration: "mm",
    },
    daily: {
      time: values.map((_, i) => `2026-08-${String(i + 1).padStart(2, "0")}`),
      et0_fao_evapotranspiration: values,
    },
    ...overrides,
  };
}

describe("mmToInches", () => {
  it("converts on the exact definition of an inch", () => {
    // 25.4 mm is one inch by definition, not by approximation.
    expect(MM_PER_INCH).toBe(25.4);
    expect(mmToInches(25.4)).toBe(1);
    expect(mmToInches(0)).toBe(0);
  });

  it("converts a realistic summer ETo", () => {
    // 7 mm/day is a hot Central Valley day; that is about 0.2756 in.
    expect(mmToInches(7)).toBeCloseTo(0.27559, 5);
  });

  it("is the direction that matters — inches are the smaller number", () => {
    // The failure this guards against is dividing the wrong way, which would
    // make ETo 25x too large and tell a grower to irrigate constantly.
    expect(mmToInches(100)).toBeLessThan(100);
    expect(mmToInches(100)).toBeCloseTo(3.937, 3);
  });
});

describe("buildEtoUrl", () => {
  it("asks for the documented variable and window", () => {
    const url = new URL(buildEtoUrl(36.25, -119.25));
    expect(url.origin + url.pathname).toBe("https://api.open-meteo.com/v1/forecast");
    expect(url.searchParams.get("daily")).toBe("et0_fao_evapotranspiration");
    expect(url.searchParams.get("past_days")).toBe(String(ETO_PAST_DAYS));
    expect(url.searchParams.get("forecast_days")).toBe(String(ETO_FORECAST_DAYS));
    expect(url.searchParams.get("timezone")).toBe("auto");
    expect(url.searchParams.get("latitude")).toBe("36.25");
    expect(url.searchParams.get("longitude")).toBe("-119.25");
  });

  it("refuses coordinates that are not coordinates", () => {
    expect(() => buildEtoUrl(91, 0)).toThrow(RangeError);
    expect(() => buildEtoUrl(-91, 0)).toThrow(RangeError);
    expect(() => buildEtoUrl(0, 181)).toThrow(RangeError);
    expect(() => buildEtoUrl(Number.NaN, 0)).toThrow(RangeError);
  });
});

describe("parseEtoResponse", () => {
  it("returns a dated series converted to inches", () => {
    const days = parseEtoResponse(body([25.4, 12.7]));
    expect(days).toEqual([
      { date: "2026-08-01", etoInches: 1 },
      { date: "2026-08-02", etoInches: 0.5 },
    ]);
  });

  it("refuses a response in units it does not convert", () => {
    // The whole point: a wrong unit must fail loudly, not quietly produce a
    // balance that is off by 25x.
    expect(() =>
      parseEtoResponse(body([1], { daily_units: { et0_fao_evapotranspiration: "inch" } })),
    ).toThrow(EtoUnitError);
  });

  it("accepts the unit case-insensitively and ignores surrounding space", () => {
    expect(() =>
      parseEtoResponse(body([1], { daily_units: { et0_fao_evapotranspiration: " MM " } })),
    ).not.toThrow();
  });

  it("assumes millimetres when the units block is absent", () => {
    const days = parseEtoResponse(body([25.4], { daily_units: undefined }));
    expect(days[0].etoInches).toBe(1);
  });

  it("carries a null day through rather than dropping or zeroing it", () => {
    // The tail of a forecast legitimately has these. A null is "unknown",
    // which the balance must treat differently from "no water used".
    const days = parseEtoResponse(body([25.4, null, 25.4]));
    expect(days.map((d) => d.etoInches)).toEqual([1, null, 1]);
  });

  it("survives a values array shorter than the dates array", () => {
    const raw = body([25.4, 25.4, 25.4]);
    raw.daily.et0_fao_evapotranspiration = [25.4];
    const days = parseEtoResponse(raw);
    expect(days).toHaveLength(3);
    expect(days.map((d) => d.etoInches)).toEqual([1, null, null]);
  });

  it("treats nonsense values as missing", () => {
    const raw = body([]);
    raw.daily.time = ["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04"];
    raw.daily.et0_fao_evapotranspiration = [
      "7" as unknown as number,
      Number.NaN,
      -3,
      undefined as unknown as number,
    ];
    expect(parseEtoResponse(raw).map((d) => d.etoInches)).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  it("trims a full timestamp down to a date", () => {
    const raw = body([25.4]);
    raw.daily.time = ["2026-08-01T00:00"];
    expect(parseEtoResponse(raw)[0].date).toBe("2026-08-01");
  });

  it("throws on a body that is not a daily series", () => {
    expect(() => parseEtoResponse(null)).toThrow(EtoShapeError);
    expect(() => parseEtoResponse("nope")).toThrow(EtoShapeError);
    expect(() => parseEtoResponse({})).toThrow(EtoShapeError);
    expect(() => parseEtoResponse({ daily: {} })).toThrow(EtoShapeError);
    expect(() =>
      parseEtoResponse({ daily: { time: ["2026-08-01"] } }),
    ).toThrow(EtoShapeError);
    expect(() =>
      parseEtoResponse({ daily: { time: [], et0_fao_evapotranspiration: [] } }),
    ).toThrow(EtoShapeError);
  });

  it("reports an API error body as a shape problem rather than crashing", () => {
    expect(() =>
      parseEtoResponse({ error: true, reason: "Latitude must be in range" }),
    ).toThrow(EtoShapeError);
  });
});

describe("cacheIsFresh", () => {
  const cache = {
    latitude: 36.25,
    longitude: -119.25,
    fetchedOn: "2026-08-10",
    days: [],
  };

  it("holds for the rest of the day at the same place", () => {
    expect(cacheIsFresh(cache, 36.25, -119.25, "2026-08-10")).toBe(true);
  });

  it("expires the next day", () => {
    expect(cacheIsFresh(cache, 36.25, -119.25, "2026-08-11")).toBe(false);
  });

  it("expires when the patch moves", () => {
    expect(cacheIsFresh(cache, 37.5, -119.25, "2026-08-10")).toBe(false);
    expect(cacheIsFresh(cache, 36.25, -120.0, "2026-08-10")).toBe(false);
  });

  it("tolerates GPS jitter that does not change the weather", () => {
    expect(cacheIsFresh(cache, 36.2505, -119.2504, "2026-08-10")).toBe(true);
  });

  it("treats no cache as not fresh", () => {
    expect(cacheIsFresh(null, 36.25, -119.25, "2026-08-10")).toBe(false);
  });
});
