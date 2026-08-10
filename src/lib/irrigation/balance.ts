/**
 * Soil water balance for a giant pumpkin patch.
 *
 * The model is the standard FAO-56 bookkeeping one: water leaves the root zone
 * as crop ET, comes back as irrigation, and you irrigate again before the
 * running depletion reaches a fraction of what the soil can hold.
 *
 *   ETc       = ETo x Kc x canopy fraction
 *   TAW       = available water holding capacity x root depth
 *   trigger   = TAW x MAD
 *   depletion = depletion + ETc - applied, floored at zero
 *
 * Everything here is in INCHES. ETo arrives in millimetres from Open-Meteo and
 * is converted once on ingest — see eto.ts.
 *
 * Pure: no clock, no network, no storage.
 *
 * On the Kc numbers: they are interpolated from commercial cucurbit values, not
 * measured on single-plant giant pumpkin patches, and a hobby patch is a very
 * different canopy from a production field. They are a scheduling aid. The
 * footer says so on the grower's behalf.
 */

/** Available water holding capacity, inches of water per foot of soil. */
export const SOIL_AWC_IN_PER_FT = {
  sand: 1.0,
  loam: 2.0,
  clay: 2.4,
} as const;

export type SoilType = keyof typeof SOIL_AWC_IN_PER_FT;

export const SOIL_TYPES = Object.keys(SOIL_AWC_IN_PER_FT) as SoilType[];

/** Management allowed depletion: irrigate before half the water is gone. */
export const MAD = 0.5;

export const DEFAULT_ROOT_DEPTH_INCHES = 18;

/**
 * Crop coefficient against days after pollination, interpolated between points
 * and flat outside them. Peaks just after the canopy closes, then falls as the
 * plant starts shutting down.
 */
export const KC_CURVE: readonly (readonly [dap: number, kc: number])[] = [
  [0, 0.6],
  [15, 0.9],
  [30, 1.05],
  [60, 1.0],
  [90, 0.8],
];

export function kcForDap(dap: number): number {
  if (!Number.isFinite(dap)) return KC_CURVE[0][1];

  const first = KC_CURVE[0];
  const last = KC_CURVE[KC_CURVE.length - 1];
  if (dap <= first[0]) return first[1];
  if (dap >= last[0]) return last[1];

  for (let i = 0; i < KC_CURVE.length - 1; i += 1) {
    const [d0, k0] = KC_CURVE[i];
    const [d1, k1] = KC_CURVE[i + 1];
    if (dap >= d0 && dap <= d1) {
      const span = d1 - d0;
      if (span === 0) return k1;
      return k0 + ((dap - d0) / span) * (k1 - k0);
    }
  }
  return last[1];
}

/**
 * Crop ET for one day.
 *
 * @param canopyFraction 0..1 of the patch actually shaded by leaf. Bare soil
 *   between rows evaporates far less than a transpiring canopy, so a young
 *   plant on a big patch uses much less than the reference figure implies.
 */
export function etcInches(
  etoInches: number,
  kc: number,
  canopyFraction: number,
): number {
  if (!Number.isFinite(etoInches) || etoInches <= 0) return 0;
  const canopy = Math.min(1, Math.max(0, canopyFraction));
  return Math.max(0, etoInches * kc * canopy);
}

/** Total water the root zone can hold, in inches. */
export function totalAvailableWater(
  soil: SoilType,
  rootDepthInches: number,
): number {
  const depth = Number.isFinite(rootDepthInches) ? Math.max(0, rootDepthInches) : 0;
  return SOIL_AWC_IN_PER_FT[soil] * (depth / 12);
}

/** Depletion at which to irrigate. */
export function triggerDepletion(taw: number): number {
  return Math.max(0, taw) * MAD;
}

export const DEFAULT_CANOPY_PERCENT = 100;

/**
 * Whether leaving the canopy slider at its default is defensible.
 *
 * Past day 30 a healthy plant has closed over its patch, so 100% is a fair
 * assumption. Before that it has not, and the app has no way to know how far
 * the vine has run — canopy is deliberately never inferred from area, weight
 * or anything else. So the UI asks instead of guessing, and this is what tells
 * it when to ask.
 */
export function canopyDefaultIsSafe(dap: number | null): boolean {
  return dap !== null && Number.isFinite(dap) && dap > 30;
}

/**
 * One inch of water over one square foot is 0.6233 US gallons.
 *
 * Nobody irrigates in inches. Growers run a hose for an hour or open a valve,
 * so the depth figures the balance works in only become actionable once they
 * are volume over the patch — which is the one thing patch area is for here.
 */
export const GALLONS_PER_INCH_SQFT = 0.623376;

export function inchesToGallons(inches: number, areaSqFt: number): number {
  if (!Number.isFinite(inches) || !Number.isFinite(areaSqFt)) return 0;
  return Math.max(0, inches) * Math.max(0, areaSqFt) * GALLONS_PER_INCH_SQFT;
}

export function gallonsToInches(gallons: number, areaSqFt: number): number {
  if (!Number.isFinite(gallons) || !Number.isFinite(areaSqFt) || areaSqFt <= 0) {
    return 0;
  }
  return Math.max(0, gallons) / (areaSqFt * GALLONS_PER_INCH_SQFT);
}

export type IrrigationEvent = { id: string; date: string } & (
  | { kind: "inches"; inches: number }
  | { kind: "refill" }
);

export type BalanceDay = {
  date: string;
  etoInches: number | null;
  kc: number;
  etcInches: number;
  /** Net inches put back on this date, and whether it was a full refill. */
  appliedInches: number;
  refilled: boolean;
  /** Depletion at the end of this day. */
  depletionInches: number;
  /** True when this day had no ETo reading, so it added nothing. */
  missingEto: boolean;
};

export type BalanceInput = {
  days: { date: string; etoInches: number | null }[];
  events: IrrigationEvent[];
  /** For Kc. Without it the curve cannot be placed, so Kc sits at its start. */
  pollinationDate: string | null;
  canopyFraction: number;
  soil: SoilType;
  rootDepthInches: number;
};

export type BalanceResult = {
  days: BalanceDay[];
  taw: number;
  trigger: number;
  /** Depletion as of `asOf`, or the last day of the series. */
  depletionInches: number;
  /** Days in the window that had no ETo reading. */
  missingDays: number;
};

function daysApart(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return Number.NaN;
  return Math.round((to - from) / 86_400_000);
}

/**
 * Walk the series day by day.
 *
 * The balance starts from zero on the first day of the window. That is an
 * assumption, not a measurement — it says "the root zone was full a fortnight
 * ago". Logging an irrigation re-anchors it, which is why the UI pushes for
 * that rather than presenting the number as fact.
 *
 * Within a day, ET comes off before irrigation goes on, so water applied on a
 * hot day is not eaten by that same day's demand before it lands.
 */
export function runBalance(input: BalanceInput): BalanceResult {
  const taw = totalAvailableWater(input.soil, input.rootDepthInches);
  const trigger = triggerDepletion(taw);

  const sorted = [...input.days].sort((a, b) => a.date.localeCompare(b.date));

  // Several events can share a date; collapse them per day up front.
  const byDate = new Map<string, { inches: number; refill: boolean }>();
  for (const event of input.events) {
    const slot = byDate.get(event.date) ?? { inches: 0, refill: false };
    if (event.kind === "refill") {
      slot.refill = true;
    } else if (Number.isFinite(event.inches) && event.inches > 0) {
      slot.inches += event.inches;
    }
    byDate.set(event.date, slot);
  }

  let depletion = 0;
  let missingDays = 0;
  const days: BalanceDay[] = [];

  for (const day of sorted) {
    const dap = input.pollinationDate
      ? daysApart(input.pollinationDate, day.date)
      : Number.NaN;
    const kc = kcForDap(dap);

    const missingEto = day.etoInches === null;
    if (missingEto) missingDays += 1;

    const etc = missingEto
      ? 0
      : etcInches(day.etoInches as number, kc, input.canopyFraction);

    depletion += etc;

    const applied = byDate.get(day.date);
    if (applied?.refill) {
      depletion = 0;
    } else if (applied && applied.inches > 0) {
      depletion -= applied.inches;
    }
    depletion = Math.max(0, depletion);

    days.push({
      date: day.date,
      etoInches: day.etoInches,
      kc,
      etcInches: etc,
      appliedInches: applied?.inches ?? 0,
      refilled: applied?.refill ?? false,
      depletionInches: depletion,
      missingEto,
    });
  }

  return {
    days,
    taw,
    trigger,
    depletionInches: depletion,
    missingDays,
  };
}

/**
 * How many days of the forecast it takes to reach the trigger.
 *
 * 0 means it is already there. `null` means the forecast runs out first, which
 * is a genuinely different answer from "a long time" and is shown as such.
 */
export function daysUntilIrrigation(
  depletionInches: number,
  trigger: number,
  forecastEtcInches: number[],
): number | null {
  if (trigger <= 0) return null;
  if (depletionInches >= trigger) return 0;

  let running = depletionInches;
  for (let i = 0; i < forecastEtcInches.length; i += 1) {
    const etc = forecastEtcInches[i];
    if (!Number.isFinite(etc) || etc <= 0) continue;
    running += etc;
    if (running >= trigger) return i + 1;
  }
  return null;
}

/**
 * Split a balance at today: what has happened, and what is coming. Forecast
 * days are the ones strictly after today.
 */
export function splitAt(
  days: BalanceDay[],
  todayIso: string,
): { past: BalanceDay[]; forecast: BalanceDay[] } {
  const past: BalanceDay[] = [];
  const forecast: BalanceDay[] = [];
  for (const day of days) {
    if (day.date.localeCompare(todayIso) <= 0) past.push(day);
    else forecast.push(day);
  }
  return { past, forecast };
}
