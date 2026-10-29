/**
 * The chair's answers sent with an outcome (VIC, ACT and WA stage 2, PR 8a-ii,
 * 29 Oct 2026) are read only where the item's test needs them, so for a
 * Queensland or NSW building a 7th argument changes nothing: the same result,
 * the same writes, and the same database reads as the call without it, for
 * any value sent, well formed or not. Not a golden: the goldens
 * (conduct-evoting.nsw-qld.golden.test.ts, conduct.nsw.golden.test.tsx) keep
 * the 6-argument call.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ scheme: null as unknown, item: null as unknown, meeting: null as unknown, reads: [] as string[] }));
const updateAgendaItem = vi.fn(async () => ({}));
const recordMeetingEvent = vi.fn(async () => ({}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-access", () => ({ requireSchemeAccess: vi.fn(async () => ({ profile: { id: "adviser" } })) }));
vi.mock("@/lib/queries/meetings", () => ({ getMeetingById: vi.fn(async () => state.meeting), updateMeeting: vi.fn() }));
vi.mock("@/lib/queries/schemes", () => ({ getSchemeById: vi.fn(async () => state.scheme) }));
vi.mock("@/lib/queries/agenda", () => ({
  getAgendaItem: vi.fn(async () => state.item),
  updateAgendaItem: (...a: unknown[]) => updateAgendaItem(...(a as [])),
}));
vi.mock("@/lib/meetings/events", () => ({ recordMeetingEvent: (...a: unknown[]) => recordMeetingEvent(...(a as [])) }));
vi.mock("@/lib/meetings/rule-set-repo", async () => {
  const { MEETING_RULES, QLD_RULE_PACK } = await import("@/config/statutory");
  return { getActiveRuleSet: vi.fn(async (s: string) => (s === "QLD" ? QLD_RULE_PACK.rules.MEETING_RULES : MEETING_RULES)) };
});
vi.mock("@/lib/jurisdiction/scheme-rules", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/jurisdiction/scheme-rules")>();
  const { QLD_RULE_PACK } = await import("@/config/statutory");
  return {
    ...actual,
    rulesForState: (s: string) => (s === "QLD" ? { pack: QLD_RULE_PACK, rules: QLD_RULE_PACK.rules, label: "AU-QLD" } : actual.rulesForState(s)),
  };
});
vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
// Every table the action reads is logged, in order.
vi.mock("@/prisma/db", async () => {
  const { sharedFake } = await import("@/test/fake-orm");
  const { db } = sharedFake;
  const logged = new Proxy(db.orm.public, { get: (t, k) => (state.reads.push(String(k)), Reflect.get(t, k)) });
  return { db: { ...db, orm: { ...db.orm, public: logged } } };
});

const { sharedFake } = await import("@/test/fake-orm");
const { recordAgendaOutcomeAction } = await import("./conduct-actions");

const lots = Array.from({ length: 8 }, (_, i) => ({ id: `lot-${i + 1}`, schemeId: "s1", lotNumber: String(i + 1), entitlement: i === 7 ? 30 : 10, lotType: "RESIDENTIAL" }));
const cp = { id: "cp", schemeId: "s1", lotNumber: "CP", entitlement: null, lotType: "COMMON" };
const AGM = { id: "m1", schemeId: "s1", status: "IN_PROGRESS", meetingType: "AGM", scheduledAt: "2026-11-20T09:00:00.000Z", startTime: null };
const overdue = { id: "n1", schemeId: "s1", lotId: "lot-2", status: "ISSUED", dueDate: "2020-01-01", balanceOutstanding: "120.00", amountDue: "120.00", amountPaid: "0" };
const v = (n: number, vote: string, byProxy = false) => ({ lotId: `lot-${n}`, vote, byProxy });

/** What one call gives: its result, its writes and the tables it read. */
async function run(args: unknown[]) {
  vi.clearAllMocks();
  sharedFake.reset({
    LevyNotice: [overdue],
    ElectronicBallot: [],
    ElectronicVote: [],
    // A selector value that a draft pack would read: never read for NSW or Queensland.
    SchemeSelectorValue: [{ id: "x", schemeId: "s1", key: "memberBand", value: "FOUR_OR_MORE" }],
  });
  state.reads = [];
  const result = await (recordAgendaOutcomeAction as (...a: unknown[]) => Promise<unknown>)("s1", "m1", "i1", ...args);
  return { result, updates: structuredClone(updateAgendaItem.mock.calls), events: structuredClone(recordMeetingEvent.mock.calls), reads: [...state.reads] };
}

const ANSWERS: unknown[] = [
  { quorumPresent: true },
  { quorumPresent: false, unitsPresent: 3 },
  { quorumPresent: "yes" },
  { other: 1 },
  "not an object",
  null,
];

const SCENARIOS: { name: string; state: string; category: string | null; meetingType?: string; outcome: string; votes?: unknown; poll?: unknown }[] = [
  { name: "a special resolution carried", state: "QLD", category: "SPECIAL", outcome: "RESOLVED", votes: [3, 4, 5, 6, 7, 8].map((n) => v(n, "FOR")).concat([v(1, "AGAINST")]) },
  { name: "a special resolution the count says is lost", state: "QLD", category: "SPECIAL", outcome: "RESOLVED", votes: [v(3, "FOR"), v(1, "AGAINST")] },
  { name: "an ordinary resolution with a debtor's vote not counted", state: "QLD", category: "ORDINARY", outcome: "MOTION_LOST", votes: [v(1, "FOR"), v(2, "FOR"), v(3, "AGAINST")] },
  { name: "an ordinary resolution on a poll", state: "QLD", category: "ORDINARY", outcome: "RESOLVED", votes: [v(1, "FOR"), v(8, "AGAINST")], poll: true },
  { name: "a majority resolution refused as resolved", state: "QLD", category: "MAJORITY", outcome: "RESOLVED", votes: [v(1, "FOR")] },
  { name: "a vote for common property refused", state: "QLD", category: "ORDINARY", outcome: "RESOLVED", votes: [{ lotId: "cp", vote: "FOR", byProxy: false }] },
  { name: "an item with no category", state: "QLD", category: null, outcome: "RESOLVED", votes: [v(1, "FOR")] },
  { name: "a committee meeting", state: "QLD", category: "ORDINARY", meetingType: "COMMITTEE", outcome: "RESOLVED" },
  { name: "a deferral", state: "QLD", category: "SPECIAL", outcome: "DEFERRED" },
  { name: "an NSW special resolution", state: "NSW", category: "SPECIAL", outcome: "RESOLVED", votes: [v(1, "FOR")] },
  { name: "an NSW ordinary resolution lost", state: "NSW", category: "ORDINARY", outcome: "MOTION_LOST" },
];

beforeEach(() => {
  state.meeting = AGM;
});

describe.each(SCENARIOS)("$name ($state)", (sc) => {
  it("gives the same result, writes and reads with a 7th argument as without it", async () => {
    state.scheme = { id: "s1", state: sc.state, timeZone: sc.state === "QLD" ? "Australia/Brisbane" : "Australia/Sydney", totalLots: 8, lots: [...lots, cp] };
    state.item = { id: "i1", meetingId: "m1", resolutionCategory: sc.category };
    state.meeting = { ...AGM, meetingType: sc.meetingType ?? "AGM" };
    const without = await run([sc.outcome, sc.votes, sc.poll]);
    expect(without.reads).not.toContain("SchemeSelectorValue");
    // A Queensland general meeting's count reads the ballot, so the reads compared are not empty.
    if (sc.state === "QLD" && !sc.meetingType && sc.outcome !== "DEFERRED" && sc.category !== "MAJORITY") expect(without.reads).toContain("ElectronicBallot");
    for (const answer of ANSWERS) {
      const withAnswer = await run([sc.outcome, sc.votes, sc.poll, answer]);
      expect(withAnswer, JSON.stringify(answer)).toEqual(without);
    }
  });
});

describe("the event written for Queensland", () => {
  it("has no attestation key, whatever is sent", async () => {
    state.scheme = { id: "s1", state: "QLD", timeZone: "Australia/Brisbane", totalLots: 8, lots: [...lots, cp] };
    state.item = { id: "i1", meetingId: "m1", resolutionCategory: "ORDINARY" };
    const { result, events, updates } = await run(["RESOLVED", [v(1, "FOR"), v(3, "FOR"), v(4, "AGAINST")], false, { quorumPresent: false }]);
    expect(result).toEqual({ ok: true });
    expect(updates).toEqual([["m1", "i1", { outcome: "RESOLVED", status: "CARRIED" }]]);
    const payload = ((events[0] as unknown[])[0] as { payload: Record<string, unknown> }).payload;
    expect(Object.keys(payload)).toEqual(["itemId", "outcome", "votes", "notCounted", "tally", "evaluation"]);
    expect(payload.tally).not.toHaveProperty("quorumPresent");
  });
});
