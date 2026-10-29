/**
 * Resolutions decided later (DB access; VIC, ACT and WA stage 2, PR 8b-i,
 * 29 Oct 2026), with the fake ORM: opening a row with its item and event in
 * one transaction; deciding it in one transaction (the row locked and checked
 * still PENDING, the item set only while INTERIM, the event appended, the
 * first writer winning and a repeat doing nothing); the facts an adviser
 * records, each once and only while pending, with the window checks; the
 * petition thresholds; confirmations; and the daily run across time zones.
 * The database's own guard trigger is not in the fake: what it refuses is
 * refused here first, under the row lock.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("@/lib/log", () => ({ logError: vi.fn() }));

const { sharedFake } = await import("@/test/fake-orm");
const { PENDING_RULE_PACKS } = await import("@/config/statutory");
const repo = await import("./pending-repo");
const { pendingDates } = await import("./pending");

const VIC = PENDING_RULE_PACKS.VIC.rules.MEETING_RULES;
const ACT = PENDING_RULE_PACKS.ACT.rules.MEETING_RULES;
const S97 = VIC.pendingResolutions!.INTERIM_SPECIAL!;
const S78 = VIC.pendingResolutions!.INTERIM_NO_QUORUM!;
const RQ = ACT.pendingResolutions!.REDUCED_QUORUM!;

const LOTS = [
  ...Array.from({ length: 8 }, (_, i) => ({ id: `lot-${i + 1}`, lotNumber: String(i + 1), lotType: "RESIDENTIAL" })),
  { id: "cp", lotNumber: "CP", lotType: "COMMON" },
];
const vicScheme = { id: "s1", timeZone: "Australia/Melbourne", totalLots: 8, lots: LOTS };
const actScheme = { id: "s2", timeZone: "Australia/Sydney", totalLots: 8, lots: LOTS };

function seed() {
  sharedFake.reset({
    Scheme: [
      { id: "s1", state: "VIC", timeZone: "Australia/Melbourne" },
      { id: "s2", state: "ACT", timeZone: "Australia/Sydney" },
    ],
    Meeting: [
      { id: "m1", schemeId: "s1", meetingType: "AGM", scheduledAt: "2026-11-01T22:00:00.000Z", startTime: null, openedAt: "2026-11-01T22:00:00.000Z" },
      { id: "sgm", schemeId: "s1", meetingType: "EGM", scheduledAt: "2026-12-10T08:00:00.000Z", startTime: null, openedAt: null },
      { id: "agm2", schemeId: "s1", meetingType: "AGM", scheduledAt: "2026-12-10T08:00:00.000Z", startTime: null, openedAt: null },
      { id: "a1", schemeId: "s2", meetingType: "AGM", scheduledAt: "2026-11-01T22:00:00.000Z", startTime: null, openedAt: "2026-11-01T22:00:00.000Z" },
      { id: "a2", schemeId: "s2", meetingType: "EGM", scheduledAt: "2026-11-19T22:00:00.000Z", startTime: null, openedAt: "2026-11-19T22:00:00.000Z" },
    ],
    AgendaItem: [
      { id: "i1", meetingId: "m1", resolutionCategory: "SPECIAL", status: "PENDING", outcome: null },
      { id: "i2", meetingId: "m1", resolutionCategory: "ORDINARY", status: "PENDING", outcome: null },
      { id: "sgm-1", meetingId: "sgm", resolutionCategory: "ORDINARY", status: "CARRIED", outcome: "RESOLVED" },
      { id: "sgm-2", meetingId: "sgm", resolutionCategory: "ORDINARY", status: "LOST", outcome: "MOTION_LOST" },
      { id: "x1", meetingId: "a1", resolutionCategory: "ORDINARY", status: "PENDING", outcome: null },
      { id: "x2", meetingId: "a2", resolutionCategory: "ORDINARY", status: "CARRIED", outcome: "RESOLVED" },
      { id: "x3", meetingId: "a2", resolutionCategory: "ORDINARY", status: "CARRIED", outcome: "RESOLVED" },
    ],
    PendingResolution: [],
    PendingResolutionLot: [],
    MeetingEvent: [
      { id: "e1", meetingId: "a2", eventType: "AGENDA_OUTCOME_RECORDED", createdAt: "2026-11-19T23:00:00.000Z", payload: { itemId: "x2", attestation: { quorumPresent: true } } },
      { id: "e2", meetingId: "a2", eventType: "AGENDA_OUTCOME_RECORDED", createdAt: "2026-11-19T23:10:00.000Z", payload: { itemId: "x3", attestation: { quorumPresent: false, reducedQuorumPresent: true } } },
    ],
  });
  sharedFake.setUniqueKeys({ PendingResolution: [["agendaItemId"]], PendingResolutionLot: [["pendingResolutionId", "lotId", "entry"]] });
}

async function open(itemId: string, kind: "INTERIM_SPECIAL" | "INTERIM_NO_QUORUM" | "REDUCED_QUORUM", madeOn = "2026-11-02") {
  const rule = kind === "INTERIM_SPECIAL" ? S97 : kind === "INTERIM_NO_QUORUM" ? S78 : RQ;
  const schemeId = kind === "REDUCED_QUORUM" ? "s2" : "s1";
  const meetingId = kind === "REDUCED_QUORUM" ? "a1" : "m1";
  const category = kind === "INTERIM_SPECIAL" ? "SPECIAL" : "ORDINARY";
  return repo.openPendingResolution({
    schemeId,
    meetingId,
    itemId,
    state: kind === "REDUCED_QUORUM" ? "ACT" : "VIC",
    kind,
    category,
    takesEffectAs: category,
    dates: pendingDates(rule, madeOn),
    meetingVotes: { counted: [], notCounted: [], tally: { forCount: 4, againstCount: 2 } },
    rule: { pending: rule, resolution: null },
    rulePack: "AU-VIC 2026.10.10",
    actorId: "chair",
    eventPayload: { itemId, outcome: "INTERIM" },
  });
}

const pendingRow = (itemId: string) => sharedFake.table("PendingResolution").find((r) => r.agendaItemId === itemId)!;
const item = (id: string) => sharedFake.table("AgendaItem").find((r) => r.id === id)!;
const events = (type: string) => sharedFake.table("MeetingEvent").filter((e) => e.eventType === type);
const at = (iso: string) => new Date(iso);

beforeEach(seed);

describe("opening at conduct", () => {
  it("writes the row, the item as INTERIM and the event in one transaction, locking the item", async () => {
    expect(await open("i1", "INTERIM_SPECIAL")).toEqual({ ok: true });
    expect(pendingRow("i1")).toMatchObject({ schemeId: "s1", meetingId: "m1", kind: "INTERIM_SPECIAL", status: "PENDING", madeOn: "2026-11-02", windowClosesOn: "2026-12-01", noticeDueOn: "2026-11-16", recordedBy: "chair" });
    expect(item("i1")).toMatchObject({ status: "INTERIM", outcome: "INTERIM" });
    expect(events("AGENDA_OUTCOME_RECORDED").at(-1)).toMatchObject({ meetingId: "m1", actorId: "chair", payload: { itemId: "i1", outcome: "INTERIM", pendingId: pendingRow("i1").id } });
    expect(sharedFake.locks).toContainEqual({ table: "AgendaItem", ids: ["i1"], inTransaction: true });
    expect(sharedFake.statements).toContain("SET LOCAL lock_timeout = '5s'");
  });

  it("refuses a second row for the same item, writing nothing more", async () => {
    await open("i1", "INTERIM_SPECIAL");
    const before = sharedFake.table("MeetingEvent").length;
    expect(await open("i1", "INTERIM_SPECIAL")).toEqual({ error: "This item is already decided later. Nothing was saved." });
    expect(sharedFake.table("PendingResolution")).toHaveLength(1);
    expect(sharedFake.table("MeetingEvent")).toHaveLength(before);
  });

  it("rolls back the row and the item when the event cannot be written", async () => {
    sharedFake.setUniqueKeys({ MeetingEvent: [["meetingId"]] });
    sharedFake.table("MeetingEvent").push({ id: "dup", meetingId: "m1", eventType: "X" });
    await expect(open("i2", "INTERIM_NO_QUORUM")).rejects.toThrow(/duplicate key/);
    expect(sharedFake.table("PendingResolution")).toHaveLength(0);
    expect(item("i2")).toMatchObject({ status: "PENDING", outcome: null });
  });
});

describe("deciding", () => {
  it("sets the row and the item, appends the event, and does nothing the second time", async () => {
    await open("i1", "INTERIM_SPECIAL");
    const id = String(pendingRow("i1").id);
    const now = at("2026-12-01T14:00:00.000Z");
    expect(await repo.settlePendingResolution(id, { status: "CARRIED", endedBy: "PERIOD_ENDED", effectiveOn: "2026-12-02" }, null, now)).toBe(true);
    expect(pendingRow("i1")).toMatchObject({ status: "CARRIED", endedBy: "PERIOD_ENDED", effectiveOn: "2026-12-02", decidedAt: now.toISOString(), decidedBy: null });
    expect(item("i1")).toMatchObject({ status: "CARRIED", outcome: "RESOLVED" });
    expect(events("PENDING_RESOLUTION_SETTLED")).toEqual([
      expect.objectContaining({ meetingId: "m1", actorId: null, payload: { pendingId: id, itemId: "i1", kind: "INTERIM_SPECIAL", status: "CARRIED", endedBy: "PERIOD_ENDED", effectiveOn: "2026-12-02" } }),
    ]);
    expect(sharedFake.locks).toContainEqual({ table: "PendingResolution", ids: [id], inTransaction: true });
    // The first writer wins: a second decision changes nothing.
    expect(await repo.settlePendingResolution(id, { status: "LOST", endedBy: "PETITION", effectiveOn: null }, "adviser")).toBe(false);
    expect(pendingRow("i1")).toMatchObject({ status: "CARRIED" });
    expect(events("PENDING_RESOLUTION_SETTLED")).toHaveLength(1);
  });

  it("writes LOST as MOTION_LOST", async () => {
    await open("i1", "INTERIM_SPECIAL");
    await repo.settlePendingResolution(String(pendingRow("i1").id), { status: "LOST", endedBy: "PETITION", effectiveOn: null, extra: { petitionReceivedOn: "2026-11-20" } }, "adviser");
    expect(item("i1")).toMatchObject({ status: "LOST", outcome: "MOTION_LOST" });
  });

  it("rolls everything back when the item is no longer pending", async () => {
    await open("i1", "INTERIM_SPECIAL");
    item("i1").status = "CARRIED";
    const id = String(pendingRow("i1").id);
    await expect(repo.settlePendingResolution(id, { status: "CARRIED", endedBy: "PERIOD_ENDED", effectiveOn: "2026-12-02" }, null)).rejects.toThrow(/no longer pending/);
    expect(pendingRow("i1").status).toBe("PENDING");
    expect(pendingRow("i1").endedBy ?? null).toBeNull();
    expect(events("PENDING_RESOLUTION_SETTLED")).toHaveLength(0);
  });
});

describe("the daily run", () => {
  it("decides what is due on today in each building's zone, waits for the rest, and lists what is blocked", async () => {
    await open("i1", "INTERIM_SPECIAL"); // Victoria: closes 1 Dec, notice missing
    await open("i2", "INTERIM_NO_QUORUM");
    await open("x1", "REDUCED_QUORUM"); // the ACT: closes 30 Nov
    pendingRow("i2").noticeGivenOn = "2026-11-03";
    pendingRow("x1").noticeGivenOn = "2026-11-03";
    // 30 Nov 13:30 UTC is 1 Dec 00:30 in Sydney and Melbourne: the ACT row is due; Victoria's are not.
    const first = await repo.settleDuePendingResolutions({}, at("2026-11-30T13:30:00.000Z"));
    expect(first).toEqual({ settled: 1, waiting: 2, blocked: [], failed: 0 });
    expect(pendingRow("x1")).toMatchObject({ status: "CARRIED", endedBy: "PERIOD_ENDED", effectiveOn: "2026-12-01" });
    expect(item("x1")).toMatchObject({ status: "CARRIED", outcome: "RESOLVED" });
    const second = await repo.settleDuePendingResolutions({}, at("2026-12-01T13:30:00.000Z"));
    expect(second.settled).toBe(1);
    expect(second.blocked).toEqual([{ id: pendingRow("i1").id, blocker: expect.stringMatching(/^Its notice to the owners is not recorded/) }]);
    expect(pendingRow("i2")).toMatchObject({ status: "CARRIED", effectiveOn: "2026-12-02" });
    // Run again: nothing more to do, and nothing changes.
    const third = await repo.settleDuePendingResolutions({}, at("2026-12-01T13:30:00.000Z"));
    expect(third).toMatchObject({ settled: 0, waiting: 0, failed: 0 });
  });

  it("decides one meeting only when asked", async () => {
    await open("i2", "INTERIM_NO_QUORUM");
    await open("x1", "REDUCED_QUORUM");
    pendingRow("i2").noticeGivenOn = "2026-11-03";
    pendingRow("x1").noticeGivenOn = "2026-11-03";
    expect(await repo.settleDuePendingResolutions({ meetingId: "a1" }, at("2027-01-01T00:00:00.000Z"))).toMatchObject({ settled: 1 });
    expect(pendingRow("i2").status).toBe("PENDING");
  });

  it("counts a failure and goes on with the others", async () => {
    await open("i2", "INTERIM_NO_QUORUM");
    await open("x1", "REDUCED_QUORUM");
    pendingRow("i2").noticeGivenOn = "2026-11-03";
    pendingRow("x1").noticeGivenOn = "2026-11-03";
    item("i2").status = "DEFERRED";
    expect(await repo.settleDuePendingResolutions({}, at("2027-01-01T00:00:00.000Z"))).toMatchObject({ settled: 1, failed: 1 });
    expect(pendingRow("x1").status).toBe("CARRIED");
  });

  it("Victoria s 78: waits for the special general meeting, then decides by whether it was opened in time", async () => {
    await open("i2", "INTERIM_NO_QUORUM");
    Object.assign(pendingRow("i2"), { noticeGivenOn: "2026-11-03", meetingNoticeGivenOn: "2026-11-20", meetingHeldBy: "2026-12-18", meetingNoticeMeetingId: "sgm" });
    expect(await repo.settleDuePendingResolutions({}, at("2026-12-10T00:00:00.000Z"))).toMatchObject({ settled: 0, waiting: 1 });
    sharedFake.table("Meeting").find((m) => m.id === "sgm")!.openedAt = "2026-12-10T08:00:00.000Z";
    const held = await repo.settleDuePendingResolutions({}, at("2026-12-20T00:00:00.000Z"));
    expect(held.blocked[0].blocker).toMatch(/was held\. Record whether it confirmed/);
    sharedFake.table("Meeting").find((m) => m.id === "sgm")!.openedAt = null;
    expect(await repo.settleDuePendingResolutions({}, at("2026-12-20T00:00:00.000Z"))).toMatchObject({ settled: 1 });
    expect(pendingRow("i2")).toMatchObject({ status: "CARRIED", endedBy: "MEETING_NOT_HELD", effectiveOn: "2026-12-19" });
  });
});

describe("the notice to the owners (D3)", () => {
  it("is recorded once, flagged when late, and decides a row whose period has ended", async () => {
    await open("i1", "INTERIM_SPECIAL");
    const id = String(pendingRow("i1").id);
    const p = { scheme: vicScheme, meetingId: "m1", pendingId: id, actorId: "adviser" };
    expect(await repo.recordPendingNotice({ ...p, givenOn: "2026-11-01", now: at("2026-11-20T00:00:00.000Z") })).toEqual({
      error: "The day the notice was given cannot be before 2 November 2026, the day the resolution was made.",
    });
    expect(await repo.recordPendingNotice({ ...p, givenOn: "2026-12-05", now: at("2026-12-04T00:00:00.000Z") })).toEqual({ error: "The day the notice was given cannot be after today." });
    const late = await repo.recordPendingNotice({ ...p, givenOn: "2026-12-03", now: at("2026-12-04T00:00:00.000Z") });
    expect(late).toEqual({ ok: true, notice: "Recorded. The notice was given after 16 November 2026, the day it was due. This is flagged, and the dates of the resolution do not move." });
    expect(events("PENDING_NOTICE_RECORDED")[0]).toMatchObject({ actorId: "adviser", payload: { pendingId: id, itemId: "i1", givenOn: "2026-12-03", late: true, dueOn: "2026-11-16" } });
    // Its period ended on 1 Dec, and a notice given after it makes it take effect on the day it was given.
    expect(pendingRow("i1")).toMatchObject({ status: "CARRIED", effectiveOn: "2026-12-03" });
    expect(await repo.recordPendingNotice({ ...p, givenOn: "2026-12-03", now: at("2026-12-04T00:00:00.000Z") })).toEqual({ error: "This resolution is already decided. Nothing was saved." });
  });

  it("cannot be changed once recorded, and belongs to its own building and meeting", async () => {
    await open("i1", "INTERIM_SPECIAL");
    const id = String(pendingRow("i1").id);
    const p = { scheme: vicScheme, meetingId: "m1", pendingId: id, actorId: "adviser", now: at("2026-11-20T00:00:00.000Z") };
    expect(await repo.recordPendingNotice({ ...p, givenOn: "2026-11-10" })).toEqual({ ok: true });
    expect(await repo.recordPendingNotice({ ...p, givenOn: "2026-11-12" })).toEqual({ error: "This is already recorded and cannot be changed. Nothing was saved." });
    expect(pendingRow("i1").noticeGivenOn).toBe("2026-11-10");
    expect(await repo.recordPendingNotice({ ...p, meetingId: "sgm", givenOn: "2026-11-12" })).toEqual({ error: "That resolution is not found on this meeting." });
    expect(await repo.recordPendingNotice({ ...p, scheme: actScheme, givenOn: "2026-11-12" })).toEqual({ error: "That resolution is not found on this meeting." });
  });
});

describe("a petition (D4, D5)", () => {
  it("Victoria: 3 of 8 lots stops it, recorded as lost with the lots; 2 of 8 (exactly 25%) is refused and not stored", async () => {
    await open("i1", "INTERIM_SPECIAL");
    const id = String(pendingRow("i1").id);
    const p = { scheme: vicScheme, meetingId: "m1", pendingId: id, actorId: "adviser", receivedOn: "2026-11-20", now: at("2026-11-21T00:00:00.000Z") };
    expect(await repo.recordPendingPetition({ ...p, lotIds: ["lot-1", "lot-2"] })).toEqual({
      error: "The petition has 2 of the 8 lots, which is not more than 25%, so it does not stop the resolution. Nothing was saved.",
    });
    expect(sharedFake.table("PendingResolutionLot")).toHaveLength(0);
    expect(await repo.recordPendingPetition({ ...p, lotIds: ["lot-1", "cp"] })).toEqual({ error: "Choose only lots of this building that signed the petition." });
    expect(await repo.recordPendingPetition({ ...p, lotIds: [] })).toEqual({ error: "Choose the lots that signed the petition." });
    expect(await repo.recordPendingPetition({ ...p, receivedOn: "2026-12-02", now: at("2026-12-05T00:00:00.000Z"), lotIds: ["lot-1", "lot-2", "lot-3"] })).toMatchObject({
      error: expect.stringMatching(/must be on or before 1 December 2026/),
    });
    expect(await repo.recordPendingPetition({ ...p, lotIds: ["lot-1", "lot-2", "lot-3", "lot-3"] })).toEqual({ ok: true, notice: "Recorded. The petition stops the resolution, so it is recorded as lost." });
    expect(pendingRow("i1")).toMatchObject({ status: "LOST", endedBy: "PETITION", petitionReceivedOn: "2026-11-20", effectiveOn: null, decidedBy: "adviser" });
    expect(item("i1")).toMatchObject({ status: "LOST", outcome: "MOTION_LOST" });
    expect(sharedFake.table("PendingResolutionLot").map((l) => [l.lotId, l.entry, l.receivedOn, l.vote])).toEqual([
      ["lot-1", "PETITION", "2026-11-20", null],
      ["lot-2", "PETITION", "2026-11-20", null],
      ["lot-3", "PETITION", "2026-11-20", null],
    ]);
    expect(events("PENDING_RESOLUTION_SETTLED")[0].payload).toMatchObject({ endedBy: "PETITION", petition: { receivedOn: "2026-11-20", counted: 3, outOf: 8 } });
  });

  it("Victoria: refused where the lots entered do not match the building's number of lots", async () => {
    await open("i1", "INTERIM_SPECIAL");
    const r = await repo.recordPendingPetition({
      scheme: { ...vicScheme, totalLots: 9 },
      meetingId: "m1",
      pendingId: String(pendingRow("i1").id),
      actorId: "adviser",
      receivedOn: "2026-11-20",
      now: at("2026-11-21T00:00:00.000Z"),
      lotIds: ["lot-1", "lot-2", "lot-3"],
    });
    expect(r).toEqual({ error: "The lots entered (8) do not match the building's number of lots (9), so the petition cannot be counted. Check the lots first." });
  });

  it("the ACT: more than half of the units entitled to vote on the day, units barred for money owed left out", async () => {
    await open("x1", "REDUCED_QUORUM");
    const id = String(pendingRow("x1").id);
    const barredOn: string[] = [];
    const p = {
      scheme: actScheme,
      meetingId: "a1",
      pendingId: id,
      actorId: "adviser",
      receivedOn: "2026-11-20",
      now: at("2026-11-21T00:00:00.000Z"),
      barredLotIds: async (d: string) => (barredOn.push(d), new Set(["lot-7", "lot-8"])),
    };
    // 6 entitled: 3 is exactly half; a barred unit's signature does not count.
    expect(await repo.recordPendingPetition({ ...p, lotIds: ["lot-1", "lot-2", "lot-3", "lot-7"] })).toEqual({
      error: "The petition has 3 of the 6 lots entitled to vote on that day, which is not more than 50%, so it does not stop the resolution. Nothing was saved.",
    });
    expect(barredOn).toEqual(["2026-11-20"]);
    expect(await repo.recordPendingPetition({ ...p, lotIds: ["lot-1", "lot-2", "lot-3", "lot-4"] })).toMatchObject({ ok: true });
    expect(pendingRow("x1")).toMatchObject({ status: "LOST", endedBy: "PETITION" });
  });

  it("is refused for a kind no petition stops", async () => {
    await open("i2", "INTERIM_NO_QUORUM");
    const r = await repo.recordPendingPetition({ scheme: vicScheme, meetingId: "m1", pendingId: String(pendingRow("i2").id), actorId: "a", receivedOn: "2026-11-20", lotIds: ["lot-1"], now: at("2026-11-21T00:00:00.000Z") });
    expect(r).toEqual({ error: "A petition does not stop this resolution." });
  });
});

describe("Victoria s 78: the special general meeting", () => {
  it("records its notice within the period with the meeting called, once, and the day it must be held by", async () => {
    await open("i2", "INTERIM_NO_QUORUM");
    const id = String(pendingRow("i2").id);
    const p = { scheme: vicScheme, meetingId: "m1", pendingId: id, actorId: "adviser", givenOn: "2026-11-20", now: at("2026-11-21T00:00:00.000Z") };
    expect(await repo.recordSpecialMeetingNotice({ ...p, calledMeetingId: "agm2" })).toEqual({ error: "Choose the special general meeting of this building that the notice called." });
    expect(await repo.recordSpecialMeetingNotice({ ...p, calledMeetingId: "m1" })).toMatchObject({ error: expect.any(String) });
    expect(await repo.recordSpecialMeetingNotice({ ...p, calledMeetingId: "a2" })).toMatchObject({ error: expect.any(String) });
    expect(await repo.recordSpecialMeetingNotice({ ...p, calledMeetingId: "sgm" })).toEqual({ ok: true, notice: "Recorded. The special general meeting must be held by 18 December 2026." });
    expect(pendingRow("i2")).toMatchObject({ meetingNoticeGivenOn: "2026-11-20", meetingHeldBy: "2026-12-18", meetingNoticeMeetingId: "sgm", status: "PENDING" });
    expect(events("PENDING_MEETING_NOTICE_RECORDED")[0].payload).toMatchObject({ givenOn: "2026-11-20", calledMeetingId: "sgm", heldBy: "2026-12-18" });
    expect(await repo.recordSpecialMeetingNotice({ ...p, calledMeetingId: "sgm" })).toEqual({ error: "This is already recorded and cannot be changed. Nothing was saved." });
  });

  it("is refused after the period, and for an interim special resolution", async () => {
    await open("i1", "INTERIM_SPECIAL");
    await open("i2", "INTERIM_NO_QUORUM");
    const p = { scheme: vicScheme, meetingId: "m1", actorId: "adviser", calledMeetingId: "sgm" };
    expect(await repo.recordSpecialMeetingNotice({ ...p, pendingId: String(pendingRow("i2").id), givenOn: "2026-12-02", now: at("2026-12-05T00:00:00.000Z") })).toMatchObject({ error: expect.stringMatching(/1 December 2026/) });
    expect(await repo.recordSpecialMeetingNotice({ ...p, pendingId: String(pendingRow("i1").id), givenOn: "2026-11-20", now: at("2026-11-21T00:00:00.000Z") })).toEqual({ error: "A special general meeting is not called for this resolution." });
  });

  it("confirmed by that meeting's carried motion: carried on its day; not confirmed by a lost one: lost", async () => {
    await open("i2", "INTERIM_NO_QUORUM");
    const id = String(pendingRow("i2").id);
    Object.assign(pendingRow("i2"), { noticeGivenOn: "2026-11-03", meetingNoticeGivenOn: "2026-11-20", meetingHeldBy: "2026-12-18", meetingNoticeMeetingId: "sgm" });
    const p = { scheme: vicScheme, meetingId: "m1", pendingId: id, actorId: "adviser", confirmingMeetingId: "sgm" };
    expect(await repo.recordPendingConfirmation({ ...p, confirmingItemId: "x2" })).toEqual({ error: "Choose a motion from that meeting." });
    expect(await repo.recordPendingConfirmation({ ...p, confirmingMeetingId: "agm2", confirmingItemId: "sgm-1" })).toEqual({ error: "Choose a motion from that meeting." });
    expect(await repo.recordPendingConfirmation({ ...p, confirmingItemId: "sgm-1" })).toEqual({ ok: true, notice: "Recorded. It took effect on 10 December 2026." });
    expect(pendingRow("i2")).toMatchObject({ status: "CARRIED", endedBy: "CONFIRMED", effectiveOn: "2026-12-10", confirmedMeetingId: "sgm", confirmedItemId: "sgm-1" });
    expect(item("i2")).toMatchObject({ status: "CARRIED", outcome: "RESOLVED" });
  });

  it("not confirmed: lost", async () => {
    await open("i2", "INTERIM_NO_QUORUM");
    Object.assign(pendingRow("i2"), { meetingNoticeGivenOn: "2026-11-20", meetingHeldBy: "2026-12-18", meetingNoticeMeetingId: "sgm" });
    const r = await repo.recordPendingConfirmation({ scheme: vicScheme, meetingId: "m1", pendingId: String(pendingRow("i2").id), actorId: "a", confirmingMeetingId: "sgm", confirmingItemId: "sgm-2" });
    expect(r).toEqual({ ok: true, notice: "Recorded. It was not confirmed, so it is recorded as lost." });
    expect(pendingRow("i2")).toMatchObject({ status: "LOST", endedBy: "NOT_CONFIRMED", confirmedItemId: "sgm-2" });
  });
});

describe("the ACT: confirmed sooner by a meeting with a standard quorum", () => {
  it("reads the chair's standard quorum answer for the confirming motion", async () => {
    await open("x1", "REDUCED_QUORUM");
    const id = String(pendingRow("x1").id);
    pendingRow("x1").noticeGivenOn = "2026-11-03";
    const p = { scheme: actScheme, meetingId: "a1", pendingId: id, actorId: "adviser", confirmingMeetingId: "a2" };
    expect(await repo.recordPendingConfirmation({ ...p, confirmingItemId: "x3" })).toEqual({ error: "Choose a motion recorded with a standard quorum present." });
    expect(await repo.recordPendingConfirmation({ ...p, confirmingMeetingId: "a1", confirmingItemId: "x1" })).toEqual({ error: "Choose a later general meeting of this building." });
    expect(await repo.recordPendingConfirmation({ ...p, confirmingItemId: "x2" })).toEqual({ ok: true, notice: "Recorded. It took effect on 20 November 2026." });
    expect(pendingRow("x1")).toMatchObject({ status: "CARRIED", endedBy: "CONFIRMED", effectiveOn: "2026-11-20", confirmedMeetingId: "a2", confirmedItemId: "x2" });
  });
});

describe("a meeting's rows", () => {
  it("lists every row of the meeting with the lots that signed a petition", async () => {
    await open("i1", "INTERIM_SPECIAL");
    await open("i2", "INTERIM_NO_QUORUM");
    await open("x1", "REDUCED_QUORUM");
    await repo.recordPendingPetition({ scheme: vicScheme, meetingId: "m1", pendingId: String(pendingRow("i1").id), actorId: "a", receivedOn: "2026-11-20", lotIds: ["lot-1", "lot-2", "lot-3"], now: at("2026-11-21T00:00:00.000Z") });
    const rows = await repo.pendingResolutionsForMeeting("m1");
    expect(rows.map((r) => [r.row.agendaItemId, r.lots.length])).toEqual([
      ["i1", 3],
      ["i2", 0],
    ]);
    expect(await repo.pendingResolutionsForMeeting("nothing")).toEqual([]);
  });
});
