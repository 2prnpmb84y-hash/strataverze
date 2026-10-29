/**
 * The ACT resolution tests (VIC, ACT and WA stage 2, PR 8a-i, 28 Oct 2026),
 * from the draft pack's MEETING_RULES: chosen by the building's number of
 * members (UTMA sch 3 ss 3.15 to 3.18), with every count refused until quorum
 * is recorded for the motion (s 3.9). Anything the count cannot decide is
 * UNDETERMINED, never carried or lost.
 */
import { describe, expect, it } from "vitest";
import { PENDING_RULE_PACKS } from "@/config/statutory";
import { evaluateResolution, type MeetingRuleSet, type ResolutionTally } from "./rules";

const ACT = PENDING_RULE_PACKS.ACT.rules.MEETING_RULES;

/** Four or more members, quorum recorded, 10 units present unless given. */
const tally = (t: Partial<ResolutionTally>): ResolutionTally => ({
  forCount: 0,
  againstCount: 0,
  memberBand: "FOUR_OR_MORE",
  quorumPresent: true,
  votesPresentCount: 12,
  ...t,
});

describe("the number of members chooses the test", () => {
  it("refuses with none recorded", () => {
    for (const c of ["ORDINARY", "SPECIAL", "UNANIMOUS"] as const) {
      const out = evaluateResolution(ACT, c, { forCount: 5, againstCount: 1, quorumPresent: true });
      expect(out.result).toBe("UNDETERMINED");
      expect(out.reason).toBe("The building's number of members is not recorded in its building rules, so this resolution's test cannot be chosen");
    }
  });

  it("refuses a value it does not know", () => {
    const out = evaluateResolution(ACT, "ORDINARY", tally({ forCount: 5, memberBand: "TWELVE" }));
    expect(out.result).toBe("UNDETERMINED");
    expect(out.reason).toMatch(/^The building's number of members recorded is not one StrataVerze knows/);
  });

  it("refuses 1 or 2 members for now, whatever the votes", () => {
    for (const c of ["ORDINARY", "SPECIAL", "UNANIMOUS"] as const) {
      expect(evaluateResolution(ACT, c, tally({ forCount: 1, memberBand: "ONE_OR_TWO" }))).toEqual({
        passed: false,
        result: "UNDETERMINED",
        reason: "StrataVerze does not count the votes of an owners corporation with 1 or 2 members yet",
      });
    }
  });
});

describe("every ACT count needs the quorum recorded for the motion", () => {
  it("is refused while it is not recorded, and decided later without one", () => {
    expect(evaluateResolution(ACT, "ORDINARY", tally({ forCount: 5, quorumPresent: undefined })).result).toBe("UNDETERMINED");
    const without = evaluateResolution(ACT, "SPECIAL", tally({ forCount: 9, againstCount: 1, quorumPresent: false }));
    expect(without.result).toBe("UNDETERMINED");
    expect(without.reason).toBe("The meeting had no quorum for this item, so it is decided later, which StrataVerze does not track yet");
  });
});

describe("an ACT ordinary resolution (s 3.15(1))", () => {
  it("is more votes for than against, by unit entitlement on a poll", () => {
    expect(evaluateResolution(ACT, "ORDINARY", tally({ forCount: 3, againstCount: 2 })).passed).toBe(true);
    expect(evaluateResolution(ACT, "ORDINARY", tally({ forCount: 2, againstCount: 3 })).passed).toBe(false);
    expect(evaluateResolution(ACT, "ORDINARY", tally({ forCount: 2, againstCount: 3, poll: true, forUE: 60, againstUE: 40 })).passed).toBe(true);
    expect(evaluateResolution(ACT, "ORDINARY", tally({ forCount: 3, againstCount: 2, memberBand: "THREE" })).passed).toBe(true);
  });

  it("refuses equal votes (the chair's casting vote is not recorded)", () => {
    const out = evaluateResolution(ACT, "ORDINARY", tally({ forCount: 2, againstCount: 2 }));
    expect(out.result).toBe("UNDETERMINED");
    expect(out.reason).toMatch(/^The votes are equal\. Whether the chair has a casting vote is not confirmed/);
  });
});

describe("an ACT special resolution with 4 or more members (s 3.16(1))", () => {
  it("passes with the votes against exactly 1/4 of the votes those present could cast", () => {
    // 12 present: 3 against is exactly a quarter.
    expect(evaluateResolution(ACT, "SPECIAL", tally({ forCount: 8, againstCount: 3 }))).toEqual({
      passed: true,
      reason: "More votes for than against, and the votes against are not more than 25% of the votes those present could cast",
    });
  });

  it("fails just over 1/4, counting abstentions among those present", () => {
    // 11 present (8 for, 3 against): 3 is more than 2.75.
    expect(evaluateResolution(ACT, "SPECIAL", tally({ forCount: 8, againstCount: 3, votesPresentCount: 11 }))).toEqual({
      passed: false,
      reason: "Votes against are more than 25% of the votes those present could cast",
    });
  });

  it("fails with fewer for than against, and refuses equal votes", () => {
    expect(evaluateResolution(ACT, "SPECIAL", tally({ forCount: 1, againstCount: 2, votesPresentCount: 40 }))).toEqual({
      passed: false,
      reason: "Not more votes for than against",
    });
    expect(evaluateResolution(ACT, "SPECIAL", tally({ forCount: 2, againstCount: 2, votesPresentCount: 40 })).result).toBe("UNDETERMINED");
  });

  it("on a poll is counted by unit entitlement, against that of the units present", () => {
    const poll = { poll: true, votesPresentEntitlement: 400 };
    expect(evaluateResolution(ACT, "SPECIAL", tally({ forCount: 2, againstCount: 5, forUE: 300, againstUE: 100, ...poll }), "unit entitlement").passed).toBe(true);
    expect(evaluateResolution(ACT, "SPECIAL", tally({ forCount: 5, againstCount: 2, forUE: 299, againstUE: 101, ...poll }), "unit entitlement")).toEqual({
      passed: false,
      reason: "The unit entitlement against is more than 25% of that of those present, on a poll",
    });
    expect(evaluateResolution(ACT, "SPECIAL", tally({ forCount: 5, againstCount: 2, forUE: 300, againstUE: 100, poll: true })).result).toBe("UNDETERMINED");
  });

  it("refuses without the votes present", () => {
    expect(evaluateResolution(ACT, "SPECIAL", tally({ forCount: 8, againstCount: 1, votesPresentCount: undefined })).result).toBe("UNDETERMINED");
  });
});

describe("refused until confirmed", () => {
  it("the 3-member special resolution test (s 3.16(2), NOT_CONFIRMED)", () => {
    const out = evaluateResolution(ACT, "SPECIAL", tally({ forCount: 3, memberBand: "THREE" }));
    expect(out.result).toBe("UNDETERMINED");
    expect(out.reason).toMatch(/^The special resolution test for an owners corporation with 3 members/);
  });

  it("an unopposed resolution (s 3.17: its member scope is NOT_CONFIRMED)", () => {
    const out = evaluateResolution(ACT, "UNOPPOSED", tally({ forCount: 3 }));
    expect(out.result).toBe("UNDETERMINED");
    expect(out.reason).toMatch(/^Which owners corporations an unopposed resolution applies to is not confirmed/);
  });
});

describe("an ACT unanimous resolution with 3 or more members (s 3.18(1))", () => {
  const unanimous = (t: Partial<ResolutionTally>) => evaluateResolution(ACT, "UNANIMOUS", tally({ totalLots: 6, ...t }));

  it("passes with every unit recorded, none against and at least 1 for", () => {
    expect(unanimous({ forCount: 4, abstainCount: 2, lotsRecorded: 6 })).toEqual({ passed: true, reason: "Every vote is recorded, none against and at least 1 for" });
  });

  it("refuses with one unit not recorded, and fails with any vote against or none for", () => {
    const out = unanimous({ forCount: 5, lotsRecorded: 5 });
    expect(out.result).toBe("UNDETERMINED");
    expect(out.reason).toBe("Only 5 of the 6 votes in the scheme are recorded, and every one must be recorded, as a vote or an abstention, to count this resolution");
    expect(unanimous({ forCount: 4, againstCount: 1, lotsRecorded: 5 })).toEqual({ passed: false, reason: "1 vote(s) against" });
    expect(unanimous({ abstainCount: 6, lotsRecorded: 6 })).toEqual({ passed: false, reason: "No vote cast for" });
  });
});

describe("no vote against and at least 1 for (the basis held for 1 or 2 members and unopposed)", () => {
  // The pack refuses each use for now, so the basis is checked on its own.
  const rs = { ...ACT, resolutionCategories: { UNOPPOSED: { basis: "NONE_AGAINST_AT_LEAST_ONE_FOR" } } } as MeetingRuleSet;
  it("passes with abstentions, fails on any vote against or none for", () => {
    expect(evaluateResolution(rs, "UNOPPOSED", { forCount: 1, againstCount: 0, abstainCount: 4 }).passed).toBe(true);
    expect(evaluateResolution(rs, "UNOPPOSED", { forCount: 9, againstCount: 1 })).toEqual({ passed: false, reason: "1 vote(s) against" });
    expect(evaluateResolution(rs, "UNOPPOSED", { forCount: 0, againstCount: 0 })).toEqual({ passed: false, reason: "No vote cast for" });
  });
});
