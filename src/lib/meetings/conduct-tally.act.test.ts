/**
 * Counting the votes at conduct for an ACT building (VIC, ACT and WA stage 2,
 * PR 8a-i, 28 Oct 2026), with the draft pack's MEETING_RULES. The tally
 * carries the building's band of members, the votes those present could cast
 * (the units recorded at the item) and the units recorded; common property
 * rows are not units. Every count is refused until quorum is recorded for
 * the motion, and the debtor rule is not applied yet.
 */
import { describe, expect, it } from "vitest";
import { PENDING_RULE_PACKS, type StatutoryRules } from "@/config/statutory";
import { buildConductTally, countNeedsMemberBand, countsVotesAtConduct, laterDecisionRefusal, type ChairVote, type TallyLot } from "./conduct-tally";
import { resolveOutcome } from "./conduct";
import { checksDebtorVotes } from "./debtor-voting";

const ACT_RULES = PENDING_RULE_PACKS.ACT.rules as unknown as StatutoryRules;
const ACT = ACT_RULES.MEETING_RULES;

const LOTS: TallyLot[] = [
  ...Array.from({ length: 6 }, (_, i) => ({ id: `u-${i + 1}`, lotNumber: String(i + 1), entitlement: i === 5 ? 50 : 10, lotType: "RESIDENTIAL" })),
  { id: "cp", lotNumber: "CP", entitlement: null, lotType: "common" },
];
const vote = (n: number, v: ChairVote["vote"]): ChairVote => ({ lotId: `u-${n}`, vote: v, byProxy: n === 3 });
const votes = (f: number[], a: number[] = [], ab: number[] = []) => [...f.map((n) => vote(n, "FOR")), ...a.map((n) => vote(n, "AGAINST")), ...ab.map((n) => vote(n, "ABSTAIN"))];

function count(category: string | null, chairVotes: ChairVote[], extra: Partial<Parameters<typeof buildConductTally>[0]> = {}) {
  return buildConductTally({
    ruleSet: ACT,
    rules: ACT_RULES,
    category,
    lots: LOTS,
    recordedLotCount: 6,
    onlineVotes: [],
    chairVotes,
    poll: false,
    owingLotIds: new Set(),
    memberBand: "FOUR_OR_MORE",
    ...extra,
  });
}
const tallyOf = (r: ReturnType<typeof count>) => {
  if (!r.ok) throw new Error(r.error);
  return r.value.tally;
};

describe("an ACT building's count", () => {
  it("is counted, and each category's test reads the band of members", () => {
    expect(countsVotesAtConduct(ACT)).toBe(true);
    for (const c of ["ORDINARY", "SPECIAL", "UNANIMOUS"]) expect(countNeedsMemberBand(ACT, c)).toBe(true);
    expect(countNeedsMemberBand(ACT, "UNOPPOSED")).toBe(false);
    expect(countNeedsMemberBand(ACT, null)).toBe(false);
    expect(ACT.memberBandSelector).toBe("memberBand");
  });

  it("carries the band on the tally, and leaves it out when none is recorded", () => {
    expect(tallyOf(count("ORDINARY", votes([1, 2], [4])))).toEqual({ forCount: 2, againstCount: 1, abstainCount: 0, totalLots: 6, memberBand: "FOUR_OR_MORE" });
    expect(tallyOf(count("ORDINARY", votes([1]), { memberBand: null }))).not.toHaveProperty("memberBand");
  });

  it("counts the votes present for a special resolution: the units recorded, abstentions included", () => {
    expect(tallyOf(count("SPECIAL", votes([1, 2, 3], [4], [5])))).toEqual({
      forCount: 3,
      againstCount: 1,
      abstainCount: 1,
      totalLots: 6,
      votesPresentCount: 5,
      memberBand: "FOUR_OR_MORE",
    });
  });

  it("on a poll weighs the units present by unit entitlement", () => {
    expect(tallyOf(count("SPECIAL", votes([1, 2], [6], [5]), { poll: true }))).toMatchObject({ poll: true, forUE: 20, againstUE: 50, votesPresentEntitlement: 80 });
    expect(count("UNANIMOUS", votes([1]), { poll: true })).toEqual({ ok: false, error: "A poll can be taken only on an ordinary resolution or special resolution." });
  });

  it("counts the units recorded for a unanimous resolution, against the building's units", () => {
    expect(tallyOf(count("UNANIMOUS", votes([1, 2, 3, 4], [], [5])))).toMatchObject({ lotsRecorded: 5, totalLots: 6 });
    expect(count("UNANIMOUS", votes([1]), { recordedLotCount: 7 }).ok).toBe(false);
  });

  it("does not apply the debtor rule yet: a unit owing money is counted", () => {
    expect(checksDebtorVotes(ACT)).toBe(false);
    const r = count("ORDINARY", votes([1, 2]), { owingLotIds: new Set(["u-2"]) });
    expect(r.ok && r.value.notCounted).toEqual([]);
  });
});

describe("what the count lets the chair record", () => {
  const decide = (category: string, t: ReturnType<typeof tallyOf>) => resolveOutcome(ACT, { requestedOutcome: "RESOLVED", resolutionCategory: category, tally: t });

  it("refuses every category until quorum is recorded for the motion", () => {
    for (const c of ["ORDINARY", "SPECIAL", "UNANIMOUS"]) {
      const r = decide(c, tallyOf(count(c, votes([1, 2, 3, 4, 5, 6]))));
      expect(r.refused).toBe(
        "The votes recorded cannot decide this motion. Whether the meeting had a quorum for this item is not recorded, so the votes cannot decide it. Nothing was saved. The item can be deferred.",
      );
    }
  });

  it("refuses first for a band it cannot count, or none recorded", () => {
    expect(decide("SPECIAL", tallyOf(count("SPECIAL", votes([1]), { memberBand: "THREE" }))).refused).toMatch(/3 members/);
    expect(decide("ORDINARY", tallyOf(count("ORDINARY", votes([1]), { memberBand: null }))).refused).toMatch(/number of members is not recorded/);
  });

  it("has no voting period refusal", () => {
    for (const c of ["ORDINARY", "SPECIAL", "UNANIMOUS", "UNOPPOSED"]) expect(laterDecisionRefusal(ACT, c, "MOTION_LOST")).toBeNull();
  });
});
