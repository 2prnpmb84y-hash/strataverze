/**
 * Recording an outcome at a general meeting under the draft Victorian, ACT
 * and WA meeting rules (VIC, ACT and WA stage 2, PR 8a-i, 28 Oct 2026). Those
 * states have no buildings yet, so each pack is given here as if it were
 * live. Whatever the count cannot record (a voting period still open, an
 * interim resolution, a quorum not recorded, a band of members missing) is
 * refused with its reason, and nothing is written. The band of members is
 * read only for the ACT. Closing a ballot skips an item the count cannot
 * decide.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  scheme: null as unknown,
  item: null as unknown,
  meeting: null as unknown,
  items: [] as unknown[],
  ballotVotes: [] as unknown[],
  /** Totals added to the ballot's tally, so only the rule (not a missing total) can stop the count. */
  ballotTotals: null as Record<string, number> | null,
}));
const updateAgendaItem = vi.fn(async () => ({}));
const recordMeetingEvent = vi.fn(async () => ({}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-access", () => ({ requireSchemeAccess: vi.fn(async () => ({ profile: { id: "adviser" } })) }));
vi.mock("@/lib/queries/meetings", () => ({ getMeetingById: vi.fn(async () => state.meeting), updateMeeting: vi.fn() }));
vi.mock("@/lib/queries/schemes", () => ({ getSchemeById: vi.fn(async () => state.scheme) }));
vi.mock("@/lib/queries/agenda", () => ({
  getAgendaItem: vi.fn(async () => state.item),
  getAgendaItemsForMeeting: vi.fn(async () => state.items),
  updateAgendaItem: (...a: unknown[]) => updateAgendaItem(...(a as [])),
}));
vi.mock("@/lib/queries/evoting", () => ({
  createBallot: vi.fn(),
  getBallotForMeeting: vi.fn(async () => ({ id: "b1", meetingId: "m1", status: "OPEN" })),
  closeBallot: vi.fn(),
  getVotesForBallot: vi.fn(async () => state.ballotVotes),
}));
vi.mock("@/lib/meetings/evoting", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/meetings/evoting")>();
  return {
    ...actual,
    tallyElectronicVotes: (votes: Parameters<typeof actual.tallyElectronicVotes>[0]) => ({ ...actual.tallyElectronicVotes(votes), ...(state.ballotTotals ?? {}) }),
  };
});
vi.mock("@/lib/meetings/events", () => ({ recordMeetingEvent: (...a: unknown[]) => recordMeetingEvent(...(a as [])) }));
vi.mock("@/lib/billing/capture", () => ({ captureUsageFee: vi.fn() }));
vi.mock("@/lib/billing/disclosure", () => ({ feeErrorMessage: () => null }));
// The draft packs, given as if live (they have no buildings yet).
vi.mock("@/lib/meetings/rule-set-repo", async () => {
  const { PENDING_RULE_PACKS } = await import("@/config/statutory");
  return { getActiveRuleSet: vi.fn(async (s: "VIC" | "ACT" | "WA") => PENDING_RULE_PACKS[s].rules.MEETING_RULES) };
});
vi.mock("@/lib/jurisdiction/scheme-rules", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/jurisdiction/scheme-rules")>();
  const { PENDING_RULE_PACKS } = await import("@/config/statutory");
  return {
    ...actual,
    rulesForState: (s: string) => {
      const pack = PENDING_RULE_PACKS[s as "VIC" | "ACT" | "WA"];
      return pack ? { pack, rules: pack.rules, label: `${pack.code} ${pack.version}` } : actual.rulesForState(s);
    },
  };
});
vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));

const { sharedFake } = await import("@/test/fake-orm");
const { recordAgendaOutcomeAction } = await import("./conduct-actions");
const { closeBallotAction } = await import("./evoting-actions");

const lots = [
  ...Array.from({ length: 8 }, (_, i) => ({ id: `lot-${i + 1}`, schemeId: "s1", lotNumber: String(i + 1), entitlement: 10, lotEntitlement: 10, lotType: "RESIDENTIAL" })),
  { id: "cp", schemeId: "s1", lotNumber: "CP", entitlement: null, lotEntitlement: null, lotType: "COMMON" },
];
const scheme = (st: string) => ({ id: "s1", state: st, timeZone: "Australia/Melbourne", totalLots: 8, lots });
const AGM = { id: "m1", schemeId: "s1", status: "IN_PROGRESS", meetingType: "AGM", scheduledAt: "2026-11-20T09:00:00.000Z", startTime: null };
const v = (n: number, vote: string) => ({ lotId: `lot-${n}`, vote, byProxy: false });
const record = (outcome: string, votes?: unknown, poll?: unknown) => recordAgendaOutcomeAction("s1", "m1", "i1", outcome, votes, poll);

function at(st: string, category: string | null, seed: Record<string, unknown[]> = {}) {
  state.scheme = scheme(st);
  state.item = { id: "i1", meetingId: "m1", resolutionCategory: category };
  sharedFake.reset({ LevyNotice: [], ElectronicBallot: [], ElectronicVote: [], ...seed });
}

function nothingWritten() {
  expect(updateAgendaItem).not.toHaveBeenCalled();
  expect(recordMeetingEvent).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  state.meeting = AGM;
  state.ballotTotals = null;
});

describe("Western Australia", () => {
  it("refuses a special, without dissent or unanimous resolution as resolved or lost, before reading anything", async () => {
    for (const c of ["SPECIAL", "WITHOUT_DISSENT", "UNANIMOUS"]) {
      for (const outcome of ["RESOLVED", "MOTION_LOST"]) {
        at("WA", c);
        sharedFake.reset({});
        const r = await record(outcome, [v(1, "FOR")]);
        expect(r.error).toMatch(/is decided when its 28-day voting period closes, which StrataVerze does not track yet\. It cannot be recorded as resolved or lost at the meeting\. It can be deferred\.$/);
        expect(sharedFake.tables).toEqual({});
      }
    }
    nothingWritten();
    at("WA", "SPECIAL");
    expect(await record("DEFERRED")).toEqual({ ok: true });
    expect(updateAgendaItem).toHaveBeenCalledWith("m1", "i1", { outcome: "DEFERRED", status: "DEFERRED" });
  });

  it("records an ordinary resolution from the count, the common property row left out", async () => {
    at("WA", "ORDINARY");
    expect(await record("RESOLVED", [v(1, "FOR"), v(2, "FOR"), v(3, "AGAINST")])).toEqual({ ok: true });
    const event = (recordMeetingEvent.mock.calls[0] as unknown[])[0] as { payload: Record<string, unknown> };
    expect(event.payload.tally).toEqual({ forCount: 2, againstCount: 1, abstainCount: 0, totalLots: 8 });
    expect(event.payload.evaluation).toEqual({ passed: true, reason: "Majority of votes cast" });
  });
});

describe("Victoria", () => {
  it("refuses an interim special resolution, writing nothing", async () => {
    at("VIC", "SPECIAL");
    const r = await record("RESOLVED", [v(1, "FOR"), v(2, "FOR"), v(3, "FOR"), v(4, "FOR"), v(5, "AGAINST")]);
    expect(r.error).toMatch(/^The votes recorded make this motion an interim special resolution\./);
    expect(r.error).toMatch(/Nothing was saved\. The item can be deferred\.$/);
    nothingWritten();
  });

  it("refuses an ordinary resolution until quorum is recorded, writing nothing", async () => {
    at("VIC", "ORDINARY");
    const r = await record("RESOLVED", [v(1, "FOR"), v(2, "FOR"), v(3, "AGAINST")]);
    expect(r.error).toBe(
      "The votes recorded cannot decide this motion. Whether the meeting had a quorum for this item is not recorded, so the votes cannot decide it. Nothing was saved. The item can be deferred.",
    );
    nothingWritten();
  });

  it("records a special resolution carried by 75% of all lots, with the tally", async () => {
    at("VIC", "SPECIAL");
    expect(await record("RESOLVED", [1, 2, 3, 4, 5, 6].map((n) => v(n, "FOR")))).toEqual({ ok: true });
    expect(updateAgendaItem).toHaveBeenCalledWith("m1", "i1", { outcome: "RESOLVED", status: "CARRIED" });
    const event = (recordMeetingEvent.mock.calls[0] as unknown[])[0] as { payload: Record<string, unknown> };
    expect(event.payload.tally).toEqual({ forCount: 6, againstCount: 0, abstainCount: 0, totalLots: 8 });
  });

  it("needs no band of members: a band recorded by mistake changes nothing", async () => {
    at("VIC", "SPECIAL", { SchemeSelectorValue: [{ id: "x", schemeId: "s1", key: "memberBand", value: "THREE" }] });
    expect(await record("RESOLVED", [1, 2, 3, 4, 5, 6].map((n) => v(n, "FOR")))).toEqual({ ok: true });
    const event = (recordMeetingEvent.mock.calls[0] as unknown[])[0] as { payload: Record<string, unknown> };
    expect(event.payload.tally).not.toHaveProperty("memberBand");
  });
});

describe("the ACT", () => {
  it("reads the band of members, and refuses every count until quorum is recorded, writing nothing", async () => {
    at("ACT", "SPECIAL", { SchemeSelectorValue: [{ id: "x", schemeId: "s1", key: "memberBand", value: "FOUR_OR_MORE" }] });
    const r = await record("RESOLVED", [v(1, "FOR"), v(2, "FOR"), v(3, "FOR"), v(4, "AGAINST")]);
    expect(r.error).toMatch(/Whether the meeting had a quorum for this item is not recorded/);
    nothingWritten();
  });

  it("refuses for the band first: none recorded, or another building's", async () => {
    at("ACT", "ORDINARY", { SchemeSelectorValue: [{ id: "x", schemeId: "other", key: "memberBand", value: "FOUR_OR_MORE" }] });
    const r = await record("RESOLVED", [v(1, "FOR")]);
    expect(r.error).toBe(
      "The votes recorded cannot decide this motion. The building's number of members is not recorded in its building rules, so this resolution's test cannot be chosen. Nothing was saved. The item can be deferred.",
    );
    at("ACT", "SPECIAL", { SchemeSelectorValue: [{ id: "x", schemeId: "s1", key: "memberBand", value: "THREE" }] });
    expect((await record("MOTION_LOST", [v(1, "FOR")])).error).toMatch(/3 members/);
    nothingWritten();
  });
});

describe("closing a ballot under a draft pack", () => {
  it("skips an item the count cannot decide, and writes no outcome for it", async () => {
    state.scheme = scheme("VIC");
    state.meeting = { ...AGM, status: "NOTICE_ISSUED" };
    state.items = [
      { id: "i1", meetingId: "m1", resolutionCategory: "SPECIAL" },
      { id: "i2", meetingId: "m1", resolutionCategory: "ORDINARY" },
    ];
    state.ballotVotes = [
      { agendaItemId: "i1", lotId: "lot-1", voteValue: "FOR", unitEntitlement: 10, isInformal: false },
      { agendaItemId: "i2", lotId: "lot-1", voteValue: "FOR", unitEntitlement: 10, isInformal: false },
    ];
    sharedFake.reset({});
    expect(await closeBallotAction("s1", "m1")).toEqual({ ok: true });
    expect(updateAgendaItem).not.toHaveBeenCalled();
    expect(recordMeetingEvent).toHaveBeenCalledWith({ meetingId: "m1", actorId: "adviser", eventType: "BALLOT_CLOSED", payload: { results: [] } });
  });
});

describe("closing a ballot under the Western Australian pack, with the totals", () => {
  it("records no special, without dissent or unanimous resolution, though every lot voted for: the voting period decides it", async () => {
    state.scheme = scheme("WA");
    state.meeting = { ...AGM, status: "NOTICE_ISSUED" };
    state.ballotTotals = { totalLots: 8, totalEntitlement: 80 };
    const cats = ["SPECIAL", "WITHOUT_DISSENT", "UNANIMOUS", "ORDINARY"];
    state.items = cats.map((c, i) => ({ id: `i${i + 1}`, meetingId: "m1", resolutionCategory: c }));
    state.ballotVotes = cats.flatMap((_, i) =>
      lots.slice(0, 8).map((l) => ({ agendaItemId: `i${i + 1}`, lotId: l.id, voteValue: "FOR", unitEntitlement: 10, isInformal: false })),
    );
    sharedFake.reset({});
    expect(await closeBallotAction("s1", "m1")).toEqual({ ok: true });
    // Only the ordinary resolution is written: the other three are undetermined, whatever the votes.
    expect(updateAgendaItem).toHaveBeenCalledTimes(1);
    expect(updateAgendaItem).toHaveBeenCalledWith("m1", "i4", { outcome: "RESOLVED", status: "CARRIED" });
    expect(recordMeetingEvent).toHaveBeenCalledWith({
      meetingId: "m1",
      actorId: "adviser",
      eventType: "BALLOT_CLOSED",
      payload: { results: [{ itemId: "i4", outcome: "RESOLVED" }] },
    });
  });
});

describe("an item with no category at a general meeting", () => {
  it("cannot be recorded as resolved under any draft pack, and nothing is written", async () => {
    for (const st of ["VIC", "ACT", "WA"]) {
      for (const category of [null, ""]) {
        at(st, category);
        const r = await record("RESOLVED", [v(1, "FOR"), v(2, "FOR")]);
        expect(r.error, st).toBe(
          "This item has no resolution type, so its votes cannot be counted and it cannot be recorded as resolved at a general meeting. Give the item its resolution type on the agenda first. It can be recorded as lost, or deferred.",
        );
      }
    }
    nothingWritten();
  });

  it("can still be recorded as lost or deferred", async () => {
    for (const st of ["VIC", "ACT", "WA"]) {
      vi.clearAllMocks();
      at(st, null);
      expect(await record("MOTION_LOST", [v(1, "AGAINST")]), st).toEqual({ ok: true });
      expect(updateAgendaItem).toHaveBeenCalledWith("m1", "i1", { outcome: "MOTION_LOST", status: "LOST" });
      vi.clearAllMocks();
      at(st, null);
      expect(await record("DEFERRED"), st).toEqual({ ok: true });
      expect(updateAgendaItem).toHaveBeenCalledWith("m1", "i1", { outcome: "DEFERRED", status: "DEFERRED" });
    }
  });

  it("is recorded as resolved at a committee meeting, which its members decide", async () => {
    state.meeting = { ...AGM, meetingType: "COMMITTEE" };
    at("VIC", null);
    expect(await record("RESOLVED")).toEqual({ ok: true });
    expect(updateAgendaItem).toHaveBeenCalledWith("m1", "i1", { outcome: "RESOLVED", status: "CARRIED" });
  });
});
