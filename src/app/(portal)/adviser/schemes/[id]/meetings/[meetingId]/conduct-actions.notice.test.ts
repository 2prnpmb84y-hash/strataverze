/**
 * An ACT unanimous resolution at conduct (VIC, ACT and WA stage 2, PR
 * 8b-iii, 29 Oct 2026, Matthew Wrigley's decision D13): it can be recorded as
 * resolved only where the latest notice issued for the meeting is recorded
 * as compliant with a period of 21 days or more (sch 3 s 3.6(2)). Otherwise
 * Resolved is refused before the votes are read, and nothing is written. Lost
 * and deferred are recorded as before. The ACT has no buildings yet, so its
 * pack is given here as if it were live.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ scheme: null as unknown, item: null as unknown, meeting: null as unknown }));
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

const lots = Array.from({ length: 8 }, (_, i) => ({ id: `lot-${i + 1}`, schemeId: "s1", lotNumber: String(i + 1), entitlement: 10, lotType: "RESIDENTIAL" }));
const AGM = { id: "m1", schemeId: "s1", status: "IN_PROGRESS", meetingType: "AGM", scheduledAt: "2026-11-20T09:00:00.000Z", startTime: null };
const YES = { quorumPresent: true };
const everyLot = (vote: (n: number) => string) => lots.map((l, i) => ({ lotId: l.id, vote: vote(i + 1), byProxy: false }));
const record = (outcome: string, votes?: unknown, attestation?: unknown) => recordAgendaOutcomeAction("s1", "m1", "i1", outcome, votes, false, attestation);
const notice = (version: number, status: string, compliant: boolean, noticePeriodDays: number | null) => ({ id: `n${version}`, meetingId: "m1", version, status, compliant, noticePeriodDays });
const SHORT = /^A unanimous resolution needs at least 21 days' notice of the meeting, and the notice issued for this meeting is not recorded as giving it, so this item cannot be recorded as resolved\. Nothing was saved\. The item can be deferred\.$/;

function at(category: string, notices: unknown[]) {
  state.scheme = { id: "s1", state: "ACT", timeZone: "Australia/Sydney", totalLots: 8, lots };
  state.item = { id: "i1", meetingId: "m1", resolutionCategory: category };
  sharedFake.reset({
    LevyNotice: [],
    ElectronicBallot: [],
    ElectronicVote: [],
    SchemeSelectorValue: [{ id: "x", schemeId: "s1", key: "memberBand", value: "FOUR_OR_MORE" }],
    Notice: notices as Record<string, unknown>[],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  state.meeting = AGM;
});

describe("an ACT unanimous resolution at conduct (D13)", () => {
  it("is recorded as resolved where the latest notice issued is compliant with 21 days or more", async () => {
    for (const days of [21, 28]) {
      vi.clearAllMocks();
      at("UNANIMOUS", [notice(1, "SUPERSEDED", false, 14), notice(2, "ISSUED", true, days)]);
      expect(await record("RESOLVED", everyLot(() => "FOR"), YES)).toEqual({ ok: true });
      expect(updateAgendaItem).toHaveBeenCalledWith("m1", "i1", { outcome: "RESOLVED", status: "CARRIED" });
    }
  });

  it("refuses Resolved on a short, unchecked or missing notice, before the votes are read, writing nothing", async () => {
    const cases = {
      fourteenDays: [notice(1, "ISSUED", true, 14)],
      twentyDays: [notice(1, "ISSUED", true, 20)],
      shortOfTwentyOne: [notice(1, "ISSUED", false, 21)],
      notChecked: [notice(1, "ISSUED", false, null)],
      // An earlier notice that gave it does not count once a revised one is issued.
      revisedShort: [notice(1, "SUPERSEDED", true, 21), notice(2, "ISSUED", false, 21)],
    };
    for (const [name, notices] of Object.entries(cases)) {
      vi.clearAllMocks();
      at("UNANIMOUS", notices);
      // Votes that cannot even be read: the refusal comes first.
      const r = await record("RESOLVED", "not votes", "not an answer");
      expect(r.error, name).toMatch(SHORT);
      expect(r.error).not.toMatch(/[;–—]/);
      expect(updateAgendaItem).not.toHaveBeenCalled();
      expect(recordMeetingEvent).not.toHaveBeenCalled();
    }
  });

  it("says why when no notice is recorded as issued, as after a revised notice that failed (review L2)", async () => {
    for (const notices of [[], [notice(1, "SUPERSEDED", true, 21), notice(2, "SUPERSEDED", true, 21)]]) {
      vi.clearAllMocks();
      at("UNANIMOUS", notices);
      const r = await record("RESOLVED", "not votes", "not an answer");
      expect(r.error).toBe(
        "A unanimous resolution needs at least 21 days' notice of the meeting. No notice is recorded as issued for this meeting, so the 21 days cannot be checked and this item cannot be recorded as resolved. Issue the notice again. Nothing was saved. The item can be deferred.",
      );
      expect(updateAgendaItem).not.toHaveBeenCalled();
      expect(recordMeetingEvent).not.toHaveBeenCalled();
    }
  });

  it("still records it as lost from the count, or deferred, on a short notice", async () => {
    at("UNANIMOUS", [notice(1, "ISSUED", true, 14)]);
    expect(await record("MOTION_LOST", everyLot((n) => (n === 1 ? "AGAINST" : "FOR")), YES)).toEqual({ ok: true });
    expect(updateAgendaItem).toHaveBeenCalledWith("m1", "i1", { outcome: "MOTION_LOST", status: "LOST" });
    vi.clearAllMocks();
    expect(await record("DEFERRED")).toEqual({ ok: true });
    expect(updateAgendaItem).toHaveBeenCalledWith("m1", "i1", { outcome: "DEFERRED", status: "DEFERRED" });
  });

  it("does not ask an ordinary or special resolution for the longer notice", async () => {
    at("ORDINARY", []);
    expect(await record("RESOLVED", everyLot((n) => (n <= 5 ? "FOR" : "AGAINST")), YES)).toEqual({ ok: true });
    expect(updateAgendaItem).toHaveBeenCalledWith("m1", "i1", { outcome: "RESOLVED", status: "CARRIED" });
  });

  it("still refuses an unopposed resolution", async () => {
    at("UNOPPOSED", [notice(1, "ISSUED", true, 21)]);
    const r = await record("RESOLVED", everyLot(() => "FOR"), YES);
    expect(r.error).toMatch(/Which owners corporations an unopposed resolution applies to is not confirmed/);
    expect(updateAgendaItem).not.toHaveBeenCalled();
  });
});
