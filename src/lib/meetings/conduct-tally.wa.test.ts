/**
 * Counting the votes at conduct for a Western Australian building (VIC, ACT
 * and WA stage 2, PR 8a-i, 28 Oct 2026), with the draft pack's MEETING_RULES.
 * Special, without dissent and unanimous resolutions are decided when their
 * 28-day voting period closes (STA s 121), so the meeting cannot record them
 * as resolved or lost; an ordinary resolution is counted. An unfinancial
 * owner votes on unanimous and without dissent resolutions only (s 120(2)).
 * In a 2-lot scheme the quorum needs both lots (s 130(2), (4)): since stage 2,
 * PR 8a-ii (29 Oct 2026, Matthew Wrigley's decision) a count is refused unless
 * both lots are recorded at the item. A lot whose vote is not counted for
 * money owed still makes up the quorum (his decision of the same day,
 * relaxing the stricter reading first applied). No quorum answer is asked.
 */
import { describe, expect, it } from "vitest";
import { MEETING_RULES as NSW_RULE_SET, PENDING_RULE_PACKS, QLD_RULE_PACK, type StatutoryRules } from "@/config/statutory";
import { buildConductTally, conductVotingView, countNeedsMemberBand, countsVotesAtConduct, laterDecisionRefusal, type ChairVote, type TallyLot } from "./conduct-tally";
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

describe("a 2-lot scheme's quorum (s 130(2), (4)): both lots must be recorded at the item", () => {
  const TWO: TallyLot[] = [
    { id: "lot-1", lotNumber: "1", entitlement: 10 },
    { id: "lot-2", lotNumber: "2", entitlement: 10 },
    { id: "cp", lotNumber: "CP", entitlement: 0, lotType: "COMMON" },
  ];
  const two = (chairVotes: ChairVote[], extra: Partial<Parameters<typeof buildConductTally>[0]> = {}) => count("ORDINARY", chairVotes, { lots: TWO, recordedLotCount: 2, ...extra });
  const refusal = `${WA.quorumNeedsEveryLot!.refusal}. Nothing was saved. The item can be deferred.`;

  it("refuses the count with one lot, or none, recorded", () => {
    expect(two(votes([1]))).toEqual({ ok: false, error: refusal });
    expect(two([])).toEqual({ ok: false, error: refusal });
    expect(refusal).toContain("a lot whose vote is not counted for money owed still makes up the quorum");
    expect(refusal).toMatch(/^In a 2-lot scheme the meeting has a quorum only with both lots present or represented, and there is no fallback \(.+ s 130\(2\), \(4\)\)\./);
    expect(refusal).not.toMatch(/[;–—]/);
  });

  it("counts both lots voting or abstaining, and records the outcome", () => {
    const t = valueOf(two([vote(1, "FOR"), vote(2, "ABSTAIN")])).tally!;
    expect(t).toEqual({ forCount: 1, againstCount: 0, abstainCount: 1, totalLots: 2 });
    expect(resolveOutcome(WA, { requestedOutcome: "RESOLVED", resolutionCategory: "ORDINARY", tally: t })).toMatchObject({ outcome: "RESOLVED", status: "CARRIED" });
    expect(valueOf(two(votes([1], [2]))).tally).toMatchObject({ forCount: 1, againstCount: 1 });
  });

  it("lets a lot whose vote is not counted for money owed make up the quorum, deciding by the counted votes (Matthew Wrigley's decision of 29 Oct 2026)", () => {
    const owing = { owingLotIds: new Set(["lot-2"]) };
    // Both recorded, lot 2 not counted for money owed: counted, by lot 1's vote alone.
    const carried = valueOf(two(votes([1, 2]), owing));
    expect(carried.tally).toEqual({ forCount: 1, againstCount: 0, abstainCount: 0, totalLots: 2 });
    expect(carried.notCounted.map((v) => v.lotId)).toEqual(["lot-2"]);
    expect(resolveOutcome(WA, { requestedOutcome: "RESOLVED", resolutionCategory: "ORDINARY", tally: carried.tally! })).toMatchObject({ outcome: "RESOLVED", status: "CARRIED" });
    // Lot 2 against, not counted: lot 1's vote still carries it.
    expect(valueOf(two(votes([1], [2]), owing)).tally).toEqual({ forCount: 1, againstCount: 0, abstainCount: 0, totalLots: 2 });
    // Lot 1 against, lot 2 for but not counted: lost.
    const lost = valueOf(two(votes([2], [1]), owing)).tally!;
    expect(lost).toEqual({ forCount: 0, againstCount: 1, abstainCount: 0, totalLots: 2 });
    expect(resolveOutcome(WA, { requestedOutcome: "MOTION_LOST", resolutionCategory: "ORDINARY", tally: lost })).toMatchObject({ outcome: "MOTION_LOST" });
    // Both lots owing and both recorded: the quorum is made, nothing is counted.
    expect(valueOf(two(votes([1, 2]), { owingLotIds: new Set(["lot-1", "lot-2"]) })).tally).toEqual({ forCount: 0, againstCount: 0, abstainCount: 0, totalLots: 2 });
  });

  it("still refuses where a lot is not recorded at the item at all, owing or not", () => {
    expect(two(votes([2]), { owingLotIds: new Set(["lot-2"]) })).toEqual({ ok: false, error: refusal });
    expect(two(votes([1]), { owingLotIds: new Set(["lot-2"]) })).toEqual({ ok: false, error: refusal });
    expect(two([], { owingLotIds: new Set(["lot-1", "lot-2"]) })).toEqual({ ok: false, error: refusal });
  });

  it("refuses where the lots entered and the number recorded do not agree, or no number is recorded", () => {
    expect(two(votes([1, 2]), { recordedLotCount: 3 })).toEqual({
      ok: false,
      error: "The building records 3 lots but 2 are entered, so this resolution cannot be counted. Enter every lot, or correct the number of lots, first.",
    });
    expect(count("ORDINARY", votes([1, 2]), { recordedLotCount: 2 })).toEqual({
      ok: false,
      error: "The building records 2 lots but 8 are entered, so this resolution cannot be counted. Enter every lot, or correct the number of lots, first.",
    });
    expect(two(votes([1, 2]), { recordedLotCount: null }).ok).toBe(false);
  });

  it("refuses fewer than 2 lots entered, even where every one is counted (PR 8a-ii review)", () => {
    expect(two(votes([1]), { lots: [TWO[0], TWO[2]], recordedLotCount: 1 })).toEqual({
      ok: false,
      error: "Only 1 lot is entered, and a scheme needs at least 2, so this resolution cannot be counted. Enter every lot, or correct the number of lots, first.",
    });
    expect(two([], { lots: [TWO[2]], recordedLotCount: 0 })).toEqual({
      ok: false,
      error: "Only 0 lots are entered, and a scheme needs at least 2, so this resolution cannot be counted. Enter every lot, or correct the number of lots, first.",
    });
  });

  it("is not checked with 3 or more lots, or for an item with no category", () => {
    expect(count("ORDINARY", votes([1])).ok).toBe(true);
    expect(count("ORDINARY", votes([1]), { recordedLotCount: null }).ok).toBe(true);
    expect(two(votes([1]), { category: null }).ok).toBe(true);
  });

  it("asks the chair nothing at the conduct screen", () => {
    const view = conductVotingView(WA, WA_RULES, TWO, [{ id: "o", resolutionCategory: "ORDINARY" }], "AGM")!;
    expect(view.items).toEqual({ o: { pollAllowed: true, proxiesAllowed: true } });
    expect(view).not.toHaveProperty("attestation");
  });
});
