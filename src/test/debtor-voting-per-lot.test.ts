/**
 * Money owed is judged lot by lot when an owner of several lots votes
 * (Queensland SM s 102(2): a lot owing the body corporate money cannot vote,
 * except as the pack allows). Both ways a vote reaches the count are run with
 * the real checks over a small in-memory store:
 * - the owner's own vote online (the ballot and the motions list), and
 * - the votes the chair records at the meeting, with the online votes added
 *   (conductVotingData and buildConductTally).
 * A lot that owes is barred, the same owner's lots that owe nothing still
 * vote, debts are judged on the meeting's date in both paths, a changed vote
 * replaces the owner's earlier votes, and a co-owner's vote on a shared lot is
 * kept.
 *
 * NSW records no debtor voting rule, so an NSW owner of several lots votes
 * exactly as before: nothing is refused, no levy notice is read, and the
 * ballot vote is saved to the owner's first lot (these cases also pass on the
 * code before the change).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
type Pred = (row: Row) => boolean;

const tables: Record<string, Row[]> = {};
const reads: Record<string, number> = {};

// A field of the where callback: each operator gives a test on a row.
const field = (name: string) => ({
  eq: (v: unknown): Pred => (row) => row[name] === v,
  in: (vs: readonly unknown[]): Pred => (row) => vs.includes(row[name]),
  lt: (v: unknown): Pred => (row) => String(row[name]) < String(v),
});
const fields = new Proxy({}, { get: (_t, name: string) => field(name) });

function model(name: string) {
  let pred: Pred = () => true;
  const rows = () => {
    reads[name] = (reads[name] ?? 0) + 1;
    return (tables[name] ?? []).filter(pred);
  };
  const chain: Record<string, unknown> = {
    where: (w: ((f: unknown) => Pred) | Row) => {
      pred = typeof w === "function" ? w(fields) : (row) => Object.entries(w).every(([k, v]) => row[k] === v);
      return chain;
    },
    limit: () => chain,
    orderBy: () => chain,
    include: () => chain,
    first: async () => rows()[0] ?? null,
    all: async () => rows(),
    // update() and delete() change the first matching row, as in Prisma 8.
    update: async (data: Row) => {
      const row = (tables[name] ?? []).find(pred);
      if (row) Object.assign(row, data);
      return row ?? null;
    },
    delete: async () => {
      const row = (tables[name] ?? []).find(pred);
      if (row) tables[name] = tables[name].filter((r) => r !== row);
      return row ?? null;
    },
    create: async (data: Row) => {
      const row = { id: `${name}-${++created}`, ...data };
      tables[name] = [...(tables[name] ?? []), row];
      return row;
    },
  };
  return chain;
}
let created = 0;

vi.mock("@/prisma/db", () => {
  const orm = { public: new Proxy({}, { get: (_t, name: string) => model(name) }) };
  return { db: { orm, transaction: async (fn: (tx: { orm: unknown }) => unknown) => fn({ orm }) } };
});
vi.mock("@prisma/orm-postgres/orm-client", () => ({
  and:
    (...preds: Pred[]): Pred =>
    (row) =>
      preds.every((p) => p(row)),
}));

const caller = { id: "owner-1", firstName: "Olive", lastName: "Owner", isPlatformAdmin: false };
vi.mock("@/lib/auth/require-membership", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/require-membership")>();
  return { ...actual, requireAuth: vi.fn(async () => caller) };
});
vi.mock("@/lib/auth/require-access", () => ({ requireSchemeAccess: vi.fn(async () => ({ profile: caller })) }));

const motions = vi.hoisted(() => ({
  getMotionById: vi.fn(),
  castVote: vi.fn(),
  VOTE_VALUES: ["FOR", "AGAINST", "ABSTAIN"],
}));
vi.mock("@/lib/queries/motions", () => motions);
const meetings = vi.hoisted(() => ({ getMeetingById: vi.fn() }));
vi.mock("@/lib/queries/meetings", () => meetings);
const agenda = vi.hoisted(() => ({ getAgendaItem: vi.fn() }));
vi.mock("@/lib/queries/agenda", () => agenda);
// The real ballot writes, over the store above; only reading the ballot is stubbed.
const evoting = vi.hoisted(() => ({ getBallotForMeeting: vi.fn() }));
vi.mock("@/lib/queries/evoting", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/queries/evoting")>()),
  getBallotForMeeting: evoting.getBallotForMeeting,
}));
vi.mock("@/lib/meetings/setup", () => ({
  normaliseMeetingType: (v: string) => {
    const u = (v ?? "").toUpperCase();
    return ["AGM", "EGM", "COMMITTEE", "FIRST_AGM"].includes(u) ? u : null;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// Queensland is not active yet: give it the pending pack, as it will be once it is.
vi.mock("@/config/statutory", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/config/statutory")>();
  return {
    ...actual,
    rulePackFor: (state: string) => (state === "QLD" ? actual.QLD_RULE_PACK : actual.rulePackFor(state)),
  };
});

const { MEETING_RULES: NSW_RULE_SET, QLD_RULE_PACK } = await import("@/config/statutory");
const { castBallotVoteAction, castVoteAction } = await import("@/app/(portal)/owner/(scheme)/meetings/actions");
const { conductVotingData } = await import("@/lib/meetings/conduct-tally-repo");
const { buildConductTally, countsVotesAtMeeting } = await import("@/lib/meetings/conduct-tally");

const QLD_RULES = QLD_RULE_PACK.rules;
const QLD = QLD_RULES.MEETING_RULES;

const SCHEMES = {
  QLD: { id: "scheme-qld", state: "QLD", timeZone: "Australia/Brisbane" },
  NSW: { id: "scheme-nsw", state: "NSW", timeZone: "Australia/Sydney" },
} as const;
type State = keyof typeof SCHEMES;

const lotsOf = (state: State) =>
  [1, 2].map((n) => ({ id: `${state}-lot-${n}`, schemeId: SCHEMES[state].id, lotNumber: String(n), entitlement: 10 }));

// Dates around the real today: a notice already overdue, one that falls due
// after today but before the meeting, and the meeting itself.
const dayFromNow = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const OVERDUE = "2020-01-01";
const DUE_BEFORE_MEETING = dayFromNow(10);
const MEETING_DAY = dayFromNow(30);

/**
 * The owner holds lots 1 and 2 of the building; each lot in `owing` has a
 * contribution notice unpaid, overdue now unless `dueDate` says otherwise.
 * `coOwnerVotedLot`: a co-owner of that lot has voted on the motion, and on
 * the ballot item (AGAINST).
 */
function building(
  state: State,
  owing: number[],
  opts: { category?: string | null; coOwnerVotedLot?: number; dueDate?: string; reverseMemberships?: boolean } = {},
) {
  const scheme = SCHEMES[state];
  const lots = lotsOf(state);
  const category = opts.category === undefined ? "ORDINARY" : opts.category;
  const own = lots.map((l, i) => ({ id: `m${i + 1}`, schemeId: scheme.id, profileId: caller.id, role: "OWNER", lotId: l.id, isActive: true }));
  const coOwner =
    opts.coOwnerVotedLot != null
      ? [{ id: "m-co", schemeId: scheme.id, profileId: "co-owner", role: "OWNER", lotId: lots[opts.coOwnerVotedLot - 1].id, isActive: true }]
      : [];
  tables.Scheme = [scheme];
  tables.Lot = lots;
  tables.SchemeMembership = [...(opts.reverseMemberships ? [...own].reverse() : own), ...coOwner];
  tables.LevyNotice = owing.map((n) => ({
    schemeId: scheme.id,
    lotId: lots[n - 1].id,
    status: "ISSUED",
    dueDate: opts.dueDate ?? OVERDUE,
    balanceOutstanding: "120.00",
  }));
  tables.ElectronicBallot = [{ id: "ballot-1", meetingId: "meeting-1" }];
  tables.ElectronicVote =
    opts.coOwnerVotedLot != null
      ? [
          {
            id: "vote-co",
            ballotId: "ballot-1",
            agendaItemId: "item-1",
            lotId: lots[opts.coOwnerVotedLot - 1].id,
            profileId: "co-owner",
            unitEntitlement: 10,
            voteValue: "AGAINST",
            isInformal: false,
          },
        ]
      : [];

  const meeting = {
    id: "meeting-1",
    schemeId: scheme.id,
    status: "SCHEDULED",
    meetingType: "AGM",
    scheduledAt: `${MEETING_DAY}T00:00:00.000Z`,
  };
  meetings.getMeetingById.mockResolvedValue(meeting);
  agenda.getAgendaItem.mockResolvedValue({ id: "item-1", meetingId: meeting.id, resolutionCategory: category });
  evoting.getBallotForMeeting.mockResolvedValue({
    id: "ballot-1",
    status: "OPEN",
    opensAt: new Date(Date.now() - 86_400_000).toISOString(),
    closesAt: new Date(Date.now() + 86_400_000).toISOString(),
  });
  motions.getMotionById.mockResolvedValue({
    id: "motion-1",
    schemeId: scheme.id,
    meetingId: meeting.id,
    status: "OPEN",
    motionType: category,
    votes: opts.coOwnerVotedLot != null ? [{ profileId: "co-owner" }] : [],
  });
  return { scheme, lots, category };
}

/** What the chair's count at the meeting makes of the online votes and the chair's own votes. */
async function conductCount(
  b: ReturnType<typeof building>,
  chairVotes: { lotId: string; vote: "FOR" | "AGAINST" | "ABSTAIN"; byProxy: boolean }[] = [],
) {
  const tallyLots = b.lots.map((l) => ({ id: l.id, lotNumber: l.lotNumber, entitlement: l.entitlement }));
  const data = await conductVotingData({
    ruleSet: QLD,
    scheme: b.scheme,
    lots: tallyLots,
    meetingId: "meeting-1",
    meetingDay: MEETING_DAY,
    itemId: "item-1",
    category: b.category,
  });
  const r = buildConductTally({
    ruleSet: QLD,
    rules: QLD_RULES,
    category: b.category,
    lots: tallyLots,
    recordedLotCount: tallyLots.length,
    onlineVotes: data.onlineVotes,
    chairVotes,
    poll: false,
    owingLotIds: data.owingLotIds,
  });
  if (!r.ok) throw new Error(r.error);
  return { counted: r.value.counted.map((v) => v.lotId), notCounted: r.value.notCounted.map((v) => v.lotId) };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(reads)) delete reads[k];
});

/** The ballot votes saved on the item, as lot: vote (and who cast it, where not the owner). */
const ballotVotes = () =>
  Object.fromEntries(
    tables.ElectronicVote.map((v) => [v.lotId, v.profileId === caller.id ? v.voteValue : `${v.voteValue} by ${v.profileId}`]),
  );

describe("Queensland: an owner of two lots, lot 1 owing money (SM s 102(2))", () => {
  it("online ballot: the vote is saved for lot 2, which owes nothing, never for lot 1", async () => {
    const b = building("QLD", [1]);
    const r = await castBallotVoteAction("meeting-1", "item-1", "FOR");
    expect(r.error).toBeUndefined();
    expect(ballotVotes()).toEqual({ [b.lots[1].id]: "FOR" });
  });

  it("both paths agree: the online vote the owner was allowed to cast is counted at the meeting", async () => {
    const b = building("QLD", [1]);
    expect((await castBallotVoteAction("meeting-1", "item-1", "FOR")).error).toBeUndefined();
    const c = await conductCount(b);
    expect(c.notCounted).toEqual([]);
    expect(c.counted).toEqual([b.lots[1].id]);
  });

  it("chair's votes: lot 1 is not counted and lot 2 is, though one owner holds both", async () => {
    const b = building("QLD", [1]);
    const c = await conductCount(b, [
      { lotId: b.lots[0].id, vote: "FOR", byProxy: false },
      { lotId: b.lots[1].id, vote: "FOR", byProxy: false },
    ]);
    expect(c.notCounted).toEqual([b.lots[0].id]);
    expect(c.counted).toEqual([b.lots[1].id]);
  });

  it("online ballot: refused, and nothing written, when every one of the owner's lots owes", async () => {
    building("QLD", [1, 2]);
    const r = await castBallotVoteAction("meeting-1", "item-1", "FOR");
    expect(r.error).toMatch(/overdue amount owing to the body corporate/);
    expect(tables.ElectronicVote).toEqual([]);
  });

  it("online ballot: a resolution without dissent takes the vote of every lot, owing or not", async () => {
    const b = building("QLD", [1, 2], { category: "WITHOUT_DISSENT" });
    const r = await castBallotVoteAction("meeting-1", "item-1", "AGAINST");
    expect(r.error).toBeUndefined();
    expect(ballotVotes()).toEqual({ [b.lots[0].id]: "AGAINST", [b.lots[1].id]: "AGAINST" });
    const c = await conductCount(b);
    expect(c.counted).toEqual([b.lots[0].id, b.lots[1].id]);
  });

  it("online ballot: the votes are saved in lot order, whatever order the memberships come in", async () => {
    const b = building("QLD", [], { reverseMemberships: true });
    expect((await castBallotVoteAction("meeting-1", "item-1", "FOR")).error).toBeUndefined();
    expect(tables.ElectronicVote.map((v) => v.lotId)).toEqual([b.lots[0].id, b.lots[1].id]);
  });

  it("motions list: a vote is taken while lot 2, which owes nothing, has not voted", async () => {
    building("QLD", [1]);
    const r = await castVoteAction("motion-1", "FOR");
    expect(r.error).toBeUndefined();
    expect(motions.castVote).toHaveBeenCalledTimes(1);
  });

  it("motions list: refused once a co-owner has voted for lot 2, as the vote could then only be lot 1's", async () => {
    building("QLD", [1], { coOwnerVotedLot: 2 });
    const r = await castVoteAction("motion-1", "FOR");
    expect(r.error).toMatch(/overdue amount owing to the body corporate/);
    expect(motions.castVote).not.toHaveBeenCalled();
  });

  it("motions list: taken once a co-owner has voted for lot 1, as the vote is then lot 2's", async () => {
    building("QLD", [1], { coOwnerVotedLot: 1 });
    const r = await castVoteAction("motion-1", "FOR");
    expect(r.error).toBeUndefined();
    expect(motions.castVote).toHaveBeenCalledTimes(1);
  });
});

describe("Queensland: a changed ballot vote replaces the owner's earlier votes", () => {
  it("lot 1 is paid between the votes: the new vote is saved for both lots, and no FOR is left behind", async () => {
    const b = building("QLD", [1]);
    expect((await castBallotVoteAction("meeting-1", "item-1", "FOR")).error).toBeUndefined();
    expect(ballotVotes()).toEqual({ [b.lots[1].id]: "FOR" });
    tables.LevyNotice = [];
    expect((await castBallotVoteAction("meeting-1", "item-1", "AGAINST")).error).toBeUndefined();
    expect(ballotVotes()).toEqual({ [b.lots[0].id]: "AGAINST", [b.lots[1].id]: "AGAINST" });
    const c = await conductCount(b);
    expect([...c.counted].sort()).toEqual([b.lots[0].id, b.lots[1].id]);
    expect(tables.ElectronicVote.every((v) => v.voteValue === "AGAINST")).toBe(true);
  });

  it("lot 1 falls into debt between the votes: its earlier vote is removed, and lot 2 takes the new one", async () => {
    const b = building("QLD", []);
    expect((await castBallotVoteAction("meeting-1", "item-1", "FOR")).error).toBeUndefined();
    expect(ballotVotes()).toEqual({ [b.lots[0].id]: "FOR", [b.lots[1].id]: "FOR" });
    tables.LevyNotice = [{ schemeId: b.scheme.id, lotId: b.lots[0].id, status: "ISSUED", dueDate: OVERDUE, balanceOutstanding: "50.00" }];
    expect((await castBallotVoteAction("meeting-1", "item-1", "AGAINST")).error).toBeUndefined();
    expect(ballotVotes()).toEqual({ [b.lots[1].id]: "AGAINST" });
    // Lot 1 is paid before the meeting: no old FOR is there to be counted.
    tables.LevyNotice = [];
    expect((await conductCount(b)).counted).toEqual([b.lots[1].id]);
  });
});

describe("Queensland: a co-owner's vote on a shared lot is kept", () => {
  it("the owner's vote is saved for their other lot, and the co-owner's vote on lot 2 stands", async () => {
    const b = building("QLD", [], { coOwnerVotedLot: 2 });
    expect((await castBallotVoteAction("meeting-1", "item-1", "FOR")).error).toBeUndefined();
    expect(ballotVotes()).toEqual({ [b.lots[0].id]: "FOR", [b.lots[1].id]: "AGAINST by co-owner" });
    // And again on a change of vote.
    expect((await castBallotVoteAction("meeting-1", "item-1", "ABSTAIN")).error).toBeUndefined();
    expect(ballotVotes()).toEqual({ [b.lots[0].id]: "ABSTAIN", [b.lots[1].id]: "AGAINST by co-owner" });
  });

  it("refused, and nothing written, when the only lot that may vote already has the co-owner's vote", async () => {
    const b = building("QLD", [1], { coOwnerVotedLot: 2 });
    const r = await castBallotVoteAction("meeting-1", "item-1", "FOR");
    expect(r.error).toBe("A vote has already been cast for your lot.");
    expect(ballotVotes()).toEqual({ [b.lots[1].id]: "AGAINST by co-owner" });
  });
});

describe("Queensland: debts are judged on the meeting's date in both paths", () => {
  it("a notice falling due after the vote but before the meeting bars lot 1 online, as the chair's count does", async () => {
    const b = building("QLD", [1], { dueDate: DUE_BEFORE_MEETING });
    expect((await castBallotVoteAction("meeting-1", "item-1", "FOR")).error).toBeUndefined();
    expect(ballotVotes()).toEqual({ [b.lots[1].id]: "FOR" });
    const chair = await conductCount(b, [{ lotId: b.lots[0].id, vote: "FOR", byProxy: false }]);
    expect(chair.notCounted).toEqual([b.lots[0].id]);
    expect(chair.counted).toEqual([b.lots[1].id]);
  });

  it("motions list: refused when the only lot it is for owes by the meeting's date", async () => {
    building("QLD", [1], { dueDate: DUE_BEFORE_MEETING, coOwnerVotedLot: 2 });
    const r = await castVoteAction("motion-1", "FOR");
    expect(r.error).toMatch(/overdue amount owing to the body corporate/);
    expect(motions.castVote).not.toHaveBeenCalled();
  });
});

describe("NSW: an owner of two lots, lot 1 owing money, votes as before", () => {
  it("does not count votes at conduct", () => {
    expect(countsVotesAtMeeting(NSW_RULE_SET, "AGM")).toBe(false);
  });

  it("online ballot: the vote is saved for the owner's first lot only, and no levy notice is read", async () => {
    const b = building("NSW", [1]);
    const r = await castBallotVoteAction("meeting-1", "item-1", "FOR");
    expect(r.error).toBeUndefined();
    expect(ballotVotes()).toEqual({ [b.lots[0].id]: "FOR" });
    expect(reads.LevyNotice ?? 0).toBe(0);
  });

  it("online ballot: taken when every one of the owner's lots owes, and a changed vote updates the same lot", async () => {
    const b = building("NSW", [1, 2], { category: "SPECIAL" });
    expect((await castBallotVoteAction("meeting-1", "item-1", "AGAINST")).error).toBeUndefined();
    expect((await castBallotVoteAction("meeting-1", "item-1", "FOR")).error).toBeUndefined();
    expect(ballotVotes()).toEqual({ [b.lots[0].id]: "FOR" });
    expect(reads.LevyNotice ?? 0).toBe(0);
  });

  it("online ballot: the owner's vote replaces a co-owner's vote on their first lot, as before", async () => {
    const b = building("NSW", [], { coOwnerVotedLot: 1 });
    expect((await castBallotVoteAction("meeting-1", "item-1", "FOR")).error).toBeUndefined();
    expect(ballotVotes()).toEqual({ [b.lots[0].id]: "FOR" });
  });

  it("motions list: taken whichever lots owe or a co-owner has voted for, and no levy notice is read", async () => {
    for (const opts of [{}, { coOwnerVotedLot: 1 }, { coOwnerVotedLot: 2 }]) {
      vi.clearAllMocks();
      building("NSW", [1, 2], opts);
      const r = await castVoteAction("motion-1", "FOR");
      expect(r.error, JSON.stringify(opts)).toBeUndefined();
      expect(motions.castVote).toHaveBeenCalledTimes(1);
    }
    expect(reads.LevyNotice ?? 0).toBe(0);
  });
});
