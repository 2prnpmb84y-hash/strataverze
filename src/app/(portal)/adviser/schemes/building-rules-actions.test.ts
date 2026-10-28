/**
 * Saving the building rules (VIC, ACT and WA stage 2, PR 2): the adviser or
 * StrataVerze saves recorded selectors and facts, checked against the
 * building's pack, all or nothing. Anyone else is refused. An NSW building
 * has no building rules. The packs are pending, so a building is given one
 * here by a test state.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/mfa-enforcement", () => ({
  requireRecentMfa: vi.fn(async () => {}),
  getMfaStatus: vi.fn(async () => null),
  enforceMfa: vi.fn(async () => {}),
  enforceMfaFor: vi.fn(async () => {}),
  StepUpRequiredError: class extends Error {},
}));
const caller = vi.hoisted(() => ({ id: "caller", isPlatformAdmin: false, roles: ["ADVISER"] as string[] }));
vi.mock("@/lib/auth/require-membership", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/require-membership")>("@/lib/auth/require-membership");
  return {
    ...actual,
    requireAuth: vi.fn(async () => caller),
    requirePlatformAdmin: vi.fn(async () => {
      if (!caller.isPlatformAdmin) throw new actual.AuthorisationError("Only StrataVerze staff can do this.");
      return caller;
    }),
    requireSchemeMembership: vi.fn(async (_schemeId: string, allowed: string[]) => {
      const role = caller.roles.find((r) => allowed.includes(r));
      if (!role) throw new actual.AuthorisationError("You do not have permission to perform this action.");
      return { profile: caller, membership: { role, profileId: caller.id }, roles: caller.roles };
    }),
  };
});
vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${url}` });
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
const activity = vi.hoisted(() => ({ logActivity: vi.fn(async () => {}) }));
vi.mock("@/lib/queries/activity-log", () => ({ logActivity: activity.logActivity, logActivityTx: vi.fn() }));
vi.mock("@/lib/audit/security-audit", () => ({ recordSecurityEvent: vi.fn(async () => {}) }));
vi.mock("@/lib/auth/session-register", () => ({ revokeAllSessions: vi.fn(async () => {}) }));
// Buildings shaped by the pending Western Australian and Victorian packs.
vi.mock("@/lib/jurisdiction/scheme-rules", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/scheme-rules")>("@/lib/jurisdiction/scheme-rules");
  const { PENDING_RULE_PACKS } = await import("@/config/statutory");
  const forState = (state: string | null | undefined) =>
    state === "WA-SHAPED"
      ? { pack: null, rules: PENDING_RULE_PACKS.WA.rules, label: "AU-WA test" }
      : state === "VIC-SHAPED"
        ? { pack: null, rules: PENDING_RULE_PACKS.VIC.rules, label: "AU-VIC test" }
        : actual.rulesForState(state);
  return { ...actual, rulesForState: forState };
});

const { sharedFake } = await import("@/test/fake-orm");
const { saveBuildingRulesAction } = await import("./actions");

const NSW_ID = "11111111-0000-0000-0000-000000000001";
const WA_ID = "33333333-0000-0000-0000-000000000003";
const VIC_ID = "44444444-0000-0000-0000-000000000004";

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}
const save = (schemeId: string, fields: Record<string, string>) => saveBuildingRulesAction(schemeId, {}, form(fields));
const values = (schemeId: string) => Object.fromEntries(sharedFake.table("SchemeSelectorValue").filter((v) => v.schemeId === schemeId).map((v) => [v.key, v.value]));
const scheme = (id: string) => sharedFake.table("Scheme").find((s) => s.id === id)!;
const lot = (id: string) => sharedFake.table("Lot").find((l) => l.id === id)!;

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(caller, { isPlatformAdmin: false, roles: ["ADVISER"] });
  sharedFake.reset({
    Scheme: [
      { id: NSW_ID, state: "NSW", totalLots: 1 },
      { id: WA_ID, state: "WA-SHAPED", totalLots: 2, replacementCost: null },
      { id: VIC_ID, state: "VIC-SHAPED", totalLots: 2, servicesOnly: null },
    ],
    Lot: [
      { id: "lot-nsw", schemeId: NSW_ID, lotNumber: "1", lotType: "RESIDENTIAL" },
      { id: "lot-vic-1", schemeId: VIC_ID, lotNumber: "1", lotType: "RESIDENTIAL", occupiable: null },
      { id: "lot-vic-2", schemeId: VIC_ID, lotNumber: "2", lotType: "PARKING", occupiable: null },
    ],
    SchemeSelectorValue: [],
  });
});

describe("saveBuildingRulesAction", () => {
  it("saves a Western Australian building's recorded selectors and replacement cost, and logs it for advisers", async () => {
    expect(await save(WA_ID, { "selector:schemeType": "STRATA", "selector:tenure": "FREEHOLD", replacementCost: "4,500,000" })).toEqual({ success: true });
    expect(values(WA_ID)).toEqual({ schemeType: "STRATA", tenure: "FREEHOLD" });
    expect(scheme(WA_ID).replacementCost).toBe("4500000.00");
    expect(sharedFake.table("SchemeSelectorValue").every((v) => v.recordedBy === "caller")).toBe(true);
    expect(activity.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "BUILDING_RULES_CHANGED", schemeId: WA_ID, metadata: { selectors: ["schemeType", "tenure"], servicesOnly: false, replacementCost: true, count: 0 } }),
    );
    // Changing one value updates its row; "Not recorded" removes it.
    expect(await save(WA_ID, { "selector:schemeType": "SURVEY_STRATA", "selector:tenure": "" })).toEqual({ success: true });
    expect(values(WA_ID)).toEqual({ schemeType: "SURVEY_STRATA" });
    expect(sharedFake.table("SchemeSelectorValue")).toHaveLength(1);
  });

  it("saves a Victorian building's services only answer and each lot's occupiable answer", async () => {
    expect(await save(VIC_ID, { "selector:ownersCorporationType": "UNLIMITED", servicesOnly: "NO", "occupiable:lot-vic-1": "YES", "occupiable:lot-vic-2": "NO" })).toEqual({ success: true });
    expect(scheme(VIC_ID).servicesOnly).toBe(false);
    expect([lot("lot-vic-1").occupiable, lot("lot-vic-2").occupiable]).toEqual([true, false]);
    expect(values(VIC_ID)).toEqual({ ownersCorporationType: "UNLIMITED" });
  });

  it("lets StrataVerze save, and refuses an owner or a committee member, saving nothing", async () => {
    Object.assign(caller, { isPlatformAdmin: true, roles: [] });
    expect(await save(WA_ID, { "selector:schemeType": "STRATA" })).toEqual({ success: true });
    sharedFake.reset({ Scheme: [{ id: WA_ID, state: "WA-SHAPED", totalLots: 2 }], SchemeSelectorValue: [] });
    for (const roles of [["OWNER"], ["COMMITTEE"], []]) {
      Object.assign(caller, { isPlatformAdmin: false, roles });
      expect(await save(WA_ID, { "selector:schemeType": "STRATA", replacementCost: "1" })).toEqual({ error: "You do not have permission to perform this action." });
    }
    expect(values(WA_ID)).toEqual({});
    expect(scheme(WA_ID).replacementCost).toBeUndefined();
    expect(activity.logActivity).toHaveBeenCalledTimes(1);
  });

  it("refuses a value the pack does not allow, a derived selector and another state's fields, saving nothing", async () => {
    expect(await save(WA_ID, { "selector:schemeType": "STRATA", "selector:tenure": "UNITS_PLAN" })).toEqual({ error: "Choose a valid freehold or leasehold." });
    expect(await save(WA_ID, { "selector:schemeSize": "TWO_LOT" })).toEqual({ error: "The scheme size is worked out from the building's facts, so it cannot be chosen." });
    expect(await save(WA_ID, { "selector:ownersCorporationType": "UNLIMITED" })).toEqual({ error: "This building has no such setting." });
    expect(values(WA_ID)).toEqual({});
    // Services only is not a Western Australian fact, so it is never written.
    expect(await save(WA_ID, { servicesOnly: "YES" })).toEqual({ success: true });
    expect(scheme(WA_ID).servicesOnly).toBeUndefined();
    expect(activity.logActivity).toHaveBeenCalledTimes(1);
  });

  it("refuses a lot of another building and rolls back the whole save", async () => {
    const result = await save(VIC_ID, { "selector:ownersCorporationType": "UNLIMITED", servicesOnly: "YES", "occupiable:lot-vic-1": "YES", "occupiable:lot-nsw": "YES" });
    expect(result).toEqual({ error: "A lot in the form is not one of this building's lots. Reload the page and try again." });
    expect(values(VIC_ID)).toEqual({});
    expect(scheme(VIC_ID).servicesOnly).toBeNull();
    expect(lot("lot-vic-1").occupiable).toBeNull();
    expect(lot("lot-nsw").occupiable).toBeUndefined();
  });

  it("has nothing to save for an NSW building", async () => {
    expect(await save(NSW_ID, { "selector:schemeType": "STRATA" })).toEqual({ error: "This building has no such setting." });
    expect(sharedFake.table("SchemeSelectorValue")).toEqual([]);
    expect(scheme(NSW_ID)).toEqual({ id: NSW_ID, state: "NSW", totalLots: 1 });
  });
});
