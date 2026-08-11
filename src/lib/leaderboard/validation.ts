/**
 * Server-side validation for leaderboard submissions.
 *
 * Pure — no env, no clock, no database. `today` is passed in so the date rules
 * are testable. Everything a client sends is treated as hostile: text is
 * stripped of markup before it is length-checked, and the weight a client
 * claims is ignored entirely (the route recomputes it from the measurements).
 */

export const LIMITS = {
  /** A tape reading below this is a typo; above it, a world record by 100". */
  measurementMin: 10,
  measurementMax: 250,
  growerNameMax: 60,
  locationMax: 60,
  pumpkinNameMax: 40,
  /** Older than this and it is history, not a current season measurement. */
  maxAgeDays: 180,
} as const;

export type EntryInput = {
  grower_name: string;
  location: string;
  pumpkin_name: string;
  circumference: number;
  side_to_side: number;
  end_to_end: number;
  pollination_date: string | null;
  measured_on: string;
};

export type FieldError = { field: string; message: string };

export type ValidationResult =
  | { ok: true; value: EntryInput }
  | { ok: false; errors: FieldError[] };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether a caller-supplied string is shaped like a UUID. Entry ids and edit
 * tokens are uuid columns; screening before they reach a query keeps a
 * malformed value from becoming a Postgres type error (22P02) and leaking a
 * different status code than a well-formed wrong value would get.
 */
export function isUuid(value: string): boolean {
  return UUID.test(value);
}

/**
 * Remove markup from free text. React escapes on render, so this is defence in
 * depth rather than the only guard — it also keeps the stored data clean for
 * anything that consumes the table later.
 */
export function stripHtml(value: string): string {
  return value
    // Only sequences that actually look like tags. A looser `<[^>]*>` would
    // swallow the words in "Dale < Marshall > Jr" along with the brackets.
    .replace(/<\/?[a-zA-Z][^>]*>/g, " ")
    // Whatever angle brackets are left were never markup; drop the characters
    // but keep the text around them.
    .replace(/[<>]/g, " ")
    // Control characters, including the newlines that would break a table row.
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True only for a real calendar date in yyyy-mm-dd form. */
export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  // Rejects rolled-over dates like 2025-02-30, which Date happily accepts.
  return parsed.toISOString().slice(0, 10) === value;
}

function daysApart(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

function asRecord(raw: unknown): Record<string, unknown> {
  return typeof raw === "object" && raw !== null
    ? (raw as Record<string, unknown>)
    : {};
}

function readText(
  source: Record<string, unknown>,
  field: string,
  label: string,
  max: number,
  errors: FieldError[],
): string {
  const raw = source[field];
  if (typeof raw !== "string") {
    errors.push({ field, message: `${label} is required.` });
    return "";
  }

  const clean = stripHtml(raw);
  if (clean.length === 0) {
    errors.push({ field, message: `${label} is required.` });
  } else if (clean.length > max) {
    errors.push({
      field,
      message: `${label} must be ${max} characters or fewer (got ${clean.length}).`,
    });
  }
  return clean;
}

function readMeasurement(
  source: Record<string, unknown>,
  field: string,
  label: string,
  errors: FieldError[],
): number {
  const raw = source[field];
  const value = typeof raw === "number" ? raw : Number.parseFloat(String(raw ?? ""));

  if (!Number.isFinite(value)) {
    errors.push({ field, message: `${label} must be a number.` });
    return 0;
  }
  if (value < LIMITS.measurementMin || value > LIMITS.measurementMax) {
    errors.push({
      field,
      message: `${label} must be between ${LIMITS.measurementMin} and ${LIMITS.measurementMax} inches (got ${value}).`,
    });
  }
  return value;
}

/**
 * Validate a raw submission body. Collects every problem rather than stopping
 * at the first, so a failed submit can tell the grower everything at once.
 *
 * @param today ISO yyyy-mm-dd for "now", supplied by the caller.
 */
export function validateEntry(raw: unknown, today: string): ValidationResult {
  const source = asRecord(raw);
  const errors: FieldError[] = [];

  const grower_name = readText(
    source, "grower_name", "Grower name", LIMITS.growerNameMax, errors,
  );
  const location = readText(
    source, "location", "Location", LIMITS.locationMax, errors,
  );
  const pumpkin_name = readText(
    source, "pumpkin_name", "Pumpkin name", LIMITS.pumpkinNameMax, errors,
  );

  const circumference = readMeasurement(
    source, "circumference", "Circumference", errors,
  );
  const side_to_side = readMeasurement(
    source, "side_to_side", "Side to side", errors,
  );
  const end_to_end = readMeasurement(source, "end_to_end", "End to end", errors);

  const measuredRaw = source.measured_on;
  let measured_on = "";
  if (typeof measuredRaw !== "string" || !isValidIsoDate(measuredRaw)) {
    errors.push({
      field: "measured_on",
      message: "Measurement date must be a real date in yyyy-mm-dd form.",
    });
  } else {
    measured_on = measuredRaw;
    const age = daysApart(measured_on, today);
    if (age < 0) {
      errors.push({
        field: "measured_on",
        message: "Measurement date cannot be in the future.",
      });
    } else if (age > LIMITS.maxAgeDays) {
      errors.push({
        field: "measured_on",
        message: `Measurement date cannot be more than ${LIMITS.maxAgeDays} days old (this one is ${age} days old).`,
      });
    }
  }

  // Optional. Absent, null, and empty string all mean "not recorded".
  const pollinationRaw = source.pollination_date;
  let pollination_date: string | null = null;
  if (pollinationRaw !== undefined && pollinationRaw !== null && pollinationRaw !== "") {
    if (typeof pollinationRaw !== "string" || !isValidIsoDate(pollinationRaw)) {
      errors.push({
        field: "pollination_date",
        message: "Pollination date must be a real date in yyyy-mm-dd form.",
      });
    } else if (daysApart(pollinationRaw, today) < 0) {
      errors.push({
        field: "pollination_date",
        message: "Pollination date cannot be in the future.",
      });
    } else if (measured_on && daysApart(pollinationRaw, measured_on) < 0) {
      errors.push({
        field: "pollination_date",
        message: "Pollination date cannot be after the measurement date.",
      });
    } else {
      pollination_date = pollinationRaw;
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      grower_name,
      location,
      pumpkin_name,
      circumference,
      side_to_side,
      end_to_end,
      pollination_date,
      measured_on,
    },
  };
}
