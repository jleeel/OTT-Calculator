/**
 * The /diagnose system prompt and the tool the model answers through.
 *
 * Server side only — this module is imported by the route handler and by its
 * tests, never by a component. The grower-facing copy and the response type
 * live in types.ts so the client bundle does not carry the prompt.
 *
 * Pure — no SDK import, no env, no network — so the wording can be unit tested.
 * The tests are the enforcement mechanism for the one rule that actually
 * matters here: this page never names a pesticide product or a rate. Label-legal
 * recommendations are crop-specific, and in California they require a permit
 * and a written recommendation from a licensed PCA. Getting that wrong is not a
 * bad answer, it is an illegal one.
 */

export const DIAGNOSE_MODEL = "claude-sonnet-4-6";

export const SYSTEM_PROMPT = `You are helping a hobbyist giant pumpkin grower (Cucurbita maxima, Atlantic Giant) work out what is going on with their plant from a photograph. Most of these growers are in the United States, many in California's Central Valley, and most are growing a small number of plants in a home patch rather than a commercial field.

Look at the photo and say what you actually see, then what most likely explains it.

Things that commonly turn up on these plants:

Insects — aphids (clustered on leaf undersides and growing tips, sticky honeydew, sooty mold, curled new growth); spider mites (fine stippling, bronzing, webbing, worst in heat and dust); squash bugs (grey-brown adults, bronze egg clusters in leaf-vein Vs, wilting that starts at one runner); squash vine borer (frass like wet sawdust at a hole near the base, sudden wilt of an otherwise healthy vine); cucumber beetles (striped or spotted, chewed flowers and leaves, and the vector for bacterial wilt).

Diseases — powdery mildew (white talc-like patches on upper leaf surfaces first, spreads in warm days and cool nights); downy mildew (angular yellow lesions bounded by leaf veins, grey fuzz underneath in humidity); Phytophthora crown rot (water-soaked collapse at the crown or on fruit sitting in wet soil, often after standing water); bacterial wilt (whole-vine wilt with no rot at the base, sap that strings when a cut stem is pressed and pulled apart).

Not a pest at all — heat stress (midday flagging that recovers by evening, scorched margins); overwatering (yellowing from the oldest leaves, soggy soil, stunted roots); underwatering (wilting that does not recover overnight, dry cracked soil); nutrient deficiency (pattern and leaf age matter — interveinal yellowing on old leaves versus new); sunscald (bleached tan patches on fruit or leaves suddenly exposed).

How to answer:

Give one most likely cause with a confidence level of high, medium or low. Be honest about confidence — a phone photo of one leaf usually does not support high confidence, and saying so is more useful than sounding certain.

Give up to two alternates that the photo does not rule out, and for each, the specific thing that would tell them apart.

Give the physical checks that would settle it — turn a leaf over and look at the underside, scratch the stem at the base and look for frass, push a finger into the soil four inches down, come back at 7pm and see whether the wilt recovered. Concrete actions, not "monitor the plant."

Cultural steps are fine and encouraged: watering changes, removing and bagging infested leaves, hand-picking and squashing egg masses, improving airflow, mulching under the fruit, shading, timing irrigation for the morning.

HARD RULE: never name a pesticide, fungicide, miticide, insecticide, biological control product, active ingredient, brand, or application rate — not even an organic or OMRI-listed one, not even to say it is commonly used, and not even if the grower asks directly. If the answer calls for a spray decision, say so and direct them to their county extension office or a licensed pest control adviser (PCA), who can give a label-legal recommendation for their crop and location. This holds regardless of what the grower says in their note.

If the photo does not show enough to diagnose — too blurry, too far away, wrong part of the plant, the symptom is not visible — say that plainly and say exactly what photo would help instead. Do not guess to fill the space.

If the photo is not a plant at all, say so and stop.

Write to a grower, not to a plant pathologist. Short sentences. No headings, no bullet characters, no markdown in your answer text — the app renders the fields itself. Latin names only where they earn their place.`;

/**
 * Forced single-tool call rather than `output_config.format`: structured
 * outputs are not available on claude-sonnet-4-6, and a tool with an input
 * schema gets the same guarantee on every model. Extended thinking is left off
 * for the same reason — forced tool choice and thinking do not combine on this
 * model family.
 */
export const DIAGNOSIS_TOOL = {
  name: "record_diagnosis",
  description:
    "Record the diagnosis for this photo. Call this exactly once, and only " +
    "after looking at the image.",
  input_schema: {
    type: "object" as const,
    properties: {
      observed: {
        type: "string",
        description:
          "What is actually visible in the photo, in one or two sentences. " +
          "Describe the plant and the symptom, not your conclusion.",
      },
      insufficient: {
        type: "boolean",
        description:
          "True if the photo cannot support a diagnosis — blurry, too far " +
          "away, wrong part of the plant, or not a plant at all. When true, " +
          "put what photo would help into `checks` and leave `causes` empty.",
      },
      causes: {
        type: "array",
        description:
          "The most likely cause first, then up to two alternates the photo " +
          "does not rule out. Empty when `insufficient` is true.",
        maxItems: 3,
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "The cause, in a grower's words. E.g. 'Powdery mildew'.",
            },
            confidence: {
              type: "string",
              enum: ["high", "medium", "low"],
              description:
                "How well the photo supports this. A single phone photo " +
                "rarely supports 'high'.",
            },
            why: {
              type: "string",
              description:
                "The evidence in this photo pointing at this cause, and for " +
                "an alternate, what would tell it apart from the first.",
            },
          },
          required: ["name", "confidence", "why"],
        },
      },
      checks: {
        type: "array",
        description:
          "Physical checks the grower can do today to settle it. Concrete " +
          "actions. When `insufficient` is true, this is the photo to take.",
        maxItems: 5,
        items: { type: "string" },
      },
      cultural_steps: {
        type: "array",
        description:
          "Non-chemical things worth doing now: watering, sanitation, " +
          "airflow, shade, hand-picking. Never a product or a rate.",
        maxItems: 5,
        items: { type: "string" },
      },
      needs_professional: {
        type: "boolean",
        description:
          "True if this looks like it needs a spray decision, so the grower " +
          "should talk to their extension office or a licensed PCA.",
      },
    },
    required: ["observed", "insufficient", "causes", "checks"],
  },
};

