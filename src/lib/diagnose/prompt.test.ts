import { describe, expect, it } from "vitest";
import {
  DIAGNOSIS_TOOL,
  IDENTIFY_PROMPT,
  IDENTIFY_TOOL,
  PESTICIDE_RULE,
  SYSTEM_PROMPT,
} from "./prompt";

/** No prompt may name one, and neither may a tool description. */
const PRODUCTS =
  /neem|spinosad|sulfur|copper|imidacloprid|carbaryl|malathion|bifenthrin|abamectin|bifenazate|chlorothalonil|myclobutanil|azoxystrobin|pyrethrin|bacillus thuringiensis|\bbt\b|sevin|roundup|OMRI-listed product/i;

/**
 * The pesticide rule is a legal constraint, not a style preference, so it is
 * asserted rather than trusted to survive a future edit of the prompt.
 */
describe("SYSTEM_PROMPT", () => {
  it("forbids naming products and rates outright", () => {
    expect(SYSTEM_PROMPT).toMatch(/never name a pesticide/i);
    expect(SYSTEM_PROMPT).toMatch(/rate/i);
    expect(SYSTEM_PROMPT).toMatch(/even if the grower asks directly/i);
  });

  it("sends spray decisions to the extension office or a PCA", () => {
    expect(SYSTEM_PROMPT).toMatch(/extension office/i);
    expect(SYSTEM_PROMPT).toMatch(/pest control adviser|PCA/);
  });

  it("does not itself name an active ingredient or a product", () => {
    // A prompt that lists products as examples of what not to say is a prompt
    // that has put product names in front of the model.
    expect(SYSTEM_PROMPT).not.toMatch(PRODUCTS);
  });

  it("covers the pests, diseases and abiotic causes this crop actually gets", () => {
    for (const term of [
      "aphids",
      "spider mites",
      "squash bugs",
      "squash vine borer",
      "cucumber beetles",
      "powdery mildew",
      "downy mildew",
      "Phytophthora",
      "bacterial wilt",
      "heat stress",
      "verwatering",
      "nderwatering",
      "utrient deficiency",
      "unscald",
    ]) {
      expect(SYSTEM_PROMPT).toContain(term);
    }
  });

  it("asks for confidence, alternates and physical checks", () => {
    expect(SYSTEM_PROMPT).toMatch(/confidence level of high, medium or low/i);
    expect(SYSTEM_PROMPT).toMatch(/two alternates/i);
    expect(SYSTEM_PROMPT).toMatch(/physical checks/i);
  });

  it("tells the model to say so when the photo is not enough", () => {
    expect(SYSTEM_PROMPT).toMatch(/does not show enough/i);
    expect(SYSTEM_PROMPT).toMatch(/Do not guess to fill the space/i);
  });
});

describe("DIAGNOSIS_TOOL", () => {
  it("requires the fields the page renders", () => {
    expect(DIAGNOSIS_TOOL.input_schema.required).toEqual([
      "observed",
      "insufficient",
      "causes",
      "checks",
    ]);
  });

  it("caps the alternates at two", () => {
    expect(DIAGNOSIS_TOOL.input_schema.properties.causes.maxItems).toBe(3);
  });

  it("constrains confidence to three levels", () => {
    expect(
      DIAGNOSIS_TOOL.input_schema.properties.causes.items.properties.confidence
        .enum,
    ).toEqual(["high", "medium", "low"]);
  });
});

/**
 * Added after a real miss: a photo of advanced spider mite damage — a whole
 * leaf bronzed with the veins still green — came back as vine borer, with
 * bacterial wilt and downy mildew as the alternates. Mites were not offered at
 * all. The model had described the stippling correctly and then read "dried
 * out" as "wilted", which sent it looking for a vascular cause.
 */
describe("SYSTEM_PROMPT: the spider mite miss", () => {
  it("describes advanced mite damage, not just the early stippling", () => {
    // The early stage is what textbooks show; the late stage is what a grower
    // actually photographs, because that is when they notice.
    expect(SYSTEM_PROMPT).toMatch(/bronze, tan or rust while the veins\s+stay green|veins\s*\n?\s*stay green/);
    expect(SYSTEM_PROMPT).toMatch(/dry and papery rather than limp/);
  });

  it("separates dry damage from a true wilt", () => {
    // This is the distinction the model got wrong.
    expect(SYSTEM_PROMPT).toMatch(/Telling dry apart from wilted/i);
    expect(SYSTEM_PROMPT).toMatch(/is not a wilt, however dead the leaf looks/i);
  });

  it("refuses to lead with a vine-level cause from a leaf-only photo", () => {
    expect(SYSTEM_PROMPT).toMatch(/One leaf is one leaf/i);
    expect(SYSTEM_PROMPT).toMatch(/do not lead with a vine or crown level cause/i);
  });

  it("still names no product, after all that editing", () => {
    expect(SYSTEM_PROMPT).not.toMatch(PRODUCTS);
  });
});

/**
 * The pesticide rule is written once and interpolated into both prompts. These
 * assert it actually reaches both — two prompts each carrying their own copy is
 * one edit away from only one of them being right, and the one that drifts is
 * the one nobody is looking at.
 */
describe("PESTICIDE_RULE", () => {
  it("is the same text in both prompts", () => {
    expect(SYSTEM_PROMPT).toContain(PESTICIDE_RULE);
    expect(IDENTIFY_PROMPT).toContain(PESTICIDE_RULE);
  });

  it("forbids the product, the brand and the rate", () => {
    expect(PESTICIDE_RULE).toMatch(/never name a pesticide/i);
    expect(PESTICIDE_RULE).toMatch(/application rate/i);
    expect(PESTICIDE_RULE).toMatch(/even if the grower asks directly/i);
    expect(PESTICIDE_RULE).toMatch(/extension office/i);
    expect(PESTICIDE_RULE).toMatch(/pest control adviser|PCA/);
  });
});

describe("IDENTIFY_PROMPT", () => {
  it("names no product either", () => {
    expect(IDENTIFY_PROMPT).not.toMatch(PRODUCTS);
  });

  it("leads with whether to leave it alone, not with the species", () => {
    expect(IDENTIFY_PROMPT).toMatch(/doing harm, doing good, or doing neither/i);
    expect(IDENTIFY_PROMPT).toMatch(/say plainly to leave it alone/i);
  });

  it("covers the pests this crop actually gets", () => {
    for (const term of [
      "Squash bug",
      "Squash vine borer",
      "cucumber beetles",
      "Aphids",
      "Spider mites",
      "Whiteflies",
      "Caterpillars",
      "Slugs and snails",
    ]) {
      expect(IDENTIFY_PROMPT).toContain(term);
    }
  });

  it("covers the beneficials that get killed by mistake", () => {
    for (const term of [
      "Lady beetle larva",
      "Lady beetle pupa",
      "Lady beetle eggs",
      "Hover fly larva",
      "Green lacewing",
      "Parasitoid wasps",
      "aphid mummies",
      "assassin bug",
      "Ground beetles",
      "Squash bee",
    ]) {
      expect(IDENTIFY_PROMPT).toContain(term);
    }
  });

  it("teaches the egg-cluster mix-up that costs beneficials their lives", () => {
    // Lady beetle eggs destroyed as squash bug eggs is the single most common
    // and most expensive mistake in this patch, so the tells are asserted.
    expect(IDENTIFY_PROMPT).toMatch(/Lady beetle eggs against squash bug eggs/i);
    expect(IDENTIFY_PROMPT).toMatch(/spindle-shaped, standing on end/i);
    expect(IDENTIFY_PROMPT).toMatch(/oval, lying flat, evenly spaced/i);
  });

  it("does not let a moth be mistaken for something that stings", () => {
    expect(IDENTIFY_PROMPT).toMatch(/It is a moth\. It cannot sting\./);
  });

  it("refuses to have anything killed on a low-confidence identification", () => {
    expect(IDENTIFY_PROMPT).toMatch(
      /Never tell a grower to destroy something the photo has not actually identified/i,
    );
  });

  it("allows collecting into soapy water but not spraying it", () => {
    // Drowning hand-picked bugs in a jar is collection and every extension
    // office suggests it. Putting soap on the plant is an application, and
    // applications are the thing this page does not do.
    expect(IDENTIFY_PROMPT).toMatch(/collection, not spraying/i);
    expect(IDENTIFY_PROMPT).toMatch(/soap included/i);
  });

  it("does not claim a size it cannot measure from a photo", () => {
    expect(IDENTIFY_PROMPT).toMatch(/There is no scale in a phone photo/i);
  });

  it("sends a photo of damage back to the other question", () => {
    expect(IDENTIFY_PROMPT).toMatch(/If the photo shows damage rather than the animal/i);
  });
});

describe("IDENTIFY_TOOL", () => {
  it("requires the fields the page renders", () => {
    expect(IDENTIFY_TOOL.input_schema.required).toEqual([
      "observed",
      "insufficient",
      "candidates",
      "checks",
    ]);
  });

  it("requires a role on every candidate, not just the first", () => {
    // The alternate is often the whole point: a squash bug nymph and an
    // assassin bug nymph are a pest and a predator in the same photo.
    expect(IDENTIFY_TOOL.input_schema.properties.candidates.items.required).toContain(
      "role",
    );
  });

  it("constrains role to the three real answers", () => {
    expect(
      IDENTIFY_TOOL.input_schema.properties.candidates.items.properties.role.enum,
    ).toEqual(["pest", "beneficial", "neutral"]);
  });

  it("caps the alternates at two", () => {
    expect(IDENTIFY_TOOL.input_schema.properties.candidates.maxItems).toBe(3);
  });

  it("keeps the two answers in separate tools", () => {
    expect(IDENTIFY_TOOL.name).not.toBe(DIAGNOSIS_TOOL.name);
  });

  it("names no product in a description either", () => {
    expect(JSON.stringify(IDENTIFY_TOOL)).not.toMatch(PRODUCTS);
    expect(JSON.stringify(DIAGNOSIS_TOOL)).not.toMatch(PRODUCTS);
  });
});
