import { describe, expect, it } from "vitest";
import {
  DIAGNOSE_DISCLAIMER,
  LEAVE_IT_ALONE,
  REFERRAL,
  ROLE_LABEL,
  coerceDiagnosis,
  coerceIdentification,
  parseDiagnosis,
  parseIdentification,
  parseMode,
} from "./types";

describe("copy", () => {
  it("carries the disclaimer verbatim", () => {
    expect(DIAGNOSE_DISCLAIMER).toBe(
      "AI-generated, for orientation only. Confirm with your local extension office before treating.",
    );
  });

  it("names who to ask instead of naming a product", () => {
    expect(REFERRAL).toMatch(/extension office/i);
    expect(REFERRAL).toMatch(/PCA/);
  });
});

describe("parseDiagnosis", () => {
  const good = {
    observed: "A pumpkin leaf with white patches on the upper surface.",
    insufficient: false,
    causes: [
      { name: "Powdery mildew", confidence: "medium", why: "White talc-like patches." },
      { name: "Spray residue", confidence: "low", why: "Would rub off." },
    ],
    checks: ["Rub a patch with your thumb."],
    cultural_steps: ["Pull the worst leaves and bag them."],
    needs_professional: true,
  };

  it("reads a well-formed response", () => {
    expect(parseDiagnosis(good)).toEqual({
      observed: good.observed,
      insufficient: false,
      causes: [
        { name: "Powdery mildew", confidence: "medium", why: "White talc-like patches." },
        { name: "Spray residue", confidence: "low", why: "Would rub off." },
      ],
      checks: ["Rub a patch with your thumb."],
      culturalSteps: ["Pull the worst leaves and bag them."],
      needsProfessional: true,
    });
  });

  it("rejects anything that is not an object with an observation", () => {
    expect(parseDiagnosis(null)).toBeNull();
    expect(parseDiagnosis("powdery mildew")).toBeNull();
    expect(parseDiagnosis({ causes: [] })).toBeNull();
    expect(parseDiagnosis({ ...good, observed: "   " })).toBeNull();
  });

  it("treats a response with no causes as insufficient however it is flagged", () => {
    const result = parseDiagnosis({ ...good, insufficient: false, causes: [] });
    expect(result?.insufficient).toBe(true);
  });

  it("falls back to low confidence on an unrecognised level", () => {
    const result = parseDiagnosis({
      ...good,
      causes: [{ name: "Aphids", confidence: "certain", why: "Clusters." }],
    });
    expect(result?.causes[0].confidence).toBe("low");
  });

  it("drops causes with no name and keeps at most three", () => {
    const result = parseDiagnosis({
      ...good,
      causes: [
        { name: "", confidence: "high", why: "x" },
        ...Array.from({ length: 4 }, (_, i) => ({
          name: `Cause ${i}`,
          confidence: "low",
          why: "x",
        })),
      ],
    });
    expect(result?.causes.map((c) => c.name)).toEqual([
      "Cause 0",
      "Cause 1",
      "Cause 2",
    ]);
  });

  it("survives missing optional arrays", () => {
    const result = parseDiagnosis({
      observed: "A leaf.",
      insufficient: true,
      causes: [],
    });
    expect(result).toEqual({
      observed: "A leaf.",
      insufficient: true,
      causes: [],
      checks: [],
      culturalSteps: [],
      needsProfessional: false,
    });
  });

  it("ignores non-string entries inside the string lists", () => {
    const result = parseDiagnosis({
      ...good,
      checks: ["Turn the leaf over.", 42, null, "  "],
    });
    expect(result?.checks).toEqual(["Turn the leaf over."]);
  });
});

describe("coerceDiagnosis", () => {
  const fromApi = {
    observed: "A leaf with white patches.",
    insufficient: false,
    causes: [{ name: "Powdery mildew", confidence: "medium", why: "Dusty patches." }],
    checks: ["Rub a patch."],
    culturalSteps: ["Bag the worst leaves."],
    needsProfessional: true,
  };

  it("reads the camelCase shape the route sends", () => {
    expect(coerceDiagnosis(fromApi)).toEqual(fromApi);
  });

  it("survives a payload missing the arrays it renders", () => {
    // A cached client meeting a changed route used to take the page down on
    // `.length` of undefined.
    expect(coerceDiagnosis({ observed: "A leaf.", causes: [] })).toEqual({
      observed: "A leaf.",
      insufficient: true,
      causes: [],
      checks: [],
      culturalSteps: [],
      needsProfessional: false,
    });
  });

  it("rejects a body that is not a diagnosis at all", () => {
    expect(coerceDiagnosis(undefined)).toBeNull();
    expect(coerceDiagnosis({ error: "nope" })).toBeNull();
  });

  it("does not read the model's snake_case names", () => {
    // parseDiagnosis owns that shape; mixing the two would hide a route bug.
    const result = coerceDiagnosis({ ...fromApi, culturalSteps: undefined, cultural_steps: ["x"] });
    expect(result?.culturalSteps).toEqual([]);
  });
});

describe("parseMode", () => {
  it("reads the bug question", () => {
    expect(parseMode("bug")).toBe("bug");
  });

  it("falls back to the plant question on anything else", () => {
    // A form field is a string from the wire; every other value is the page's
    // default question, not an error.
    for (const value of [undefined, null, "", "damage", "BUG", 1, {}]) {
      expect(parseMode(value)).toBe("damage");
    }
  });
});

describe("parseIdentification", () => {
  const good = {
    observed: "A spiny dark larva with orange spots on a leaf covered in aphids.",
    insufficient: false,
    candidates: [
      {
        name: "Lady beetle larva",
        scientific_name: "Hippodamia convergens",
        confidence: "high",
        role: "beneficial",
        life_stage: "larva",
        why: "Alligator-shaped, spiny, dark with orange markings, among aphids.",
      },
      {
        name: "Squash bug nymph",
        confidence: "low",
        role: "pest",
        life_stage: "nymph",
        why: "Nymphs are flat and grey and sit in clusters, not spiny.",
      },
    ],
    effect: "It eats aphids by the hundred.",
    lookalikes: ["Lady beetle eggs are yellow spindles standing on end."],
    checks: ["Turn the leaf over and count the aphids."],
    cultural_steps: ["Leave it where it is."],
    needs_professional: false,
  };

  it("reads a well-formed response", () => {
    expect(parseIdentification(good)).toEqual({
      observed: good.observed,
      insufficient: false,
      candidates: [
        {
          name: "Lady beetle larva",
          scientificName: "Hippodamia convergens",
          confidence: "high",
          role: "beneficial",
          lifeStage: "larva",
          why: "Alligator-shaped, spiny, dark with orange markings, among aphids.",
        },
        {
          name: "Squash bug nymph",
          scientificName: "",
          confidence: "low",
          role: "pest",
          lifeStage: "nymph",
          why: "Nymphs are flat and grey and sit in clusters, not spiny.",
        },
      ],
      effect: "It eats aphids by the hundred.",
      lookalikes: ["Lady beetle eggs are yellow spindles standing on end."],
      checks: ["Turn the leaf over and count the aphids."],
      culturalSteps: ["Leave it where it is."],
      needsProfessional: false,
    });
  });

  it("keeps each candidate's own role", () => {
    // The alternate carrying the opposite role is the point of the field.
    const result = parseIdentification(good);
    expect(result?.candidates.map((c) => c.role)).toEqual(["beneficial", "pest"]);
  });

  it("degrades an unreadable role to unknown, never to neutral", () => {
    // "neutral" is a claim — it tells a grower the thing is harmless. An
    // unparseable value has to claim nothing at all.
    for (const value of ["helpful", "", undefined, null, 3]) {
      const result = parseIdentification({
        ...good,
        candidates: [{ ...good.candidates[0], role: value }],
      });
      expect(result?.candidates[0].role).toBe("unknown");
    }
  });

  it("rejects anything that is not an object with an observation", () => {
    expect(parseIdentification(null)).toBeNull();
    expect(parseIdentification("a squash bug")).toBeNull();
    expect(parseIdentification({ candidates: [] })).toBeNull();
    expect(parseIdentification({ ...good, observed: "  " })).toBeNull();
  });

  it("treats a response with no candidates as insufficient however it is flagged", () => {
    const result = parseIdentification({ ...good, insufficient: false, candidates: [] });
    expect(result?.insufficient).toBe(true);
  });

  it("drops candidates with no name and keeps at most three", () => {
    const result = parseIdentification({
      ...good,
      candidates: [
        { name: "", confidence: "high", role: "pest", why: "x" },
        ...Array.from({ length: 4 }, (_, i) => ({
          name: `Bug ${i}`,
          confidence: "low",
          role: "neutral",
          why: "x",
        })),
      ],
    });
    expect(result?.candidates.map((c) => c.name)).toEqual([
      "Bug 0",
      "Bug 1",
      "Bug 2",
    ]);
  });

  it("survives missing optional fields", () => {
    expect(
      parseIdentification({ observed: "A beetle.", insufficient: true, candidates: [] }),
    ).toEqual({
      observed: "A beetle.",
      insufficient: true,
      candidates: [],
      effect: "",
      lookalikes: [],
      checks: [],
      culturalSteps: [],
      needsProfessional: false,
    });
  });

  it("keeps at most three lookalikes", () => {
    const result = parseIdentification({
      ...good,
      lookalikes: ["a", "b", "c", "d"],
    });
    expect(result?.lookalikes).toEqual(["a", "b", "c"]);
  });
});

describe("coerceIdentification", () => {
  const fromApi = {
    observed: "A grey shield-shaped bug on a leaf underside.",
    insufficient: false,
    candidates: [
      {
        name: "Squash bug",
        scientificName: "Anasa tristis",
        confidence: "medium",
        role: "pest",
        lifeStage: "adult",
        why: "Flat grey-brown shield with a ragged-edged abdomen.",
      },
    ],
    effect: "Sucks sap; one runner wilts while the rest looks fine.",
    lookalikes: ["Leaf-footed bugs have flares on the hind legs."],
    checks: ["Lay a board on the soil and look under it in the morning."],
    culturalSteps: ["Crush the egg clusters in the vein Vs."],
    needsProfessional: false,
  };

  it("reads the camelCase shape the route sends", () => {
    expect(coerceIdentification(fromApi)).toEqual(fromApi);
  });

  it("survives a payload missing the arrays it renders", () => {
    expect(coerceIdentification({ observed: "A beetle.", candidates: [] })).toEqual({
      observed: "A beetle.",
      insufficient: true,
      candidates: [],
      effect: "",
      lookalikes: [],
      checks: [],
      culturalSteps: [],
      needsProfessional: false,
    });
  });

  it("rejects a body that is not an identification at all", () => {
    expect(coerceIdentification(undefined)).toBeNull();
    expect(coerceIdentification({ error: "nope" })).toBeNull();
  });

  it("does not read the model's snake_case names", () => {
    const result = coerceIdentification({
      ...fromApi,
      candidates: [{ ...fromApi.candidates[0], scientificName: undefined, scientific_name: "x" }],
      culturalSteps: undefined,
      cultural_steps: ["x"],
    });
    expect(result?.candidates[0].scientificName).toBe("");
    expect(result?.culturalSteps).toEqual([]);
  });

  it("does not confuse a diagnosis for an identification", () => {
    // Both bodies have `observed`. If the route ever answered the wrong key,
    // the page must get null rather than a card of empty fields.
    const diagnosis = {
      observed: "White patches on the upper leaf surface.",
      insufficient: false,
      causes: [{ name: "Powdery mildew", confidence: "medium", why: "Talc-like." }],
      checks: ["Rub a patch."],
    };
    expect(coerceIdentification(diagnosis)?.insufficient).toBe(true);
    expect(coerceIdentification(diagnosis)?.candidates).toEqual([]);
  });
});

describe("identification copy", () => {
  it("labels every role, including the one the model cannot return", () => {
    expect(ROLE_LABEL.pest).toBe("Pest");
    expect(ROLE_LABEL.beneficial).toBe("On your side");
    expect(ROLE_LABEL.neutral).toBe("Not a problem");
    // Rendered when a role could not be read. It must claim nothing.
    expect(ROLE_LABEL.unknown).toMatch(/unclear/i);
  });

  it("says to leave a beneficial alone in as many words", () => {
    expect(LEAVE_IT_ALONE).toMatch(/leave this one where it is/i);
  });
});
