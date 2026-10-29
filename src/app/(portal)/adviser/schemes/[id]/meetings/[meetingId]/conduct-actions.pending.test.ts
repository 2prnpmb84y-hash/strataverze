/**
 * Recording a resolution decided later at conduct (VIC, ACT and WA stage 2,
 * PR 8b-i, 29 Oct 2026), under the draft Victorian and ACT packs given as if
 * live: the pending row, the item stored as INTERIM (never CARRIED) and the
 * event with the dates are written in one transaction; a count that makes
 * the motion one of these cannot be recorded as lost; a pending item cannot
 * be recorded again, deferred or removed (D10), nor can an item whose
 * pending row is decided (review M2); the ACT asks whether a
 * reduced quorum was present after "no" (D6), refusing an unreadable answer
 * and writing nothing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ scheme: null as unknown, item: null as unknown, meeting: null as unknown }));
const updateAgendaItem = vi.fn(async () => ({}));
const deleteAgendaItem = vi.fn(async () => ({}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-access", () => ({ requireSchemeAccess: vi.fn(async () => ({ profile: { id: "chair" } })) }));
vi.mock("@/lib/queries/meetings", () => ({ getMeetingById: vi.fn(async () => state.meeting), updateMeeting: vi.fn() }));
vi.mock("@/lib/queries/schemes", () => ({ getSchemeById: vi.fn(async () => state.scheme) }));
vi.mock("@/lib/queries/agenda", () => ({
  getAgendaItem: vi.fn(async () => state.item),
  getAgendaItemsForMeeting: vi.fn(async () => []),
  updateAgendaItem: (...a: unknown[]) => updateAgendaItem(...(a as [])),
  deleteAgendaItem: (...a: unknown[]) => deleteAgendaItem(...(a as [])),
  createAgendaItem: vi.fn(),
  getNextAgendaPosition: vi.fn(),
}));
vi.mock("@/lib/meetings/rule-set-repo", async () => {
  const { PENDING_RULE_PACKS } = await import("@/config/statutory");
  return {
    getActiveRuleSet: vi.fn(async (s: "VIC" | "ACT" | "WA") => PENDING_RULE_PACKS[s].rules.MEETING_RULES),
    getActiveRuleSetForScheme: vi.fn(),
  };
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
const { deleteAgendaItemAction } = await import("./agenda-actions");

const lots = [
  ...Array.from({ length: 8 }, (_, i) => ({ id: `lot-${i + 1}`, schemeId: "s1", lotNumber: String(i + 1), entitlement: 10, lotEntitlement: 10, lotType: "RESIDENTIAL", occupiable: true })),
  { id: "cp", schemeId: "s1", lotNumber: "CP", entitlement: null, lotEntitlement: null, lotType: "COMMON", occupiable: null },
];
const VIC_TIER_4 = [{ id: "oc", schemeId: "s1", key: "severalOwnersCorporations", value: "NO" }];
const FOUR_OR_MORE = [{ id: "x", schemeId: "s1", key: "memberBand", value: "FOUR_OR_MORE" }];
// Monday 2 November 2026, 9 am in Melbourne and Canberra.
const AGM = { id: "m1", schemeId: "s1", status: "IN_PROGRESS", meetingType: "AGM", scheduledAt: "2026-11-01T22:00:00.000Z", startTime: null };
const v = (n: number, vote: string) => ({ lotId: `lot-${n}`, vote, byProxy: false });
const record = (outcome: string, votes?: unknown, attestation?: unknown) => recordAgendaOutcomeAction("s1", "m1", "i1", outcome, votes, undefined, attestation);

function at(st: "VIC" | "ACT", category: string, status = "PENDING") {
  state.scheme = { id: "s1", state: st, timeZone: st === "VIC" ? "Australia/Melbourne" : "Australia/Sydney", totalLots: 8, servicesOnly: false, lots };
  state.item = { id: "i1", meetingId: "m1", resolutionCategory: category, status };
  state.meeting = AGM;
  sharedFake.reset({
    LevyNotice: [],
    ElectronicBallot: [],
    ElectronicVote: [],
    SchemeSelectorValue: st === "VIC" ? VIC_TIER_4 : FOUR_OR_MORE,
    AgendaItem: [{ id: "i1", meetingId: "m1", resolutionCategory: category, status, outcome: null }],
    PendingResolution: [],
    MeetingEvent: [],
  });
  sharedFake.setUniqueKeys({ PendingResolution: [["agendaItemId"]] });
}

const rows = () => sharedFake.table("PendingResolution");
const events = () => sharedFake.table("MeetingEvent");
function nothingWritten() {
  expect(rows()).toHaveLength(0);
  expect(events()).toHaveLength(0);
  expect(updateAgendaItem).not.toHaveBeenCalled();
  expect(sharedFake.table("AgendaItem")[0]).toMatchObject({ status: "PENDING", outcome: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  // The chair records it on the meeting's day (2 Nov 2026, 10 am in Melbourne).
  vi.setSystemTime(new Date("2026-11-01T23:00:00.000Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("Victoria s 97: an interim special resolution", () => {
  const passesAsInterim = [v(1, "FOR"), v(2, "FOR"), v(3, "FOR"), v(4, "FOR"), v(5, "AGAINST")];

  it("is written as pending in one transaction: the row, the item as INTERIM and the event with the dates", async () => {
    at("VIC", "SPECIAL");
    const r = await record("RESOLVED", passesAsInterim, { quorumPresent: true });
    expect(r).toEqual({
      ok: true,
      notice:
        "Recorded as an interim special resolution, decided later. It was made on 2 November 2026. Give the owners notice of it by 16 November 2026 and record the day it was given. Unless it is stopped sooner, it takes effect on 2 December 2026 at the earliest. See Decided later on this page.",
    });
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({
      schemeId: "s1",
      meetingId: "m1",
      agendaItemId: "i1",
      state: "VIC",
      kind: "INTERIM_SPECIAL",
      category: "SPECIAL",
      takesEffectAs: "SPECIAL",
      status: "PENDING",
      madeOn: "2026-11-02",
      windowClosesOn: "2026-12-01",
      noticeDueOn: "2026-11-16",
      rulePack: "AU-VIC 2026.10.10",
      recordedBy: "chair",
    });
    const snapshot = rows()[0].rule as { pending: { label: string; windowDays: number }; resolution: { basis: string } };
    expect(snapshot.pending).toMatchObject({ label: "Interim special resolution", windowDays: 29 });
    expect(snapshot.resolution.basis).toBe("SHARE_OF_ALL_LOTS");
    expect(rows()[0].meetingVotes).toMatchObject({ tally: { forCount: 4, againstCount: 1, totalLots: 8, quorumPresent: true } });
    // Never CARRIED or RESOLVED until it is decided.
    expect(sharedFake.table("AgendaItem")[0]).toMatchObject({ status: "INTERIM", outcome: "INTERIM" });
    expect(updateAgendaItem).not.toHaveBeenCalled();
    expect(events()).toHaveLength(1);
    expect(events()[0]).toMatchObject({ meetingId: "m1", actorId: "chair", eventType: "AGENDA_OUTCOME_RECORDED" });
    const payload = events()[0].payload as Record<string, unknown>;
    expect(Object.keys(payload)).toEqual(["itemId", "outcome", "votes", "notCounted", "tally", "evaluation", "attestation", "later", "pendingId"]);
    expect(payload).toMatchObject({
      outcome: "INTERIM",
      attestation: { quorumPresent: true },
      evaluation: { result: "INTERIM", laterKind: "INTERIM_SPECIAL", interimCategory: "INTERIM_SPECIAL" },
      later: { kind: "INTERIM_SPECIAL", madeOn: "2026-11-02", windowClosesOn: "2026-12-01", noticeDueOn: "2026-11-16" },
      pendingId: rows()[0].id,
    });
    expect(sharedFake.statements).toContain("SET LOCAL lock_timeout = '5s'");
  });

  it("is made on the recording day where that is later than the meeting's (D2), in the building's time zone", async () => {
    at("VIC", "SPECIAL");
    // 3 Nov 00:30 in Melbourne is still 2 Nov in UTC.
    vi.setSystemTime(new Date("2026-11-02T13:30:00.000Z"));
    expect(await record("RESOLVED", passesAsInterim, { quorumPresent: true })).toMatchObject({ ok: true });
    expect(rows()[0]).toMatchObject({ madeOn: "2026-11-03", windowClosesOn: "2026-12-02", noticeDueOn: "2026-11-17" });
  });

  it("cannot be recorded as lost: the count makes it decided later, and nothing is written", async () => {
    at("VIC", "SPECIAL");
    const r = await record("MOTION_LOST", passesAsInterim, { quorumPresent: true });
    expect(r.error).toMatch(/^The votes recorded make this motion an interim special resolution, decided later, not lost\. .*Nothing was saved\. Record it as resolved to start its period, or check the votes entered\.$/);
    nothingWritten();
  });
});

describe("Victoria s 78: an interim resolution without a quorum", () => {
  it("is written as pending, taking effect as an ordinary resolution", async () => {
    at("VIC", "ORDINARY");
    const r = await record("RESOLVED", [v(1, "FOR"), v(2, "FOR"), v(3, "AGAINST")], { quorumPresent: false });
    expect(r).toMatchObject({ ok: true, notice: expect.stringMatching(/^Recorded as an interim resolution, decided later\./) });
    expect(rows()[0]).toMatchObject({ kind: "INTERIM_NO_QUORUM", category: "ORDINARY", takesEffectAs: "ORDINARY", windowClosesOn: "2026-12-01" });
    expect((events()[0].payload as Record<string, unknown>).attestation).toEqual({ quorumPresent: false });
  });

  it("refuses a reduced quorum answer, which Victoria never asks, writing nothing", async () => {
    at("VIC", "ORDINARY");
    const r = await record("RESOLVED", [v(1, "FOR"), v(2, "FOR"), v(3, "AGAINST")], { quorumPresent: false, reducedQuorumPresent: true });
    expect(r.error).toBe("The quorum answer sent could not be read. Reload the page and record it again.");
    nothingWritten();
  });
});

describe("the ACT: a reduced quorum (D6)", () => {
  const passes = [v(1, "FOR"), v(2, "FOR"), v(3, "AGAINST")];

  it("with a reduced quorum, a count that passes is written as pending, with both answers kept", async () => {
    at("ACT", "ORDINARY");
    const r = await record("RESOLVED", passes, { quorumPresent: false, reducedQuorumPresent: true });
    expect(r).toMatchObject({ ok: true, notice: expect.stringMatching(/^Recorded as a reduced quorum decision, decided later\..*1 December 2026 at the earliest/) });
    expect(rows()[0]).toMatchObject({ state: "ACT", kind: "REDUCED_QUORUM", category: "ORDINARY", takesEffectAs: "ORDINARY", madeOn: "2026-11-02", windowClosesOn: "2026-11-30" });
    const payload = events()[0].payload as Record<string, unknown>;
    expect(payload.attestation).toEqual({ quorumPresent: false, reducedQuorumPresent: true });
    expect(payload.tally).toMatchObject({ quorumPresent: false, reducedQuorumPresent: true });
  });

  it("with a reduced quorum, a count that fails is recorded as lost at once", async () => {
    at("ACT", "ORDINARY");
    expect(await record("MOTION_LOST", [v(1, "FOR"), v(2, "AGAINST"), v(3, "AGAINST")], { quorumPresent: false, reducedQuorumPresent: true })).toEqual({ ok: true });
    expect(updateAgendaItem).toHaveBeenCalledWith("m1", "i1", { outcome: "MOTION_LOST", status: "LOST" });
    expect(rows()).toHaveLength(0);
  });

  it("refuses no reduced quorum (adjourned), no answer and an unreadable answer, writing nothing", async () => {
    at("ACT", "ORDINARY");
    expect((await record("RESOLVED", passes, { quorumPresent: false, reducedQuorumPresent: false })).error).toMatch(/so the meeting is adjourned and the votes cannot decide it/);
    expect((await record("RESOLVED", passes, { quorumPresent: false })).error).toMatch(/whether it had a reduced quorum is not recorded/);
    for (const bad of ["yes", 1, null]) {
      const r = await record("RESOLVED", passes, { quorumPresent: false, reducedQuorumPresent: bad });
      if (bad === null) expect(r.error, String(bad)).toMatch(/whether it had a reduced quorum is not recorded/);
      else expect(r.error, String(bad)).toBe("The quorum answer sent could not be read. Reload the page and record it again.");
    }
    nothingWritten();
  });

  it("ignores a reduced quorum answer with a standard quorum, storing nothing about it", async () => {
    at("ACT", "ORDINARY");
    expect(await record("RESOLVED", passes, { quorumPresent: true, reducedQuorumPresent: false })).toEqual({ ok: true });
    expect(updateAgendaItem).toHaveBeenCalledWith("m1", "i1", { outcome: "RESOLVED", status: "CARRIED" });
    expect(rows()).toHaveLength(0);
  });
});

describe("a pending item (D10)", () => {
  it("cannot be recorded again or deferred, before anything else is read", async () => {
    for (const status of ["INTERIM", "OPEN"]) {
      for (const outcome of ["RESOLVED", "MOTION_LOST", "DEFERRED"]) {
        at("VIC", "SPECIAL", status);
        const r = await record(outcome, [v(1, "FOR")], { quorumPresent: true });
        expect(r.error, `${status} ${outcome}`).toBe(
          "This item is decided later, so it cannot be recorded again, deferred or removed. Nothing was saved. See Decided later on this page.",
        );
      }
    }
    expect(updateAgendaItem).not.toHaveBeenCalled();
    expect(rows()).toHaveLength(0);
  });

  it("cannot be removed from the agenda", async () => {
    at("VIC", "SPECIAL", "INTERIM");
    expect(await deleteAgendaItemAction("s1", "m1", "i1")).toEqual({
      error: "This item is decided later, so it cannot be recorded again, deferred or removed. Nothing was saved. See Decided later on this page.",
    });
    expect(deleteAgendaItem).not.toHaveBeenCalled();
    at("VIC", "SPECIAL", "PENDING");
    expect(await deleteAgendaItemAction("s1", "m1", "i1")).toEqual({});
    expect(deleteAgendaItem).toHaveBeenCalledWith("m1", "i1");
  });

  it("is refused a second time by its pending row, when the item read was not yet INTERIM (review M2)", async () => {
    at("VIC", "SPECIAL");
    await record("RESOLVED", [v(1, "FOR"), v(2, "FOR"), v(3, "FOR"), v(4, "FOR"), v(5, "AGAINST")], { quorumPresent: true });
    // A second request that read the item before the first committed.
    for (const outcome of ["RESOLVED", "MOTION_LOST", "DEFERRED"]) {
      const r = await record(outcome, [v(1, "FOR"), v(2, "FOR"), v(3, "FOR"), v(4, "FOR"), v(5, "AGAINST")], { quorumPresent: true });
      expect(r, outcome).toEqual({ error: "This item is decided later, so it cannot be recorded again, deferred or removed. Nothing was saved. See Decided later on this page." });
    }
    expect(rows()).toHaveLength(1);
    expect(events()).toHaveLength(1);
    expect(updateAgendaItem).not.toHaveBeenCalled();
  });
});

describe("an item whose resolution was decided later (review M2)", () => {
  function decided(st: "VIC" | "ACT", status: "CARRIED" | "LOST") {
    at(st, st === "VIC" ? "SPECIAL" : "ORDINARY", status);
    sharedFake.table("AgendaItem")[0].outcome = status === "CARRIED" ? "RESOLVED" : "MOTION_LOST";
    sharedFake.table("PendingResolution").push({ id: "p1", agendaItemId: "i1", meetingId: "m1", schemeId: "s1", status, endedBy: status === "CARRIED" ? "PERIOD_ENDED" : "PETITION" });
  }
  const refusal = "This item's resolution was decided after the meeting, so it cannot be recorded again, deferred or removed. Nothing was saved. See Decided later on this page.";

  it("cannot be recorded again or deferred, whatever it is stored as now", async () => {
    for (const st of ["VIC", "ACT"] as const) {
      for (const status of ["CARRIED", "LOST"] as const) {
        for (const outcome of ["RESOLVED", "MOTION_LOST", "DEFERRED"]) {
          decided(st, status);
          const r = await record(outcome, [v(1, "FOR"), v(2, "FOR"), v(3, "AGAINST")], { quorumPresent: true });
          expect(r.error, `${st} ${status} ${outcome}`).toBe(refusal);
          expect(sharedFake.table("AgendaItem")[0].status).toBe(status);
        }
      }
    }
    expect(updateAgendaItem).not.toHaveBeenCalled();
    expect(events()).toHaveLength(0);
  });

  it("can still be recorded where it has no pending row", async () => {
    at("VIC", "SPECIAL", "CARRIED");
    expect(await record("DEFERRED")).toEqual({ ok: true });
    expect(updateAgendaItem).toHaveBeenCalledWith("m1", "i1", { outcome: "DEFERRED", status: "DEFERRED" });
  });

  it("cannot be removed from the agenda: the database refuses it, and the refusal is told plainly", async () => {
    decided("VIC", "CARRIED");
    const fk = (constraint: string) =>
      Object.assign(new Error(`update or delete on table "agenda_items" violates foreign key constraint "${constraint}" on table "pending_resolutions"`), { code: "23503" });
    deleteAgendaItem.mockRejectedValueOnce(fk("pending_resolutions_agenda_item_id_fkey"));
    expect(await deleteAgendaItemAction("s1", "m1", "i1")).toEqual({ error: refusal });
    // Wrapped by the driver, with the code and the constraint in its cause.
    deleteAgendaItem.mockRejectedValueOnce(Object.assign(new Error("Query failed"), { cause: { code: "23503", constraint: "pending_resolutions_agenda_item_id_fkey", table: "pending_resolutions" } }));
    expect(await deleteAgendaItemAction("s1", "m1", "i1")).toEqual({ error: refusal });
    // The motion that confirmed a resolution of another meeting.
    deleteAgendaItem.mockRejectedValueOnce(fk("pending_resolutions_confirmed_item_id_fkey"));
    expect(await deleteAgendaItemAction("s1", "m1", "i1")).toEqual({
      error: "This motion is recorded as deciding a resolution of another meeting, so it cannot be removed. Nothing was saved.",
    });
    // Any other failure, as before.
    deleteAgendaItem.mockRejectedValueOnce(new Error("connection reset"));
    expect(await deleteAgendaItemAction("s1", "m1", "i1")).toEqual({ error: "Failed to remove the agenda item." });
    expect(events()).toHaveLength(0);
  });
});
