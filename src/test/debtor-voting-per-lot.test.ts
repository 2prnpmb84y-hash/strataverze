/**
 * Money owed is judged lot by lot when an owner of several lots votes
 * (Queensland SM s 102(2): a lot owing the body corporate money cannot vote,
 * except as the pack allows). Both ways a vote reaches the count are run with
 * the real checks over a small in-memory store:
 * - the owner's own vote online (the ballot and the motions list), and
 * - the votes the chair records at the meeting, with the online votes added
 *   (conductVotingData and buildConductTally).
 * A lot that owes is barred, the same owner's lots that owe nothing still
 * vote, and both paths agree on which lot is which.
 *
 * NSW records no debtor voting rule, so an NSW owner of several lots votes
 * exactly as before: nothing is refused and no levy notice is read.
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
  };
  return chain;
}

vi.mock("@/prisma/db", () => ({
  db: { orm: { public: new Proxy({}, { get: (_t, name: string) => model(name) }) } },
}));
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
const evoting = vi.hoisted(() => ({ getBallotForMeeting: vi.fn(), castElectronicVote: vi.fn() }));
vi.mock("@/lib/queries/evoting", () => evoting);
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
    rulePackFor: (state: string) => (state === "QLD" ? actual.PENDING_RULE_PACKS.QLD : actual.rulePackFor(state)),
  };
});

const { MEETING_RULES: NSW_RULE_SET, PENDING_RULE_PACKS } = await import("@/config/statutory");
const { castBallotVoteAction, castVoteAction } = await import("@/app/(portal)/owner/(scheme)/meetings/actions");
const { conductVotingData } = await import("@/lib/meetings/conduct-tally-repo");
const { buildConductTally, countsVotesAtMeeting } = await import("@/lib/meetings/conduct-tally");

const QLD_RULES = PENDING_RULE_PACKS.QLD.rules;
const QLD = QLD_RULES.MEETING_RULES;

const SCHEMES = {
  QLD: { id: "scheme-qld", state: "QLD", timeZone: "Australia/Brisbane" },
  NSW: { id: "scheme-nsw", state: "NSW", timeZone: "Australia/Sydney" },
} as const;
type State = keyof typeof SCHEMES;

const lotsOf = (state: State) =>
  [1, 2].map((n) => ({ id: `${state}-lot-${n}`, schemeId: SCHEMES[state].id, lotNumber: String(n), entitlement: 10 }));

/** The owner holds lots 1 and 2 of the building; each lot in `owing` has an overdue contribution notice. */
function building(state: State, owing: number[], opts: { category?: string | null; coOwnerVotedLot?: number } = {}) {
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
  tables.SchemeMembership = [...own, ...coOwner];
  tables.LevyNotice = owing.map((n) => ({
    schemeId: scheme.id,
    lotId: lots[n - 1].id,
    status: "ISSUED",
    dueDate: "2020-01-01",
    balanceOutstanding: "120.00",
  }));
  tables.ElectronicBallot = [{ id: "ballot-1", meetingId: "meeting-1" }];
  tables.ElectronicVote = [];

  const meeting = { id: "meeting-1", schemeId: scheme.id, status: "SCHEDULED", meetingType: "AGM" };
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
    meetingDay: "2026-11-01",
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
  // The ballot keeps one vote per lot per item, as castElectronicVote does.
  evoting.castElectronicVote.mockImplementation(async (v: Row) => {
    tables.ElectronicVote = [
      ...tables.ElectronicVote.filter((e) => !(e.agendaItemId === v.agendaItemId && e.lotId === v.lotId)),
      { ...v, agendaItemId: v.agendaItemId, lotId: v.lotId },
    ];
  });
});

describe("Queensland: an owner of two lots, lot 1 owing money (SM s 102(2))", () => {
  it("online ballot: the vote is recorded for lot 2, which owes nothing, never for lot 1", async () => {
    const b = building("QLD", [1]);
    const r = await castBallotVoteAction("meeting-1", "item-1", "FOR");
    expect(r.error).toBeUndefined();
    expect(evoting.castElectronicVote).toHaveBeenCalledTimes(1);
    expect(evoting.castElectronicVote).toHaveBeenCalledWith(expect.objectContaining({ lotId: b.lots[1].id, voteValue: "FOR" }));
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
    expect(evoting.castElectronicVote).not.toHaveBeenCalled();
  });

  it("online ballot: a resolution without dissent takes the vote of a lot that owes", async () => {
    const b = building("QLD", [1, 2], { category: "WITHOUT_DISSENT" });
    const r = await castBallotVoteAction("meeting-1", "item-1", "AGAINST");
    expect(r.error).toBeUndefined();
    expect(evoting.castElectronicVote).toHaveBeenCalledWith(expect.objectContaining({ lotId: b.lots[0].id }));
    const c = await conductCount(b);
    expect(c.counted).toEqual([b.lots[0].id]);
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

describe("NSW: an owner of two lots, lot 1 owing money, votes as before", () => {
  it("does not count votes at conduct", () => {
    expect(countsVotesAtMeeting(NSW_RULE_SET, "AGM")).toBe(false);
  });

  it("online ballot: the vote is recorded for the owner's first lot, and no levy notice is read", async () => {
    const b = building("NSW", [1]);
    const r = await castBallotVoteAction("meeting-1", "item-1", "FOR");
    expect(r.error).toBeUndefined();
    expect(evoting.castElectronicVote).toHaveBeenCalledTimes(1);
    expect(evoting.castElectronicVote).toHaveBeenCalledWith(expect.objectContaining({ lotId: b.lots[0].id, voteValue: "FOR" }));
    expect(reads.LevyNotice ?? 0).toBe(0);
  });

  it("online ballot: taken when every one of the owner's lots owes", async () => {
    const b = building("NSW", [1, 2], { category: "SPECIAL" });
    const r = await castBallotVoteAction("meeting-1", "item-1", "AGAINST");
    expect(r.error).toBeUndefined();
    expect(evoting.castElectronicVote).toHaveBeenCalledWith(expect.objectContaining({ lotId: b.lots[0].id }));
    expect(reads.LevyNotice ?? 0).toBe(0);
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
