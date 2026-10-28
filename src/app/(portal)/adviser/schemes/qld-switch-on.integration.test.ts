/**
 * A Queensland building end to end, with the live Queensland pack (QLD stage
 * 2, step 11, the switch-on, 28 Oct 2026). Nothing lends it rules: the real
 * jurisdiction config and rule packs are used, on the in-memory database.
 *
 * The Add Property action creates the building with its regulation module,
 * plan format and lots with both lot entitlements, its funds on the pack's
 * accounting basis and its chart of accounts. A contribution that includes
 * insurance is then raised for it: the insurance part is shared by the
 * interest schedule and the rest by the contribution schedule.
 *
 * Plan numbers are unique within each state (decided 27 Oct 2026): the
 * building shares its plan number with an NSW building, and a second
 * Queensland building with the same plan number is refused.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { currentYearEnd } from "@/lib/onboarding/property-onboarding";
import { todayIn } from "@/lib/jurisdiction/time-zone";

const scheduleToday = vi.hoisted(() => ({ value: "2026-05-01" }));

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
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
    requirePlatformAdmin: vi.fn(async () => ({ id: "admin" })),
    requireSchemeMembership: vi.fn(async () => ({ profile: { id: "admin" } })),
  };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
vi.mock("@/lib/audit/security-audit", () => ({ recordSecurityEvent: vi.fn(async () => {}) }));
vi.mock("@/lib/queries/activity-log", () => ({ logActivity: vi.fn(async () => {}), getAuditTrailForExport: vi.fn(), formatAuditTrailCsv: vi.fn() }));
// No opening balances to bring across: the building page is next.
vi.mock("@/lib/onboarding/stage-opening-cutover", () => ({ stageOnboardingCutover: vi.fn(async () => null) }));
// The contribution: the building's day, its lots and owners, and what happens after the notices are issued.
vi.mock("@/lib/jurisdiction/scheme-time", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/scheme-time")>("@/lib/jurisdiction/scheme-time");
  return { ...actual, schemeToday: async () => scheduleToday.value };
});
vi.mock("@/lib/levies/load-plan-lots", async () => {
  const { sharedFake } = await import("@/test/fake-orm");
  return {
    loadPlanLots: async (schemeId: string) =>
      sharedFake
        .table("Lot")
        .filter((l) => l.schemeId === schemeId)
        .map((l) => ({ lotId: l.id, lotNumber: String(l.lotNumber), entitlement: Number(l.entitlement), ownerId: `o${String(l.lotNumber)}` })),
  };
});
vi.mock("@/lib/levies/notice-content-data", () => ({ checkPlannedNotices: async () => [], sendIssuedNotices: async (i: { notices: unknown[] }) => i.notices.length }));
vi.mock("@/lib/finance/owner-credits", () => ({ applyOwnerCredit: async () => 0, recordCreditMovement: async () => ({ id: "credit-1" }) }));
vi.mock("@/lib/queries/journal-entries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries/journal-entries")>("@/lib/queries/journal-entries");
  return { ...actual, getNextEntryNumber: async () => "JE-1", createJournalEntry: async () => ({ id: "je" }), postJournalEntry: async () => {} };
});

const { sharedFake } = await import("@/test/fake-orm");
const { createSchemeAction } = await import("./actions");
const { issueScheduleNoticesAction } = await import("./[id]/finance/actions");

const today = todayIn("Australia/Brisbane");
const yearEnd = currentYearEnd("06-30", today);

/** The NSW building already on the platform, with the plan number the Queensland one will have. */
const NSW_BUILDING = { id: "nsw-1", name: "Harbour View", state: "NSW", planNumber: "12345", postcode: "2000", timeZone: "Australia/Sydney" };

function addPropertyForm(fields: Record<string, string> = {}) {
  const fd = new FormData();
  const all: Record<string, string> = {
    name: "Riverside",
    planNumber: "12345",
    address: "1 Eagle St",
    suburb: "Brisbane City",
    state: "QLD",
    postcode: "4000",
    totalLots: "3",
    totalEntitlement: "60",
    financialYearEnd: yearEnd,
    regulationModule: "STANDARD",
    planFormat: "BUILDING",
    ...fields,
  };
  for (const [k, v] of Object.entries(all)) fd.set(k, v);
  // Contribution schedule 10, 20, 30; interest schedule 30, 30, 40.
  fd.set(
    "lotsJson",
    JSON.stringify([
      { lotNumber: "1", unitNumber: "", entitlement: "10", ownerName: "A OWNER", interestScheduleEntitlement: "30" },
      { lotNumber: "2", unitNumber: "", entitlement: "20", ownerName: "B OWNER", interestScheduleEntitlement: "30" },
      { lotNumber: "3", unitNumber: "", entitlement: "30", ownerName: "C OWNER", interestScheduleEntitlement: "40" },
    ]),
  );
  const fund = { cashAtBank: "", leviesReceivable: "", leviesInAdvance: "", creditors: "", fundBalance: "" };
  fd.set("balancesJson", JSON.stringify({ takeoverDate: today, totalBalance: "0", admin: fund, capitalWorks: fund }));
  fd.set("lotBalancesJson", JSON.stringify([{ lotNumber: "1" }, { lotNumber: "2" }, { lotNumber: "3" }]));
  return fd;
}

/** Run the Add Property action; it ends by redirecting to the new building. */
async function addProperty(fields: Record<string, string> = {}) {
  return createSchemeAction({}, addPropertyForm(fields)).then(
    (result) => ({ result, redirect: null as string | null }),
    (err: unknown) => {
      const m = /^REDIRECT (.+)$/.exec(err instanceof Error ? err.message : "");
      if (!m) throw err;
      return { result: null, redirect: m[1] };
    },
  );
}

const qldBuilding = () => sharedFake.table("Scheme").find((s) => s.state === "QLD")!;

beforeEach(() => {
  scheduleToday.value = "2026-05-01";
  sharedFake.reset({
    Scheme: [{ ...NSW_BUILDING }],
    SchemeMembership: [],
    Fund: [],
    Lot: [],
    LotDetail: [],
    AccountCode: [],
    Budget: [],
    BudgetLine: [],
    LevySchedule: [],
    LevyNotice: [],
  });
  // The database's keys (migration 20261121): plan numbers unique within each state.
  sharedFake.setUniqueKeys({ Scheme: [["state", "planNumber"]], Lot: [["schemeId", "lotNumber"]] });
});

describe("adding a Queensland building", () => {
  it("creates it with its module, plan format, both lot entitlements, funds and chart of accounts", async () => {
    const { result, redirect } = await addProperty();
    expect(result).toBeNull();
    const scheme = qldBuilding();
    expect(redirect).toBe(`/adviser/schemes/${scheme.id}`);
    expect(scheme).toMatchObject({
      name: "Riverside",
      state: "QLD",
      planNumber: "12345",
      postcode: "4000",
      timeZone: "Australia/Brisbane",
      regulationModule: "STANDARD",
      planFormat: "BUILDING",
      // The penalty applies only once the body corporate resolves it (LATE_CHARGE.defaultMode).
      interestMode: "NONE",
      totalLots: 3,
      totalEntitlement: 60,
    });
    expect(sharedFake.table("SchemeMembership")).toEqual([expect.objectContaining({ schemeId: scheme.id, profileId: "admin", role: "ADVISER", isActive: true })]);

    // The pack's two funds, named as the pack names them, on its default accounting basis.
    const funds = sharedFake.table("Fund").filter((f) => f.schemeId === scheme.id);
    expect(funds.map((f) => [f.name, f.fundType, f.accountingBasis])).toEqual([
      ["Administrative Fund", "ADMINISTRATIVE", "CASH"],
      ["Sinking Fund", "CAPITAL_WORKS", "ACCRUAL"],
    ]);

    // Each lot with both entitlements, and the owner's name as entered.
    const lots = sharedFake.table("Lot").filter((l) => l.schemeId === scheme.id);
    expect(lots.map((l) => [l.lotNumber, l.entitlement, l.interestScheduleEntitlement])).toEqual([
      ["1", 10, 30],
      ["2", 20, 30],
      ["3", 30, 40],
    ]);
    expect(sharedFake.table("LotDetail").map((d) => d.rollOwnerName)).toEqual(["A OWNER", "B OWNER", "C OWNER"]);

    // The chart of accounts, seeded for both funds, with an insurance account in the administrative fund.
    const accounts = sharedFake.table("AccountCode").filter((a) => a.schemeId === scheme.id);
    const admin = funds.find((f) => f.fundType === "ADMINISTRATIVE")!;
    const sinking = funds.find((f) => f.fundType === "CAPITAL_WORKS")!;
    expect(new Set(accounts.map((a) => a.fundId))).toEqual(new Set([admin.id, sinking.id]));
    expect(accounts.filter((a) => a.accountSubType === "INSURANCE_EXPENSE").map((a) => a.fundId)).toEqual([admin.id]);

    // The NSW building with the same plan number is untouched.
    expect(sharedFake.table("Scheme").find((s) => s.id === "nsw-1")).toEqual(NSW_BUILDING);
  });

  it("refuses a second Queensland building with the same plan number, saving nothing", async () => {
    await addProperty();
    const { result } = await addProperty({ name: "Riverside Two" });
    expect(result).toEqual({
      fieldErrors: { planNumber: "A Queensland building with this plan number is already registered." },
      step: "details",
      stepErrors: ["A Queensland building with this plan number is already registered."],
    });
    expect(sharedFake.table("Scheme").filter((s) => s.state === "QLD")).toHaveLength(1);
  });

  it("refuses an NSW postcode for a Queensland building, and takes Mungindi's shared one", async () => {
    const { result } = await addProperty({ postcode: "2000" });
    expect(result?.fieldErrors?.postcode).toBe(
      "2000 is not a Queensland postcode. Only New South Wales and Queensland buildings can be set up for now. If this building is in Queensland, check the postcode with StrataVerze.",
    );
    expect(sharedFake.table("Scheme")).toHaveLength(1);
    await addProperty({ postcode: "2406" });
    expect(qldBuilding()).toMatchObject({ postcode: "2406", timeZone: "Australia/Brisbane" });
  });
});

describe("a contribution that includes insurance, for the new Queensland building", () => {
  it("is shared by the interest schedule for insurance and the contribution schedule for the rest, exact to the cent", async () => {
    await addProperty();
    const scheme = qldBuilding();
    const admin = sharedFake.table("Fund").find((f) => f.schemeId === scheme.id && f.fundType === "ADMINISTRATIVE")!;
    const accounts = sharedFake.table("AccountCode").filter((a) => a.schemeId === scheme.id && a.fundId === admin.id);
    const insurance = accounts.find((a) => a.accountSubType === "INSURANCE_EXPENSE")!;
    const other = accounts.find((a) => a.accountType === "EXPENSE" && a.accountSubType !== "INSURANCE_EXPENSE")!;
    expect(insurance).toBeDefined();
    expect(other).toBeDefined();

    // The adopted administrative fund budget: $400.01 of insurance in $1,000.00.
    sharedFake.table("Budget").push({ id: "b-admin", schemeId: scheme.id, fundId: admin.id, financialYear: 2026, version: 1, status: "ADOPTED" });
    sharedFake.table("BudgetLine").push(
      { id: "bl-ins", fundId: admin.id, accountCodeId: insurance.id, financialYear: 2026, budgetId: "b-admin", budgetAmount: "400.01" },
      { id: "bl-other", fundId: admin.id, accountCodeId: other.id, financialYear: 2026, budgetId: "b-admin", budgetAmount: "599.99" },
    );
    sharedFake.table("LevySchedule").push({
      id: "ls1",
      schemeId: scheme.id,
      fundId: admin.id,
      financialYear: 2026,
      budgetAmount: "1000.00",
      frequency: "QUARTERLY",
      levyType: "ORDINARY",
      totalLots: 3,
      totalEntitlement: "60",
      status: "APPROVED",
      approvedBy: "admin",
    });

    const r = await issueScheduleNoticesAction(String(scheme.id), "ls1", {}, new FormData());
    expect(r).toMatchObject({ success: true, data: { planned: 12 } });

    const notices = sharedFake.table("LevyNotice");
    expect(notices).toHaveLength(12);
    const cents = (v: unknown) => Math.round(Number(v) * 100);
    const lotIds = sharedFake.table("Lot").filter((l) => l.schemeId === scheme.id).map((l) => l.id);
    const byLot = (field: string) => lotIds.map((id) => notices.filter((n) => n.lotId === id).reduce((a, n) => a + cents(n[field]), 0));
    // Insurance $400.01 by the interest schedule (30, 30, 40); the other $599.99 by the contribution schedule (10, 20, 30).
    expect(byLot("insuranceAmount")).toEqual([12_000, 12_000, 16_001]);
    expect(byLot("amountDue")).toEqual([22_000, 32_000, 46_000]);
    expect(notices.reduce((a, n) => a + cents(n.amountDue), 0)).toBe(100_000);
    expect(sharedFake.table("LevySchedule")[0].status).toBe("ACTIVE");
  });
});
