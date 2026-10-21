import { describe, it, expect } from "vitest";
import { NSW_RULE_SET } from "./rules";
import { resolveOutcome, statusForOutcome, isOutcome } from "./conduct";

describe("statusForOutcome", () => {
  it("maps outcomes to agenda-item statuses", () => {
    expect(statusForOutcome("RESOLVED")).toBe("CARRIED");
    expect(statusForOutcome("MOTION_LOST")).toBe("LOST");
    expect(statusForOutcome("DEFERRED")).toBe("DEFERRED");
  });
});

describe("isOutcome", () => {
  it("accepts valid outcomes and rejects others", () => {
    expect(isOutcome("RESOLVED")).toBe(true);
    expect(isOutcome("MAYBE")).toBe(false);
  });
});

describe("resolveOutcome", () => {
  it("honours an explicit deferral", () => {
    const r = resolveOutcome(NSW_RULE_SET, {
      requestedOutcome: "DEFERRED",
      resolutionCategory: "ORDINARY",
    });
    expect(r.outcome).toBe("DEFERRED");
    expect(r.status).toBe("DEFERRED");
  });

  it("records a plain resolved outcome when no tally is given", () => {
    const r = resolveOutcome(NSW_RULE_SET, {
      requestedOutcome: "RESOLVED",
      resolutionCategory: "ORDINARY",
    });
    expect(r.outcome).toBe("RESOLVED");
    expect(r.status).toBe("CARRIED");
    expect(r.evaluation).toBeUndefined();
  });

  it("carries a special resolution when a tally passes", () => {
    const r = resolveOutcome(NSW_RULE_SET, {
      requestedOutcome: "RESOLVED",
      resolutionCategory: "SPECIAL",
      tally: { forCount: 0, againstCount: 0, forUE: 80, againstUE: 20 },
    });
    expect(r.outcome).toBe("RESOLVED");
    expect(r.evaluation?.passed).toBe(true);
  });

  it("loses a special resolution when the tally fails", () => {
    const r = resolveOutcome(NSW_RULE_SET, {
      requestedOutcome: "RESOLVED",
      resolutionCategory: "SPECIAL",
      tally: { forCount: 0, againstCount: 0, forUE: 75, againstUE: 25 },
    });
    expect(r.outcome).toBe("MOTION_LOST");
    expect(r.evaluation?.passed).toBe(false);
  });
});
