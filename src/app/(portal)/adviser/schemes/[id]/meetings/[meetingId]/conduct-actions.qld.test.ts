/**
 * Recording an outcome at a Queensland general meeting (QLD stage 2,
 * resolution tallies, 27 Oct 2026): the action takes every lot of the
 * building, reads the online votes and the notices overdue on the meeting's
 * date, builds the tally and checks the chair's outcome against it. A
 * committee meeting is not counted by lot. Refusals write nothing. NSW ignores votes sent with
 * the outcome and reads nothing more (its goldens are in
 * conduct.nsw.golden.test.tsx).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ scheme: null as unknown, item: null as unknown, meeting: null as unknown }));
const updateAgendaItem = vi.fn(async () => ({}));
const recordMeetingEvent = vi.fn(async () => ({}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-access", () => ({ requireSchemeAccess: vi.fn(async () => ({ profile: { id: "adviser" } })) }));
vi.mock("@/lib/queries/meetings", () => ({
  getMeetingById: vi.fn(async () => state.meeting),
  updateMeeting: vi.fn(),
}));
vi.mock("@/lib/queries/schemes", () => ({ getSchemeById: vi.fn(async () => state.scheme) }));
vi.mock("@/lib/queries/agenda", () => ({
  getAgendaItem: vi.fn(async () => state.item),
  updateAgendaItem: (...a: unknown[]) => updateAgendaItem(...(a as [])),
}));
vi.mock("@/lib/meetings/events", () => ({ recordMeetingEvent: (...a: unknown[]) => recordMeetingEvent(...(a as [])) }));
// A Queensland building has the Queensland pack (live from the switch-on, 28 Oct 2026; given here as before it was).
vi.mock("@/lib/meetings/rule-set-repo", async () => {
  const { MEETING_RULES, QLD_RULE_PACK } = await import("@/config/statutory");
  return { getActiveRuleSet: vi.fn(async (s: string) => (s === "QLD" ? QLD_RULE_PACK.rules.MEETING_RULES : MEETING_RULES)) };
});
vi.mock("@/lib/jurisdiction/scheme-rules", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/jurisdiction/scheme-rules")>();
  const { QLD_RULE_PACK } = await import("@/config/statutory");
  return {
    ...actual,
    rulesForState: (s: string) =>
      s === "QLD" ? { pack: QLD_RULE_PACK, rules: QLD_RULE_PACK.rules, label: "AU-QLD" } : actual.rulesForState(s),
  };
});
vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));

const { sharedFake } = await import("@/test/fake-orm");
const { recordAgendaOutcomeAction } = await import("./conduct-actions");

const lots = Array.from({ length: 8 }, (_, i) => ({
  id: `lot-${i + 1}`,
  schemeId: "s1",
  lotNumber: String(i + 1),
  entitlement: i === 7 ? 30 : 10,
  interestScheduleEntitlement: 5,
}));
const QLD_SCHEME = { id: "s1", state: "QLD", timeZone: "Australia/Brisbane", totalLots: 8, lots };
// The meeting: 20 Nov 2026, 7 pm in Brisbane (9 am UTC).
const AGM = { id: "m1", schemeId: "s1", status: "IN_PROGRESS", meetingType: "AGM", scheduledAt: "2026-11-20T09:00:00.000Z", startTime: null };
// Lot 2 has an issued notice long past its due date and unpaid.
const overdue = { id: "n1", schemeId: "s1", lotId: "lot-2", status: "ISSUED", dueDate: "2020-01-01", balanceOutstanding: "120.00", amountDue: "120.00", amountPaid: "0" };

const v = (n: number, vote: string, byProxy = false) => ({ lotId: `lot-${n}`, vote, byProxy });

beforeEach(() => {
  vi.clearAllMocks();
  state.scheme = QLD_SCHEME;
  state.meeting = AGM;
  state.item = { id: "i1", meetingId: "m1", resolutionCategory: "SPECIAL" };
  sharedFake.reset({ LevyNotice: [overdue], ElectronicBallot: [], ElectronicVote: [] });
});

const record = (outcome: string, votes?: unknown, poll?: unknown) => recordAgendaOutcomeAction("s1", "m1", "i1", outcome, votes, poll);

describe("a Queensland special resolution at conduct", () => {
  it("is stored when the count carries it, with the votes and tally in the event", async () => {
    const r = await record("RESOLVED", [v(3, "FOR"), v(4, "FOR"), v(5, "FOR"), v(6, "FOR"), v(7, "FOR"), v(8, "FOR"), v(1, "AGAINST")]);
    expect(r).toEqual({ ok: true });
    expect(updateAgendaItem).toHaveBeenCalledWith("m1", "i1", { outcome: "RESOLVED", status: "CARRIED" });
    const event = (recordMeetingEvent.mock.calls[0] as unknown[])[0] as { eventType: string; payload: Record<string, unknown> };
    expect(event.eventType).toBe("AGENDA_OUTCOME_RECORDED");
    expect(event.payload.tally).toEqual({ forCount: 6, againstCount: 1, abstainCount: 0, totalLots: 8, totalEntitlement: 100, forUE: 80, againstUE: 10 });
    expect(event.payload.outcome).toBe("RESOLVED");
    expect((event.payload.votes as unknown[]).length).toBe(7);
  });

  it("is refused, and nothing written, when the chair's outcome disagrees with the count", async () => {
    const r = await record("RESOLVED", [v(3, "FOR"), v(4, "FOR"), v(5, "FOR"), v(1, "AGAINST"), v(8, "AGAINST")]);
    expect(r.error).toMatch(/^The votes recorded show the motion is lost, not resolved\. Votes for are less than 66\.7% of the votes cast\./);
    expect(updateAgendaItem).not.toHaveBeenCalled();
    expect(recordMeetingEvent).not.toHaveBeenCalled();
  });

  it("fails closed, writing nothing, when a lot has no contribution schedule lot entitlement", async () => {
    state.scheme = { ...QLD_SCHEME, lots: lots.map((l) => (l.id === "lot-6" ? { ...l, entitlement: 0 } : l)) };
    const r = await record("RESOLVED", [v(1, "FOR")]);
    expect(r.error).toBe("The votes cannot be counted. Lot 6 has no contribution schedule lot entitlement recorded. Enter it before this can be worked out.");
    expect(updateAgendaItem).not.toHaveBeenCalled();
  });

  it("counts only the lots of this building", async () => {
    const r = await record("MOTION_LOST", [v(1, "FOR"), { lotId: "other", vote: "AGAINST", byProxy: false }]);
    expect(r.error).toBe("A vote is for a lot that is not in this building.");
  });
});

describe("a debtor's vote the chair records", () => {
  it("is not counted on an ordinary resolution, and the chair is told", async () => {
    state.item = { id: "i1", meetingId: "m1", resolutionCategory: "ORDINARY" };
    // Lot 2 owes: 1 for, 1 against counted, so the motion is lost.
    const r = await record("MOTION_LOST", [v(1, "FOR"), v(2, "FOR"), v(3, "AGAINST")]);
    expect(r).toEqual({
      ok: true,
      notice: "Not counted: lot 2 owes the body corporate an overdue amount, so its vote on this motion cannot count.",
    });
    const event = (recordMeetingEvent.mock.calls[0] as unknown[])[0] as { payload: Record<string, unknown> };
    expect(event.payload.tally).toMatchObject({ forCount: 1, againstCount: 1 });
    expect(event.payload.notCounted).toEqual([{ lotId: "lot-2", lotNumber: "2", vote: "FOR", byProxy: false, source: "CHAIR" }]);
  });

  it("is counted on a resolution without dissent", async () => {
    state.item = { id: "i1", meetingId: "m1", resolutionCategory: "WITHOUT_DISSENT" };
    const r = await record("MOTION_LOST", [v(1, "FOR"), v(2, "AGAINST")]);
    expect(r).toEqual({ ok: true });
    expect(updateAgendaItem).toHaveBeenCalledWith("m1", "i1", { outcome: "MOTION_LOST", status: "LOST" });
  });

  it("is counted on an item with no category (the committee election), which keeps the chair's outcome", async () => {
    state.item = { id: "i1", meetingId: "m1", resolutionCategory: null };
    const r = await record("RESOLVED", [v(2, "FOR")]);
    expect(r).toEqual({ ok: true });
    const event = (recordMeetingEvent.mock.calls[0] as unknown[])[0] as { payload: Record<string, unknown> };
    expect(event.payload).toMatchObject({ outcome: "RESOLVED", tally: null, notCounted: [] });
  });
});

describe("a Queensland majority resolution and a poll", () => {
  it("refuses a majority resolution recorded as resolved, before reading anything, until written votes are recorded", async () => {
    state.item = { id: "i1", meetingId: "m1", resolutionCategory: "MAJORITY" };
    sharedFake.reset({});
    const r = await record("RESOLVED", [v(1, "FOR"), v(3, "FOR"), v(4, "FOR"), v(5, "FOR"), v(6, "FOR")]);
    expect(r.error).toBe(
      "A majority resolution is decided on each lot's written vote, which StrataVerze does not record yet. It cannot be recorded as resolved here. It can be recorded as lost, or deferred.",
    );
    expect(updateAgendaItem).not.toHaveBeenCalled();
    expect(sharedFake.tables).toEqual({});
  });

  it("records a majority resolution as lost, leaving a debtor lot out of the lots entitled to vote", async () => {
    state.item = { id: "i1", meetingId: "m1", resolutionCategory: "MAJORITY" };
    sharedFake.reset({ LevyNotice: [overdue] });
    // 7 lots entitled (lot 2 owes): 3 for is not more than half.
    const r = await record("MOTION_LOST", [v(1, "FOR"), v(3, "FOR"), v(4, "FOR")]);
    expect(r).toEqual({ ok: true });
    const event = (recordMeetingEvent.mock.calls[0] as unknown[])[0] as { payload: Record<string, unknown> };
    expect(event.payload.tally).toMatchObject({ forCount: 3, eligibleLots: 7, totalLots: 8 });
    expect(await record("DEFERRED")).toEqual({ ok: true });
  });

  it("counts an ordinary resolution on a poll by contribution schedule lot entitlement", async () => {
    state.item = { id: "i1", meetingId: "m1", resolutionCategory: "ORDINARY" };
    const votes = [v(1, "FOR"), v(3, "FOR"), v(4, "FOR"), v(8, "AGAINST"), v(5, "AGAINST")];
    expect((await record("RESOLVED", votes, true)).error).toMatch(/^The votes recorded show the motion is lost, not resolved\. Not carried by contribution schedule lot entitlement on a poll\./);
    expect(await record("MOTION_LOST", votes, true)).toEqual({ ok: true });
    expect(await record("RESOLVED", votes, false)).toEqual({ ok: true });
  });
});

describe("debts are judged on the meeting's date", () => {
  // Due 20 Nov 2026 and unpaid: overdue only from 21 Nov in Brisbane.
  const dueOnMeetingDay = { ...overdue, dueDate: "2026-11-20" };
  const dueBefore = { ...overdue, dueDate: "2026-11-19" };
  // The clock is pinned, so each case tells the meeting's date apart from the
  // day the result is recorded, whatever the real date is. Only Date is faked.
  const recordOn = (iso: string) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(iso));
  };
  afterEach(() => vi.useRealTimers());

  it("does not count a lot as owing for a notice due on the meeting's own day, though overdue on the day recorded", async () => {
    // Recorded on 15 Dec 2026: judged on that day, the notice due 20 Nov would be overdue.
    recordOn("2026-12-15T00:00:00.000Z");
    state.item = { id: "i1", meetingId: "m1", resolutionCategory: "ORDINARY" };
    sharedFake.reset({ LevyNotice: [dueOnMeetingDay] });
    expect(await record("RESOLVED", [v(2, "FOR")])).toEqual({ ok: true });
  });

  it("counts a lot as owing for a notice due before the meeting's day in the building's time zone, though not yet due on the day recorded", async () => {
    // Recorded on 1 Nov 2026: judged on that day, the notice due 19 Nov would not be overdue.
    recordOn("2026-11-01T00:00:00.000Z");
    state.item = { id: "i1", meetingId: "m1", resolutionCategory: "ORDINARY" };
    sharedFake.reset({ LevyNotice: [dueBefore] });
    expect((await record("MOTION_LOST", [v(2, "FOR")])).notice).toMatch(/^Not counted: lot 2 owes/);
  });

  it("takes the meeting's day from its start time where it has one, in Brisbane time", async () => {
    recordOn("2026-11-01T00:00:00.000Z");
    state.item = { id: "i1", meetingId: "m1", resolutionCategory: "ORDINARY" };
    // 21 Nov 2026 00:30 in Brisbane is 20 Nov 14:30 UTC: the notice due 20 Nov is now overdue.
    state.meeting = { ...AGM, startTime: "2026-11-20T14:30:00.000Z" };
    sharedFake.reset({ LevyNotice: [dueOnMeetingDay] });
    expect((await record("MOTION_LOST", [v(2, "FOR")])).notice).toMatch(/^Not counted: lot 2 owes/);
  });
});

describe("a Queensland committee meeting", () => {
  it("is not counted by lot: the chair's outcome is stored as before and nothing is read", async () => {
    state.meeting = { ...AGM, meetingType: "COMMITTEE" };
    state.item = { id: "i1", meetingId: "m1", resolutionCategory: "ORDINARY" };
    sharedFake.reset({});
    expect(await record("RESOLVED", [v(2, "AGAINST")])).toEqual({ ok: true });
    expect(updateAgendaItem).toHaveBeenCalledWith("m1", "i1", { outcome: "RESOLVED", status: "CARRIED" });
    expect(recordMeetingEvent).toHaveBeenCalledWith({ meetingId: "m1", actorId: "adviser", eventType: "AGENDA_OUTCOME_RECORDED", payload: { itemId: "i1", outcome: "RESOLVED" } });
    expect(sharedFake.tables).toEqual({});
  });
});

describe("the building's number of lots", () => {
  it("fails closed on a special resolution when it is not recorded", async () => {
    state.scheme = { ...QLD_SCHEME, totalLots: null };
    const r = await record("RESOLVED", [v(1, "FOR")]);
    expect(r.error).toBe("The building's number of lots is not recorded, so this resolution cannot be counted. Record it in the building's details first.");
    expect(updateAgendaItem).not.toHaveBeenCalled();
  });
});

describe("online votes and malformed input", () => {
  it("adds the item's formal online votes, and refuses the chair recording a lot again", async () => {
    state.item = { id: "i1", meetingId: "m1", resolutionCategory: "ORDINARY" };
    sharedFake.reset({
      LevyNotice: [],
      ElectronicBallot: [{ id: "b1", meetingId: "m1" }],
      ElectronicVote: [
        { id: "e1", ballotId: "b1", agendaItemId: "i1", lotId: "lot-1", voteValue: "FOR", isInformal: false },
        { id: "e2", ballotId: "b1", agendaItemId: "other-item", lotId: "lot-3", voteValue: "FOR", isInformal: false },
      ],
    });
    expect(await record("RESOLVED", [v(2, "FOR"), v(3, "AGAINST")])).toEqual({ ok: true });
    expect((await record("RESOLVED", [v(1, "AGAINST")])).error).toBe("Lot 1 has already voted online, so its vote cannot be recorded again.");
  });

  it("refuses votes it cannot read", async () => {
    expect(await record("RESOLVED", [{ lotId: "lot-1", vote: "YES" }])).toEqual({
      error: "The votes sent could not be read. Reload the page and record them again.",
    });
    // More votes than the building has lots.
    expect(await record("RESOLVED", Array.from({ length: 9 }, (_, i) => v(i + 1, "FOR")))).toEqual({
      error: "The votes sent could not be read. Reload the page and record them again.",
    });
    expect(await record("RESOLVED", [], "yes")).toEqual({ error: "The votes sent could not be read. Reload the page and record them again." });
    expect(updateAgendaItem).not.toHaveBeenCalled();
  });

  it("defers without counting or reading anything", async () => {
    sharedFake.reset({});
    expect(await record("DEFERRED", "not even votes")).toEqual({ ok: true });
    expect(updateAgendaItem).toHaveBeenCalledWith("m1", "i1", { outcome: "DEFERRED", status: "DEFERRED" });
    expect(sharedFake.tables).toEqual({});
  });
});

describe("an NSW building", () => {
  it("ignores votes sent with the outcome and stores the chair's outcome as before", async () => {
    state.scheme = { id: "s1", state: "NSW", timeZone: "Australia/Sydney", totalLots: 8, lots };
    sharedFake.reset({});
    const r = await record("RESOLVED", [v(1, "AGAINST")], true);
    expect(r).toEqual({ ok: true });
    expect(updateAgendaItem).toHaveBeenCalledWith("m1", "i1", { outcome: "RESOLVED", status: "CARRIED" });
    expect(recordMeetingEvent).toHaveBeenCalledWith({ meetingId: "m1", actorId: "adviser", eventType: "AGENDA_OUTCOME_RECORDED", payload: { itemId: "i1", outcome: "RESOLVED" } });
    // Nothing was read from the lots, ballots or notices.
    expect(sharedFake.tables).toEqual({});
  });
});
