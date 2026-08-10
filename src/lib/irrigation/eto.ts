/**
 * Reference evapotranspiration (ETo) from Open-Meteo.
 *
 * Open-Meteo needs no API key and serves CORS, so this is fetched from the
 * browser. That is deliberate: latitude and longitude are the most identifying
 * thing this app touches, and keeping the request client-side means the patch
 * location never reaches our server — consistent with the measurement log
 * staying in localStorage.
 *
 * UNITS ARE THE WHOLE PROBLEM HERE. Open-Meteo reports
 * `et0_fao_evapotranspiration` in millimetres; the soil water balance is in
 * inches. A silent unit mismatch would not crash, it would just tell a grower
 * to irrigate 25x too rarely, which is worse. So conversion happens once, on
 * ingest, everything downstream is inches, and every identifier carries the
 * unit in its name.
 *
 * The response is also checked rather than trusted: `daily_units` is read back
 * and the parse refuses if it is not millimetres. This code was written in an
 * environment whose network policy blocks api.open-meteo.com, so the shape
 * below could not be confirmed against a live response — the runtime check is
 * what stands in for that, and it fails loudly instead of guessing.
 */

export const MM_PER_INCH = 25.4;

/** Enough history to see a trend, enough forecast to answer "when next". */
export const ETO_PAST_DAYS = 14;
export const ETO_FORECAST_DAYS = 7;

export const ETO_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const ETO_VARIABLE = "et0_fao_evapotranspiration";

export function mmToInches(mm: number): number {
  return mm / MM_PER_INCH;
}

export function buildEtoUrl(latitude: number, longitude: number): string {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new RangeError(`Latitude out of range: ${latitude}`);
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new RangeError(`Longitude out of range: ${longitude}`);
  }

  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    daily: ETO_VARIABLE,
    past_days: String(ETO_PAST_DAYS),
    forecast_days: String(ETO_FORECAST_DAYS),
    timezone: "auto",
  });
  return `${ETO_ENDPOINT}?${params.toString()}`;
}

/** One day of the series. `etoInches` is null when that day has no value. */
export type EtoDay = {
  date: string;
  etoInches: number | null;
};

/** Thrown when the response is not in the units the conversion assumes. */
export class EtoUnitError extends Error {
  constructor(units: string) {
    super(
      `Open-Meteo returned ${ETO_VARIABLE} in "${units}", not "mm". The soil ` +
        `water balance converts millimetres to inches, so this would produce a ` +
        `wrong depletion rather than an obvious failure. Refusing the response.`,
    );
    this.name = "EtoUnitError";
  }
}

/** Thrown when the response is not shaped like a daily ETo series at all. */
export class EtoShapeError extends Error {
  constructor(detail: string) {
    super(`Unexpected Open-Meteo response: ${detail}`);
    this.name = "EtoShapeError";
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Turn a raw Open-Meteo body into a dated series in inches.
 *
 * Deliberately tolerant about *missing* data and strict about *wrong* data: a
 * null day is normal at the edge of a forecast and becomes `null`, but a unit
 * we do not expect, or a body that is not a daily series, throws.
 */
export function parseEtoResponse(raw: unknown): EtoDay[] {
  const root = asRecord(raw);
  if (!root) throw new EtoShapeError("body is not an object");

  const units = asRecord(root.daily_units)?.[ETO_VARIABLE];
  if (typeof units === "string" && units.trim().toLowerCase() !== "mm") {
    throw new EtoUnitError(units);
  }

  const daily = asRecord(root.daily);
  if (!daily) throw new EtoShapeError("no `daily` object");

  const times = daily.time;
  if (!Array.isArray(times)) throw new EtoShapeError("`daily.time` is not an array");

  const values = daily[ETO_VARIABLE];
  if (!Array.isArray(values)) {
    throw new EtoShapeError(`\`daily.${ETO_VARIABLE}\` is not an array`);
  }

  const days: EtoDay[] = [];
  for (let i = 0; i < times.length; i += 1) {
    const date = times[i];
    if (typeof date !== "string" || !date) continue;

    // Short value arrays, nulls and non-numbers are all "no reading for that
    // day" rather than an error — the tail of a forecast legitimately has them.
    const mm = values[i];
    const usable =
      typeof mm === "number" && Number.isFinite(mm) && mm >= 0 ? mm : null;

    days.push({
      date: date.slice(0, 10),
      etoInches: usable === null ? null : mmToInches(usable),
    });
  }

  if (days.length === 0) throw new EtoShapeError("no dated days in `daily.time`");

  return days;
}

/** A cached series plus where and when it came from. */
export type EtoCache = {
  latitude: number;
  longitude: number;
  /** ISO date (UTC) the series was fetched on, for the once-a-day rule. */
  fetchedOn: string;
  days: EtoDay[];
};

/**
 * Whether a cached series still stands. Refetch at most once a day, and always
 * when the patch moves — ETo a county away is a different number.
 */
export function cacheIsFresh(
  cache: EtoCache | null,
  latitude: number,
  longitude: number,
  todayIso: string,
): boolean {
  if (!cache) return false;
  if (cache.fetchedOn !== todayIso) return false;
  // ~100 m, well inside the resolution of the underlying weather model.
  return (
    Math.abs(cache.latitude - latitude) < 0.001 &&
    Math.abs(cache.longitude - longitude) < 0.001
  );
}

/** Fetch and parse. Throws; the caller decides what a stale balance looks like. */
export async function fetchEto(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<EtoDay[]> {
  const response = await fetch(buildEtoUrl(latitude, longitude), { signal });
  if (!response.ok) {
    throw new EtoShapeError(`HTTP ${response.status} from Open-Meteo`);
  }
  return parseEtoResponse(await response.json());
}
