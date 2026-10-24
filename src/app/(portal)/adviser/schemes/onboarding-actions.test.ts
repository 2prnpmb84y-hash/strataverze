import { beforeEach, describe, expect, it, vi } from "vitest";
import { currentYearEnd, todayInSydney } from "@/lib/onboarding/property-onboarding";

/**
 * Property onboarding (24 Oct): the server refuses anything the wizard would
 * refuse, saves nothing until every step passes, and stages the opening
 * balances as a draft cutover.
 */

const admin = { id: "admin-profile", firstName: "Ada", lastName: "Admin", isPlatformAdmin: true };
let isAdmin = true;

vi.mock("@/lib/auth/mfa-enforcement", () => ({
  requireRecentMfa: vi.fn(async () => {}),
  getMfaStatus: vi.fn(async () => null),
  enforceMfa: vi.fn(async () => {}),
  enforceMfaFor: vi.fn(async () => {}),
  StepUpRequiredError: class extends Error {},
}));

vi.mock("@/lib/auth/require-membership", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/require-membership")>("@/lib/auth/require-membership");
  return {
    ...actual,
    requireAuth: vi.fn(async () => admin),
    requirePlatformAdmin: vi.fn(async () => {
      if (!isAdmin) throw new actual.AuthorisationError("Only StrataVerze staff can do this.");
      return admin;
    }),
  };
});

const mocks = vi.hoisted(() => ({
  createScheme: vi.fn(async () => ({ id: "scheme-1" })),
  stage: vi.fn(async (): Promise<string | null> => "batch-1"),
  existing: null as null | { id: string },
}));

vi.mock("@/lib/queries/schemes", () => ({
  createScheme: mocks.createScheme,
  updateScheme: vi.fn(),
  deleteScheme: vi.fn(),
}));
vi.mock("@/lib/onboarding/stage-opening-cutover", () => ({ stageOnboardingCutover: mocks.stage }));
vi.mock("@/lib/audit/security-audit", () => ({ recordSecurityEvent: vi.fn(async () => {}) }));
vi.mock("@/lib/queries/activity-log", () => ({ logActivity: vi.fn(async () => {}) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
vi.mock("@/prisma/db", () => {
  const chain = { where: () => chain, first: async () => mocks.existing };
  return { db: { orm: { public: { Scheme: chain } } } };
});

const { createSchemeAction } = await import("./actions");

const today = todayInSydney();
const yearEnd = currentYearEnd("06-30", today);

function form(overrides: { lots?: unknown; balances?: unknown; lotBalances?: unknown; fields?: Record<string, string> } = {}) {
  const fd = new FormData();
  const fields: Record<string, string> = {
    name: "Harbour View",
    planNumber: "SP 12345",
    address: "1 Harbour St",
    suburb: "Drummoyne",
    state: "NSW",
    postcode: "2047",
    totalLots: "2",
    totalEntitlement: "100",
    financialYearEnd: yearEnd,
    ...overrides.fields,
  };
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  fd.set(
    "lotsJson",
    JSON.stringify(
      overrides.lots ?? [
        { lotNumber: "1", unitNumber: "1", entitlement: "40", ownerName: "J CITIZEN & J CITIZEN " },
        { lotNumber: "2", unitNumber: "2", entitlement: "60", ownerName: "ACME PTY LTD (ACN 000 000 000)" },
      ],
    ),
  );
  fd.set(
    "balancesJson",
    JSON.stringify(
      overrides.balances ?? {
        takeoverDate: today,
        totalBalance: "2,000",
        admin: { cashAtBank: "1,000", leviesReceivable: "300", leviesInAdvance: "100", creditors: "200", fundBalance: "1,000" },
        capitalWorks: { cashAtBank: "900", leviesReceivable: "100", leviesInAdvance: "", creditors: "", fundBalance: "1,000" },
      },
    ),
  );
  fd.set(
    "lotBalancesJson",
    JSON.stringify(
      overrides.lotBalances ?? [
        { lotNumber: "1", admin: "300", capitalWorks: "100", interest: "", unallocated: "" },
        { lotNumber: "2", admin: "", capitalWorks: "", interest: "", unallocated: "100" },
      ],
    ),
  );
  return fd;
}

beforeEach(() => {
  isAdmin = true;
  mocks.existing = null;
  mocks.createScheme.mockClear();
  mocks.stage.mockReset();
  mocks.stage.mockResolvedValue("batch-1");
});

describe("createSchemeAction (property onboarding)", () => {
  it("creates the building with its lots and owner names as on the roll, then opens the draft cutover", async () => {
    await expect(createSchemeAction({}, form())).rejects.toThrow("REDIRECT /adviser/schemes/scheme-1/finance/migration/cutover?batch=batch-1");
    expect(mocks.createScheme).toHaveBeenCalledTimes(1);
    const [data, actor, lots] = mocks.createScheme.mock.calls[0] as unknown as [Record<string, unknown>, string, unknown[]];
    expect(data).toMatchObject({ financialYearEnd: "06-30", totalLots: 2, totalEntitlement: 100 });
    expect(actor).toBe("admin-profile");
    expect(lots).toEqual([
      { lotNumber: "1", unitNumber: "1", entitlement: 40, ownerName: "J CITIZEN & J CITIZEN" },
      { lotNumber: "2", unitNumber: "2", entitlement: 60, ownerName: "ACME PTY LTD (ACN 000 000 000)" },
    ]);
    expect(mocks.stage).toHaveBeenCalledWith(expect.objectContaining({ schemeId: "scheme-1", actorId: "admin-profile", takeoverDate: today }));
  });

  it("goes to the building when there are no balances to bring across", async () => {
    mocks.stage.mockResolvedValue(null);
    await expect(createSchemeAction({}, form())).rejects.toThrow(/^REDIRECT \/adviser\/schemes\/scheme-1$/);
  });

  it("keeps the building, and says so, if the cutover cannot be staged", async () => {
    mocks.stage.mockRejectedValue(new Error("no chart of accounts"));
    await expect(createSchemeAction({}, form())).rejects.toThrow("REDIRECT /adviser/schemes/scheme-1/finance/migration/cutover?onboarding=not-staged");
    expect(mocks.createScheme).toHaveBeenCalledTimes(1);
  });

  it("refuses a year end without the year", async () => {
    const r = await createSchemeAction({}, form({ fields: { financialYearEnd: "06-30" } }));
    expect(r.step).toBe("address");
    expect(r.fieldErrors?.financialYearEnd).toContain("full date");
    expect(mocks.createScheme).not.toHaveBeenCalled();
  });

  it("refuses lots that do not match the building's total lots", async () => {
    const r = await createSchemeAction({}, form({ fields: { totalLots: "3" } }));
    expect(r.step).toBe("lots");
    expect(r.stepErrors?.join(" ")).toContain("You have entered 2 lots, but the building has 3");
    expect(mocks.createScheme).not.toHaveBeenCalled();
  });

  it("refuses unit entitlements that do not add up to the total", async () => {
    const r = await createSchemeAction({}, form({ fields: { totalEntitlement: "99" } }));
    expect(r.step).toBe("lots");
    expect(r.stepErrors?.join(" ")).toContain("add up to 100");
    expect(mocks.createScheme).not.toHaveBeenCalled();
  });

  it("refuses opening balances that do not reconcile with the balance sheet", async () => {
    const r = await createSchemeAction(
      {},
      form({
        balances: {
          takeoverDate: today,
          totalBalance: "2,000",
          admin: { cashAtBank: "1,000", leviesReceivable: "300", leviesInAdvance: "100", creditors: "200", fundBalance: "1,050" },
          capitalWorks: { cashAtBank: "900", leviesReceivable: "100", fundBalance: "950" },
        },
      }),
    );
    expect(r.step).toBe("balances");
    expect(r.stepErrors?.join(" ")).toContain("Administrative fund: the balance sheet comes to $1,000.00");
    expect(mocks.createScheme).not.toHaveBeenCalled();
  });

  it("refuses lot balances that do not add up to the balance sheet", async () => {
    const r = await createSchemeAction(
      {},
      form({
        lotBalances: [
          { lotNumber: "1", admin: "250", capitalWorks: "100", interest: "", unallocated: "" },
          { lotNumber: "2", admin: "", capitalWorks: "", interest: "", unallocated: "100" },
        ],
      }),
    );
    expect(r.step).toBe("lotBalances");
    expect(r.stepErrors?.join(" ")).toContain("Administrative fund levies and interest on the lots come to $250.00");
    expect(mocks.createScheme).not.toHaveBeenCalled();
  });

  it("refuses missing or malformed step data", async () => {
    const fd = form();
    fd.set("lotsJson", "{not json");
    expect((await createSchemeAction({}, fd)).step).toBe("lots");
    const fd2 = form();
    fd2.delete("balancesJson");
    expect((await createSchemeAction({}, fd2)).step).toBe("balances");
    expect(mocks.createScheme).not.toHaveBeenCalled();
  });

  it("refuses a plan number that is already registered", async () => {
    mocks.existing = { id: "other" };
    const r = await createSchemeAction({}, form());
    expect(r.step).toBe("details");
    expect(r.fieldErrors?.planNumber).toContain("already registered");
    expect(mocks.createScheme).not.toHaveBeenCalled();
  });

  it("is for StrataVerze administrators only", async () => {
    isAdmin = false;
    const r = await createSchemeAction({}, form());
    expect(r.error).toContain("Only StrataVerze staff");
    expect(mocks.createScheme).not.toHaveBeenCalled();
  });
});
