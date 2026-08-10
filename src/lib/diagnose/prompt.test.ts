import { describe, expect, it } from "vitest";
import { DIAGNOSIS_TOOL, SYSTEM_PROMPT } from "./prompt";

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
    const products =
      /neem|spinosad|sulfur|copper|imidacloprid|carbaryl|malathion|bifenthrin|chlorothalonil|myclobutanil|azoxystrobin|pyrethrin|bacillus thuringiensis|\bbt\b|sevin|roundup|OMRI-listed product/i;
    expect(SYSTEM_PROMPT).not.toMatch(products);
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
    const products =
      /neem|spinosad|sulfur|copper|imidacloprid|carbaryl|malathion|bifenthrin|abamectin|bifenazate|chlorothalonil|myclobutanil|azoxystrobin|pyrethrin|sevin|roundup/i;
    expect(SYSTEM_PROMPT).not.toMatch(products);
  });
});
