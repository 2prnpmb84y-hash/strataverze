/**
 * Counting the votes at conduct for a Queensland building (QLD stage 2,
 * resolution tallies, 27 Oct 2026). The tally is built from the votes the
 * chair records and the formal online votes, with the totals of every lot,
 * and the pack's own tests decide: the special resolution (Act s 106(3)),
 * the majority resolution (s 107), an ordinary resolution on a poll by
 * contribution schedule lot entitlement (s 110(3)), and the debtor rule
 * (SM s 102(2)). NSW counts nothing at conduct.
 */
import { describe, expect, it } from "vitest";
import { MEETING_RULES as NSW_RULE_SET, PENDING_RULE_PACKS, statutoryRulesFor, type StatutoryRules } from "@/config/statutory";
import {
  buildConductTally,
  conductVotingView,
  countsVotesAtConduct,
  countsVotesAtMeeting,
  notCountedNotice,
  outcomeDisagreement,
  parseChairVotes,
  writtenVotesRefusal,
  type ChairVote,
  type ConductTally,
  type TallyLot,
} from "./conduct-tally";
import { resolveOutcome, type Outcome } from "./conduct";

const QLD_RULES = PENDING_RULE_PACKS.QLD.rules as unknown as StatutoryRules;
const QLD = QLD_RULES.MEETING_RULES;

// Eight lots: lots 1 to 7 hold 10 each and lot 8 holds 30 (100 in all).
const LOTS: TallyLot[] = Array.from({ length: 8 }, (_, i) => ({
  id: `lot-${i + 1}`,
  lotNumber: String(i + 1),
  entitlement: i === 7 ? 30 : 10,
  interestScheduleEntitlement: 5,
}));

const vote = (n: number, v: ChairVote["vote"], byProxy = false): ChairVote => ({ lotId: `lot-${n}`, vote: v, byProxy });
const votes = (forLots: number[], againstLots: number[], abstain: number[] = []) => [
  ...forLots.map((n) => vote(n, "FOR")),
  ...againstLots.map((n) => vote(n, "AGAINST")),
  ...abstain.map((n) => vote(n, "ABSTAIN")),
];

function count(
  category: string | null,
  chairVotes: ChairVote[],
  extra: Partial<Parameters<typeof buildConductTally>[0]> = {},
) {
  return buildConductTally({
    ruleSet: QLD,
    rules: QLD_RULES,
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

function counted(result: ReturnType<typeof count>): ConductTally {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

/** What the count gives for the chair's outcome, through resolveOutcome. */
function decide(category: string, result: ReturnType<typeof count>, requested: Outcome = "RESOLVED") {
  return resolveOutcome(QLD, { requestedOutcome: requested, resolutionCategory: category, tally: counted(result).tally });
}

describe("which buildings count votes at conduct", () => {
  it("is Queensland, whose pack has the special and majority bases, and not NSW", () => {
    expect(countsVotesAtConduct(QLD)).toBe(true);
    expect(countsVotesAtConduct(NSW_RULE_SET)).toBe(false);
  });

  it("takes the poll and proxy categories from the pack", () => {
    expect(QLD.pollCategories).toEqual(["ORDINARY"]);
    expect(QLD.proxiesBarredOn).toEqual(["MAJORITY"]);
    expect(NSW_RULE_SET.pollCategories).toBeUndefined();
    expect(NSW_RULE_SET.proxiesBarredOn).toBeUndefined();
  });
});

describe("which meetings are counted", () => {
  it("counts a Queensland general meeting but not a committee meeting (SM ss 60, 68)", () => {
    for (const t of ["AGM", "EGM", "FIRST_AGM", "SGM", null]) expect(countsVotesAtMeeting(QLD, t)).toBe(true);
    for (const t of ["COMMITTEE", " Committee "]) expect(countsVotesAtMeeting(QLD, t)).toBe(false);
    expect(countsVotesAtMeeting(NSW_RULE_SET, "AGM")).toBe(false);
  });
});

describe("a special resolution (Act s 106(3))", () => {
  it("counts every lot and the contribution schedule of every lot", () => {
    const { tally } = counted(count("SPECIAL", votes([3, 4, 5, 6, 7, 8], [1, 2])));
    expect(tally).toEqual({ forCount: 6, againstCount: 2, abstainCount: 0, totalLots: 8, totalEntitlement: 100, forUE: 80, againstUE: 20 });
  });

  it("passes: two thirds for, 2 of 8 lots against, holding 20% of the entitlement", () => {
    const r = decide("SPECIAL", count("SPECIAL", votes([3, 4, 5, 6, 7, 8], [1, 2])));
    expect(r.outcome).toBe("RESOLVED");
  });

  it("passes at exactly two thirds of the votes cast", () => {
    // 4 for of 6 cast: 3 x 4 = 2 x 6.
    const r = decide("SPECIAL", count("SPECIAL", votes([3, 4, 5, 6], [1, 2])));
    expect(r.outcome).toBe("RESOLVED");
  });

  it("fails on (a): less than two thirds of the votes cast are for", () => {
    const r = decide("SPECIAL", count("SPECIAL", votes([3, 4, 5], [1, 2])));
    expect(r.outcome).toBe("MOTION_LOST");
    expect(r.evaluation?.reason).toBe("Votes for are less than 66.7% of the votes cast");
  });

  it("fails on (b): votes against are more than 25% of the lots, with the entitlement against within its cap", () => {
    // Twelve lots: lots 1 to 4 hold 1 each, the rest 20 each (164 in all). 8 for, 4 against (lots 1 to 4):
    // two thirds for, 4 lots against is more than 3, and 4 of 164 entitlement is within 25%.
    const lots = Array.from({ length: 12 }, (_, i) => ({ id: `lot-${i + 1}`, lotNumber: String(i + 1), entitlement: i < 4 ? 1 : 20 }));
    const r = buildConductTally({
      ruleSet: QLD,
      rules: QLD_RULES,
      category: "SPECIAL",
      lots,
      recordedLotCount: 12,
      onlineVotes: [],
      chairVotes: votes([5, 6, 7, 8, 9, 10, 11, 12], [1, 2, 3, 4]),
      poll: false,
      owingLotIds: new Set(),
    });
    expect(counted(r).tally).toMatchObject({ forCount: 8, againstCount: 4, totalLots: 12, totalEntitlement: 164, againstUE: 4 });
    const outcome = decide("SPECIAL", r);
    expect(outcome.outcome).toBe("MOTION_LOST");
    expect(outcome.evaluation?.reason).toBe("Votes against are more than 25% of the lots in the scheme");
  });

  it("fails on (c): the lot against holds more than 25% of the contribution schedule", () => {
    // 6 for, 1 against: lot 8 alone holds 30 of 100.
    const r = decide("SPECIAL", count("SPECIAL", votes([1, 2, 3, 4, 5, 6], [8])));
    expect(r.outcome).toBe("MOTION_LOST");
    expect(r.evaluation?.reason).toBe("The lots against hold more than 25% of the total entitlement");
  });

  it("does not count a debtor's vote against", () => {
    const r = count("SPECIAL", votes([1, 2, 3, 4, 5, 6], [8]), { owingLotIds: new Set(["lot-8"]) });
    expect(counted(r).notCounted.map((v) => v.lotNumber)).toEqual(["8"]);
    expect(decide("SPECIAL", r).outcome).toBe("RESOLVED");
  });
});

describe("a majority resolution (Act s 107)", () => {
  it("passes when the votes for are more than half of the lots entitled to vote", () => {
    const r = count("MAJORITY", votes([1, 2, 3, 4, 5], [6]));
    expect(counted(r).tally).toMatchObject({ forCount: 5, eligibleLots: 8 });
    expect(decide("MAJORITY", r).outcome).toBe("RESOLVED");
  });

  it("fails at exactly half", () => {
    const r = decide("MAJORITY", count("MAJORITY", votes([1, 2, 3, 4], [])));
    expect(r.outcome).toBe("MOTION_LOST");
    expect(r.evaluation?.reason).toBe("Votes for are not more than half of the lots entitled to vote");
  });

  it("leaves the lots owing money out of the lots entitled to vote, and out of the count", () => {
    // Lot 8 owes: 7 lots are entitled, so 4 for is more than half.
    const r = count("MAJORITY", votes([1, 2, 3, 4, 8], []), { owingLotIds: new Set(["lot-8"]) });
    expect(counted(r).tally).toMatchObject({ forCount: 4, eligibleLots: 7, totalLots: 8 });
    expect(counted(r).notCounted.map((v) => v.lotId)).toEqual(["lot-8"]);
    expect(decide("MAJORITY", r).outcome).toBe("RESOLVED");
  });

  it("cannot be recorded as resolved until written votes are recorded, but can be lost or deferred", () => {
    const text = writtenVotesRefusal(QLD, "MAJORITY", "RESOLVED");
    expect(text).toBe(
      "A majority resolution is decided on each lot's written vote, which StrataVerze does not record yet. It cannot be recorded as resolved here. It can be recorded as lost, or deferred.",
    );
    expect(text).not.toMatch(/[;–—]/);
    expect(writtenVotesRefusal(QLD, "MAJORITY", "MOTION_LOST")).toBeNull();
    expect(writtenVotesRefusal(QLD, "MAJORITY", "DEFERRED")).toBeNull();
    for (const c of ["ORDINARY", "SPECIAL", "WITHOUT_DISSENT", null]) expect(writtenVotesRefusal(QLD, c, "RESOLVED")).toBeNull();
  });

  it("refuses a proxy vote", () => {
    const r = count("MAJORITY", [vote(1, "FOR"), vote(2, "FOR", true)]);
    expect(r).toEqual({
      ok: false,
      error: "Lot 2 voted by proxy, but a proxy cannot vote on a majority resolution. Remove that vote, or record it without the proxy if the owner voted themselves.",
    });
  });

  it("takes a proxy vote on the other categories as the lot's vote", () => {
    for (const c of ["ORDINARY", "SPECIAL", "WITHOUT_DISSENT"]) {
      expect(counted(count(c, [vote(1, "FOR", true)])).counted).toEqual([
        { lotId: "lot-1", lotNumber: "1", vote: "FOR", byProxy: true, source: "CHAIR" },
      ]);
    }
  });
});

describe("an ordinary resolution", () => {
  it("is a majority of the votes cast, one vote per lot, without a poll", () => {
    const r = count("ORDINARY", votes([1, 2, 3], [4, 8], [5]));
    expect(counted(r).tally).toEqual({ forCount: 3, againstCount: 2, abstainCount: 1, totalLots: 8 });
    expect(decide("ORDINARY", r).outcome).toBe("RESOLVED");
  });

  it("on a poll is decided by contribution schedule lot entitlement (Act s 110(3))", () => {
    // 3 lots for (30), 2 against (lot 4 and lot 8: 40). Carried on the count, lost on the poll.
    const r = count("ORDINARY", votes([1, 2, 3], [4, 8]), { poll: true });
    expect(counted(r).tally).toMatchObject({ forCount: 3, againstCount: 2, poll: true, forUE: 30, againstUE: 40 });
    const outcome = decide("ORDINARY", r, "MOTION_LOST");
    expect(outcome.outcome).toBe("MOTION_LOST");
    expect(outcome.evaluation?.reason).toBe("Not carried by unit entitlement on a poll");
  });

  it("takes a poll only on an ordinary resolution", () => {
    for (const c of ["SPECIAL", "WITHOUT_DISSENT", "MAJORITY", null]) {
      expect(count(c, votes([1], []), { poll: true })).toEqual({ ok: false, error: "A poll can be taken only on an ordinary resolution." });
    }
  });

  it("fails closed on a poll when a lot that voted has no contribution schedule lot entitlement", () => {
    const lots = LOTS.map((l) => (l.id === "lot-2" ? { ...l, entitlement: 0 } : l));
    expect(count("ORDINARY", votes([1, 2], [3]), { poll: true, lots })).toEqual({
      ok: false,
      error: "The votes cannot be counted. Lot 2 has no contribution schedule lot entitlement recorded. Enter it before this can be worked out.",
    });
    // Without a poll the entitlement is not needed.
    expect(count("ORDINARY", votes([1, 2], [3]), { lots }).ok).toBe(true);
  });
});

describe("missing entitlements and lots fail closed", () => {
  it("refuses a special resolution when any lot, voting or not, has no contribution schedule lot entitlement", () => {
    const lots = LOTS.map((l) => (l.id === "lot-5" ? { ...l, entitlement: null } : l));
    expect(count("SPECIAL", votes([1, 2, 3], []), { lots })).toEqual({
      ok: false,
      error: "The votes cannot be counted. Lot 5 has no contribution schedule lot entitlement recorded. Enter it before this can be worked out.",
    });
  });

  it("refuses a special or majority resolution when the lots entered differ from the building's number of lots", () => {
    for (const c of ["SPECIAL", "MAJORITY"]) {
      expect(count(c, votes([1], []), { recordedLotCount: 9 })).toEqual({
        ok: false,
        error: "The building records 9 lots but 8 are entered, so this resolution cannot be counted. Enter every lot, or correct the number of lots, first.",
      });
    }
    expect(count("ORDINARY", votes([1], []), { recordedLotCount: 9 }).ok).toBe(true);
  });

  it("refuses a special or majority resolution when the building's number of lots is not recorded", () => {
    for (const c of ["SPECIAL", "MAJORITY"]) {
      expect(count(c, votes([1], []), { recordedLotCount: null })).toEqual({
        ok: false,
        error: "The building's number of lots is not recorded, so this resolution cannot be counted. Record it in the building's details first.",
      });
    }
    expect(count("ORDINARY", votes([1], []), { recordedLotCount: null }).ok).toBe(true);
  });

  it("refuses a category the building does not use", () => {
    expect(count("UNANIMOUS", votes([1], []))).toEqual({
      ok: false,
      error: "This item's resolution type is not one this building uses, so its votes cannot be counted.",
    });
  });
});

describe("one vote per lot", () => {
  it("refuses a lot recorded twice", () => {
    expect(count("ORDINARY", [vote(1, "FOR"), vote(1, "AGAINST")])).toEqual({
      ok: false,
      error: "Lot 1 has more than one vote recorded. Each lot has one vote.",
    });
  });

  it("adds formal online votes and refuses the chair recording a lot that voted online", () => {
    const onlineVotes = [
      { lotId: "lot-1", voteValue: "FOR", isInformal: false },
      { lotId: "lot-2", voteValue: "SPOILT", isInformal: true },
    ];
    const ok = counted(count("ORDINARY", [vote(3, "AGAINST")], { onlineVotes }));
    expect(ok.counted.map((v) => [v.lotNumber, v.vote, v.source])).toEqual([
      ["1", "FOR", "ONLINE"],
      ["3", "AGAINST", "CHAIR"],
    ]);
    expect(count("ORDINARY", [vote(1, "AGAINST")], { onlineVotes })).toEqual({
      ok: false,
      error: "Lot 1 has already voted online, so its vote cannot be recorded again.",
    });
  });

  it("refuses a vote for a lot not in the building", () => {
    expect(count("ORDINARY", [{ lotId: "elsewhere", vote: "FOR", byProxy: false }])).toEqual({
      ok: false,
      error: "A vote is for a lot that is not in this building.",
    });
  });
});

describe("a debtor's vote the chair records (SM s 102(2))", () => {
  const owing = { owingLotIds: new Set(["lot-2"]) };

  it("is not counted on an ordinary, special or majority resolution", () => {
    for (const c of ["ORDINARY", "SPECIAL", "MAJORITY"]) {
      const r = counted(count(c, votes([1, 2], []), owing));
      expect(r.counted.map((v) => v.lotId)).toEqual(["lot-1"]);
      expect(r.notCounted.map((v) => v.lotId)).toEqual(["lot-2"]);
      expect(r.tally?.forCount).toBe(1);
    }
  });

  it("is counted on a resolution without dissent", () => {
    const r = counted(count("WITHOUT_DISSENT", votes([1], [2]), owing));
    expect(r.notCounted).toEqual([]);
    expect(r.tally).toMatchObject({ forCount: 1, againstCount: 1 });
    expect(decide("WITHOUT_DISSENT", count("WITHOUT_DISSENT", votes([1], [2]), owing), "MOTION_LOST").outcome).toBe("MOTION_LOST");
  });

  it("is counted on an item with no category, such as the committee election, which keeps the chair's outcome", () => {
    for (const c of [null, ""]) {
      const r = counted(count(c, votes([1, 2], []), owing));
      expect(r.notCounted).toEqual([]);
      expect(r.counted.map((v) => v.lotId)).toEqual(["lot-1", "lot-2"]);
      expect(r.tally).toBeNull();
    }
    expect(resolveOutcome(QLD, { requestedOutcome: "RESOLVED", resolutionCategory: null, tally: null }).outcome).toBe("RESOLVED");
  });

  it("is named to the chair in plain words", () => {
    const one = counted(count("ORDINARY", votes([2], []), owing)).notCounted;
    expect(notCountedNotice(one, "body corporate")).toBe(
      "Not counted: lot 2 owes the body corporate an overdue amount, so its vote on this motion cannot count.",
    );
    const two = counted(count("ORDINARY", votes([2, 3], []), { owingLotIds: new Set(["lot-2", "lot-3"]) })).notCounted;
    const text = notCountedNotice(two, "body corporate");
    expect(text).toBe("Not counted: lots 2 and 3 owe the body corporate an overdue amount, so their votes on this motion cannot count.");
    expect(text).not.toMatch(/[;–—]/);
    expect(notCountedNotice([], "body corporate")).toBeNull();
  });
});

describe("when the chair's outcome disagrees with the count", () => {
  it("is refused with what the count gives", () => {
    const result = decide("SPECIAL", count("SPECIAL", votes([3, 4, 5], [1, 2])), "RESOLVED");
    const text = outcomeDisagreement("RESOLVED", result);
    expect(text).toBe(
      "The votes recorded show the motion is lost, not resolved. Votes for are less than 66.7% of the votes cast. Nothing was saved. Check the votes entered, or record the outcome the count gives.",
    );
    expect(text).not.toMatch(/[;–—]/);
  });

  it("is refused the other way too", () => {
    const result = decide("ORDINARY", count("ORDINARY", votes([1, 2], [3])), "MOTION_LOST");
    expect(outcomeDisagreement("MOTION_LOST", result)).toMatch(/^The votes recorded show the motion is carried, not lost\. Majority of votes cast\./);
  });

  it("goes ahead when they agree, or when nothing was counted", () => {
    const agrees = decide("ORDINARY", count("ORDINARY", votes([1, 2], [3])), "RESOLVED");
    expect(outcomeDisagreement("RESOLVED", agrees)).toBeNull();
    expect(outcomeDisagreement("RESOLVED", resolveOutcome(QLD, { requestedOutcome: "RESOLVED", resolutionCategory: null }))).toBeNull();
  });
});

describe("the chair's votes from the browser", () => {
  it("are read when well formed", () => {
    expect(parseChairVotes(undefined, 8)).toEqual([]);
    expect(parseChairVotes([{ lotId: "a", vote: "FOR" }, { lotId: "b", vote: "AGAINST", byProxy: true }], 2)).toEqual([
      { lotId: "a", vote: "FOR", byProxy: false },
      { lotId: "b", vote: "AGAINST", byProxy: true },
    ]);
  });

  it("are refused otherwise", () => {
    for (const bad of ["FOR", [{ lotId: "a", vote: "YES" }], [{ lotId: "", vote: "FOR" }], [{ lotId: "a", vote: "FOR", byProxy: "yes" }], [null]]) {
      expect(parseChairVotes(bad, 8)).toBeNull();
    }
  });

  it("are bounded by the building's number of lots, not a fixed limit", () => {
    const many = Array.from({ length: 6000 }, (_, i) => ({ lotId: `lot-${i}`, vote: "FOR" }));
    expect(parseChairVotes(many, 6000)).toHaveLength(6000);
    expect(parseChairVotes(many, 5999)).toBeNull();
  });
});

describe("the conduct screen's voting view", () => {
  const items = [
    { id: "i1", resolutionCategory: "ORDINARY" },
    { id: "i2", resolutionCategory: "MAJORITY" },
    { id: "i3", resolutionCategory: null },
  ];

  it("is null for NSW", () => {
    expect(conductVotingView(NSW_RULE_SET, statutoryRulesFor("NSW"), LOTS, items, "AGM")).toBeNull();
  });

  it("is null for a Queensland committee meeting, whose members vote", () => {
    expect(conductVotingView(QLD, QLD_RULES, LOTS, items, "COMMITTEE")).toBeNull();
    expect(conductVotingView(QLD, QLD_RULES, LOTS, items, "committee")).toBeNull();
    for (const t of ["AGM", "EGM", "FIRST_AGM", "SGM"]) expect(conductVotingView(QLD, QLD_RULES, LOTS, items, t)).not.toBeNull();
  });

  it("lists every lot in lot number order, with each item's poll and proxy choices", () => {
    const view = conductVotingView(QLD, QLD_RULES, [...LOTS].reverse().concat([{ id: "lot-10", lotNumber: "10", entitlement: 1 }]), items, "AGM")!;
    expect(view.lots.map((l) => l.lotNumber)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "10"]);
    expect(view.items).toEqual({
      i1: { pollAllowed: true, proxiesAllowed: true },
      i2: { pollAllowed: false, proxiesAllowed: false },
      i3: { pollAllowed: false, proxiesAllowed: true },
    });
    expect(view.pollLabel).toBe("Poll asked for, counted by contribution schedule lot entitlement");
  });
});
