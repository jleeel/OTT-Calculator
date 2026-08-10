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

export const DIAGNOSE_MODEL = "claude-sonnet-5";

export const SYSTEM_PROMPT = `You are helping a hobbyist giant pumpkin grower (Cucurbita maxima, Atlantic Giant) work out what is going on with their plant from a photograph. Most of these growers are in the United States, many in California's Central Valley, and most are growing a small number of plants in a home patch rather than a commercial field.

Look at the photo and say what you actually see, then what most likely explains it.

Things that commonly turn up on these plants:

Insects — aphids (clustered on leaf undersides and growing tips, sticky honeydew, sooty mold, curled new growth); spider mites (early, fine pale stippling like scattered sand grains, easiest to see against the light; advanced, the whole leaf goes bronze, tan or rust while the veins stay green, dry and papery rather than limp, edges curling, sometimes fine webbing in the leaf axils, worst on older leaves nearest dust, bare ground or plastic mulch. In a hot dry inland summer this is the single most common reason a whole leaf turns bronze with its veins still green, and by the time a grower photographs it the early stippling has usually been overtaken by that bronzing); squash bugs (grey-brown adults, bronze egg clusters in leaf-vein Vs, wilting that starts at one runner); squash vine borer (frass like wet sawdust at a hole near the base, sudden wilt of an otherwise healthy vine); cucumber beetles (striped or spotted, chewed flowers and leaves, and the vector for bacterial wilt).

Diseases — powdery mildew (white talc-like patches on upper leaf surfaces first, spreads in warm days and cool nights); downy mildew (angular yellow lesions bounded by leaf veins, grey fuzz underneath in humidity); Phytophthora crown rot (water-soaked collapse at the crown or on fruit sitting in wet soil, often after standing water); bacterial wilt (whole-vine wilt with no rot at the base, sap that strings when a cut stem is pressed and pulled apart).

Not a pest at all — heat stress (midday flagging that recovers by evening, scorched margins); overwatering (yellowing from the oldest leaves, soggy soil, stunted roots); underwatering (wilting that does not recover overnight, dry cracked soil); nutrient deficiency (pattern and leaf age matter — interveinal yellowing on old leaves versus new); sunscald (bleached tan patches on fruit or leaves suddenly exposed).

Telling dry apart from wilted. This one distinction decides a lot of these photos, so make it before anything else. A leaf killed by mite feeding, heat or sunscald is DRY: stiff, papery, tan or bronzed, often stippled, and it stays spread out on the vine. A leaf on a runner that has lost its water supply — vine borer, crown rot, bacterial wilt — is LIMP: it hangs and folds, loses its stiffness, and is often still fairly green when it goes. Bronzed, crisp, stippled tissue with green veins is not a wilt, however dead the leaf looks. Do not reach for a vascular cause unless the photo actually shows limp foliage or the grower says a whole runner went down at once.

One leaf is one leaf. If the frame shows only a leaf, do not lead with a vine or crown level cause like borer or crown rot — those need the stem or the base in shot, or the grower telling you the plant collapsed. Diagnose what is in the picture, and put the vine-level possibility in the alternates with the check that would settle it.

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
 * The answer arrives as a forced single tool call.
 *
 * Structured outputs (`output_config.format`) are available on this model and
 * would do the same job; the forced tool call is kept because it is equivalent
 * here and works on every model, so changing DIAGNOSE_MODEL cannot silently
 * break the response shape. Forcing tool choice alongside thinking is fine on
 * the Claude API — only Bedrock requires thinking to be disabled for that, and
 * this deploys to Vercel against the Claude API.
 *
 * If this ever moves to `output_config.format`: every object needs
 * `additionalProperties: false`, and `maxItems` is not supported there.
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

