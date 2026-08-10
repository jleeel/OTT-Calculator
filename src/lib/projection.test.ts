import { describe, expect, it } from "vitest";
import {
  MAX_DAP,
  MIN_DAP,
  fractionOfFinal,
  projectFinalWeight,
  roundProjection,
} from "./projection";

describe("fractionOfFinal", () => {
  it.each([
    [20, 0.15],
    [30, 0.35],
    [35, 0.46],
    [40, 0.57],
    [50, 0.73],
    [60, 0.845],
    [70, 0.92],
    [80, 0.97],
    [90, 1.0],
  ])("matches the published table at DAP %i", (dap, expected) => {
    expect(fractionOfFinal(dap)).toBeCloseTo(expected, 6);
  });

  it("interpolates linearly between table points", () => {
    // Midway between 30 (0.35) and 35 (0.46).
    expect(fractionOfFinal(32.5)).toBeCloseTo(0.405, 6);
    // Midway between 60 (0.845) and 70 (0.92).
    expect(fractionOfFinal(65)).toBeCloseTo(0.8825, 6);
  });

  it("is null before the curve says anything useful", () => {
    expect(fractionOfFinal(14.9)).toBeNull();
    expect(fractionOfFinal(0)).toBeNull();
    expect(fractionOfFinal(-5)).toBeNull();
    expect(fractionOfFinal(Number.NaN)).toBeNull();
  });

  it("starts exactly at the minimum", () => {
    expect(fractionOfFinal(MIN_DAP)).not.toBeNull();
  });

  it("clamps to 1 at and past maturity", () => {
    expect(fractionOfFinal(MAX_DAP)).toBe(1);
    expect(fractionOfFinal(120)).toBe(1);
    expect(fractionOfFinal(400)).toBe(1);
  });

  it("increases monotonically across the season", () => {
    let previous = 0;
    for (let dap = MIN_DAP; dap <= 100; dap += 1) {
      const f = fractionOfFinal(dap);
      expect(f).not.toBeNull();
      expect(f!).toBeGreaterThanOrEqual(previous);
      previous = f!;
    }
  });
});

describe("projectFinalWeight", () => {
  it("divides the current weight by the fraction reached", () => {
    // 500 lb at day 50, which the curve puts at 73% of final.
    const result = projectFinalWeight(500, 50);
    expect(result).not.toBeNull();
    expect(result!.projectedLbs).toBeCloseTo(500 / 0.73, 6);
    expect(result!.fractionComplete).toBeCloseTo(0.73, 6);
  });

  it("projects to the end date when one is given", () => {
    // Same fruit, but the season ends at day 70 (92% of maturity).
    const open = projectFinalWeight(500, 50)!;
    const clamped = projectFinalWeight(500, 50, 70)!;
    expect(clamped.projectedLbs).toBeCloseTo(open.projectedLbs * 0.92, 6);
    // The fraction reported is still progress against full maturity.
    expect(clamped.fractionComplete).toBeCloseTo(0.73, 6);
  });

  it("an end date at or past maturity changes nothing", () => {
    const open = projectFinalWeight(800, 60)!;
    expect(projectFinalWeight(800, 60, 90)!.projectedLbs).toBeCloseTo(
      open.projectedLbs,
      6,
    );
    expect(projectFinalWeight(800, 60, 130)!.projectedLbs).toBeCloseTo(
      open.projectedLbs,
      6,
    );
  });

  it("an earlier end date always lowers the projection", () => {
    const base = projectFinalWeight(600, 45)!;
    const early = projectFinalWeight(600, 45, 60)!;
    expect(early.projectedLbs).toBeLessThan(base.projectedLbs);
  });

  it("a fruit measured at maturity projects to roughly itself", () => {
    const result = projectFinalWeight(1200, 90)!;
    expect(result.projectedLbs).toBeCloseTo(1200, 6);
    expect(result.fractionComplete).toBe(1);
  });

  it("is null when it is too early to project", () => {
    expect(projectFinalWeight(40, 12)).toBeNull();
    expect(projectFinalWeight(40, 0)).toBeNull();
  });

  it("is null without a usable current weight", () => {
    expect(projectFinalWeight(0, 50)).toBeNull();
    expect(projectFinalWeight(-100, 50)).toBeNull();
    expect(projectFinalWeight(Number.NaN, 50)).toBeNull();
  });

  it("treats a missing end date the same as no clamp", () => {
    const open = projectFinalWeight(500, 50)!;
    expect(projectFinalWeight(500, 50, null)!.projectedLbs).toBeCloseTo(
      open.projectedLbs,
      6,
    );
    expect(projectFinalWeight(500, 50, undefined)!.projectedLbs).toBeCloseTo(
      open.projectedLbs,
      6,
    );
  });

  it("projects above the current weight before maturity", () => {
    for (const dap of [20, 35, 50, 70, 85]) {
      const result = projectFinalWeight(400, dap)!;
      expect(result.projectedLbs).toBeGreaterThan(400);
    }
  });
});

describe("roundProjection", () => {
  it("rounds to the nearest 10 lb", () => {
    expect(roundProjection(684.9)).toBe(680);
    expect(roundProjection(685)).toBe(690);
    expect(roundProjection(1234)).toBe(1230);
  });
});
