/**
 * The Victorian decision to start proceedings (stage 2, PR 9c, decision D2):
 * authorityResolution with the VIC pack's resolutions, against the in-memory
 * database. Only a special resolution at a general meeting is offered while
 * the s 18(2) comparator has no value. An interim special resolution (s 97)
 * counts as special only through its pending resolution: CARRIED, taking
 * effect as SPECIAL, dated the day it took effect. A committee motion is
 * refused.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));

const { sharedFake } = await import("@/test/fake-orm");
const { authorityResolution, authorityResolutionProblem } = await import("./resolutions");
const { PENDING_RULE_PACKS } = await import("@/config/statutory");
const { recoveryStepNeeds } = await import("@/lib/debt-recovery/recovery-gates");

const needs = recoveryStepNeeds(PENDING_RULE_PACKS.VIC.rules, "COMMITTEE_REVIEW");
const OFFERED = needs && !("problem" in needs) ? needs.authority!.accepted : [];
const SPECIAL = OFFERED[0];

const pending = (id: string, itemId: string, over: Record<string, unknown>) => ({
  id,
  schemeId: "v1",
  meetingId: "agm",
  agendaItemId: itemId,
  kind: "INTERIM_SPECIAL",
  category: "SPECIAL",
  takesEffectAs: "SPECIAL",
  status: "PENDING",
  effectiveOn: null,
  ...over,
});

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-10T01:00:00.000Z"));
});
afterAll(() => vi.useRealTimers());

beforeEach(() => {
  sharedFake.reset({
    Scheme: [{ id: "v1", state: "VIC", timeZone: "Australia/Melbourne" }],
    Meeting: [
      { id: "agm", schemeId: "v1", meetingType: "AGM", status: "PUBLISHED", title: "AGM", scheduledAt: "2026-10-10T02:00:00.000Z", timezone: null },
      { id: "committee", schemeId: "v1", meetingType: "COMMITTEE", status: "PUBLISHED", title: "Committee", scheduledAt: "2026-10-12T02:00:00.000Z", timezone: null },
    ],
    AgendaItem: [
      { id: "special", meetingId: "agm", position: 1, title: "Start proceedings", status: "CARRIED", outcome: "RESOLVED", resolutionCategory: "SPECIAL" },
      { id: "ordinary", meetingId: "agm", position: 2, title: "Start proceedings", status: "CARRIED", outcome: "RESOLVED", resolutionCategory: "ORDINARY" },
      { id: "interim-pending", meetingId: "agm", position: 3, title: "Start proceedings", status: "INTERIM", outcome: "INTERIM", resolutionCategory: "SPECIAL" },
      { id: "interim-carried", meetingId: "agm", position: 4, title: "Start proceedings", status: "CARRIED", outcome: "RESOLVED", resolutionCategory: "SPECIAL" },
      { id: "interim-as-ordinary", meetingId: "agm", position: 5, title: "Start proceedings", status: "CARRIED", outcome: "RESOLVED", resolutionCategory: "SPECIAL" },
      { id: "interim-no-day", meetingId: "agm", position: 6, title: "Start proceedings", status: "CARRIED", outcome: "RESOLVED", resolutionCategory: "SPECIAL" },
      { id: "recorded-interim", meetingId: "agm", position: 7, title: "Start proceedings", status: "CARRIED", outcome: "RESOLVED", resolutionCategory: "INTERIM_SPECIAL" },
      { id: "recorded-interim-carried", meetingId: "agm", position: 8, title: "Start proceedings", status: "CARRIED", outcome: "RESOLVED", resolutionCategory: "INTERIM_SPECIAL" },
      { id: "interim-later", meetingId: "agm", position: 9, title: "Start proceedings", status: "CARRIED", outcome: "RESOLVED", resolutionCategory: "SPECIAL" },
      { id: "no-quorum-same", meetingId: "agm", position: 10, title: "Start proceedings", status: "CARRIED", outcome: "RESOLVED", resolutionCategory: "SPECIAL" },
      { id: "no-quorum-special", meetingId: "agm", position: 11, title: "Start proceedings", status: "CARRIED", outcome: "RESOLVED", resolutionCategory: "SPECIAL" },
      { id: "committee-carried", meetingId: "committee", position: 1, title: "Start proceedings", status: "CARRIED", outcome: "RESOLVED", resolutionCategory: null },
    ],
    PendingResolution: [
      pending("p-1", "interim-pending", {}),
      pending("p-2", "interim-carried", { status: "CARRIED", effectiveOn: "2026-11-09" }),
      pending("p-3", "interim-as-ordinary", { status: "CARRIED", takesEffectAs: "ORDINARY", effectiveOn: "2026-11-09" }),
      pending("p-4", "interim-no-day", { status: "CARRIED", effectiveOn: null }),
      pending("p-5", "recorded-interim-carried", { status: "CARRIED", effectiveOn: "2026-11-09" }),
      pending("p-6", "interim-later", { status: "CARRIED", effectiveOn: "2026-11-11" }),
      // A resolution of a meeting without a quorum (s 78) taking effect as the SAME category, and one recorded as SPECIAL.
      pending("p-7", "no-quorum-same", { kind: "INTERIM_NO_QUORUM", takesEffectAs: "SAME", status: "CARRIED", effectiveOn: "2026-11-09" }),
      pending("p-8", "no-quorum-special", { kind: "INTERIM_NO_QUORUM", takesEffectAs: "SPECIAL", status: "CARRIED", effectiveOn: "2026-11-09" }),
    ],
  });
});

describe("the Victorian decision to start proceedings (D2)", () => {
  it("offers only a special resolution at a general meeting", () => {
    expect(OFFERED).toEqual([{ meeting: "GENERAL", kind: "SPECIAL", words: "a special resolution at a general meeting" }]);
  });

  it("accepts a special resolution, dated the day of its meeting", async () => {
    expect(await authorityResolution("v1", "agm", "special", OFFERED)).toEqual({ problem: null, resolution: SPECIAL, decidedOn: "2026-10-10", meetingId: "agm", itemId: "special" });
  });

  it("refuses an ordinary resolution and a committee motion", async () => {
    expect(await authorityResolutionProblem("v1", "agm", "ordinary", OFFERED)).toBe(
      "That motion is not recorded as a special resolution at a general meeting. Choose a motion carried as a special resolution at a general meeting.",
    );
    expect(await authorityResolutionProblem("v1", "committee", "committee-carried", OFFERED)).toBe("Choose a special resolution at a general meeting.");
  });
});

describe("an interim special resolution", () => {
  it("is refused while pending", async () => {
    expect(await authorityResolutionProblem("v1", "agm", "interim-pending", OFFERED)).toBe("That motion was not carried, so it cannot be relied on.");
  });

  it("is accepted once carried and taken effect as a special resolution, dated the day it took effect", async () => {
    expect(await authorityResolution("v1", "agm", "interim-carried", OFFERED)).toEqual({ problem: null, resolution: SPECIAL, decidedOn: "2026-11-09", meetingId: "agm", itemId: "interim-carried" });
    // An item recorded as an interim special resolution counts through its carried pending resolution too.
    expect(await authorityResolution("v1", "agm", "recorded-interim-carried", OFFERED)).toMatchObject({ problem: null, decidedOn: "2026-11-09" });
  });

  it("is refused where it takes effect as anything but special, has no day it took effect, or has no pending resolution", async () => {
    const refused = "That motion was decided later and has not taken effect as a special resolution, so it cannot be relied on.";
    expect(await authorityResolutionProblem("v1", "agm", "interim-as-ordinary", OFFERED)).toBe(refused);
    expect(await authorityResolutionProblem("v1", "agm", "interim-no-day", OFFERED)).toBe(refused);
    expect(await authorityResolutionProblem("v1", "agm", "recorded-interim", OFFERED)).toBe(refused);
  });

  it("any resolution decided later counts as special only if it takes effect as SPECIAL, carried, on or before the building's day (review L3)", async () => {
    const refused = "That motion was decided later and has not taken effect as a special resolution, so it cannot be relied on.";
    expect(await authorityResolutionProblem("v1", "agm", "no-quorum-same", OFFERED)).toBe(refused);
    expect(await authorityResolution("v1", "agm", "no-quorum-special", OFFERED)).toMatchObject({ problem: null, decidedOn: "2026-11-09" });
    // Taking effect after the building's day (10 Nov in Melbourne) is refused.
    expect(await authorityResolutionProblem("v1", "agm", "interim-later", OFFERED)).toBe("That resolution has not taken effect yet, so it cannot be relied on.");
  });
});

describe("the ACT and Western Australia never reach the special resolution check (review L3)", () => {
  it("accept no special resolution, for the decision or the charge's declaration", () => {
    for (const code of ["ACT", "WA"] as const) {
      const recovery = PENDING_RULE_PACKS[code].rules.DEBT_RECOVERY as unknown as {
        authorityToSue: { accepted: { value: readonly { kind: string }[] | null } };
        statutoryCharge?: { declaredBy: { value: readonly { kind: string }[] | null } };
      };
      const kinds = [...(recovery.authorityToSue.accepted.value ?? []), ...(recovery.statutoryCharge?.declaredBy.value ?? [])].map((r) => r.kind);
      expect(kinds.length, code).toBeGreaterThan(0);
      expect(kinds, code).not.toContain("SPECIAL");
    }
  });
});
