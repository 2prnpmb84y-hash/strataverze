/**
 * NSW and Queensland resolutions, golden (VIC, ACT and WA stage 2, PR 8a-i,
 * 28 Oct 2026). Recorded on origin/main (1080f07) in a temporary worktree,
 * before the resolution bases and categories of the draft Victorian, ACT and
 * WA packs were added to the shared evaluator and to the count at conduct.
 * NSW and Queensland must give exactly the same results, reasons, tallies,
 * refusals and rule sets after that change. Never regenerate these snapshots
 * to make a change pass: a difference is a change to NSW or Queensland.
 *
 * One deliberate change (29 Oct 2026, approved by Matthew Wrigley): the
 * Queensland pack 2026.10.20 leaves common property rows out of the count at
 * conduct (excludeCommonPropertyRows), fixing the latent point recorded by
 * LOTS_WITH_COMMON below. Only the entries holding a common property row were
 * updated, by a targeted run of the four tests concerned, not regenerated:
 * the Queensland commonProperty, commonPropertyEightLots,
 * commonPropertyNoEntitlement and commonPropertyPoll counts on ORDINARY,
 * SPECIAL, WITHOUT_DISSENT and MAJORITY (and their notice and outcome
 * entries, added or removed as the count now succeeds or refuses), the
 * Queensland general meeting voting views (no CP lot), and the Queensland
 * rule sets (which now hold excludeCommonPropertyRows: true). Every NSW entry
 * and every Queensland entry without a common property row is byte-identical.
 *
 * Covered: evaluateResolution over every NSW and Queensland category and a
 * grid of tallies (two thirds exactly, the 25% caps, missing totals, polls,
 * an unknown category); resolveOutcome; the count at conduct
 * (buildConductTally over the Queensland fixtures, which buildings and
 * meetings are counted, the voting view, the written votes refusal, the
 * disagreement and the votes not counted); the debtor rules, pure and read
 * from the database; the agenda categories; and the rule set a building is
 * given, from the seed or a stored row.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));

import { MEETING_RULES as NSW_RULE_SET, QLD_RULE_PACK, statutoryRulesFor, type StatutoryRules } from "@/config/statutory";
import { sharedFake } from "@/test/fake-orm";
import { evaluateResolution, snapshotRuleSet, type MeetingRuleSet, type ResolutionCategory, type ResolutionTally } from "./rules";
import { OUTCOMES, resolveOutcome, type Outcome } from "./conduct";
import {
  buildConductTally,
  conductVotingView,
  countsVotesAtConduct,
  countsVotesAtMeeting,
  isCommitteeMeeting,
  notCountedNotice,
  outcomeDisagreement,
  parseChairVotes,
  writtenVotesRefusal,
  type ChairVote,
  type OnlineVote,
  type TallyLot,
} from "./conduct-tally";
import { checksDebtorVotes, debtorBarsLot, debtorVoteRefusal } from "./debtor-voting";
import { debtorVoteCheck, debtorVoteProblem } from "./debtor-voting-repo";
import { allowedCategoriesForMeetingType, canAddCategoryToMeetingType, validateAgendaItem } from "./agenda";
import { getActiveRuleSet } from "./rule-set-repo";
import { tallyElectronicVotes } from "./evoting";
import { minutesDistributionDeadline, retentionUntil } from "./minutes";

const QLD_RULES = QLD_RULE_PACK.rules as unknown as StatutoryRules;
const NSW_RULES = statutoryRulesFor("NSW");
const QLD = QLD_RULES.MEETING_RULES;
const RULE_SETS: [string, MeetingRuleSet, Pick<StatutoryRules, "ENTITLEMENT_SCHEDULES">][] = [
  ["NSW", NSW_RULE_SET, NSW_RULES],
  ["QLD", QLD, QLD_RULES],
];

const CATEGORIES = [
  ...new Set([...Object.keys(NSW_RULE_SET.resolutionCategories), ...Object.keys(QLD.resolutionCategories)]),
  "BOGUS",
] as ResolutionCategory[];
const ITEM_CATEGORIES: (string | null | undefined)[] = [...CATEGORIES, null, undefined, "", "  "];
const MEETING_TYPES: (string | null | undefined)[] = ["AGM", "EGM", "SGM", "FIRST_AGM", "COMMITTEE", " Committee ", "committee", "UNKNOWN", null, undefined];

/** Tallies with the keys a tally has today: counts, entitlements, a poll and the scheme's totals. */
const TALLIES: Record<string, ResolutionTally> = {
  clearFor: { forCount: 10, againstCount: 2, forUE: 900, againstUE: 100 },
  tied: { forCount: 5, againstCount: 5, forUE: 500, againstUE: 500 },
  tiedNoUE: { forCount: 5, againstCount: 5 },
  quarterAgainst: { forCount: 6, againstCount: 4, forUE: 750, againstUE: 250 },
  justUnderQuarter: { forCount: 6, againstCount: 4, forUE: 751, againstUE: 249 },
  halfAgainst: { forCount: 3, againstCount: 7, forUE: 500, againstUE: 500 },
  pollReverses: { forCount: 7, againstCount: 3, forUE: 300, againstUE: 700, poll: true },
  pollCarries: { forCount: 3, againstCount: 7, forUE: 700, againstUE: 300, poll: true },
  pollTied: { forCount: 3, againstCount: 3, forUE: 300, againstUE: 300, poll: true },
  pollNoUE: { forCount: 7, againstCount: 3, poll: true },
  noneAgainst: { forCount: 4, againstCount: 0, forUE: 400, againstUE: 0 },
  noneAgainstNoneFor: { forCount: 0, againstCount: 0, abstainCount: 3 },
  noUE: { forCount: 8, againstCount: 1 },
  noVotes: { forCount: 0, againstCount: 0, forUE: 0, againstUE: 0 },
  twoThirdsExact: { forCount: 4, againstCount: 2, abstainCount: 1, forUE: 40, againstUE: 20, totalLots: 8, totalEntitlement: 100 },
  justUnderTwoThirds: { forCount: 3, againstCount: 2, forUE: 30, againstUE: 20, totalLots: 8, totalEntitlement: 100 },
  lotsCapExact: { forCount: 6, againstCount: 2, forUE: 80, againstUE: 20, totalLots: 8, totalEntitlement: 100 },
  lotsCapOver: { forCount: 8, againstCount: 4, forUE: 160, againstUE: 4, totalLots: 12, totalEntitlement: 164 },
  entitlementCapExact: { forCount: 6, againstCount: 1, forUE: 60, againstUE: 25, totalLots: 8, totalEntitlement: 100 },
  entitlementCapOver: { forCount: 6, againstCount: 1, forUE: 60, againstUE: 26, totalLots: 8, totalEntitlement: 100 },
  thirdsFloat: { forCount: 6, againstCount: 3, forUE: 600, againstUE: 300, totalLots: 12, totalEntitlement: 1200 },
  noTotalLots: { forCount: 6, againstCount: 1, forUE: 60, againstUE: 10, totalEntitlement: 100 },
  noTotalEntitlement: { forCount: 6, againstCount: 1, forUE: 60, againstUE: 10, totalLots: 8 },
  noAgainstUE: { forCount: 6, againstCount: 1, totalLots: 8, totalEntitlement: 100 },
  noVotesWithTotals: { forCount: 0, againstCount: 0, forUE: 0, againstUE: 0, totalLots: 8, totalEntitlement: 100 },
  allFor: { forCount: 8, againstCount: 0, forUE: 100, againstUE: 0, totalLots: 8, totalEntitlement: 100, eligibleLots: 8 },
  eligibleHalf: { forCount: 4, againstCount: 0, totalLots: 8, eligibleLots: 8 },
  eligibleOverHalf: { forCount: 5, againstCount: 1, totalLots: 8, eligibleLots: 8 },
  eligibleDebtors: { forCount: 4, againstCount: 0, totalLots: 8, eligibleLots: 7 },
  eligibleMissing: { forCount: 5, againstCount: 0, totalLots: 8 },
  eligibleZero: { forCount: 0, againstCount: 0, eligibleLots: 0 },
};

// Eight lots: lots 1 to 7 hold 10 each and lot 8 holds 30 (100 in all), as conduct-tally.qld.test.ts.
const LOTS: TallyLot[] = Array.from({ length: 8 }, (_, i) => ({
  id: `lot-${i + 1}`,
  lotNumber: String(i + 1),
  entitlement: i === 7 ? 30 : 10,
  interestScheduleEntitlement: 5,
}));
// The same building with a common property row entered as a lot (the latent Queensland point: it was counted as a lot
// until pack 2026.10.20, 29 Oct 2026; Queensland now leaves it out, NSW is not counted at conduct).
const LOTS_WITH_COMMON = [...LOTS, { id: "cp", lotNumber: "CP", entitlement: 0, lotType: "COMMON" }] as TallyLot[];
const LOTS_WITH_COMMON_NO_ENTITLEMENT = [...LOTS, { id: "cp", lotNumber: "CP", entitlement: null, lotType: "COMMON" }] as TallyLot[];

const vote = (n: number, v: ChairVote["vote"], byProxy = false): ChairVote => ({ lotId: `lot-${n}`, vote: v, byProxy });
const votes = (forLots: number[], againstLots: number[], abstain: number[] = []) => [
  ...forLots.map((n) => vote(n, "FOR")),
  ...againstLots.map((n) => vote(n, "AGAINST")),
  ...abstain.map((n) => vote(n, "ABSTAIN")),
];

interface Scenario {
  chairVotes: ChairVote[];
  poll?: boolean;
  owing?: string[];
  recordedLotCount?: number | null;
  onlineVotes?: OnlineVote[];
  lots?: readonly TallyLot[];
}

const SCENARIOS: Record<string, Scenario> = {
  none: { chairVotes: [] },
  carried: { chairVotes: votes([3, 4, 5, 6, 7, 8], [1, 2]) },
  twoThirds: { chairVotes: votes([3, 4, 5, 6], [1, 2], [7]) },
  underTwoThirds: { chairVotes: votes([3, 4, 5], [1, 2]) },
  bigLotAgainst: { chairVotes: votes([1, 2, 3, 4, 5, 6], [8]) },
  tied: { chairVotes: votes([1, 2], [3, 4]) },
  allFor: { chairVotes: votes([1, 2, 3, 4, 5, 6, 7, 8], []) },
  noneAgainst: { chairVotes: votes([1, 2, 3], [], [4]) },
  halfFor: { chairVotes: votes([1, 2, 3, 4], []) },
  proxies: { chairVotes: [vote(1, "FOR", true), vote(2, "AGAINST", true), vote(3, "FOR")] },
  poll: { chairVotes: votes([1, 2, 3], [4, 8]), poll: true },
  pollCarried: { chairVotes: votes([1, 8], [2, 3, 4]), poll: true },
  owingFor: { chairVotes: votes([1, 2], [3]), owing: ["lot-2"] },
  owingAgainst: { chairVotes: votes([1, 2, 3, 4, 5, 6], [8]), owing: ["lot-8"] },
  owingMany: { chairVotes: votes([1, 2, 3, 4, 5], []), owing: ["lot-1", "lot-2", "lot-7"] },
  owingNotVoting: { chairVotes: votes([1, 3, 4, 5, 6], []), owing: ["lot-2"] },
  online: {
    chairVotes: [vote(3, "AGAINST")],
    onlineVotes: [
      { lotId: "lot-1", voteValue: "FOR", isInformal: false },
      { lotId: "lot-2", voteValue: "SPOILT", isInformal: true },
      { lotId: "lot-4", voteValue: "MAYBE", isInformal: false },
      { lotId: null, voteValue: "FOR", isInformal: false },
      { lotId: "lot-5", voteValue: "ABSTAIN", isInformal: false },
    ],
  },
  onlineOwing: { chairVotes: [], onlineVotes: [{ lotId: "lot-2", voteValue: "FOR", isInformal: false }], owing: ["lot-2"] },
  onlineThenChair: { chairVotes: [vote(1, "AGAINST")], onlineVotes: [{ lotId: "lot-1", voteValue: "FOR", isInformal: false }] },
  onlineTwice: {
    chairVotes: [],
    onlineVotes: [
      { lotId: "lot-1", voteValue: "FOR", isInformal: false },
      { lotId: "lot-1", voteValue: "AGAINST", isInformal: false },
    ],
  },
  onlineElsewhere: { chairVotes: [], onlineVotes: [{ lotId: "elsewhere", voteValue: "FOR", isInformal: false }] },
  chairTwice: { chairVotes: [vote(1, "FOR"), vote(1, "AGAINST")] },
  chairElsewhere: { chairVotes: [{ lotId: "elsewhere", vote: "FOR", byProxy: false }] },
  lotCountDiffers: { chairVotes: votes([1], []), recordedLotCount: 9 },
  lotCountMissing: { chairVotes: votes([1], []), recordedLotCount: null },
  entitlementMissing: { chairVotes: votes([1, 2, 3], []), lots: LOTS.map((l) => (l.id === "lot-5" ? { ...l, entitlement: null } : l)) },
  entitlementZeroPoll: { chairVotes: votes([1, 2], [3]), poll: true, lots: LOTS.map((l) => (l.id === "lot-2" ? { ...l, entitlement: 0 } : l)) },
  commonProperty: { chairVotes: votes([1, 2, 3, 4, 5, 6], [7]), lots: LOTS_WITH_COMMON, recordedLotCount: 9 },
  commonPropertyEightLots: { chairVotes: votes([1, 2, 3, 4, 5], []), lots: LOTS_WITH_COMMON, recordedLotCount: 8 },
  commonPropertyNoEntitlement: { chairVotes: votes([1, 2, 3, 4, 5, 6], [7]), lots: LOTS_WITH_COMMON_NO_ENTITLEMENT, recordedLotCount: 9 },
  commonPropertyPoll: { chairVotes: votes([1, 2], [3]), poll: true, lots: LOTS_WITH_COMMON, recordedLotCount: 9 },
};

function count(ruleSet: MeetingRuleSet, rules: Pick<StatutoryRules, "ENTITLEMENT_SCHEDULES">, category: string | null | undefined, s: Scenario) {
  return buildConductTally({
    ruleSet,
    rules,
    category,
    lots: s.lots ?? LOTS,
    recordedLotCount: s.recordedLotCount === undefined ? 8 : s.recordedLotCount,
    onlineVotes: s.onlineVotes ?? [],
    chairVotes: s.chairVotes,
    poll: s.poll ?? false,
    owingLotIds: new Set(s.owing ?? []),
  });
}

describe("evaluateResolution (golden)", () => {
  it("gives the same result and reason for every NSW and Queensland category and tally", () => {
    const out: Record<string, unknown> = {};
    for (const [state, ruleSet] of RULE_SETS) {
      for (const c of CATEGORIES) {
        for (const [k, t] of Object.entries(TALLIES)) {
          out[`${state}/${c}/${k}`] = evaluateResolution(ruleSet, c, t);
          if (t.poll) out[`${state}/${c}/${k}/named`] = evaluateResolution(ruleSet, c, t, "contribution schedule lot entitlement");
        }
      }
    }
    expect(out).toMatchSnapshot();
  });

  it("does not change the tally it is given", () => {
    for (const [, ruleSet] of RULE_SETS) {
      for (const c of CATEGORIES) {
        for (const t of Object.values(TALLIES)) {
          const copy = JSON.parse(JSON.stringify(t));
          evaluateResolution(ruleSet, c, t);
          expect(t).toEqual(copy);
        }
      }
    }
  });
});

describe("resolveOutcome (golden)", () => {
  it("gives the same outcome, status and evaluation", () => {
    const tallies: Record<string, ResolutionTally | null | undefined> = {
      none: undefined,
      null: null,
      clearFor: TALLIES.clearFor,
      tied: TALLIES.tied,
      twoThirdsExact: TALLIES.twoThirdsExact,
      lotsCapOver: TALLIES.lotsCapOver,
      eligibleOverHalf: TALLIES.eligibleOverHalf,
      pollReverses: TALLIES.pollReverses,
      noVotes: TALLIES.noVotes,
    };
    const out: Record<string, unknown> = {};
    for (const [state, ruleSet] of RULE_SETS) {
      for (const c of ITEM_CATEGORIES) {
        for (const requested of OUTCOMES) {
          for (const [k, tally] of Object.entries(tallies)) {
            out[`${state}/${String(c)}/${requested}/${k}`] = resolveOutcome(ruleSet, { requestedOutcome: requested, resolutionCategory: c, tally });
          }
          out[`${state}/${String(c)}/${requested}/poll-named`] = resolveOutcome(ruleSet, {
            requestedOutcome: requested,
            resolutionCategory: c,
            tally: TALLIES.pollReverses,
            pollEntitlement: "contribution schedule lot entitlement",
          });
        }
      }
    }
    expect(out).toMatchSnapshot();
  });
});

describe("the count at conduct (golden)", () => {
  it("counts the same buildings and meetings", () => {
    const out: Record<string, unknown> = {};
    for (const [state, ruleSet] of RULE_SETS) {
      out[`${state}/conduct`] = countsVotesAtConduct(ruleSet);
      for (const t of MEETING_TYPES) out[`${state}/${String(t)}`] = countsVotesAtMeeting(ruleSet, t);
    }
    for (const t of MEETING_TYPES) out[`committee/${String(t)}`] = isCommitteeMeeting(t);
    expect(out).toMatchSnapshot();
  });

  it("builds the same tally, or refuses with the same words, for every category and scenario", () => {
    const out: Record<string, unknown> = {};
    for (const [state, ruleSet, rules] of RULE_SETS) {
      for (const c of ITEM_CATEGORIES) {
        for (const [k, s] of Object.entries(SCENARIOS)) {
          const result = count(ruleSet, rules, c, s);
          // Each vote on one line (lossless: every field of the vote, in order).
          out[`${state}/${String(c)}/${k}`] = result.ok
            ? {
                ok: true,
                tally: result.value.tally,
                counted: result.value.counted.map((v) => JSON.stringify(v)),
                notCounted: result.value.notCounted.map((v) => JSON.stringify(v)),
              }
            : result;
          if (result.ok) {
            out[`${state}/${String(c)}/${k}/notice`] = notCountedNotice(result.value.notCounted, rules === QLD_RULES ? "body corporate" : "owners corporation");
            for (const requested of ["RESOLVED", "MOTION_LOST"] as const) {
              const decided = resolveOutcome(ruleSet, { requestedOutcome: requested, resolutionCategory: c, tally: result.value.tally });
              out[`${state}/${String(c)}/${k}/${requested}`] = { decided, disagreement: outcomeDisagreement(requested, decided) };
            }
          }
        }
      }
    }
    expect(out).toMatchSnapshot();
  });

  it("refuses the same outcomes for written votes", () => {
    const out: Record<string, unknown> = {};
    for (const [state, ruleSet] of RULE_SETS) {
      for (const c of ITEM_CATEGORIES) {
        for (const requested of OUTCOMES) out[`${state}/${String(c)}/${requested}`] = writtenVotesRefusal(ruleSet, c, requested as Outcome);
      }
    }
    expect(out).toMatchSnapshot();
  });

  it("gives the same voting view", () => {
    const items = ITEM_CATEGORIES.filter((c) => c !== undefined).map((c, i) => ({ id: `i${i}`, resolutionCategory: c as string | null }));
    const out: Record<string, unknown> = {};
    for (const [state, ruleSet, rules] of RULE_SETS) {
      for (const t of MEETING_TYPES) {
        out[`${state}/${String(t)}`] = conductVotingView(ruleSet, rules, [...LOTS_WITH_COMMON].reverse(), items, t);
      }
    }
    expect(out).toMatchSnapshot();
  });

  it("reads the chair's votes the same way", () => {
    const inputs: unknown[] = [
      undefined,
      null,
      [],
      "FOR",
      [{ lotId: "a", vote: "FOR" }, { lotId: "b", vote: "AGAINST", byProxy: true }, { lotId: "c", vote: "ABSTAIN", byProxy: false }],
      [{ lotId: "a", vote: "YES" }],
      [{ lotId: "", vote: "FOR" }],
      [{ lotId: "a", vote: "FOR", byProxy: "yes" }],
      [null],
      [{ lotId: "a", vote: "FOR" }, { lotId: "b", vote: "FOR" }, { lotId: "c", vote: "FOR" }],
    ];
    expect(inputs.map((i) => parseChairVotes(i, 2))).toMatchSnapshot();
  });

  it("tallies the same online votes", () => {
    const sets = [
      [],
      [
        { voteValue: "FOR", unitEntitlement: 10, isInformal: false },
        { voteValue: "AGAINST", unitEntitlement: 30, isInformal: false },
        { voteValue: "ABSTAIN", unitEntitlement: 5, isInformal: false },
        { voteValue: "FOR", unitEntitlement: 7, isInformal: true },
        { voteValue: "SPOILT", unitEntitlement: 3, isInformal: false },
      ],
    ];
    expect(sets.map((s) => tallyElectronicVotes(s))).toMatchSnapshot();
  });
});

describe("debtor voting (golden)", () => {
  it("bars and refuses the same votes", () => {
    const out: Record<string, unknown> = {};
    for (const [state, ruleSet] of RULE_SETS) {
      out[`${state}/checks`] = checksDebtorVotes(ruleSet);
      for (const c of ITEM_CATEGORIES) {
        for (const owes of [true, false]) out[`${state}/${String(c)}/${owes}`] = debtorVoteRefusal(ruleSet, c, owes, "body corporate");
        out[`${state}/${String(c)}/bars`] = [debtorBarsLot(ruleSet, c, "lot-1", new Set(["lot-1"])), debtorBarsLot(ruleSet, c, "lot-2", new Set(["lot-1"]))];
      }
    }
    expect(out).toMatchSnapshot();
  });

  it("checks the same lots against the database", async () => {
    const notices = [
      { id: "n1", schemeId: "qld", lotId: "lot-1", status: "ISSUED", dueDate: "2020-01-01", balanceOutstanding: "120.00", amountDue: "120.00", amountPaid: "0" },
      { id: "n2", schemeId: "qld", lotId: "lot-2", status: "PAID", dueDate: "2020-01-01", balanceOutstanding: "0", amountDue: "50.00", amountPaid: "50.00" },
      { id: "n3", schemeId: "qld", lotId: "lot-3", status: "ISSUED", dueDate: "2026-11-20", balanceOutstanding: "80.00", amountDue: "80.00", amountPaid: "0" },
      { id: "n4", schemeId: "nsw", lotId: "lot-9", status: "ISSUED", dueDate: "2020-01-01", balanceOutstanding: "120.00", amountDue: "120.00", amountPaid: "0" },
    ];
    const out: Record<string, unknown> = {};
    for (const schemeId of ["qld", "nsw", "missing"]) {
      for (const c of ITEM_CATEGORIES) {
        for (const lotIds of [[], ["lot-1"], ["lot-1", "lot-2"], ["lot-3"], ["lot-9"]]) {
          for (const meetingAt of [undefined, "2026-11-20T09:00:00.000Z", "2026-11-20T14:30:00.000Z"]) {
            sharedFake.reset({
              Scheme: [
                { id: "qld", state: "QLD", timeZone: "Australia/Brisbane" },
                { id: "nsw", state: "NSW", timeZone: "Australia/Sydney" },
              ],
              LevyNotice: notices,
            });
            const key = `${schemeId}/${String(c)}/${lotIds.join("+")}/${String(meetingAt)}`;
            if (meetingAt === undefined && lotIds.includes("lot-3")) continue; // today's date would decide
            out[key] = {
              check: await debtorVoteCheck({ schemeId, lotIds, category: c, meetingAt }),
              problem: await debtorVoteProblem({ schemeId, lotIds, category: c, meetingAt }),
            };
          }
        }
      }
    }
    expect(out).toMatchSnapshot();
  });
});

describe("agenda categories (golden)", () => {
  it("allows and refuses the same categories on each meeting type", () => {
    const out: Record<string, unknown> = {};
    for (const [state, ruleSet] of RULE_SETS) {
      for (const t of MEETING_TYPES.filter((m): m is string => typeof m === "string")) {
        out[`${state}/${t}/allowed`] = allowedCategoriesForMeetingType(ruleSet, t);
        for (const c of ITEM_CATEGORIES) {
          out[`${state}/${t}/${String(c)}`] = {
            can: typeof c === "string" ? canAddCategoryToMeetingType(ruleSet, t, c) : null,
            errors: validateAgendaItem({ title: "Item", resolutionCategory: c }, t, ruleSet),
            noTitle: validateAgendaItem({ title: " ", resolutionCategory: c }, t, ruleSet),
          };
        }
      }
    }
    expect(out).toMatchSnapshot();
  });
});

describe("the rule set a building is given (golden)", () => {
  beforeEach(() => sharedFake.reset({}));

  it("is the seed when no row is stored, and the same snapshot is stored", async () => {
    const out: Record<string, unknown> = {};
    for (const state of ["NSW", "QLD", " qld ", "nsw"]) {
      const ruleSet = await getActiveRuleSet(state);
      out[state] = ruleSet;
      out[`${state}/snapshot`] = snapshotRuleSet(ruleSet);
    }
    expect(out).toMatchSnapshot();
  });

  it("comes from the stored row with the seed's lists, as before", async () => {
    sharedFake.reset({
      MeetingRuleSet: [
        {
          id: "r1",
          state: "NSW",
          isActive: true,
          version: "NSW-2026.1",
          effectiveFrom: "2026-07-01T00:00:00.000Z",
          noticePeriods: { AGM: 14, EGM: 7, COMMITTEE: 3, FIRST_AGM: 14 },
          minutesDeadlines: { AGM: 7, EGM: 7, COMMITTEE: 7, FIRST_AGM: 7 },
          quorumRules: NSW_RULE_SET.quorumRules,
          resolutionCategories: NSW_RULE_SET.resolutionCategories,
          retention: NSW_RULE_SET.retention,
          preMeetingEvoting: null,
          notes: null,
        },
        {
          id: "r2",
          state: "QLD",
          isActive: true,
          version: "QLD-2026.1",
          effectiveFrom: "2026-10-28",
          noticePeriods: QLD.noticePeriods,
          minutesDeadlines: QLD.minutesDeadlines,
          quorumRules: QLD.quorumRules,
          resolutionCategories: QLD.resolutionCategories,
          retention: null,
          preMeetingEvoting: { ballotOpenDaysBefore: 7, ballotCloseHoursBefore: { AGM: 24 } },
          notes: "stored",
        },
      ],
    });
    const out: Record<string, unknown> = {};
    for (const state of ["NSW", "QLD"]) out[state] = await getActiveRuleSet(state);
    expect(out).toMatchSnapshot();
  });

  it("refuses a state with no live pack, as before", async () => {
    const out: Record<string, unknown> = {};
    for (const state of ["VIC", "ACT", "WA", "", "XX"]) {
      out[state] = await getActiveRuleSet(state).then(
        () => "given",
        (e: Error) => `${e.name}: ${e.message}`,
      );
    }
    expect(out).toMatchSnapshot();
  });

  it("dates the minutes and the retention the same way", () => {
    const from = new Date("2026-11-20T09:00:00.000Z");
    const out: Record<string, unknown> = {};
    for (const [state, ruleSet] of RULE_SETS) {
      out[`${state}/retention`] = retentionUntil(ruleSet, from)?.toISOString() ?? null;
      for (const t of ["AGM", "EGM", "COMMITTEE", "FIRST_AGM"] as const) {
        out[`${state}/${t}`] = minutesDistributionDeadline(ruleSet, t, from)?.toISOString() ?? null;
      }
    }
    expect(out).toMatchSnapshot();
  });
});
