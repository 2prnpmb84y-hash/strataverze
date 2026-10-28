/**
 * The Western Australian resolution tests (VIC, ACT and WA stage 2, PR 8a-i,
 * 28 Oct 2026), from the draft pack's MEETING_RULES (STA s 123): the special
 * resolution by size class, measured against all lots and all unit
 * entitlement; the resolution without dissent and the unanimous resolution;
 * and the ordinary resolution, whose tie fails. The tests are held even
 * though the meeting cannot record a special, without dissent or unanimous
 * resolution until its voting period is tracked (conduct-tally.wa.test.ts).
 */
import { describe, expect, it } from "vitest";
import { PENDING_RULE_PACKS } from "@/config/statutory";
import { evaluateResolution, type ResolutionTally } from "./rules";

const WA = PENDING_RULE_PACKS.WA.rules.MEETING_RULES;

/** Twelve lots of 10 unit entitlement each (120). */
const special = (t: Partial<ResolutionTally>, lots = 12) =>
  evaluateResolution(WA, "SPECIAL", { forCount: 0, againstCount: 0, forUE: 0, againstUE: 0, totalLots: lots, totalEntitlement: lots * 10, ...t });

describe("a special resolution with 6 or more lots (s 123(4))", () => {
  it("passes at exactly 50% of all lots and unit entitlement for", () => {
    expect(special({ forCount: 6, forUE: 60, againstCount: 2, againstUE: 20 })).toEqual({
      passed: true,
      reason:
        "Votes for are at least 50% of all lots in the scheme, and the lots for hold at least 50% of the total entitlement, and votes against are less than 25% of all lots in the scheme, and the lots against hold less than 25% of the total entitlement",
    });
  });

  it("fails just under 50% for, by lots or by unit entitlement", () => {
    expect(special({ forCount: 5, forUE: 70 }).reason).toBe("Votes for are less than 50% of all lots in the scheme");
    expect(special({ forCount: 7, forUE: 59 }).reason).toBe("The lots for do not hold at least 50% of the total entitlement");
  });

  it("fails at exactly 25% against: the against test is strict", () => {
    // 3 of 12 lots is exactly 25%.
    expect(special({ forCount: 8, forUE: 80, againstCount: 3, againstUE: 20 })).toEqual({ passed: false, reason: "Votes against are 25% or more of all lots in the scheme" });
    // 30 of 120 entitlement is exactly 25%.
    expect(special({ forCount: 8, forUE: 80, againstCount: 2, againstUE: 30 })).toEqual({
      passed: false,
      reason: "The lots against hold 25% or more of the total entitlement",
    });
    expect(special({ forCount: 8, forUE: 80, againstCount: 2, againstUE: 29 }).passed).toBe(true);
  });

  it("refuses without the totals or the entitlement", () => {
    expect(evaluateResolution(WA, "SPECIAL", { forCount: 6, againstCount: 0 }).result).toBe("UNDETERMINED");
    expect(evaluateResolution(WA, "SPECIAL", { forCount: 6, againstCount: 0, totalLots: 12 }).result).toBe("UNDETERMINED");
  });
});

describe("a special resolution with 3, 4 or 5 lots (s 123(6))", () => {
  it("needs 2, 3 or 4 lots for and 50% of the unit entitlement, with no against test", () => {
    for (const [lots, needed] of [[3, 2], [4, 3], [5, 4]] as const) {
      const half = lots * 5;
      expect(special({ forCount: needed, forUE: half, againstCount: lots - needed, againstUE: lots * 10 - half }, lots).passed).toBe(true);
      expect(special({ forCount: needed - 1, forUE: lots * 10 }, lots)).toEqual({ passed: false, reason: `Fewer than ${needed} lots voted for` });
      expect(special({ forCount: needed, forUE: half - 1 }, lots).passed).toBe(false);
    }
  });
});

describe("2 lots: a special resolution and a resolution without dissent only if unanimous (s 123(3), (5))", () => {
  it("needs both lots for", () => {
    expect(special({ forCount: 2, forUE: 20 }, 2).passed).toBe(true);
    expect(special({ forCount: 1, forUE: 10 }, 2)).toEqual({ passed: false, reason: "Not every lot in the scheme voted for" });
    expect(evaluateResolution(WA, "WITHOUT_DISSENT", { forCount: 1, againstCount: 0, abstainCount: 1, totalLots: 2 })).toEqual({
      passed: false,
      reason: "Not every lot in the scheme voted for",
    });
  });

  it("refuses below 2 lots: no test fits", () => {
    const out = special({ forCount: 1, forUE: 10 }, 1);
    expect(out).toEqual({ passed: false, result: "UNDETERMINED", reason: "This resolution needs a scheme of at least 2 lots, and fewer are recorded" });
  });
});

describe("without dissent and unanimous (s 123(1), (2))", () => {
  it("without dissent: no vote against, with 3 or more lots", () => {
    expect(evaluateResolution(WA, "WITHOUT_DISSENT", { forCount: 1, againstCount: 0, totalLots: 9 }).passed).toBe(true);
    expect(evaluateResolution(WA, "WITHOUT_DISSENT", { forCount: 8, againstCount: 1, totalLots: 9 }).passed).toBe(false);
    expect(evaluateResolution(WA, "WITHOUT_DISSENT", { forCount: 8, againstCount: 0 }).result).toBe("UNDETERMINED");
  });

  it("unanimous: every lot for", () => {
    expect(evaluateResolution(WA, "UNANIMOUS", { forCount: 9, againstCount: 0, totalLots: 9 }).passed).toBe(true);
    expect(evaluateResolution(WA, "UNANIMOUS", { forCount: 8, againstCount: 0, abstainCount: 1, totalLots: 9 }).passed).toBe(false);
  });
});

describe("an ordinary resolution (s 123(7))", () => {
  it("is more than half of the lots voting, a tie fails, and by unit entitlement where demanded", () => {
    expect(evaluateResolution(WA, "ORDINARY", { forCount: 3, againstCount: 2 })).toEqual({ passed: true, reason: "Majority of votes cast" });
    expect(evaluateResolution(WA, "ORDINARY", { forCount: 2, againstCount: 2 })).toEqual({ passed: false, reason: "Not a majority of votes cast" });
    expect(evaluateResolution(WA, "ORDINARY", { forCount: 2, againstCount: 3, forUE: 60, againstUE: 30, poll: true }).passed).toBe(true);
  });
});
