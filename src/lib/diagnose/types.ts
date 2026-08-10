/**
 * The shape a diagnosis comes back in, and the copy shown alongside it.
 *
 * Split out of prompt.ts because the client component imports these — keeping
 * the system prompt and the tool schema in a module nothing on the client
 * touches means they never reach the browser bundle.
 *
 * Pure, and normalising rather than trusting: the route is the last thing
 * between a model response and a rendered page.
 */

/** Shown under every result, and on the page before anyone uploads anything. */
export const DIAGNOSE_DISCLAIMER =
  "AI-generated, for orientation only. Confirm with your local extension " +
  "office before treating.";

/** What the grower is pointed at instead of a product name. */
export const REFERRAL =
  "Your county extension office or a licensed PCA can tell you what is " +
  "legal to apply here, and at what rate.";

export type Confidence = "high" | "medium" | "low";

export type Cause = {
  name: string;
  confidence: Confidence;
  why: string;
};

export type Diagnosis = {
  observed: string;
  insufficient: boolean;
  causes: Cause[];
  checks: string[];
  culturalSteps: string[];
  needsProfessional: boolean;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function textList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(text).filter(Boolean).slice(0, max);
}

function confidence(value: unknown): Confidence {
  return value === "high" || value === "medium" ? value : "low";
}

function causeList(value: unknown): Cause[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
    .map((c) => ({
      name: text(c.name),
      confidence: confidence(c.confidence),
      why: text(c.why),
    }))
    .filter((c) => c.name.length > 0)
    .slice(0, 3);
}

/**
 * Build a renderable diagnosis out of an object whose fields are named
 * `culturalKey` and `professionalKey`. The two callers differ only in casing —
 * the model answers in the tool schema's snake_case, the API responds in the
 * camelCase the page renders.
 */
function build(
  raw: unknown,
  culturalKey: string,
  professionalKey: string,
): Diagnosis | null {
  if (typeof raw !== "object" || raw === null) return null;
  const input = raw as Record<string, unknown>;

  const observed = text(input.observed);
  if (!observed) return null;

  const causes = causeList(input.causes);

  return {
    observed,
    // A response with nothing to show is treated as insufficient whatever the
    // flag says, so the page never renders an empty result card.
    insufficient: input.insufficient === true || causes.length === 0,
    causes,
    checks: textList(input.checks, 5),
    culturalSteps: textList(input[culturalKey], 5),
    needsProfessional: input[professionalKey] === true,
  };
}

/**
 * Normalise the model's tool input into something the page can render without
 * optional-chaining every field. The schema is enforced server-side by the
 * API, but the route is the last thing between a model response and a page, so
 * it does not assume.
 */
export function parseDiagnosis(raw: unknown): Diagnosis | null {
  return build(raw, "cultural_steps", "needs_professional");
}

/**
 * Normalise what the browser got back from /api/diagnose.
 *
 * The client has no more business trusting a response body than the route has
 * trusting a model — a payload missing an array it renders `.length` on takes
 * the whole page down, and a cached client meeting a changed route is exactly
 * how that happens. Costs nothing, removes a white screen.
 */
export function coerceDiagnosis(raw: unknown): Diagnosis | null {
  return build(raw, "culturalSteps", "needsProfessional");
}
