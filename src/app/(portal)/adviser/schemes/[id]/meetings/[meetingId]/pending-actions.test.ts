/**
 * The "Decided later" panel's actions (VIC, ACT and WA stage 2, PR 8b-i,
 * 29 Oct 2026): each needs governance.manage and a meeting of the building,
 * is refused for a pack that records no resolutions decided later, and
 * passes the building to the repository. The ACT's petition leaves out the
 * units barred for money owed on the day it was received (D5), where the
 * debtor rule applies.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ meeting: null as unknown, scheme: null as unknown, denied: false, building: null as unknown }));
const repo = vi.hoisted(() => ({
  recordPendingNotice: vi.fn(),
  recordPendingPetition: vi.fn(),
  recordSpecialMeetingNotice: vi.fn(),
  recordPendingConfirmation: vi.fn(),
}));
const owing = vi.fn();
const revalidatePath = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: (p: string) => revalidatePath(p) }));
vi.mock("@/lib/auth/require-access", async () => {
  const { AuthorisationError } = await import("@/lib/auth/require-membership");
  return {
    requireSchemeAccess: vi.fn(async (_s: string, capability: string) => {
      if (state.denied) throw new AuthorisationError("You do not have permission to do this.");
      expect(capability).toBe("governance.manage");
      return { profile: { id: "adviser" } };
    }),
  };
});
vi.mock("@/lib/queries/meetings", () => ({ getMeetingById: vi.fn(async () => state.meeting) }));
vi.mock("@/lib/queries/schemes", () => ({ getSchemeById: vi.fn(async () => state.scheme) }));
vi.mock("@/lib/queries/building-selectors", () => ({ selectorBuildingFor: vi.fn(async () => state.building) }));
vi.mock("@/lib/meetings/debtor-voting-repo", () => ({ lotsOwingMoney: (...a: unknown[]) => owing(...a) }));
vi.mock("@/lib/meetings/pending-repo", () => repo);
vi.mock("@/lib/meetings/rule-set-repo", async () => {
  const { PENDING_RULE_PACKS, MEETING_RULES } = await import("@/config/statutory");
  return { getActiveRuleSet: vi.fn(async (s: string) => (s === "NSW" ? MEETING_RULES : PENDING_RULE_PACKS[s as "VIC" | "ACT"].rules.MEETING_RULES)) };
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

const A = await import("./pending-actions");

const lots = [
  { id: "lot-1", lotNumber: "1", lotType: "RESIDENTIAL" },
  { id: "lot-2", lotNumber: "2", lotType: "RESIDENTIAL" },
  { id: "cp", lotNumber: "CP", lotType: "COMMON" },
];
const at = (st: string) => {
  state.scheme = { id: "s1", state: st, timeZone: st === "VIC" ? "Australia/Melbourne" : "Australia/Sydney", totalLots: 2, lots };
  state.meeting = { id: "m1", schemeId: "s1" };
};

beforeEach(() => {
  vi.clearAllMocks();
  state.denied = false;
  state.building = null;
  for (const f of Object.values(repo)) f.mockResolvedValue({ ok: true });
  at("VIC");
});

describe("every action", () => {
  it("passes the building, the meeting and the adviser to the repository, and refreshes the page", async () => {
    expect(await A.recordPendingNoticeAction("s1", "m1", " p1 ", "2026-11-10")).toEqual({ ok: true });
    expect(repo.recordPendingNotice).toHaveBeenCalledWith({
      scheme: { id: "s1", timeZone: "Australia/Melbourne", totalLots: 2, lots },
      meetingId: "m1",
      pendingId: "p1",
      givenOn: "2026-11-10",
      actorId: "adviser",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/adviser/schemes/s1/meetings/m1");
    repo.recordSpecialMeetingNotice.mockResolvedValue({ ok: true, notice: "Recorded." });
    expect(await A.recordSpecialMeetingNoticeAction("s1", "m1", "p1", "2026-11-20", "sgm")).toEqual({ ok: true, notice: "Recorded." });
    expect(repo.recordSpecialMeetingNotice).toHaveBeenCalledWith(expect.objectContaining({ givenOn: "2026-11-20", calledMeetingId: "sgm" }));
    expect(await A.recordPendingConfirmationAction("s1", "m1", "p1", "sgm", "sgm-1")).toEqual({ ok: true });
    expect(repo.recordPendingConfirmation).toHaveBeenCalledWith(expect.objectContaining({ confirmingMeetingId: "sgm", confirmingItemId: "sgm-1" }));
  });

  it("returns the repository's refusal, refreshing nothing", async () => {
    repo.recordPendingNotice.mockResolvedValue({ error: "This resolution is already decided. Nothing was saved." });
    expect(await A.recordPendingNoticeAction("s1", "m1", "p1", "2026-11-10")).toEqual({ error: "This resolution is already decided. Nothing was saved." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("is refused without permission, for another building's meeting, and for a pack with none decided later", async () => {
    state.denied = true;
    expect(await A.recordPendingNoticeAction("s1", "m1", "p1", "2026-11-10")).toEqual({ error: "You do not have permission to do this." });
    state.denied = false;
    state.meeting = { id: "m1", schemeId: "other" };
    expect(await A.recordPendingNoticeAction("s1", "m1", "p1", "2026-11-10")).toEqual({ error: "Meeting not found." });
    at("NSW");
    expect(await A.recordPendingConfirmationAction("s1", "m1", "p1", "x", "y")).toEqual({ error: "This building's rules record no resolutions decided later." });
    expect(Object.values(repo).every((f) => f.mock.calls.length === 0)).toBe(true);
  });

  it("hides a failure behind a plain refusal", async () => {
    repo.recordPendingNotice.mockRejectedValue(new Error("database down"));
    expect(await A.recordPendingNoticeAction("s1", "m1", "p1", "2026-11-10")).toEqual({ error: "Failed to record it. Nothing was saved." });
  });
});

describe("a petition", () => {
  it("refuses lots that cannot be read", async () => {
    for (const bad of ["lot-1", [1], null, { a: 1 }]) {
      expect(await A.recordPendingPetitionAction("s1", "m1", "p1", "2026-11-20", bad)).toEqual({ error: "The lots sent could not be read. Reload the page and record them again." });
    }
    expect(repo.recordPendingPetition).not.toHaveBeenCalled();
  });

  it("the ACT: leaves out units owing money on the day received, where the debtor rule applies (3 or more members)", async () => {
    at("ACT");
    state.building = { scheme: state.scheme, lots, recorded: { memberBand: "FOUR_OR_MORE" } };
    owing.mockResolvedValue(new Set(["lot-2"]));
    expect(await A.recordPendingPetitionAction("s1", "m1", "p1", "2026-11-20", ["lot-1"])).toEqual({ ok: true });
    const barred = (repo.recordPendingPetition.mock.calls[0][0] as { barredLotIds: (d: string, c: string) => Promise<Set<string>> }).barredLotIds;
    expect(await barred("2026-11-20", "ORDINARY")).toEqual(new Set(["lot-2"]));
    expect(owing).toHaveBeenCalledWith(state.scheme, ["lot-1", "lot-2", "cp"], "2026-11-20");
    // A category a unit owing money may still vote on: nobody is barred.
    owing.mockClear();
    expect(await barred("2026-11-20", "UNANIMOUS")).toEqual(new Set());
    expect(owing).not.toHaveBeenCalled();
    // 1 or 2 members: the debtor rule does not apply.
    state.building = { scheme: state.scheme, lots, recorded: { memberBand: "ONE_OR_TWO" } };
    expect(await barred("2026-11-20", "ORDINARY")).toEqual(new Set());
    // The band not recorded: the rule applies (it fails closed).
    state.building = { scheme: state.scheme, lots, recorded: {} };
    owing.mockResolvedValue(new Set(["lot-1"]));
    expect(await barred("2026-11-20", "ORDINARY")).toEqual(new Set(["lot-1"]));
  });
});
