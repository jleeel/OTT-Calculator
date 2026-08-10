import { describe, expect, it } from "vitest";
import { MILESTONES, milestoneFor, milestoneMessage } from "./milestones";

describe("milestoneFor", () => {
  it("has nothing passed below the first mark", () => {
    expect(milestoneFor(40)).toEqual({ passed: null, next: 100 });
  });

  it("counts a mark as passed exactly on it", () => {
    expect(milestoneFor(100)).toEqual({ passed: 100, next: 200 });
    expect(milestoneFor(1000)).toEqual({ passed: 1000, next: 1500 });
  });

  it("picks the pair either side of a weight", () => {
    expect(milestoneFor(247)).toEqual({ passed: 200, next: 300 });
    expect(milestoneFor(812)).toEqual({ passed: 750, next: 1000 });
  });

  it("has no next mark past the last one", () => {
    expect(milestoneFor(2600)).toEqual({ passed: 2500, next: null });
  });

  it("treats zero and nonsense as not started", () => {
    expect(milestoneFor(0)).toEqual({ passed: null, next: 100 });
    expect(milestoneFor(-5)).toEqual({ passed: null, next: 100 });
    expect(milestoneFor(Number.NaN)).toEqual({ passed: null, next: 100 });
  });

  it("never reports a passed mark above the weight", () => {
    for (const lbs of [99, 150, 301, 749, 1499, 2499]) {
      const { passed } = milestoneFor(lbs);
      if (passed !== null) expect(passed).toBeLessThanOrEqual(lbs);
    }
  });

  it("uses only the published marks", () => {
    for (const lbs of [50, 250, 600, 1200, 3000]) {
      const { passed, next } = milestoneFor(lbs);
      if (passed !== null) expect(MILESTONES).toContain(passed);
      if (next !== null) expect(MILESTONES).toContain(next);
    }
  });
});

describe("milestoneMessage", () => {
  it("invites the first mark before any is reached", () => {
    expect(milestoneMessage(60)).toBe("Next stop: 100 lb.");
  });

  it("names the mark passed and the one ahead", () => {
    expect(milestoneMessage(247)).toBe("Past 200 lb. Next stop: 300.");
  });

  it("formats thousands with a separator", () => {
    expect(milestoneMessage(1100)).toBe("Past 1,000 lb. Next stop: 1,500.");
  });

  it("stops promising more past the last mark", () => {
    expect(milestoneMessage(2600)).toContain("Past 2,500 lb.");
    expect(milestoneMessage(2600)).not.toContain("Next stop");
  });

  it("never invents a comparison to other growers", () => {
    for (const lbs of [0, 50, 250, 900, 3000]) {
      const message = milestoneMessage(lbs) ?? "";
      expect(message).not.toMatch(/percentile|rank|average|top \d|than most|other/i);
    }
  });
});
