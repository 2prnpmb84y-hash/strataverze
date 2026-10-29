/**
 * Counting the votes at conduct for a Victorian building (VIC, ACT and WA
 * stage 2, PR 8a-i, 28 Oct 2026), with the draft pack's MEETING_RULES. Common
 * property rows are not lots; an owner in arrears votes on special and
 * unanimous resolutions only (OCA s 89B); a poll on an ordinary resolution
 * only, by lot entitlement; an interim special resolution and an ordinary
 * resolution without a quorum recorded are refused, never recorded.
 */
import { describe, expect, it } from "vitest";
import { MEETING_RULES as NSW_RULE_SET, PENDING_RULE_PACKS, QLD_RULE_PACK, type StatutoryRules } from "@/config/statutory";
import { buildConductTally, conductVotingView, countNeedsMemberBand, countsVotesAtConduct, countsVotesAtMeeting, laterDecisionRefusal, uncategorisedRefusal, type ChairVote, type TallyLot } from "./conduct-tally";
import { resolveOutcome } from "./conduct";

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
    expect(view.items).toEqual({ i1: { pollAllowed: true, proxiesAllowed: true }, i2: { pollAllowed: false, proxiesAllowed: true } });
    expect(view.pollLabel).toBe("Poll asked for, counted by lot entitlement");
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

  it("refuses an ordinary resolution until quorum is recorded for the item", () => {
    expect(decide("ORDINARY", votes([1, 2, 3], [4])).refused).toBe(
      "The votes recorded cannot decide this motion. Whether the meeting had a quorum for this item is not recorded, so the votes cannot decide it. Nothing was saved. The item can be deferred.",
    );
  });

  it("has no voting period refusal", () => {
    for (const c of ["ORDINARY", "SPECIAL", "UNANIMOUS"]) expect(laterDecisionRefusal(VIC, c, "RESOLVED")).toBeNull();
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
