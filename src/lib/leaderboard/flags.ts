/**
 * Plausibility flags, computed server-side on insert.
 *
 * These are informational only. They never block an insert and they never
 * accuse anyone — a flagged entry is far more often a mis-read tape or a typo
 * than anything else, and the UI wording reflects that. The real integrity
 * mechanism is the public measurement history, not these.
 *
 * Pure: no clock, no database.
 */

export type Flag = "geometry" | "jump" | "ott_extreme" | "early";

export const FLAG_RULES = {
  /** One tape reading dominating the total means two were likely swapped or mis-read. */
  geometryShareMax: 0.6,
  /** Even record fruit do not put on this much in a day. */
  jumpLbPerDay: 40,
  /** Beyond any measured fruit on record. */
  ottExtremeInches: 500,
  /** A fruit this big this soon after pollination is unusual. */
  earlyDap: 20,
  earlyOttInches: 150,
} as const;

export type FlagInput = {
  circumference: number;
  side_to_side: number;
  end_to_end: number;
  estimated_lbs: number;
  measured_on: string;
  pollination_date: string | null;
};

/** The same grower+pumpkin's previous live entry, if there is one. */
export type PreviousEntry = {
  measured_on: string;
  estimated_lbs: number;
};

function daysApart(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return Number.NaN;
  return Math.round((to - from) / 86_400_000);
}

export function computeFlags(
  entry: FlagInput,
  previous?: PreviousEntry | null,
): Flag[] {
  const flags: Flag[] = [];

  const ott = entry.circumference + entry.side_to_side + entry.end_to_end;

  if (ott > 0) {
    const largest = Math.max(
      entry.circumference,
      entry.side_to_side,
      entry.end_to_end,
    );
    if (largest / ott > FLAG_RULES.geometryShareMax) flags.push("geometry");
  }

  if (previous) {
    const days = daysApart(previous.measured_on, entry.measured_on);
    if (Number.isFinite(days) && days > 0) {
      const perDay = (entry.estimated_lbs - previous.estimated_lbs) / days;
      if (perDay > FLAG_RULES.jumpLbPerDay) flags.push("jump");
    }
  }

  if (ott > FLAG_RULES.ottExtremeInches) flags.push("ott_extreme");

  if (entry.pollination_date) {
    const dap = daysApart(entry.pollination_date, entry.measured_on);
    if (
      Number.isFinite(dap) &&
      dap < FLAG_RULES.earlyDap &&
      ott > FLAG_RULES.earlyOttInches
    ) {
      flags.push("early");
    }
  }

  return flags;
}

/**
 * One neutral sentence covering however many flags a row carries. Deliberately
 * says nothing about the grower and nothing about intent.
 */
export const FLAG_NOTE = "Unusual measurement, double-check the tape.";

/* -------------------------------------------------------------------------
 * The one rule that refuses an entry.
 *
 * Everything above this line is informational and never blocks — that is a
 * deliberate, documented decision. This is different in kind: not "unusual"
 * but "not physically possible", and a number that far out is corrupt data
 * rather than a surprising result. The best fruit ever grown put on somewhere
 * around 50-60 lb on their best day, so 70 is comfortably past the record
 * rather than a judgement about any particular grower.
 *
 * A refusal is still not an accusation. Overwhelmingly the cause is a mistyped
 * date — an entry dated a day after the last one instead of a fortnight — so
 * the message says that and sends them back to the fields.
 * ---------------------------------------------------------------------- */

export const MAX_LB_PER_DAY = 70;

/**
 * Pounds per day implied between the previous entry and this one.
 *
 * Null when it cannot be computed: no prior entry, an unparseable date, or the
 * same day twice (which would divide by zero). Negative when the fruit shrank,
 * which is a re-measurement rather than an error and is left alone.
 */
export function impliedLbPerDay(
  entry: Pick<FlagInput, "estimated_lbs" | "measured_on">,
  previous: PreviousEntry | null | undefined,
): number | null {
  if (!previous) return null;
  const days = daysApart(previous.measured_on, entry.measured_on);
  if (!Number.isFinite(days) || days <= 0) return null;
  return (entry.estimated_lbs - previous.estimated_lbs) / days;
}

/** Refusal, not a flag. Carried to the route so it can answer 400, not 502. */
export class ImplausibleGrowthError extends Error {
  readonly lbPerDay: number;
  readonly since: string;

  constructor(lbPerDay: number, since: string) {
    super(
      `That is ${Math.round(lbPerDay)} lb a day since ${since}, which is beyond ` +
        `anything on record. Check the date and the three measurements — a ` +
        `mistyped date is the usual cause.`,
    );
    this.name = "ImplausibleGrowthError";
    this.lbPerDay = lbPerDay;
    this.since = since;
  }
}
