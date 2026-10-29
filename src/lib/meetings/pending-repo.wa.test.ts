/**
 * Western Australia's voting period (DB access; VIC, ACT and WA stage 2,
 * PR 8b-ii, 29 Oct 2026), with the fake ORM: the row opened with the item
 * stored as OPEN; written votes after the meeting (D8), each under the row
 * lock with its event, refused for a lot entered at the meeting, a second
 * vote, a day outside the period or a lot owing money on the day received;
 * the outcome notice; and the close, decided by the daily run only after the
 * grace, in the building's time zone, on the votes at the meeting and the
 * written votes weighed by each lot's unit entitlement, judged again under
 * the row lock (review M3).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("@/lib/log", () => ({ logError: vi.fn() }));
// The Western Australian pack, given as if live (it has no buildings yet).
vi.mock("@/lib/jurisdiction/scheme-rules", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/jurisdiction/scheme-rules")>();
  const { PENDING_RULE_PACKS } = await import("@/config/statutory");
  return {
    ...actual,
    rulesForState: (s: string) => (s === "WA" ? { pack: PENDING_RULE_PACKS.WA, rules: PENDING_RULE_PACKS.WA.rules, label: "AU-WA 2026.10.8" } : actual.rulesForState(s)),
  };
});

const { sharedFake } = await import("@/test/fake-orm");
const { PENDING_RULE_PACKS } = await import("@/config/statutory");
const repo = await import("./pending-repo");
const { pendingDates } = await import("./pending");

const WA = PENDING_RULE_PACKS.WA.rules.MEETING_RULES;
const VP = WA.pendingResolutions!.VOTING_PERIOD!;

/** Twelve lots of 10 unit entitlement each, and the common property. */
const LOTS = [
  ...Array.from({ length: 12 }, (_, i) => ({ id: `lot-${i + 1}`, schemeId: "w1", lotNumber: String(i + 1), entitlement: 10, lotType: "RESIDENTIAL" })),
  { id: "cp", schemeId: "w1", lotNumber: "CP", entitlement: 0, lotType: "COMMON" },
];
const waScheme = { id: "w1", timeZone: "Australia/Perth", totalLots: 12, lots: LOTS };
const at = (iso: string) => new Date(iso);
const vote = (n: number, v: string) => ({ lotId: `lot-${n}`, lotNumber: String(n), vote: v, byProxy: false, source: "CHAIR" });

function seed() {
  sharedFake.reset({
    Scheme: [{ id: "w1", state: "WA", timeZone: "Australia/Perth" }],
    Lot: LOTS.map((l) => ({ ...l })),
    Meeting: [{ id: "m1", schemeId: "w1", meetingType: "AGM", scheduledAt: "2026-11-02T02:00:00.000Z", startTime: null, openedAt: "2026-11-02T02:00:00.000Z" }],
    AgendaItem: [{ id: "i1", meetingId: "m1", resolutionCategory: "SPECIAL", status: "PENDING", outcome: null, position: 1, title: "New by-law" }],
    PendingResolution: [],
    PendingResolutionLot: [],
    MeetingEvent: [],
  });
  sharedFake.setUniqueKeys({ PendingResolution: [["agendaItemId"]], PendingResolutionLot: [["pendingResolutionId", "lotId", "entry"]] });
}

/** A special resolution made on Monday 2 November 2026: lots 1 to 4 for, lot 5 against, lot 6 not counted for money owed. */
async function open() {
  return repo.openPendingResolution({
    schemeId: "w1",
    meetingId: "m1",
    itemId: "i1",
    state: "WA",
    kind: "VOTING_PERIOD",
    category: "SPECIAL",
    takesEffectAs: "SPECIAL",
    dates: pendingDates(VP, "2026-11-02"),
    meetingVotes: {
      counted: [vote(1, "FOR"), vote(2, "FOR"), vote(3, "FOR"), vote(4, "FOR"), vote(5, "AGAINST")],
      notCounted: [vote(6, "FOR")],
      tally: { forCount: 4, againstCount: 1, abstainCount: 0, totalLots: 12, forUE: 40, againstUE: 10, totalEntitlement: 120 },
    },
    rule: { pending: VP, resolution: WA.resolutionCategories.SPECIAL! },
    rulePack: "AU-WA 2026.10.8",
    actorId: "chair",
    stored: "OPEN",
    eventPayload: { itemId: "i1", outcome: "OPEN" },
  });
}

const pendingRow = () => sharedFake.table("PendingResolution")[0];
const item = () => sharedFake.table("AgendaItem")[0];
const events = (type: string) => sharedFake.table("MeetingEvent").filter((e) => e.eventType === type);
type Barred = (day: string, category: string) => Promise<ReadonlySet<string>>;
const noneBarred: Barred = async () => new Set<string>();

function lateVote(lotId: string, v: string, receivedOn: string, now = "2026-11-25T02:00:00.000Z", barredLotIds: Barred = noneBarred) {
  return repo.recordLateVote({ scheme: waScheme, meetingId: "m1", pendingId: String(pendingRow().id), lotId, vote: v, receivedOn, barredLotIds, actorId: "adviser", now: at(now) });
}

beforeEach(seed);

describe("opening at conduct", () => {
  it("stores the item as OPEN, never as carried, with the row and its event", async () => {
    expect(await open()).toEqual({ ok: true });
    expect(item()).toMatchObject({ status: "OPEN", outcome: "OPEN" });
    expect(pendingRow()).toMatchObject({ state: "WA", kind: "VOTING_PERIOD", status: "PENDING", madeOn: "2026-11-02", windowClosesOn: "2026-11-30", noticeDueOn: null });
    expect(events("AGENDA_OUTCOME_RECORDED")[0]).toMatchObject({ payload: { itemId: "i1", outcome: "OPEN", pendingId: pendingRow().id } });
  });
});

describe("written votes after the meeting (D8)", () => {
  beforeEach(async () => {
    await open();
  });

  it("records one per lot with nothing entered, under the row lock, with its event", async () => {
    expect(await lateVote("lot-7", "FOR", "2026-11-20")).toEqual({ ok: true, notice: "Recorded. Lot 7 voted for in writing." });
    expect(sharedFake.table("PendingResolutionLot")).toEqual([
      expect.objectContaining({ pendingResolutionId: pendingRow().id, lotId: "lot-7", entry: "LATE_VOTE", vote: "FOR", receivedOn: "2026-11-20", recordedBy: "adviser" }),
    ]);
    expect(events("PENDING_LATE_VOTE_RECORDED")).toEqual([
      expect.objectContaining({ meetingId: "m1", actorId: "adviser", payload: { pendingId: pendingRow().id, itemId: "i1", lotId: "lot-7", vote: "FOR", receivedOn: "2026-11-20" } }),
    ]);
    expect(sharedFake.locks).toContainEqual({ table: "PendingResolution", ids: [pendingRow().id], inTransaction: true });
    // The last day of the period, recorded during the grace.
    expect(await lateVote("lot-8", "AGAINST", "2026-11-30", "2026-12-03T02:00:00.000Z")).toMatchObject({ ok: true });
  });

  it("refuses a lot entered at the meeting (counted or not), a second vote, an abstention, common property and a day outside the period, storing nothing", async () => {
    expect(await lateVote("lot-5", "FOR", "2026-11-20")).toEqual({ error: "Lot 5 had a vote or an abstention entered at the meeting, so it cannot vote again in writing. Nothing was saved." });
    expect(await lateVote("lot-6", "FOR", "2026-11-20")).toEqual({ error: "Lot 6 had a vote or an abstention entered at the meeting, so it cannot vote again in writing. Nothing was saved." });
    expect(await lateVote("lot-7", "ABSTAIN", "2026-11-20")).toEqual({ error: "Choose For or Against. Nothing was saved." });
    expect(await lateVote("cp", "FOR", "2026-11-20")).toEqual({ error: "Choose a lot of this building. Nothing was saved." });
    expect(await lateVote("lot-7", "FOR", "2026-12-01", "2026-12-02T02:00:00.000Z")).toEqual({
      error: "The day the written vote was received must be on or before 30 November 2026, the last day of its period.",
    });
    expect(sharedFake.table("PendingResolutionLot")).toHaveLength(0);
    expect(await lateVote("lot-7", "FOR", "2026-11-20")).toMatchObject({ ok: true });
    expect(await lateVote("lot-7", "AGAINST", "2026-11-21")).toEqual({ error: "A written vote for lot 7 is already recorded. Each lot votes once. Nothing was saved." });
    expect(sharedFake.table("PendingResolutionLot")).toHaveLength(1);
    expect(events("PENDING_LATE_VOTE_RECORDED")).toHaveLength(1);
  });

  it("judges a debt on the day the vote was received (s 120(2)), refusing a lot owing money then", async () => {
    const asked: [string, string][] = [];
    const barred = async (day: string, category: string) => {
      asked.push([day, category]);
      return new Set(day < "2026-11-15" ? ["lot-7"] : []);
    };
    expect(await lateVote("lot-7", "FOR", "2026-11-10", undefined, barred)).toEqual({
      error: "Lot 7 had an amount owing on 10 November 2026, the day its written vote was received, so it cannot vote on this resolution. Nothing was saved.",
    });
    expect(sharedFake.table("PendingResolutionLot")).toHaveLength(0);
    // Paid by a later day: a vote received then is recorded.
    expect(await lateVote("lot-7", "FOR", "2026-11-16", undefined, barred)).toMatchObject({ ok: true });
    expect(asked).toEqual([
      ["2026-11-10", "SPECIAL"],
      ["2026-11-16", "SPECIAL"],
    ]);
  });

  it("refuses once the resolution is decided, and on a resolution that takes no written votes", async () => {
    pendingRow().status = "CARRIED";
    expect(await lateVote("lot-7", "FOR", "2026-11-20")).toEqual({ error: "This resolution is already decided. Nothing was saved." });
    pendingRow().status = "PENDING";
    pendingRow().kind = "INTERIM_SPECIAL";
    expect(await lateVote("lot-7", "FOR", "2026-11-20")).toEqual({ error: "Written votes after the meeting are not taken on this resolution. Nothing was saved." });
  });
});

describe("the close (D9, D11 and the grace)", () => {
  beforeEach(async () => {
    await open();
  });

  it("waits until the grace ends in Perth, is blocked without the outcome notice, and is decided once it is recorded", async () => {
    await lateVote("lot-7", "FOR", "2026-11-20");
    expect(await lateVote("lot-8", "FOR", "2026-11-24")).toMatchObject({ ok: true });
    // 7 Dec in Perth: within the grace.
    expect(await repo.settleDuePendingResolutions({}, at("2026-12-07T15:59:00.000Z"))).toMatchObject({ settled: 0, waiting: 0, blocked: [expect.objectContaining({ blocker: expect.stringMatching(/^The written notice of the outcome/) })] });
    // 8 Dec in Perth, after the grace: still blocked without the notice.
    const blocked = await repo.settleDuePendingResolutions({}, at("2026-12-07T16:00:00.000Z"));
    expect(blocked).toMatchObject({ settled: 0, failed: 0 });
    expect(blocked.blocked[0].blocker).toBe(
      "The written notice of the outcome to the owners with no-one present at the meeting is not recorded as given, so it cannot be decided. Record the day it was given.",
    );
    expect(item()).toMatchObject({ status: "OPEN" });
    // Recording the notice decides it, as it is due: 6 of 12 lots for (lot 6 not counted), 60 of 120 entitlement.
    expect(await repo.recordPendingNotice({ scheme: waScheme, meetingId: "m1", pendingId: String(pendingRow().id), givenOn: "2026-11-04", actorId: "adviser", now: at("2026-12-08T02:00:00.000Z") })).toEqual({ ok: true });
    expect(pendingRow()).toMatchObject({ status: "CARRIED", endedBy: "VOTES_AT_CLOSE", effectiveOn: "2026-12-01", noticeGivenOn: "2026-11-04", decidedBy: null });
    expect(item()).toMatchObject({ status: "CARRIED", outcome: "RESOLVED" });
    expect(events("PENDING_RESOLUTION_SETTLED")).toEqual([
      expect.objectContaining({
        meetingId: "m1",
        actorId: null,
        payload: expect.objectContaining({
          kind: "VOTING_PERIOD",
          status: "CARRIED",
          endedBy: "VOTES_AT_CLOSE",
          effectiveOn: "2026-12-01",
          close: { tally: expect.objectContaining({ forCount: 6, againstCount: 1, forUE: 60, againstUE: 10, totalLots: 12, totalEntitlement: 120 }), evaluation: expect.objectContaining({ passed: true }) },
        }),
      }),
    ]);
    // Done once: a second run does nothing.
    expect(await repo.settleDuePendingResolutions({}, at("2026-12-20T02:00:00.000Z"))).toMatchObject({ settled: 0 });
    expect(events("PENDING_RESOLUTION_SETTLED")).toHaveLength(1);
  });

  it("decides it lost on the votes at the close, with no day", async () => {
    pendingRow().noticeGivenOn = "2026-11-04";
    await lateVote("lot-7", "AGAINST", "2026-11-20");
    await lateVote("lot-8", "AGAINST", "2026-11-20");
    expect(await repo.settleDuePendingResolutions({ meetingId: "m1" }, at("2026-12-08T02:00:00.000Z"))).toMatchObject({ settled: 1 });
    expect(pendingRow()).toMatchObject({ status: "LOST", endedBy: "VOTES_AT_CLOSE" });
    expect(pendingRow().effectiveOn ?? null).toBeNull();
    expect(item()).toMatchObject({ status: "LOST", outcome: "MOTION_LOST" });
  });

  it("is blocked where a written vote's lot has no entitlement to read", async () => {
    pendingRow().noticeGivenOn = "2026-11-04";
    await lateVote("lot-7", "FOR", "2026-11-20");
    sharedFake.table("Lot").find((l) => l.id === "lot-7")!.entitlement = null;
    const run = await repo.settleDuePendingResolutions({}, at("2026-12-08T02:00:00.000Z"));
    expect(run).toMatchObject({ settled: 0, failed: 0 });
    expect(run.blocked[0].blocker).toBe("The entitlement of a lot with a written vote is not recorded, so the votes cannot be counted. Record it in the building's lots.");
    expect(pendingRow().status).toBe("PENDING");
  });

  it("judges it again once locked: a written vote recorded since it was read changes the count, so it is left for the next run (review M3)", async () => {
    pendingRow().noticeGivenOn = "2026-11-04";
    await lateVote("lot-7", "FOR", "2026-11-20");
    await lateVote("lot-8", "FOR", "2026-11-20");
    const original = sharedFake.db.transaction;
    const spy = vi.spyOn(sharedFake.db, "transaction").mockImplementationOnce(async (fn) => {
      // Recorded by another request after the run read it as carried: 2 more against make it lost.
      for (const n of [9, 10]) {
        sharedFake.table("PendingResolutionLot").push({ id: `late-${n}`, pendingResolutionId: pendingRow().id, lotId: `lot-${n}`, entry: "LATE_VOTE", vote: "AGAINST", receivedOn: "2026-11-29", recordedBy: "x" });
      }
      return original(fn as never);
    });
    expect(await repo.settleDuePendingResolutions({}, at("2026-12-08T02:00:00.000Z"))).toMatchObject({ settled: 0, failed: 0 });
    spy.mockRestore();
    expect(pendingRow().status).toBe("PENDING");
    expect(item()).toMatchObject({ status: "OPEN" });
    // The next run counts every vote.
    expect(await repo.settleDuePendingResolutions({}, at("2026-12-09T02:00:00.000Z"))).toMatchObject({ settled: 1 });
    expect(pendingRow()).toMatchObject({ status: "LOST", endedBy: "VOTES_AT_CLOSE" });
  });

  it("refuses a written vote once it is decided", async () => {
    pendingRow().noticeGivenOn = "2026-11-04";
    await repo.settleDuePendingResolutions({}, at("2026-12-08T02:00:00.000Z"));
    expect(pendingRow().status).toBe("LOST");
    expect(await lateVote("lot-7", "FOR", "2026-11-20", "2026-12-08T02:00:00.000Z")).toEqual({ error: "This resolution is already decided. Nothing was saved." });
  });
});

describe("the meeting page's panel", () => {
  it("shows the votes so far and offers the lots that may still vote in writing", async () => {
    await open();
    await lateVote("lot-7", "FOR", "2026-11-20");
    const data = await repo.pendingPanelData({ scheme: waScheme, meetingId: "m1", itemLabels: new Map([["i1", "1. New by-law"]]), now: at("2026-11-25T02:00:00.000Z") });
    const p = data!.items[0];
    expect(p).toMatchObject({ kindLabel: "Voting period", status: "PENDING", canRecordNotice: true, noticeLabel: VP.lateVotes!.noticeLabel, confirmChoices: [] });
    expect(p.facts).toContain("Votes at the meeting: 4 for, 1 against.");
    expect(p.facts).toContain("Lot 7 voted for in writing, received on 20 November 2026.");
    expect(p.lateVote?.lots.map((l) => l.lotNumber)).toEqual(["8", "9", "10", "11", "12"]);
    // A written vote is not a petition signature.
    expect(p.facts.some((f) => f.startsWith("Petition"))).toBe(false);
  });
});
