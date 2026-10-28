/**
 * NSW and Queensland conduct and e-voting close, golden (VIC, ACT and WA
 * stage 2, PR 8a-i, 28 Oct 2026). Recorded on origin/main (1080f07) in a
 * temporary worktree, before the resolution bases and categories of the
 * draft Victorian, ACT and WA packs were added. What recordAgendaOutcomeAction
 * returns, writes and logs for a Queensland general or committee meeting and
 * an NSW building (with votes sent), and what closeBallotAction writes and
 * logs for each category, must stay exactly the same. Never regenerate these
 * snapshots to make a change pass: a difference is a change to NSW or
 * Queensland. The NSW conduct golden without votes is conduct.nsw.golden.test.tsx.
 *
 * One deliberate change (29 Oct 2026, approved by Matthew Wrigley): the
 * Queensland pack 2026.10.20 leaves common property rows out of the count at
 * conduct. Only the three entries holding a common property row
 * (commonPropertyOrdinary, commonPropertySpecial, commonPropertyMajority) were
 * updated, by a targeted run of their test: the ordinary resolution now counts
 * 8 lots, not 9, and the special and majority resolutions are refused because
 * the fixture's building records 9 lots, counting the row as a lot. Every
 * other entry is byte-identical.
 *
 * The rule set is read through the real rule-set repository (no stored row,
 * so each building is given its pack's seed), and the online votes and debts
 * through the real repositories on the in-memory database.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  scheme: null as unknown,
  item: null as unknown,
  items: [] as unknown[],
  meeting: null as unknown,
  ballot: null as unknown,
  ballotVotes: [] as unknown[],
  log: [] as unknown[],
}));

vi.mock("next/cache", () => ({ revalidatePath: (p: string) => state.log.push({ revalidate: p }) }));
vi.mock("@/lib/auth/require-access", () => ({ requireSchemeAccess: vi.fn(async () => ({ profile: { id: "adviser" } })) }));
vi.mock("@/lib/queries/meetings", () => ({
  getMeetingById: vi.fn(async () => state.meeting),
  updateMeeting: vi.fn(async (...a: unknown[]) => state.log.push({ updateMeeting: a })),
}));
vi.mock("@/lib/queries/schemes", () => ({ getSchemeById: vi.fn(async () => state.scheme) }));
vi.mock("@/lib/queries/agenda", () => ({
  getAgendaItem: vi.fn(async () => state.item),
  getAgendaItemsForMeeting: vi.fn(async () => state.items),
  updateAgendaItem: vi.fn(async (...a: unknown[]) => state.log.push({ updateAgendaItem: a })),
}));
vi.mock("@/lib/queries/evoting", () => ({
  createBallot: vi.fn(),
  getBallotForMeeting: vi.fn(async () => state.ballot),
  closeBallot: vi.fn(async (id: string) => state.log.push({ closeBallot: id })),
  getVotesForBallot: vi.fn(async () => state.ballotVotes),
}));
vi.mock("@/lib/meetings/events", () => ({ recordMeetingEvent: vi.fn(async (e: unknown) => state.log.push({ event: e })) }));
vi.mock("@/lib/billing/capture", () => ({ captureUsageFee: vi.fn() }));
vi.mock("@/lib/billing/disclosure", () => ({ feeErrorMessage: () => null }));
vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));

const { sharedFake } = await import("@/test/fake-orm");
const { recordAgendaOutcomeAction } = await import("./conduct-actions");
const { closeBallotAction } = await import("./evoting-actions");

const lots = Array.from({ length: 8 }, (_, i) => ({
  id: `lot-${i + 1}`,
  schemeId: "s1",
  lotNumber: String(i + 1),
  entitlement: i === 7 ? 30 : 10,
  interestScheduleEntitlement: 5,
}));
const QLD_SCHEME = { id: "s1", state: "QLD", timeZone: "Australia/Brisbane", totalLots: 8, lots };
const NSW_SCHEME = { id: "s1", state: "NSW", timeZone: "Australia/Sydney", totalLots: 8, lots };
// The meeting: 20 Nov 2026, 7 pm in Brisbane (9 am UTC).
const AGM = { id: "m1", schemeId: "s1", status: "IN_PROGRESS", meetingType: "AGM", scheduledAt: "2026-11-20T09:00:00.000Z", startTime: null };
// Lot 2 has an issued notice long past its due date and unpaid.
const overdue = { id: "n1", schemeId: "s1", lotId: "lot-2", status: "ISSUED", dueDate: "2020-01-01", balanceOutstanding: "120.00", amountDue: "120.00", amountPaid: "0" };

const v = (n: number, vote: string, byProxy = false) => ({ lotId: `lot-${n}`, vote, byProxy });

const CATEGORIES = ["ORDINARY", "SPECIAL", "UNANIMOUS", "SUSTAINABILITY_INFRASTRUCTURE", "WITHOUT_DISSENT", "MAJORITY", "BOGUS", null, ""];
const VOTE_SETS: Record<string, { votes?: unknown; poll?: unknown }> = {
  none: {},
  empty: { votes: [] },
  carried: { votes: [v(3, "FOR"), v(4, "FOR"), v(5, "FOR"), v(6, "FOR"), v(7, "FOR"), v(8, "FOR"), v(1, "AGAINST")] },
  lost: { votes: [v(3, "FOR"), v(4, "FOR"), v(5, "FOR"), v(1, "AGAINST"), v(8, "AGAINST")] },
  tied: { votes: [v(1, "FOR"), v(3, "AGAINST")] },
  debtor: { votes: [v(1, "FOR"), v(2, "FOR"), v(3, "AGAINST")] },
  majority: { votes: [v(1, "FOR"), v(3, "FOR"), v(4, "FOR"), v(5, "FOR"), v(6, "FOR")] },
  proxy: { votes: [v(1, "FOR", true), v(3, "FOR")] },
  poll: { votes: [v(1, "FOR"), v(3, "FOR"), v(4, "FOR"), v(8, "AGAINST"), v(5, "AGAINST")], poll: true },
  pollFalse: { votes: [v(1, "FOR"), v(3, "AGAINST")], poll: false },
  badPoll: { votes: [], poll: "yes" },
  unreadable: { votes: [{ lotId: "lot-1", vote: "YES" }] },
  tooMany: { votes: Array.from({ length: 9 }, (_, i) => v(i + 1, "FOR")) },
  elsewhere: { votes: [v(1, "FOR"), { lotId: "other", vote: "AGAINST", byProxy: false }] },
  online: { votes: [v(2, "FOR"), v(3, "AGAINST")] },
  onlineAgain: { votes: [v(1, "AGAINST")] },
};

function seed(withBallot: boolean) {
  sharedFake.reset({
    LevyNotice: [overdue],
    ElectronicBallot: withBallot ? [{ id: "b1", meetingId: "m1" }] : [],
    ElectronicVote: withBallot
      ? [
          { id: "e1", ballotId: "b1", agendaItemId: "i1", lotId: "lot-1", voteValue: "FOR", isInformal: false },
          { id: "e2", ballotId: "b1", agendaItemId: "other-item", lotId: "lot-3", voteValue: "FOR", isInformal: false },
          { id: "e3", ballotId: "b1", agendaItemId: "i1", lotId: "lot-6", voteValue: "SPOILT", isInformal: true },
        ]
      : [],
  });
}

async function run(category: string | null, outcome: string, set: { votes?: unknown; poll?: unknown }, withBallot = false) {
  seed(withBallot);
  state.log = [];
  state.item = { id: "i1", meetingId: "m1", resolutionCategory: category };
  const result = await recordAgendaOutcomeAction("s1", "m1", "i1", outcome, set.votes, set.poll);
  return { result, log: state.log };
}

beforeEach(() => {
  state.scheme = QLD_SCHEME;
  state.meeting = AGM;
  state.item = null;
  state.items = [];
  state.ballot = null;
  state.ballotVotes = [];
  state.log = [];
});

describe("recordAgendaOutcomeAction (golden)", () => {
  it("gives the same result, writes and event at a Queensland general meeting", async () => {
    const out: Record<string, unknown> = {};
    for (const category of CATEGORIES) {
      for (const outcome of ["RESOLVED", "MOTION_LOST", "DEFERRED", "CARRIED"]) {
        for (const [k, set] of Object.entries(VOTE_SETS)) {
          out[`${String(category)}/${outcome}/${k}`] = await run(category, outcome, set, k === "online" || k === "onlineAgain");
        }
      }
    }
    expect(out).toMatchSnapshot();
  });

  it("gives the same result for each meeting type and building", async () => {
    const out: Record<string, unknown> = {};
    const types = ["AGM", "EGM", "SGM", "FIRST_AGM", "COMMITTEE", "committee", null];
    for (const [name, scheme] of [["QLD", QLD_SCHEME], ["NSW", NSW_SCHEME]] as const) {
      for (const meetingType of types) {
        state.scheme = scheme;
        state.meeting = { ...AGM, meetingType };
        for (const category of ["ORDINARY", "SPECIAL", "MAJORITY", "UNANIMOUS", null]) {
          for (const outcome of ["RESOLVED", "MOTION_LOST"]) {
            out[`${name}/${String(meetingType)}/${String(category)}/${outcome}`] = await run(category, outcome, VOTE_SETS.carried);
          }
        }
      }
    }
    expect(out).toMatchSnapshot();
  });

  it("judges debts on the meeting's date, and refuses as before", async () => {
    const out: Record<string, unknown> = {};
    state.meeting = { ...AGM, startTime: "2026-11-20T14:30:00.000Z" };
    sharedFake.reset({ LevyNotice: [{ ...overdue, dueDate: "2026-11-20" }] });
    state.log = [];
    state.item = { id: "i1", meetingId: "m1", resolutionCategory: "ORDINARY" };
    out.startTime = { result: await recordAgendaOutcomeAction("s1", "m1", "i1", "MOTION_LOST", [v(2, "FOR")]), log: state.log };
    state.meeting = { ...AGM, status: "NOTICE_ISSUED" };
    out.notRunning = await run("ORDINARY", "RESOLVED", VOTE_SETS.carried);
    state.meeting = AGM;
    state.scheme = { ...QLD_SCHEME, totalLots: null };
    out.noLotCount = await run("SPECIAL", "RESOLVED", VOTE_SETS.carried);
    state.scheme = { ...QLD_SCHEME, lots: lots.map((l) => (l.id === "lot-6" ? { ...l, entitlement: 0 } : l)) };
    out.noEntitlement = await run("SPECIAL", "RESOLVED", VOTE_SETS.carried);
    state.scheme = { ...QLD_SCHEME, lots: [...lots, { id: "cp", schemeId: "s1", lotNumber: "CP", entitlement: 0, lotType: "COMMON" }], totalLots: 9 };
    out.commonPropertyOrdinary = await run("ORDINARY", "RESOLVED", VOTE_SETS.carried);
    out.commonPropertySpecial = await run("SPECIAL", "RESOLVED", VOTE_SETS.carried);
    out.commonPropertyMajority = await run("MAJORITY", "MOTION_LOST", VOTE_SETS.carried);
    state.scheme = null;
    out.noScheme = await run("ORDINARY", "RESOLVED", VOTE_SETS.carried);
    expect(out).toMatchSnapshot();
  });
});

describe("closeBallotAction (golden)", () => {
  const ballotVote = (itemId: string, n: number, voteValue: string, isInformal = false) => ({
    agendaItemId: itemId,
    lotId: `lot-${n}`,
    voteValue,
    unitEntitlement: n === 8 ? 30 : 10,
    isInformal,
  });

  it("writes the same outcome for each category and logs the same results", async () => {
    const out: Record<string, unknown> = {};
    const tallies: Record<string, [number, string, boolean?][]> = {
      carried: [[1, "FOR"], [2, "FOR"], [3, "FOR"], [4, "AGAINST"], [5, "ABSTAIN"]],
      tied: [[1, "FOR"], [2, "AGAINST"]],
      bigAgainst: [[1, "FOR"], [2, "FOR"], [3, "FOR"], [8, "AGAINST"]],
      noneAgainst: [[1, "FOR"], [2, "FOR"]],
      informalOnly: [[1, "FOR", true]],
    };
    for (const [name, scheme] of [["NSW", NSW_SCHEME], ["QLD", QLD_SCHEME]] as const) {
      for (const [k, list] of Object.entries(tallies)) {
        sharedFake.reset({});
        state.scheme = scheme;
        state.meeting = { ...AGM, status: "NOTICE_ISSUED" };
        state.ballot = { id: "b1", meetingId: "m1", status: "OPEN" };
        state.items = CATEGORIES.map((c, i) => ({ id: `i${i}`, meetingId: "m1", resolutionCategory: c }));
        state.items.push({ id: "silent", meetingId: "m1", resolutionCategory: "ORDINARY" });
        state.ballotVotes = CATEGORIES.flatMap((_c, i) => list.map(([n, value, informal]) => ballotVote(`i${i}`, n, value, informal ?? false)));
        state.log = [];
        const result = await closeBallotAction("s1", "m1");
        out[`${name}/${k}`] = { result, log: state.log };
      }
    }
    state.ballot = { id: "b1", meetingId: "m1", status: "CLOSED" };
    state.log = [];
    out.closed = { result: await closeBallotAction("s1", "m1"), log: state.log };
    state.ballot = null;
    out.none = { result: await closeBallotAction("s1", "m1"), log: state.log };
    expect(out).toMatchSnapshot();
  });
});
