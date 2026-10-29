/**
 * The Western Australian resolution tests (VIC, ACT and WA stage 2, PR 8a-i,
 * 28 Oct 2026), from the draft pack's MEETING_RULES (STA s 123): the special
 * resolution by size class, measured against all lots and all unit
 * entitlement; the resolution without dissent and the unanimous resolution;
 * and the ordinary resolution, whose tie fails. A special, without dissent
 * or unanimous resolution is decided when its 28-day voting period closes
 * (s 121), so with the pack as it is the count of those is UNDETERMINED
 * whatever the votes; the s 123 tests are held for when the voting period is
 * tracked, and are tested here on the pack without it (AT_CLOSE).
 */
import { describe, expect, it } from "vitest";
import { PENDING_RULE_PACKS } from "@/config/statutory";
import { evaluateResolution, type MeetingRuleSet, type ResolutionTally } from "./rules";
import { resolveOutcome } from "./conduct";

const WA = PENDING_RULE_PACKS.WA.rules.MEETING_RULES;

/** The pack's tests as they will be counted when the voting period closes: the same rules without votingPeriodDays. */
const AT_CLOSE: MeetingRuleSet = {
  ...WA,
  resolutionCategories: Object.fromEntries(
    Object.entries(WA.resolutionCategories).map(([c, rule]) => {
      const { votingPeriodDays: _days, ...rest } = rule!;
      return [c, rest];
    }),
  ),
};

/** Twelve lots of 10 unit entitlement each (120). */
const special = (t: Partial<ResolutionTally>, lots = 12) =>
  evaluateResolution(AT_CLOSE, "SPECIAL", { forCount: 0, againstCount: 0, forUE: 0, againstUE: 0, totalLots: lots, totalEntitlement: lots * 10, ...t });

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
    expect(evaluateResolution(AT_CLOSE, "SPECIAL", { forCount: 6, againstCount: 0 }).result).toBe("UNDETERMINED");
    expect(evaluateResolution(AT_CLOSE, "SPECIAL", { forCount: 6, againstCount: 0, totalLots: 12 }).result).toBe("UNDETERMINED");
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
    expect(evaluateResolution(AT_CLOSE, "WITHOUT_DISSENT", { forCount: 1, againstCount: 0, abstainCount: 1, totalLots: 2 })).toEqual({
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
    expect(evaluateResolution(AT_CLOSE, "WITHOUT_DISSENT", { forCount: 1, againstCount: 0, totalLots: 9 }).passed).toBe(true);
    expect(evaluateResolution(AT_CLOSE, "WITHOUT_DISSENT", { forCount: 8, againstCount: 1, totalLots: 9 }).passed).toBe(false);
    expect(evaluateResolution(AT_CLOSE, "WITHOUT_DISSENT", { forCount: 8, againstCount: 0 }).result).toBe("UNDETERMINED");
  });

  it("unanimous: every lot for", () => {
    expect(evaluateResolution(AT_CLOSE, "UNANIMOUS", { forCount: 9, againstCount: 0, totalLots: 9 }).passed).toBe(true);
    expect(evaluateResolution(AT_CLOSE, "UNANIMOUS", { forCount: 8, againstCount: 0, abstainCount: 1, totalLots: 9 }).passed).toBe(false);
  });
});

describe("an ordinary resolution (s 123(7))", () => {
  it("is more than half of the lots voting, a tie fails, and by unit entitlement where demanded", () => {
    expect(evaluateResolution(WA, "ORDINARY", { forCount: 3, againstCount: 2 })).toEqual({ passed: true, reason: "Majority of votes cast" });
    expect(evaluateResolution(WA, "ORDINARY", { forCount: 2, againstCount: 2 })).toEqual({ passed: false, reason: "Not a majority of votes cast" });
    expect(evaluateResolution(WA, "ORDINARY", { forCount: 2, againstCount: 3, forUE: 60, againstUE: 30, poll: true }).passed).toBe(true);
  });
});

describe("the voting period (s 121): the count at the meeting decides nothing", () => {
  const REASON = "This resolution is decided when its 28-day voting period closes, which StrataVerze does not track yet, so the count at the meeting cannot decide it";
  // Totals that pass (or fail) every s 123 test, so only the voting period stops the count.
  const passing = { forCount: 12, againstCount: 0, forUE: 120, againstUE: 0, totalLots: 12, totalEntitlement: 120 };
  const failing = { forCount: 0, againstCount: 12, forUE: 0, againstUE: 120, totalLots: 12, totalEntitlement: 120 };

  it("is UNDETERMINED for a special, without dissent or unanimous resolution, carried or lost on the votes", () => {
    for (const c of ["SPECIAL", "WITHOUT_DISSENT", "UNANIMOUS"] as const) {
      expect(evaluateResolution(AT_CLOSE, c, passing).passed, c).toBe(true);
      expect(evaluateResolution(AT_CLOSE, c, failing), c).toMatchObject({ passed: false });
      expect(evaluateResolution(AT_CLOSE, c, failing).result, c).toBeUndefined();
      for (const t of [passing, failing]) expect(evaluateResolution(WA, c, t), c).toEqual({ passed: false, result: "UNDETERMINED", reason: REASON });
    }
    // Every size class: the variant is chosen, and its test never reached.
    for (const lots of [2, 3, 5, 6]) {
      const t = { ...passing, forCount: lots, forUE: lots * 10, totalLots: lots, totalEntitlement: lots * 10 };
      expect(evaluateResolution(WA, "SPECIAL", t), String(lots)).toEqual({ passed: false, result: "UNDETERMINED", reason: REASON });
    }
  });

  it("is refused by resolveOutcome, so nothing is written", () => {
    const r = resolveOutcome(WA, { requestedOutcome: "RESOLVED", resolutionCategory: "UNANIMOUS", tally: passing });
    expect(r.refused).toBe(`The votes recorded cannot decide this motion. ${REASON}. Nothing was saved. The item can be deferred.`);
    expect(r.refused).not.toMatch(/[;–—]|\(s \d/);
  });

  it("leaves an ordinary resolution counted at the meeting", () => {
    expect(evaluateResolution(WA, "ORDINARY", { ...passing, forCount: 3, againstCount: 2 })).toEqual({ passed: true, reason: "Majority of votes cast" });
  });
});
