/**
 * Saving a Queensland building's data (QLD stage 2, step 10): the regulation
 * module (adviser or StrataVerze, the Standard Module only), the plan format
 * (adviser or StrataVerze, any listed format; QLD go-live gap) and each lot's
 * interest schedule lot entitlement (required for a new lot, locked like the
 * unit entitlement). An NSW building has neither, and its lots save as before.
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
// A Queensland-shaped building: the Queensland pack's rules (not yet active).
vi.mock("@/lib/jurisdiction/scheme-rules", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/scheme-rules")>("@/lib/jurisdiction/scheme-rules");
  const { PENDING_RULE_PACKS } = await import("@/config/statutory");
  const qld = PENDING_RULE_PACKS.QLD.rules;
  const forState = (state: string | null | undefined) => (state === "QLD-SHAPED" ? { pack: null, rules: qld, label: "AU-QLD test" } : actual.rulesForState(state));
  return {
    ...actual,
    rulesForState: forState,
    rulesForScheme: async (schemeId: string) => {
      const { sharedFake } = await import("@/test/fake-orm");
      return forState(sharedFake.table("Scheme").find((s) => s.id === schemeId)?.state as string);
    },
  };
});

const { sharedFake } = await import("@/test/fake-orm");
const { saveRegulationModuleAction, savePlanFormatAction } = await import("./actions");
const { createLotAction, updateLotAction } = await import("./[id]/lots/actions");

const NSW_ID = "11111111-0000-0000-0000-000000000001";
const QLD_ID = "22222222-0000-0000-0000-000000000002";

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}
const scheme = (id: string) => sharedFake.table("Scheme").find((s) => s.id === id)!;
const lot = (id: string) => sharedFake.table("Lot").find((l) => l.id === id)!;
const saveModule = (schemeId: string, value: string) => saveRegulationModuleAction(schemeId, {}, form({ regulationModule: value }));
const saveFormat = (schemeId: string, value: string) => savePlanFormatAction(schemeId, {}, form({ planFormat: value }));

/** createLotAction redirects on success. */
async function createLot(schemeId: string, fields: Record<string, string>) {
  try {
    return await createLotAction(schemeId, {}, form(fields));
  } catch (err) {
    if ((err as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) return "created";
    throw err;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(caller, { isPlatformAdmin: false, roles: ["ADVISER"] });
  sharedFake.reset({
    Scheme: [
      { id: NSW_ID, state: "NSW", regulationModule: null, planFormat: null },
      { id: QLD_ID, state: "QLD-SHAPED", regulationModule: null, planFormat: null },
    ],
    Lot: [
      { id: "lot-nsw", schemeId: NSW_ID, lotNumber: "1", entitlement: 10, interestScheduleEntitlement: null, lotType: "RESIDENTIAL" },
      { id: "lot-qld", schemeId: QLD_ID, lotNumber: "1", entitlement: 10, interestScheduleEntitlement: null, lotType: "RESIDENTIAL" },
    ],
  });
});

describe("saveRegulationModuleAction", () => {
  it("saves the Standard Module for a Queensland building, and logs it for advisers only", async () => {
    expect(await saveModule(QLD_ID, "STANDARD")).toEqual({ success: true });
    expect(scheme(QLD_ID).regulationModule).toBe("STANDARD");
    expect(activity.logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "REGULATION_MODULE_CHANGED", metadata: { from: null, to: "STANDARD" } }));
  });

  it("refuses a module StrataVerze does not apply, an unknown one and none", async () => {
    expect((await saveModule(QLD_ID, "COMMERCIAL")).error).toBe("StrataVerze applies the Standard Module only for now, so a building under the Commercial Module cannot be managed yet.");
    expect((await saveModule(QLD_ID, "NSW")).error).toBe("Choose a valid regulation module.");
    expect((await saveModule(QLD_ID, "")).error).toBe("Choose the regulation module.");
    expect(scheme(QLD_ID).regulationModule).toBeNull();
  });

  it("refuses an NSW building, which has no such setting", async () => {
    expect((await saveModule(NSW_ID, "STANDARD")).error).toBe("This building has no such setting.");
    expect(scheme(NSW_ID).regulationModule).toBeNull();
  });

  it("is for the adviser or StrataVerze only, never an owner or the committee", async () => {
    caller.roles = ["OWNER", "COMMITTEE"];
    expect((await saveModule(QLD_ID, "STANDARD")).error).toMatch(/permission/);
    expect(scheme(QLD_ID).regulationModule).toBeNull();
    caller.isPlatformAdmin = true;
    caller.roles = [];
    expect(await saveModule(QLD_ID, "STANDARD")).toEqual({ success: true });
  });
});

describe("savePlanFormatAction (QLD go-live gap, insurance in contributions)", () => {
  it("saves a building or volumetric format plan for a Queensland building, and logs it for advisers only", async () => {
    expect(await saveFormat(QLD_ID, "BUILDING")).toEqual({ success: true });
    expect(scheme(QLD_ID).planFormat).toBe("BUILDING");
    expect(activity.logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "PLAN_FORMAT_CHANGED", metadata: { from: null, to: "BUILDING" } }));
    expect(await saveFormat(QLD_ID, "VOLUMETRIC")).toEqual({ success: true });
    expect(activity.logActivity).toHaveBeenLastCalledWith(expect.objectContaining({ metadata: { from: "BUILDING", to: "VOLUMETRIC" } }));
  });

  it("records a standard format plan, a fact about the building, though its insurance contributions are refused", async () => {
    expect(await saveFormat(QLD_ID, "STANDARD")).toEqual({ success: true });
    expect(scheme(QLD_ID).planFormat).toBe("STANDARD");
  });

  it("refuses an unknown plan format and none", async () => {
    expect((await saveFormat(QLD_ID, "LAYERED")).error).toBe("Choose a valid plan format.");
    expect((await saveFormat(QLD_ID, "")).error).toBe("Choose the plan format.");
    expect(scheme(QLD_ID).planFormat).toBeNull();
  });

  it("refuses an NSW building, which has no such setting", async () => {
    expect((await saveFormat(NSW_ID, "BUILDING")).error).toBe("This building has no such setting.");
    expect(scheme(NSW_ID).planFormat).toBeNull();
  });

  it("is for the adviser or StrataVerze only, never an owner or the committee", async () => {
    caller.roles = ["OWNER", "COMMITTEE"];
    expect((await saveFormat(QLD_ID, "BUILDING")).error).toMatch(/permission/);
    expect(scheme(QLD_ID).planFormat).toBeNull();
    expect(activity.logActivity).not.toHaveBeenCalled();
    caller.isPlatformAdmin = true;
    caller.roles = [];
    expect(await saveFormat(QLD_ID, "BUILDING")).toEqual({ success: true });
  });
});

describe("a lot's interest schedule lot entitlement", () => {
  it("is required, as a positive whole number, when StrataVerze adds a Queensland lot", async () => {
    caller.isPlatformAdmin = true;
    const base = { lotNumber: "2", entitlement: "20", lotType: "RESIDENTIAL" };
    expect(await createLot(QLD_ID, base)).toEqual({ fieldErrors: { interestScheduleEntitlement: "Enter the interest schedule lot entitlement." } });
    expect(await createLot(QLD_ID, { ...base, interestScheduleEntitlement: "0" })).toEqual({
      fieldErrors: { interestScheduleEntitlement: "Interest Schedule Lot Entitlement must be a whole number of at least 1." },
    });
    expect(await createLot(QLD_ID, { ...base, interestScheduleEntitlement: "18" })).toBe("created");
    expect(sharedFake.table("Lot").find((l) => l.schemeId === QLD_ID && l.lotNumber === "2")).toMatchObject({ entitlement: 20, interestScheduleEntitlement: 18 });
  });

  it("is not asked for or written for an NSW lot", async () => {
    caller.isPlatformAdmin = true;
    expect(await createLot(NSW_ID, { lotNumber: "2", entitlement: "20", lotType: "RESIDENTIAL" })).toBe("created");
    const created = sharedFake.table("Lot").find((l) => l.schemeId === NSW_ID && l.lotNumber === "2")!;
    expect("interestScheduleEntitlement" in created).toBe(false);
  });

  it("is entered by StrataVerze, and is locked for the adviser like the unit entitlement", async () => {
    const fields = { lotNumber: "1", entitlement: "10", lotType: "RESIDENTIAL" };
    // The adviser's form sends the locked field unchanged (empty): the lot saves and stays flagged.
    expect(await updateLotAction(QLD_ID, "lot-qld", {}, form({ ...fields, unitNumber: "4", interestScheduleEntitlement: "" }))).toEqual({});
    expect(lot("lot-qld")).toMatchObject({ unitNumber: "4", interestScheduleEntitlement: null });
    expect((await updateLotAction(QLD_ID, "lot-qld", {}, form({ ...fields, interestScheduleEntitlement: "12" }))).error).toMatch(/locked building record/);
    expect(lot("lot-qld").interestScheduleEntitlement).toBeNull();

    caller.isPlatformAdmin = true;
    expect(await updateLotAction(QLD_ID, "lot-qld", {}, form({ ...fields, interestScheduleEntitlement: "12" }))).toEqual({});
    expect(lot("lot-qld").interestScheduleEntitlement).toBe(12);
    expect(await updateLotAction(QLD_ID, "lot-qld", {}, form({ ...fields, interestScheduleEntitlement: "1.5" }))).toEqual({
      fieldErrors: { interestScheduleEntitlement: "Interest Schedule Lot Entitlement must be a whole number of at least 1." },
    });
    expect(lot("lot-qld").interestScheduleEntitlement).toBe(12);
  });

  it("is refused for an NSW lot, whose form never sends it", async () => {
    caller.isPlatformAdmin = true;
    const fields = { lotNumber: "1", entitlement: "10", lotType: "RESIDENTIAL" };
    expect((await updateLotAction(NSW_ID, "lot-nsw", {}, form({ ...fields, interestScheduleEntitlement: "12" }))).error).toBe("This building's lots hold one lot entitlement only.");
    expect(lot("lot-nsw").interestScheduleEntitlement).toBeNull();
    expect(await updateLotAction(NSW_ID, "lot-nsw", {}, form({ ...fields, unitNumber: "7" }))).toEqual({});
    expect(lot("lot-nsw")).toMatchObject({ unitNumber: "7", interestScheduleEntitlement: null });
  });
});

describe("each lot's entitlement (lots.entitlement)", () => {
  it("keeps NSW's create errors exactly as they were", async () => {
    caller.isPlatformAdmin = true;
    expect(await createLot(NSW_ID, { lotNumber: "", entitlement: "0", lotType: "RESIDENTIAL" })).toEqual({
      fieldErrors: { lotNumber: "Lot number is required.", entitlement: "Entitlement must be at least 1." },
    });
    expect(await createLot(NSW_ID, { lotNumber: "2", entitlement: "", lotType: "VILLA" })).toEqual({
      fieldErrors: { entitlement: "Entitlement must be at least 1.", lotType: "Select a valid lot type." },
    });
    // Only StrataVerze adds a lot (locked record).
    caller.isPlatformAdmin = false;
    expect(await createLot(NSW_ID, { lotNumber: "2", entitlement: "20", lotType: "RESIDENTIAL" })).toEqual({ error: "Only StrataVerze staff can do this." });
    expect(sharedFake.table("Lot").filter((l) => l.schemeId === NSW_ID)).toHaveLength(1);
  });

  it("keeps NSW's update check as it was: only below 1 is refused there", async () => {
    caller.isPlatformAdmin = true;
    expect(await updateLotAction(NSW_ID, "lot-nsw", {}, form({ lotNumber: "1", entitlement: "0", lotType: "RESIDENTIAL" }))).toEqual({
      fieldErrors: { entitlement: "Entitlement must be at least 1." },
    });
    expect(await updateLotAction(NSW_ID, "lot-nsw", {}, form({ lotNumber: "1", entitlement: "12.5", lotType: "RESIDENTIAL" }))).toEqual({});
  });

  it("must be a whole number for a Queensland lot (its contribution schedule lot entitlement, Act s 46)", async () => {
    caller.isPlatformAdmin = true;
    const problem = { entitlement: "Contribution Schedule Lot Entitlement must be a whole number of at least 1." };
    expect(await createLot(QLD_ID, { lotNumber: "2", entitlement: "12.5", lotType: "RESIDENTIAL", interestScheduleEntitlement: "10" })).toEqual({ fieldErrors: problem });
    expect(await updateLotAction(QLD_ID, "lot-qld", {}, form({ lotNumber: "1", entitlement: "12.5", lotType: "RESIDENTIAL" }))).toEqual({ fieldErrors: problem });
    expect(lot("lot-qld").entitlement).toBe(10);
    // Below 1 keeps the shared words, for both states.
    expect(await createLot(QLD_ID, { lotNumber: "2", entitlement: "0", lotType: "RESIDENTIAL", interestScheduleEntitlement: "10" })).toEqual({
      fieldErrors: { entitlement: "Entitlement must be at least 1." },
    });
  });
});
