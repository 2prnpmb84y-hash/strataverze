/**
 * Counting the votes at conduct for a Victorian building (VIC, ACT and WA
 * stage 2, PR 8a-i, 28 Oct 2026), with the draft pack's MEETING_RULES. Common
 * property rows are not lots; an owner in arrears votes on special and
 * unanimous resolutions only (OCA s 89B); a poll on an ordinary resolution
 * only, by lot entitlement; an interim special resolution and an ordinary
 * resolution without a quorum recorded are refused, never recorded.
 *
 * Since stage 2, PR 8a-ii (29 Oct 2026): whether the meeting had a quorum is
 * the chair's answer for each ordinary and special resolution; a "no" the
 * votes counted contradict is refused; a tier 5 owners corporation, or one
 * whose tier cannot be worked out, is not counted at all; and the arrears
 * rule applies to tiers 1 to 4 only.
 */
import { describe, expect, it } from "vitest";
import { MEETING_RULES as NSW_RULE_SET, PENDING_RULE_PACKS, QLD_RULE_PACK, type StatutoryRules } from "@/config/statutory";
import {
  buildConductTally,
  conductVotingView,
  countingRefusal,
  countNeedsMemberBand,
  countNeedsQuorum,
  countsVotesAtConduct,
  countsVotesAtMeeting,
  laterDecisionRefusal,
  quorumAnswerProblem,
  uncategorisedRefusal,
  type ChairVote,
  type TallyLot,
} from "./conduct-tally";
import { resolveOutcome } from "./conduct";
import { debtorRuleApplies } from "./debtor-voting";
import { conditionHolds, type SelectorBuilding } from "@/lib/jurisdiction/building-selectors";

const VIC_RULES = PENDING_RULE_PACKS.VIC.rules as unknown as StatutoryRules;
const VIC = VIC_RULES.MEETING_RULES;

// Eight lots (lot liability 10 each, lot entitlement 10, lot 8: 30) and a common property row.
const LOTS: TallyLot[] = [
  ...Array.from({ length: 8 }, (_, i) => ({ id: `lot-${i + 1}`, lotNumber: String(i + 1), entitlement: 10, lotEntitlement: i === 7 ? 30 : 10, lotType: "RESIDENTIAL" })),
  { id: "cp", lotNumber: "CP", entitlement: null, lotEntitlement: null, lotType: "COMMON" },
];

const vote = (n: number, v: ChairVote["vote"]): ChairVote => ({ lotId: `lot-${n}`, vote: v, byProxy: false });
const votes = (f: number[], a: number[] = [], ab: number[] = []) => [...f.map((n) => vote(n, "FOR")), ...a.map((n) => vote(n, "AGAINST")), ...ab.map((n) => vote(n, "ABSTAIN"))];

function count(category: string | null, chairVotes: ChairVote[], extra: Partial<Parameters<typeof buildConductTally>[0]> = {}) {
  return buildConductTally({
    ruleSet: VIC,
    rules: VIC_RULES,
    category,
    lots: LOTS,
    recordedLotCount: 8,
    onlineVotes: [],
    chairVotes,
    poll: false,
    owingLotIds: new Set(),
    ...extra,
  });
}

const tallyOf = (r: ReturnType<typeof count>) => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe("a Victorian building's votes are counted at a general meeting", () => {
  it("counts the draft pack, not a committee meeting, and needs no band of members", () => {
    expect(countsVotesAtConduct(VIC)).toBe(true);
    expect(countsVotesAtMeeting(VIC, "AGM")).toBe(true);
    expect(countsVotesAtMeeting(VIC, "COMMITTEE")).toBe(false);
    for (const c of ["ORDINARY", "SPECIAL", "UNANIMOUS"]) expect(countNeedsMemberBand(VIC, c)).toBe(false);
    // NSW and Queensland as before.
    expect(countsVotesAtConduct(NSW_RULE_SET)).toBe(false);
    expect(countsVotesAtConduct(QLD_RULE_PACK.rules.MEETING_RULES)).toBe(true);
  });
});

describe("the lots counted", () => {
  it("leave the common property row out, so the building's 8 lots match", () => {
    expect(tallyOf(count("SPECIAL", votes([1, 2, 3, 4, 5, 6], [7]))).tally).toEqual({ forCount: 6, againstCount: 1, abstainCount: 0, totalLots: 8 });
    expect(count("SPECIAL", votes([1]), { recordedLotCount: 9 })).toEqual({
      ok: false,
      error: "The building records 9 lots but 8 are entered, so this resolution cannot be counted. Enter every lot, or correct the number of lots, first.",
    });
  });

  it("refuse a vote for the common property row", () => {
    expect(count("ORDINARY", [{ lotId: "cp", vote: "FOR", byProxy: false }])).toEqual({
      ok: false,
      error: "Common property (entered as lot CP) is not a lot and has no vote, so nothing was counted. Reload the page and record the votes again.",
    });
  });

  it("leave it out of the conduct screen too", () => {
    const view = conductVotingView(VIC, VIC_RULES, LOTS, [{ id: "i1", resolutionCategory: "ORDINARY" }, { id: "i2", resolutionCategory: "SPECIAL" }], "AGM")!;
    expect(view.lots.map((l) => l.lotNumber)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
    // Stage 2, PR 8a-ii: both ask the chair whether there was a quorum, in the pack's words; neither asks the lots present.
    expect(view.items).toEqual({ i1: { pollAllowed: true, proxiesAllowed: true, quorumAsked: true }, i2: { pollAllowed: false, proxiesAllowed: true, quorumAsked: true } });
    expect(view.pollLabel).toBe("Poll asked for, counted by lot entitlement");
    expect(view.attestation).toEqual({ quorum: { label: "Quorum present for this item", help: VIC.quorumAttestation!.help } });
  });

  it("asks no quorum on a unanimous resolution or an item with no category, and words nothing when no item asks", () => {
    const view = conductVotingView(VIC, VIC_RULES, LOTS, [{ id: "u", resolutionCategory: "UNANIMOUS" }, { id: "n", resolutionCategory: null }], "AGM")!;
    expect(view.items).toEqual({ u: { pollAllowed: false, proxiesAllowed: true }, n: { pollAllowed: false, proxiesAllowed: true } });
    expect(view).not.toHaveProperty("attestation");
  });
});

describe("an owner in arrears (s 89B)", () => {
  const owing = { owingLotIds: new Set(["lot-2"]) };
  it("is not counted on an ordinary resolution, and is counted on a special or unanimous one", () => {
    expect(tallyOf(count("ORDINARY", votes([1, 2]), owing)).notCounted.map((v) => v.lotId)).toEqual(["lot-2"]);
    for (const c of ["SPECIAL", "UNANIMOUS"]) expect(tallyOf(count(c, votes([1, 2]), owing)).notCounted).toEqual([]);
  });
});

describe("a poll", () => {
  it("is taken on an ordinary resolution only, by lot entitlement", () => {
    for (const c of ["SPECIAL", "UNANIMOUS", "INTERIM_SPECIAL"]) {
      expect(count(c, votes([1]), { poll: true })).toEqual({ ok: false, error: "A poll can be taken only on an ordinary resolution." });
    }
    expect(tallyOf(count("ORDINARY", votes([1, 2], [8]), { poll: true })).tally).toEqual({
      forCount: 2,
      againstCount: 1,
      abstainCount: 0,
      totalLots: 8,
      poll: true,
      forUE: 20,
      againstUE: 30,
    });
  });

  it("fails closed when a lot that voted has no lot entitlement", () => {
    const lots = LOTS.map((l) => (l.id === "lot-2" ? { ...l, lotEntitlement: null } : l));
    expect(count("ORDINARY", votes([1, 2]), { poll: true, lots })).toEqual({
      ok: false,
      error: "The votes cannot be counted. Lot 2 has no lot entitlement recorded. Enter it before this can be worked out.",
    });
  });
});

describe("what the count lets the chair record", () => {
  const decide = (category: string, chairVotes: ChairVote[], requested: "RESOLVED" | "MOTION_LOST" = "RESOLVED") =>
    resolveOutcome(VIC, { requestedOutcome: requested, resolutionCategory: category, tally: tallyOf(count(category, chairVotes)).tally });

  it("records a special resolution carried by 75% of all lots, or lost", () => {
    expect(decide("SPECIAL", votes([1, 2, 3, 4, 5, 6]))).toMatchObject({ outcome: "RESOLVED", status: "CARRIED" });
    expect(decide("SPECIAL", votes([1, 2, 3], [4, 5, 6]), "MOTION_LOST")).toMatchObject({ outcome: "MOTION_LOST" });
    expect(decide("SPECIAL", votes([1, 2, 3], [4, 5, 6]), "MOTION_LOST").refused).toBeUndefined();
  });

  it("refuses an interim special resolution, as resolved or lost", () => {
    for (const requested of ["RESOLVED", "MOTION_LOST"] as const) {
      const r = decide("SPECIAL", votes([1, 2, 3, 4], [5, 6]), requested);
      expect(r.refused).toMatch(/^The votes recorded make this motion an interim special resolution\./);
      expect(r.evaluation?.result).toBe("INTERIM");
    }
  });

  it("refuses an ordinary resolution when the quorum is not answered", () => {
    expect(decide("ORDINARY", votes([1, 2, 3], [4])).refused).toBe(
      "The votes recorded cannot decide this motion. Whether the meeting had a quorum for this item is not recorded, so the votes cannot decide it. Nothing was saved. The item can be deferred.",
    );
    expect(decide("ORDINARY", votes([1], [2, 3]), "MOTION_LOST").refused).toMatch(/quorum for this item is not recorded/);
  });

  const withQuorum = (category: string, chairVotes: ChairVote[], quorumPresent: boolean | null, requested: "RESOLVED" | "MOTION_LOST" = "RESOLVED", extra = {}) =>
    resolveOutcome(VIC, { requestedOutcome: requested, resolutionCategory: category, tally: tallyOf(count(category, chairVotes, { quorumPresent, ...extra })).tally });

  it("records an ordinary resolution as carried or lost with a quorum, by votes cast or on a poll, and refuses equal votes", () => {
    expect(withQuorum("ORDINARY", votes([1, 2], [3]), true)).toMatchObject({ outcome: "RESOLVED", status: "CARRIED", evaluation: { passed: true, reason: "Majority of votes cast" } });
    expect(withQuorum("ORDINARY", votes([1], [2, 3]), true, "MOTION_LOST")).toMatchObject({ outcome: "MOTION_LOST", status: "LOST" });
    expect(withQuorum("ORDINARY", votes([1, 2], [8]), true, "MOTION_LOST", { poll: true })).toMatchObject({ outcome: "MOTION_LOST" });
    expect(withQuorum("ORDINARY", votes([1], [2]), true).refused).toMatch(/The votes are equal/);
  });

  it("without a quorum, records only a lost ordinary resolution: one that carries is interim and refused", () => {
    expect(withQuorum("ORDINARY", votes([1], [2, 3]), false, "MOTION_LOST")).toMatchObject({ outcome: "MOTION_LOST", status: "LOST" });
    const carried = withQuorum("ORDINARY", votes([1, 2], [3]), false);
    expect(carried.evaluation?.result).toBe("INTERIM");
    expect(carried.refused).toBe(
      "The votes recorded make this motion an interim resolution. Majority of votes cast, at a meeting without a quorum, so it is an interim resolution. StrataVerze does not record interim resolutions yet, so this outcome cannot be recorded here. Nothing was saved. The item can be deferred.",
    );
  });

  it("decides the second interim special route (no vote against, at least 1 for) by the quorum answer", () => {
    // 3 of 8 for and none against: below 75% and below route 1's 50%, so only route 2 can pass it.
    const route2 = votes([1, 2, 3]);
    expect(withQuorum("SPECIAL", route2, true).evaluation?.result).toBe("INTERIM");
    expect(withQuorum("SPECIAL", route2, true).refused).toMatch(/^The votes recorded make this motion an interim special resolution\./);
    expect(withQuorum("SPECIAL", route2, false, "MOTION_LOST")).toMatchObject({ outcome: "MOTION_LOST", status: "LOST" });
    expect(withQuorum("SPECIAL", route2, false, "MOTION_LOST").refused).toBeUndefined();
    expect(withQuorum("SPECIAL", route2, null).refused).toMatch(/whether there was one for this item is not recorded/);
    // 75% of all lots carries whatever the answer.
    expect(withQuorum("SPECIAL", votes([1, 2, 3, 4, 5, 6]), true)).toMatchObject({ outcome: "RESOLVED", status: "CARRIED" });
  });

  it("puts the answer on the tally only where the test needs it: never on a unanimous resolution", () => {
    expect(countNeedsQuorum(VIC, "UNANIMOUS")).toBe(false);
    expect(tallyOf(count("UNANIMOUS", votes([1, 2, 3, 4, 5, 6, 7, 8]), { quorumPresent: false })).tally).not.toHaveProperty("quorumPresent");
    expect(tallyOf(count("ORDINARY", votes([1]), { quorumPresent: false })).tally).toMatchObject({ quorumPresent: false });
    expect(tallyOf(count("ORDINARY", votes([1]), { quorumPresent: null })).tally).not.toHaveProperty("quorumPresent");
  });

  it("has no voting period refusal", () => {
    for (const c of ["ORDINARY", "SPECIAL", "UNANIMOUS"]) expect(laterDecisionRefusal(VIC, c, "RESOLVED")).toBeNull();
  });
});

describe("a \"no quorum\" answer the votes contradict (s 77: 50% of the lots)", () => {
  it("is refused from exactly half of all lots counted, and not below", () => {
    expect(quorumAnswerProblem(VIC, "AGM", false, 4, 8)).toBe(
      "The answer says the meeting had no quorum for this item, but 4 of the 8 lots have a vote counted on it, which is at least 50% of the lots, so it had one. Check the quorum answer and the votes entered. Nothing was saved.",
    );
    expect(quorumAnswerProblem(VIC, "EGM", false, 5, 9)).toMatch(/5 of the 9 lots/);
    expect(quorumAnswerProblem(VIC, "AGM", false, 3, 8)).toBeNull();
    expect(quorumAnswerProblem(VIC, "EGM", false, 4, 9)).toBeNull();
  });

  it("never refuses a \"yes\", an unanswered item, a committee or a meeting type with no quorum rule", () => {
    expect(quorumAnswerProblem(VIC, "AGM", true, 8, 8)).toBeNull();
    expect(quorumAnswerProblem(VIC, "AGM", null, 8, 8)).toBeNull();
    expect(quorumAnswerProblem(VIC, "COMMITTEE", false, 8, 8)).toBeNull();
    expect(quorumAnswerProblem(VIC, "SGM", false, 8, 8)).toBeNull();
    expect(quorumAnswerProblem(NSW_RULE_SET, "AGM", false, 8, 8)).toBeNull();
    expect(quorumAnswerProblem(QLD_RULE_PACK.rules.MEETING_RULES, "AGM", false, 8, 8)).toBeNull();
  });
});

describe("a tier 5 owners corporation, or one whose tier cannot be worked out (ss 7(6), 7A, 8)", () => {
  const lotsOf = (n: number, occupiable: boolean | null = true) =>
    Array.from({ length: n }, (_, i) => ({ id: `lot-${i + 1}`, lotNumber: String(i + 1), lotType: "RESIDENTIAL", occupiable }));
  const building = (over: { lots?: SelectorBuilding["lots"]; servicesOnly?: boolean | null; totalLots?: number | null; several?: string | null } = {}): SelectorBuilding => {
    const lots = over.lots ?? lotsOf(8);
    return {
      scheme: { totalLots: over.totalLots === undefined ? lots.filter((l) => l.lotType !== "COMMON").length : over.totalLots, servicesOnly: over.servicesOnly === undefined ? false : over.servicesOnly },
      lots,
      recorded: over.several === null ? {} : { severalOwnersCorporations: over.several ?? "NO" },
    };
  };
  const refusal = (b: SelectorBuilding) => countingRefusal(VIC_RULES, VIC, b);

  it("refuses a services only owners corporation and a 2-lot subdivision", () => {
    const tier5 = `${VIC.countingRefusedWhen![0].refusal}. Nothing was saved. The item can be deferred.`;
    expect(tier5).toMatch(/^This owners corporation is tier 5 \(a 2-lot subdivision or services only\)\. It is exempt from many of the meeting and resolution rules \(.+ ss 7A, 8\)/);
    expect(tier5).toMatch(/StrataVerze does not apply the rules for tier 5 owners corporations yet, so its votes cannot be counted\. Nothing was saved\. The item can be deferred\.$/);
    expect(refusal(building({ servicesOnly: true }))).toBe(tier5);
    expect(refusal(building({ lots: lotsOf(2) }))).toBe(tier5);
    expect(refusal(building({ lots: [...lotsOf(2), { id: "cp", lotNumber: "CP", lotType: "COMMON", occupiable: null }] }))).toBe(tier5);
  });

  it("counts tiers 1 to 4", () => {
    for (const n of [3, 9, 10, 50, 51, 101]) expect(refusal(building({ lots: lotsOf(n) })), String(n)).toBeNull();
  });

  it("fails closed where the tier cannot be worked out, saying what the building rules are missing", () => {
    const start = "StrataVerze cannot tell whether this owners corporation is tier 5 (a 2-lot subdivision or services only), whose votes it does not count yet, because ";
    const end = " Check the building rules. Nothing was saved. The item can be deferred.";
    expect(refusal(building({ several: null }))).toBe(`${start}no answer is recorded for owners corporations on the plan.${end}`);
    expect(refusal(building({ servicesOnly: null }))).toMatch(/^StrataVerze cannot tell whether this owners corporation is tier 5 .*because no answer is recorded for services only/i);
    expect(refusal(building({ lots: lotsOf(8, null) }))).toBe(`${start}8 lots have no answer for occupiable (lots 1, 2, 3, 4, 5, 6, 7 and 8).${end}`.replace("occupiable (", `${VIC_RULES.BUILDING_FACTS!.LOT_OCCUPIABLE!.label.toLowerCase()} (`));
    expect(refusal(building({ totalLots: 9 }))).toBe(`${start}8 lots are recorded but the building's total is 9.${end}`);
    expect(refusal(building({ lots: [] }))).toMatch(/because no lots are recorded\./);
    // A tier refused for a reason other than a missing fact says why.
    expect(refusal(building({ several: "YES" }))).toBe(
      `${start}the tier cannot be worked out. This owners corporation is one of several on its plan. How the tier is assessed then is not confirmed, so StrataVerze does not work it out.${end}`,
    );
    expect(refusal(building({ lots: [...lotsOf(2), { id: "p", lotNumber: "P1", lotType: "PARKING", occupiable: false }] }))).toMatch(/the tier cannot be worked out\. The plan has 2 occupiable lots and other lots/);
  });

  it("is never refused under a pack with no such rule", () => {
    for (const rs of [NSW_RULE_SET, QLD_RULE_PACK.rules.MEETING_RULES, PENDING_RULE_PACKS.ACT.rules.MEETING_RULES, PENDING_RULE_PACKS.WA.rules.MEETING_RULES]) {
      expect(countingRefusal(VIC_RULES, rs, building({ servicesOnly: true }))).toBeNull();
    }
  });

  it("applies the arrears rule to tiers 1 to 4, not tier 5, and where the tier is unknown", () => {
    const applies = (b: SelectorBuilding) => debtorRuleApplies(VIC, conditionHolds(VIC_RULES, VIC.debtorRuleAppliesWhen!, b).holds);
    expect(applies(building())).toBe(true);
    expect(applies(building({ servicesOnly: true }))).toBe(false);
    expect(applies(building({ lots: lotsOf(2) }))).toBe(false);
    expect(applies(building({ several: null }))).toBe(true);
    // At the count: a lot in arrears is counted on an ordinary resolution where the rule does not apply.
    const r = count("ORDINARY", votes([1, 2]), { owingLotIds: new Set(["lot-2"]), debtorRuleApplies: false });
    expect(r.ok && r.value.notCounted).toEqual([]);
  });
});

describe("an item with no category at a draft pack's general meeting (Victoria, the ACT and Western Australia)", () => {
  const drafts = [PENDING_RULE_PACKS.VIC, PENDING_RULE_PACKS.ACT, PENDING_RULE_PACKS.WA].map((p) => p.rules.MEETING_RULES);

  it("cannot be recorded as resolved, since nothing counts it; lost and deferred are allowed, and a committee is not checked", () => {
    for (const rs of drafts) {
      for (const meetingType of ["AGM", "EGM", "FIRST_AGM", "SGM", null]) {
        for (const category of [null, undefined, "", "  "]) {
          expect(uncategorisedRefusal(rs, category, "RESOLVED", meetingType), `${rs.state} ${meetingType}`).toBe(
            "This item has no resolution type, so its votes cannot be counted and it cannot be recorded as resolved at a general meeting. Give the item its resolution type on the agenda first. It can be recorded as lost, or deferred.",
          );
          expect(uncategorisedRefusal(rs, category, "MOTION_LOST", meetingType)).toBeNull();
          expect(uncategorisedRefusal(rs, category, "DEFERRED", meetingType)).toBeNull();
        }
        expect(uncategorisedRefusal(rs, "ORDINARY", "RESOLVED", meetingType)).toBeNull();
      }
      expect(uncategorisedRefusal(rs, null, "RESOLVED", "COMMITTEE")).toBeNull();
    }
  });

  it("is never refused under the NSW or Queensland rules, which leave the flag out", () => {
    for (const rs of [NSW_RULE_SET, QLD_RULE_PACK.rules.MEETING_RULES]) {
      expect(rs).not.toHaveProperty("categoryRequiredAtGeneralMeetings");
      for (const outcome of ["RESOLVED", "MOTION_LOST", "DEFERRED"] as const) {
        for (const meetingType of ["AGM", "EGM", "COMMITTEE"]) expect(uncategorisedRefusal(rs, null, outcome, meetingType)).toBeNull();
      }
    }
  });
});
