/**
 * Counting the votes at conduct for a Western Australian building (VIC, ACT
 * and WA stage 2, PR 8a-i, 28 Oct 2026), with the draft pack's MEETING_RULES.
 * Special, without dissent and unanimous resolutions are decided when their
 * 28-day voting period closes (STA s 121), so the meeting cannot record them
 * as resolved or lost; an ordinary resolution is counted. An unfinancial
 * owner votes on unanimous and without dissent resolutions only (s 120(2)).
 */
import { describe, expect, it } from "vitest";
import { MEETING_RULES as NSW_RULE_SET, PENDING_RULE_PACKS, QLD_RULE_PACK, type StatutoryRules } from "@/config/statutory";
import { buildConductTally, countNeedsMemberBand, countsVotesAtConduct, laterDecisionRefusal, type ChairVote, type TallyLot } from "./conduct-tally";
import { resolveOutcome } from "./conduct";

const WA_RULES = PENDING_RULE_PACKS.WA.rules as unknown as StatutoryRules;
const WA = WA_RULES.MEETING_RULES;

const LOTS: TallyLot[] = [
  ...Array.from({ length: 8 }, (_, i) => ({ id: `lot-${i + 1}`, lotNumber: String(i + 1), entitlement: i === 7 ? 30 : 10 })),
  { id: "cp", lotNumber: "CP", entitlement: 0, lotType: "COMMON" },
];
const vote = (n: number, v: ChairVote["vote"]): ChairVote => ({ lotId: `lot-${n}`, vote: v, byProxy: false });
const votes = (f: number[], a: number[] = []) => [...f.map((n) => vote(n, "FOR")), ...a.map((n) => vote(n, "AGAINST"))];

function count(category: string | null, chairVotes: ChairVote[], extra: Partial<Parameters<typeof buildConductTally>[0]> = {}) {
  return buildConductTally({
    ruleSet: WA,
    rules: WA_RULES,
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
const valueOf = (r: ReturnType<typeof count>) => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe("the voting period (s 121)", () => {
  it("refuses a special, without dissent or unanimous resolution recorded as resolved or lost, and allows deferral", () => {
    expect(laterDecisionRefusal(WA, "SPECIAL", "RESOLVED")).toBe(
      "A special resolution is decided when its 28-day voting period closes, which StrataVerze does not track yet. It cannot be recorded as resolved or lost at the meeting. It can be deferred.",
    );
    expect(laterDecisionRefusal(WA, "WITHOUT_DISSENT", "MOTION_LOST")).toMatch(/^A resolution without dissent is decided when its 28-day voting period closes/);
    expect(laterDecisionRefusal(WA, "UNANIMOUS", "RESOLVED")).toMatch(/^A unanimous resolution is decided/);
    for (const c of ["SPECIAL", "WITHOUT_DISSENT", "UNANIMOUS"]) expect(laterDecisionRefusal(WA, c, "DEFERRED")).toBeNull();
    for (const c of ["ORDINARY", null, "BOGUS"]) expect(laterDecisionRefusal(WA, c, "RESOLVED")).toBeNull();
    expect(laterDecisionRefusal(WA, "SPECIAL", "RESOLVED")).not.toMatch(/[;–—]|\(s \d/);
  });

  it("is never refused under the NSW or Queensland rules", () => {
    for (const rs of [NSW_RULE_SET, QLD_RULE_PACK.rules.MEETING_RULES]) {
      for (const c of Object.keys(rs.resolutionCategories)) expect(laterDecisionRefusal(rs, c, "RESOLVED")).toBeNull();
    }
  });
});

describe("an ordinary resolution", () => {
  it("is counted: a majority of the lots voting, a tie lost, by unit entitlement on a poll", () => {
    expect(countsVotesAtConduct(WA)).toBe(true);
    expect(countNeedsMemberBand(WA, "ORDINARY")).toBe(false);
    const decide = (chairVotes: ChairVote[], poll = false, requested: "RESOLVED" | "MOTION_LOST" = "RESOLVED") =>
      resolveOutcome(WA, { requestedOutcome: requested, resolutionCategory: "ORDINARY", tally: valueOf(count("ORDINARY", chairVotes, { poll })).tally });
    expect(decide(votes([1, 2, 3], [4]))).toMatchObject({ outcome: "RESOLVED" });
    expect(decide(votes([1, 2], [3, 4]), false, "MOTION_LOST")).toMatchObject({ outcome: "MOTION_LOST" });
    expect(decide(votes([1, 2, 3], [8]), true)).toMatchObject({ outcome: "MOTION_LOST", evaluation: { reason: "Not carried by unit entitlement on a poll" } });
    for (const c of ["SPECIAL", "WITHOUT_DISSENT", "UNANIMOUS"]) {
      expect(count(c, votes([1]), { poll: true })).toEqual({ ok: false, error: "A poll can be taken only on an ordinary resolution." });
    }
  });
});

describe("the totals of a special resolution", () => {
  it("are every lot and its unit entitlement, the common property row left out", () => {
    expect(valueOf(count("SPECIAL", votes([1, 2, 3, 4], [8]))).tally).toEqual({
      forCount: 4,
      againstCount: 1,
      abstainCount: 0,
      totalLots: 8,
      totalEntitlement: 100,
      forUE: 40,
      againstUE: 30,
    });
  });
});

describe("an unfinancial owner (s 120(2))", () => {
  const owing = { owingLotIds: new Set(["lot-2"]) };
  it("is not counted on an ordinary or special resolution, and is on a unanimous or without dissent one", () => {
    for (const c of ["ORDINARY", "SPECIAL"]) expect(valueOf(count(c, votes([1, 2]), owing)).notCounted.map((v) => v.lotId)).toEqual(["lot-2"]);
    for (const c of ["UNANIMOUS", "WITHOUT_DISSENT"]) expect(valueOf(count(c, votes([1, 2]), owing)).notCounted).toEqual([]);
  });
});
