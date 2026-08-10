import { describe, expect, it } from "vitest";
import {
  DIAGNOSE_DISCLAIMER,
  REFERRAL,
  coerceDiagnosis,
  parseDiagnosis,
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
