/**
 * Counting the votes at conduct for an ACT building (VIC, ACT and WA stage 2,
 * PR 8a-i, 28 Oct 2026), with the draft pack's MEETING_RULES. The tally
 * carries the building's band of members, the votes those present could cast
 * (the units recorded at the item) and the units recorded; common property
 * rows are not units.
 *
 * Since stage 2, PR 8a-ii (29 Oct 2026): whether there was a standard quorum
 * is the chair's answer for each motion, refused when not answered or "no"
 * (a reduced quorum); the units present for a special resolution are the
 * chair's count, which must match the units entered; and the debtor rule
 * (sch 3 s 3.20(3)) bars a unit owing money on an ordinary or special
 * resolution with 3 or more members. With 1 or 2 members a resolution
 * passes with no vote against and at least 1 vote for (ss 3.15(2), 3.16(3),
 * 3.18(2)), and a unit owing money is not barred.
 */
import { describe, expect, it } from "vitest";
import { PENDING_RULE_PACKS, type StatutoryRules } from "@/config/statutory";
import {
  buildConductTally,
  conductVotingView,
  countNeedsMemberBand,
  countsVotesAtConduct,
  laterDecisionRefusal,
  notCountedNotice,
  quorumAnswerProblem,
  type ChairVote,
  type TallyLot,
} from "./conduct-tally";
import { resolveOutcome } from "./conduct";
import { checksDebtorVotes, debtorRuleApplies } from "./debtor-voting";

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

  it("counts the votes present for a special resolution: the units the chair counts present, which are the units entered, abstentions included", () => {
    expect(tallyOf(count("SPECIAL", votes([1, 2, 3], [4], [5]), { unitsPresent: 5, quorumPresent: true }))).toEqual({
      forCount: 3,
      againstCount: 1,
      abstainCount: 1,
      totalLots: 6,
      votesPresentCount: 5,
      memberBand: "FOUR_OR_MORE",
      quorumPresent: true,
    });
  });

  it("on a poll weighs the units present by unit entitlement", () => {
    expect(tallyOf(count("SPECIAL", votes([1, 2], [6], [5]), { poll: true, unitsPresent: 4 }))).toMatchObject({ poll: true, forUE: 20, againstUE: 50, votesPresentEntitlement: 80 });
    expect(count("UNANIMOUS", votes([1]), { poll: true })).toEqual({ ok: false, error: "A poll can be taken only on an ordinary resolution or special resolution." });
  });

  it("counts the units recorded for a unanimous resolution, against the building's units", () => {
    expect(tallyOf(count("UNANIMOUS", votes([1, 2, 3, 4], [], [5])))).toMatchObject({ lotsRecorded: 5, totalLots: 6 });
    expect(count("UNANIMOUS", votes([1]), { recordedLotCount: 7 }).ok).toBe(false);
  });

  it("applies the debtor rule (s 3.20(3)) to an ordinary or special resolution with 3 or more members, never with 1 or 2 or on a unanimous resolution", () => {
    expect(checksDebtorVotes(ACT)).toBe(true);
    const owing = { owingLotIds: new Set(["u-2"]) };
    for (const band of ["THREE", "FOUR_OR_MORE"]) {
      const applies = debtorRuleApplies(ACT, true);
      for (const c of ["ORDINARY", "SPECIAL"]) {
        const r = count(c, votes([1, 2]), { ...owing, memberBand: band, debtorRuleApplies: applies, unitsPresent: 2 });
        expect(r.ok && r.value.notCounted.map((v) => v.lotId), `${band} ${c}`).toEqual(["u-2"]);
      }
      const unanimous = count("UNANIMOUS", votes([1, 2]), { ...owing, memberBand: band, debtorRuleApplies: applies });
      expect(unanimous.ok && unanimous.value.notCounted).toEqual([]);
    }
    // 1 or 2 members: the condition does not hold, so nothing is barred.
    expect(debtorRuleApplies(ACT, false)).toBe(false);
    const small = count("ORDINARY", votes([1, 2]), { ...owing, memberBand: "ONE_OR_TWO", debtorRuleApplies: debtorRuleApplies(ACT, false) });
    expect(small.ok && small.value.notCounted).toEqual([]);
    // No band recorded: the rule applies (it fails closed).
    expect(debtorRuleApplies(ACT, null)).toBe(true);
    const unknown = count("ORDINARY", votes([1, 2]), { ...owing, memberBand: null, debtorRuleApplies: debtorRuleApplies(ACT, null) });
    expect(unknown.ok && unknown.value.notCounted.map((v) => v.lotId)).toEqual(["u-2"]);
  });

  it("tells the chair which units were not counted for money owed (its words say lot until the wording change)", () => {
    const r = count("ORDINARY", votes([1, 2]), { owingLotIds: new Set(["u-2"]) });
    expect(r.ok && notCountedNotice(r.value.notCounted, ACT_RULES.TERMINOLOGY.ownersCorporation)).toBe(
      "Not counted: lot 2 owes the owners corporation an overdue amount, so its vote on this motion cannot count.",
    );
  });
});

describe("the units present for a special resolution (s 3.16(1))", () => {
  it("are refused when not given, or when they differ from the units entered, in units", () => {
    expect(count("SPECIAL", votes([1, 2], [3]))).toEqual({
      ok: false,
      error: "How many units were present or represented for this item is not recorded, so the votes cannot be counted. Record it, then save again.",
    });
    expect(count("SPECIAL", votes([1, 2], [3]), { unitsPresent: 4 })).toEqual({
      ok: false,
      error: "4 units were present or represented for this item, but 3 have a vote or an abstention entered. Enter each unit present, as Abstain if it did not vote, or correct the number present. Nothing was saved.",
    });
    expect(count("SPECIAL", votes([1]), { unitsPresent: 2 }).ok).toBe(false);
    expect(count("SPECIAL", votes([1, 2], [3]), { unitsPresent: 2 })).toEqual({
      ok: false,
      error: "2 units were present or represented for this item, but 3 have a vote or an abstention entered. Enter each unit present, as Abstain if it did not vote, or correct the number present. Nothing was saved.",
    });
    expect(count("SPECIAL", [], { unitsPresent: 1 })).toEqual({
      ok: false,
      error: "1 unit was present or represented for this item, but 0 have a vote or an abstention entered. Enter each unit present, as Abstain if it did not vote, or correct the number present. Nothing was saved.",
    });
  });

  it("count a unit barred for money owed as present, but not in the votes those present could cast", () => {
    const r = count("SPECIAL", votes([1, 2, 3], [4], [5]), { unitsPresent: 5, owingLotIds: new Set(["u-5"]) });
    expect(r.ok && r.value.notCounted.map((v) => v.lotId)).toEqual(["u-5"]);
    expect(tallyOf(r)).toMatchObject({ votesPresentCount: 4, abstainCount: 0 });
    expect(count("SPECIAL", votes([1, 2, 3], [4], [5]), { unitsPresent: 4, owingLotIds: new Set(["u-5"]) }).ok).toBe(false);
  });

  it("are not asked for an ordinary or unanimous resolution", () => {
    expect(tallyOf(count("ORDINARY", votes([1]), { unitsPresent: 3 }))).not.toHaveProperty("votesPresentCount");
    expect(count("UNANIMOUS", votes([1])).ok).toBe(true);
  });
});

describe("what the count lets the chair record", () => {
  const decide = (category: string, t: ReturnType<typeof tallyOf>) => resolveOutcome(ACT, { requestedOutcome: "RESOLVED", resolutionCategory: category, tally: t });

  const decideAs = (category: string, t: ReturnType<typeof tallyOf>, requestedOutcome: "RESOLVED" | "MOTION_LOST") =>
    resolveOutcome(ACT, { requestedOutcome, resolutionCategory: category, tally: t });

  it("refuses every category when the quorum is not answered", () => {
    for (const c of ["ORDINARY", "SPECIAL", "UNANIMOUS"]) {
      const r = decide(c, tallyOf(count(c, votes([1, 2, 3, 4, 5, 6]), { unitsPresent: 6 })));
      expect(r.refused).toBe(
        "The votes recorded cannot decide this motion. Whether the meeting had a quorum for this item is not recorded, so the votes cannot decide it. Nothing was saved. The item can be deferred.",
      );
    }
  });

  it("refuses every category without a standard quorum: a reduced quorum decision takes effect later", () => {
    for (const c of ["ORDINARY", "SPECIAL", "UNANIMOUS"]) {
      const r = decide(c, tallyOf(count(c, votes([1, 2, 3, 4, 5, 6]), { unitsPresent: 6, quorumPresent: false })));
      expect(r.refused).toMatch(/The meeting had no quorum for this item, so it is decided later, which StrataVerze does not track yet/);
    }
  });

  it("records an ordinary resolution as carried or lost with a quorum, and refuses equal votes", () => {
    for (const band of ["THREE", "FOUR_OR_MORE"]) {
      const q = { quorumPresent: true, memberBand: band };
      expect(decide("ORDINARY", tallyOf(count("ORDINARY", votes([1, 2], [3]), q)))).toMatchObject({ outcome: "RESOLVED", status: "CARRIED" });
      expect(decideAs("ORDINARY", tallyOf(count("ORDINARY", votes([1], [2, 3]), q)), "MOTION_LOST")).toMatchObject({ outcome: "MOTION_LOST", status: "LOST" });
      expect(decide("ORDINARY", tallyOf(count("ORDINARY", votes([1], [2]), q))).refused).toMatch(/The votes are equal/);
    }
  });

  it("records a special resolution with 4 or more members: the votes against may be exactly 1/4 of the votes present, abstentions included", () => {
    const q = { quorumPresent: true };
    // 3 for, 2 against, 3 abstain: 8 present, 2 against is exactly 1/4.
    const lots8 = [...Array.from({ length: 8 }, (_, i) => ({ id: `u-${i + 1}`, lotNumber: String(i + 1), entitlement: 10 }))];
    const exact = count("SPECIAL", votes([1, 2, 3], [4, 5], [6, 7, 8]), { ...q, lots: lots8, recordedLotCount: 8, unitsPresent: 8 });
    expect(decide("SPECIAL", tallyOf(exact))).toMatchObject({ outcome: "RESOLVED", status: "CARRIED" });
    // 7 present: 2 against is more than 1/4, so it is lost.
    const over = count("SPECIAL", votes([1, 2, 3], [4, 5], [6, 7]), { ...q, lots: lots8, recordedLotCount: 8, unitsPresent: 7 });
    expect(decideAs("SPECIAL", tallyOf(over), "MOTION_LOST")).toMatchObject({ outcome: "MOTION_LOST", evaluation: { passed: false } });
    expect(decide("SPECIAL", tallyOf(over)).evaluation?.reason).toBe("Votes against are more than 25% of the votes those present could cast");
  });

  it("records a special resolution on a poll by the unit entitlement of the units present", () => {
    // For 20, against 10, present 80 (unit 6 holds 50 and abstains): more for than against, and 10 is not more than 1/4 of 80.
    const r = count("SPECIAL", votes([1, 2], [3], [6]), { poll: true, quorumPresent: true, unitsPresent: 4 });
    expect(tallyOf(r)).toMatchObject({ forUE: 20, againstUE: 10, votesPresentEntitlement: 80 });
    expect(decide("SPECIAL", tallyOf(r))).toMatchObject({ outcome: "RESOLVED", status: "CARRIED" });
  });

  it("still refuses a 3-member special resolution, with a quorum", () => {
    expect(decide("SPECIAL", tallyOf(count("SPECIAL", votes([1, 2]), { memberBand: "THREE", quorumPresent: true, unitsPresent: 2 }))).refused).toMatch(/3 members/);
  });

  it("refuses first for a band it cannot count, or none recorded", () => {
    expect(decide("SPECIAL", tallyOf(count("SPECIAL", votes([1]), { memberBand: "THREE", unitsPresent: 1 }))).refused).toMatch(/3 members/);
    expect(decide("ORDINARY", tallyOf(count("ORDINARY", votes([1]), { memberBand: null }))).refused).toMatch(/number of members is not recorded/);
  });

  it("puts the quorum answer on the tally only where the test needs it, and never checks it against the votes (absentee votes do not make up the quorum)", () => {
    expect(tallyOf(count("ORDINARY", votes([1]), { quorumPresent: false }))).toMatchObject({ quorumPresent: false });
    expect(tallyOf(count("ORDINARY", votes([1])))).not.toHaveProperty("quorumPresent");
    expect(quorumAnswerProblem(ACT, "AGM", false, 6, 6)).toBeNull();
  });

  it("has no voting period refusal", () => {
    for (const c of ["ORDINARY", "SPECIAL", "UNANIMOUS", "UNOPPOSED"]) expect(laterDecisionRefusal(ACT, c, "MOTION_LOST")).toBeNull();
  });
});

describe("1 or 2 members (ss 3.15(2), 3.16(3), 3.18(2); Matthew Wrigley's decision of 29 Oct 2026)", () => {
  const two: TallyLot[] = [
    { id: "u-1", lotNumber: "1", entitlement: 10, lotType: "RESIDENTIAL" },
    { id: "u-2", lotNumber: "2", entitlement: 30, lotType: "RESIDENTIAL" },
  ];
  const small = (category: string, chairVotes: ChairVote[], extra: Partial<Parameters<typeof buildConductTally>[0]> = {}) =>
    tallyOf(count(category, chairVotes, { lots: two, recordedLotCount: 2, memberBand: "ONE_OR_TWO", quorumPresent: true, ...extra }));
  const decideSmall = (category: string, t: ReturnType<typeof tallyOf>, requestedOutcome: "RESOLVED" | "MOTION_LOST" = "RESOLVED") =>
    resolveOutcome(ACT, { requestedOutcome, resolutionCategory: category, tally: t });

  it("carries a resolution with no vote against and at least 1 for, whatever the entitlement", () => {
    expect(decideSmall("ORDINARY", small("ORDINARY", votes([1], [], [2])))).toMatchObject({ outcome: "RESOLVED", status: "CARRIED", evaluation: { passed: true, reason: "No vote against, and at least 1 vote for" } });
    expect(decideSmall("SPECIAL", small("SPECIAL", votes([1, 2]), { unitsPresent: 2 }))).toMatchObject({ outcome: "RESOLVED", status: "CARRIED" });
    expect(decideSmall("UNANIMOUS", small("UNANIMOUS", votes([2])))).toMatchObject({ outcome: "RESOLVED", status: "CARRIED" });
    expect(decideSmall("ORDINARY", small("ORDINARY", votes([1, 2]), { poll: true }))).toMatchObject({ outcome: "RESOLVED" });
  });

  it("loses a resolution with any vote against, or none for: no casting vote is needed (s 3.30)", () => {
    expect(decideSmall("ORDINARY", small("ORDINARY", votes([1], [2])), "MOTION_LOST")).toMatchObject({ outcome: "MOTION_LOST", evaluation: { passed: false, reason: "1 vote(s) against" } });
    expect(decideSmall("SPECIAL", small("SPECIAL", votes([], [], [1, 2]), { unitsPresent: 2 }), "MOTION_LOST")).toMatchObject({ outcome: "MOTION_LOST", evaluation: { reason: "No vote cast for" } });
    expect(decideSmall("ORDINARY", small("ORDINARY", votes([2], [1])), "MOTION_LOST").refused).toBeUndefined();
  });

  it("still needs the quorum answer (everyone entitled to vote present, s 3.12), and refuses a no in the pack's words: the meeting is adjourned, not decided later", () => {
    expect(decideSmall("ORDINARY", small("ORDINARY", votes([1, 2]), { quorumPresent: null })).refused).toMatch(/quorum for this item is not recorded/);
    for (const c of ["ORDINARY", "SPECIAL", "UNANIMOUS"]) {
      const r = decideSmall(c, small(c, votes([1, 2]), { quorumPresent: false, unitsPresent: 2 }));
      expect(r.refused, c).toMatch(/^The votes recorded cannot decide this motion\. With 1 or 2 members the meeting has a quorum only when everyone entitled to vote is present, and without it the meeting is adjourned \(.+ sch 3 s 3\.12\), so the votes cannot decide this motion\. Nothing was saved\. The item can be deferred\.$/);
      expect(r.refused, c).not.toMatch(/decided later/);
    }
    // With 3 or more members a no is still a reduced quorum, decided later.
    expect(decideSmall("ORDINARY", tallyOf(count("ORDINARY", votes([1, 2]), { quorumPresent: false }))).refused).toMatch(/so it is decided later/);
  });

  it("asks the units present on a special resolution too, though the test does not use them", () => {
    expect(count("SPECIAL", votes([1, 2]), { lots: two, recordedLotCount: 2, memberBand: "ONE_OR_TWO", quorumPresent: true }).ok).toBe(false);
  });

  it("does not bar a unit owing money (s 3.20(3) applies from 3 members)", () => {
    const r = count("ORDINARY", votes([1, 2]), { lots: two, recordedLotCount: 2, memberBand: "ONE_OR_TWO", quorumPresent: true, owingLotIds: new Set(["u-2"]), debtorRuleApplies: debtorRuleApplies(ACT, false) });
    expect(r.ok && r.value.notCounted).toEqual([]);
    expect(decideSmall("ORDINARY", tallyOf(r))).toMatchObject({ outcome: "RESOLVED" });
  });
});

describe("the conduct screen's questions (stage 2, PR 8a-ii)", () => {
  it("asks the quorum for every motion and the units present for a special resolution, in the pack's words", () => {
    const view = conductVotingView(ACT, ACT_RULES, LOTS, [
      { id: "o", resolutionCategory: "ORDINARY" },
      { id: "s", resolutionCategory: "SPECIAL" },
      { id: "n", resolutionCategory: null },
    ], "AGM")!;
    expect(view.items).toEqual({
      o: { pollAllowed: true, proxiesAllowed: true, quorumAsked: true },
      s: { pollAllowed: true, proxiesAllowed: true, quorumAsked: true, unitsPresentAsked: true },
      n: { pollAllowed: false, proxiesAllowed: true },
    });
    expect(view.attestation).toEqual({
      quorum: { label: ACT.quorumAttestation!.label, help: ACT.quorumAttestation!.help },
      unitsPresent: { label: ACT.votesPresentAttestation!.label, help: ACT.votesPresentAttestation!.help },
    });
    expect(view.attestation?.quorum?.label).toBe("Standard quorum present for this motion");
    expect(view.attestation?.unitsPresent?.label).toBe("Units present or represented for this motion");
    expect(conductVotingView(ACT, ACT_RULES, LOTS, [{ id: "o", resolutionCategory: "ORDINARY" }], "AGM")?.attestation).toEqual({
      quorum: { label: ACT.quorumAttestation!.label, help: ACT.quorumAttestation!.help },
    });
  });
});
