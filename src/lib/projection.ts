/**
 * Projected final weight from a generic Atlantic Giant growth curve.
 *
 * Pure — no clock, no storage. Days after pollination (DAP) is supplied by the
 * caller, measured to the date of the most recent logged measurement rather
 * than to today, so the projection matches the weight it is built from.
 *
 * This is a population curve applied to one fruit. It is a much rougher number
 * than the OTT estimate and is presented that way: a wider band, and wording
 * that says what it assumes.
 */

/** Percent of final weight reached at a given day after pollination. */
const CURVE: ReadonlyArray<readonly [dap: number, fraction: number]> = [
  [10, 0.025],
  [20, 0.15],
  [30, 0.35],
  [35, 0.46],
  [40, 0.57],
  [50, 0.73],
  [60, 0.845],
  [70, 0.92],
  [80, 0.97],
  [90, 1.0],
];

/** Before this the fruit is too small for the curve to say anything useful. */
export const MIN_DAP = 15;
/** At and past this the curve is treated as complete. */
export const MAX_DAP = 90;

/** Projections carry far more error than the OTT estimate itself. */
export const PROJECTION_TOLERANCE = 0.2;

export type Projection = {
  projectedLbs: number;
  /** Fraction of full maturity reached at this DAP, 0..1. */
  fractionComplete: number;
};

/**
 * The curve itself, linearly interpolated and clamped at both ends. Used for
 * the end-date scaling factor, where the "too early" rule does not apply.
 */
function curveAt(dap: number): number {
  if (!Number.isFinite(dap)) return 0;
  if (dap >= MAX_DAP) return 1;
  if (dap <= CURVE[0][0]) return CURVE[0][1];

  for (let i = 1; i < CURVE.length; i++) {
    const [d0, f0] = CURVE[i - 1];
    const [d1, f1] = CURVE[i];
    if (dap <= d1) {
      return f0 + ((dap - d0) / (d1 - d0)) * (f1 - f0);
    }
  }
  return 1;
}

/**
 * Fraction of final weight at this DAP, or null when it is too early to say.
 */
export function fractionOfFinal(dap: number): number | null {
  if (!Number.isFinite(dap) || dap < MIN_DAP) return null;
  return curveAt(dap);
}

/**
 * Project a final weight from the current weight and DAP.
 *
 * With no end date, this projects to full maturity. With one, the result is
 * scaled down to the fraction of the curve reached by that date — a fruit
 * harvested or lost at day 70 never gets the last 8%.
 *
 * Returns null when DAP is out of range (too early, or not a number).
 */
export function projectFinalWeight(
  currentLbs: number,
  dap: number,
  endDap?: number | null,
): Projection | null {
  const fraction = fractionOfFinal(dap);
  if (fraction === null || fraction <= 0) return null;
  if (!Number.isFinite(currentLbs) || currentLbs <= 0) return null;

  const atMaturity = currentLbs / fraction;

  if (endDap === undefined || endDap === null || !Number.isFinite(endDap)) {
    return { projectedLbs: atMaturity, fractionComplete: fraction };
  }

  return {
    projectedLbs: atMaturity * curveAt(endDap),
    fractionComplete: fraction,
  };
}

/** Projections are quoted to the nearest 10 lb; the precision is not there. */
export function roundProjection(lbs: number): number {
  return Math.round(lbs / 10) * 10;
}
