/**
 * The shapes an answer comes back in, and the copy shown alongside them.
 *
 * Split out of prompt.ts because the client component imports these — keeping
 * the system prompts and the tool schemas in a module nothing on the client
 * touches means they never reach the browser bundle.
 *
 * Pure, and normalising rather than trusting: the route is the last thing
 * between a model response and a rendered page.
 */

/**
 * Which question the grower is asking. Two different questions with two
 * different answers, chosen by a control at the top of the page — a photo of a
 * bronzed leaf and a photo of the bug that bronzed it want nothing alike.
 */
export type DiagnoseMode = "damage" | "bug";

/** Anything unrecognised is the plant question, which is the page's default. */
export function parseMode(value: unknown): DiagnoseMode {
  return value === "bug" ? "bug" : "damage";
}

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

/* -------------------------------------------------------------------------
 * Identification.
 * ---------------------------------------------------------------------- */

/**
 * What the organism does in a patch.
 *
 * "unknown" is not in the tool schema — the model must choose one of the three
 * real roles. It exists so an unreadable value degrades to a badge that claims
 * nothing, rather than silently landing on "neutral" and telling a grower an
 * unidentified thing is harmless.
 */
export type Role = "pest" | "beneficial" | "neutral" | "unknown";

export const ROLE_LABEL: Record<Role, string> = {
  pest: "Pest",
  beneficial: "On your side",
  neutral: "Not a problem",
  unknown: "Role unclear",
};

/** Said once, above everything else, when the leading candidate is a beneficial. */
export const LEAVE_IT_ALONE =
  "Leave this one where it is. It is working for you.";

export type Candidate = {
  name: string;
  scientificName: string;
  confidence: Confidence;
  role: Role;
  lifeStage: string;
  why: string;
};

export type Identification = {
  observed: string;
  insufficient: boolean;
  candidates: Candidate[];
  effect: string;
  lookalikes: string[];
  checks: string[];
  culturalSteps: string[];
  needsProfessional: boolean;
};

function role(value: unknown): Role {
  return value === "pest" || value === "beneficial" || value === "neutral"
    ? value
    : "unknown";
}

/** Field names differ only in casing between the model's shape and the API's. */
type IdKeys = {
  scientific: string;
  lifeStage: string;
  cultural: string;
  professional: string;
};

function candidateList(value: unknown, keys: IdKeys): Candidate[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
    .map((c) => ({
      name: text(c.name),
      scientificName: text(c[keys.scientific]),
      confidence: confidence(c.confidence),
      role: role(c.role),
      lifeStage: text(c[keys.lifeStage]),
      why: text(c.why),
    }))
    .filter((c) => c.name.length > 0)
    .slice(0, 3);
}

function buildIdentification(raw: unknown, keys: IdKeys): Identification | null {
  if (typeof raw !== "object" || raw === null) return null;
  const input = raw as Record<string, unknown>;

  const observed = text(input.observed);
  if (!observed) return null;

  const candidates = candidateList(input.candidates, keys);

  return {
    observed,
    // Nothing to name means nothing to show, whatever the flag says.
    insufficient: input.insufficient === true || candidates.length === 0,
    candidates,
    effect: text(input.effect),
    lookalikes: textList(input.lookalikes, 3),
    checks: textList(input.checks, 5),
    culturalSteps: textList(input[keys.cultural], 5),
    needsProfessional: input[keys.professional] === true,
  };
}

/** The model's tool input, in the schema's snake_case. */
export function parseIdentification(raw: unknown): Identification | null {
  return buildIdentification(raw, {
    scientific: "scientific_name",
    lifeStage: "life_stage",
    cultural: "cultural_steps",
    professional: "needs_professional",
  });
}

/** What the browser got back from /api/diagnose, in camelCase. */
export function coerceIdentification(raw: unknown): Identification | null {
  return buildIdentification(raw, {
    scientific: "scientificName",
    lifeStage: "lifeStage",
    cultural: "culturalSteps",
    professional: "needsProfessional",
  });
}
