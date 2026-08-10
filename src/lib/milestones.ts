/**
 * Milestone context for the weight readout.
 *
 * Deliberately just the two nearest fixed marks. No percentiles, no rankings,
 * no comparison to other growers — there is no distribution data behind this
 * page, and a fabricated statistic on something people screenshot would be
 * worse than saying nothing.
 */

export const MILESTONES = [
  100, 200, 300, 500, 750, 1000, 1500, 2000, 2500,
] as const;

export type Milestone = {
  /** Highest milestone the fruit has reached, or null if below the first. */
  passed: number | null;
  /** Next milestone ahead, or null once past the last one. */
  next: number | null;
};

export function milestoneFor(lbs: number): Milestone {
  if (!Number.isFinite(lbs) || lbs <= 0) return { passed: null, next: MILESTONES[0] };

  let passed: number | null = null;
  let next: number | null = null;

  for (const mark of MILESTONES) {
    if (lbs >= mark) passed = mark;
    else {
      next = mark;
      break;
    }
  }

  return { passed, next };
}

/** One short sentence, or null when there is nothing worth saying yet. */
export function milestoneMessage(lbs: number): string | null {
  const { passed, next } = milestoneFor(lbs);

  if (passed === null && next === null) return null;
  if (passed === null) return `Next stop: ${next?.toLocaleString("en-US")} lb.`;
  if (next === null) {
    return `Past ${passed.toLocaleString("en-US")} lb. That is giant by any measure.`;
  }
  return `Past ${passed.toLocaleString("en-US")} lb. Next stop: ${next.toLocaleString("en-US")}.`;
}
