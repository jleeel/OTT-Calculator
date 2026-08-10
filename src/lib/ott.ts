/**
 * Over-the-top (OTT) weight estimation for Atlantic Giant pumpkins.
 *
 * Everything here is a pure function of its arguments — no DOM, no storage,
 * no clock. The UI layer owns formatting; this module owns the math.
 */

/** Growers report a +/-5% band around the chart weight. */
export const TOLERANCE = 0.05;

/**
 * 2025 GPC Atlantic Giant OTT chart formula: total inches -> pounds.
 *
 * Two terms carry the curve. `a` is a logistic that dominates the small end,
 * `b` is a power term that takes over as the fruit gets big, and the -10
 * offset trims the seam between them. Returns 0 for non-positive or
 * non-finite input rather than NaN, so partially-filled forms stay renderable.
 */
export function ottWeight(ott: number): number {
  if (!Number.isFinite(ott) || ott <= 0) return 0;
  const a = Math.pow(12.81 / (1 + 6.87 * Math.pow(2, -ott / 97)), 3);
  const b = Math.pow(ott / 45.9, 3.014);
  return Math.max(0, a + b - 10);
}

/**
 * Total OTT is the plain sum of the three tape measurements:
 * circumference, side to side, and end to end.
 */
export function totalOtt(
  circumference: number,
  sideToSide: number,
  endToEnd: number,
): number {
  const sum = circumference + sideToSide + endToEnd;
  return Number.isFinite(sum) && sum > 0 ? sum : 0;
}

/** The +/-5% band a chart weight is usually quoted with. */
export function weightRange(
  lbs: number,
  tolerance: number = TOLERANCE,
): { low: number; high: number } {
  return { low: lbs * (1 - tolerance), high: lbs * (1 + tolerance) };
}

/**
 * Whole days from one ISO date (yyyy-mm-dd) to another. Parsed at midnight
 * UTC so the result never shifts with the viewer's timezone.
 */
export function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}

/**
 * Pounds gained per day between two dated weights. Null when the entries
 * share a date (or run backwards), which is the caller's cue to hide the
 * growth readout rather than print an infinity.
 */
export function lbPerDay(
  previous: { date: string; lbs: number },
  latest: { date: string; lbs: number },
): number | null {
  const days = daysBetween(previous.date, latest.date);
  if (days <= 0) return null;
  return (latest.lbs - previous.lbs) / days;
}
