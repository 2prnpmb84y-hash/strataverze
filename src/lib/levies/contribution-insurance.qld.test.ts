/**
 * Raising a Queensland contribution with insurance in it, end to end on the
 * fake database (QLD go-live gap, insurance in contributions, 27 Oct 2026):
 * the generate action splits each lot's share, stores each notice's insurance
 * part and refuses, creating nothing, where the split cannot be made. The
 * building is Queensland shaped: the pending pack's rules, as the other
 * Queensland tests use them.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const today = vi.hoisted(() => ({ value: "2026-05-01" }));

vi.mock("@/lib/auth/mfa-enforcement", () => ({
  requireRecentMfa: vi.fn(async () => {}),
  getMfaStatus: vi.fn(async () => null),
  enforceMfa: vi.fn(async () => {}),
  enforceMfaFor: vi.fn(async () => {}),
  StepUpRequiredError: class extends Error {},
}));
vi.mock("@/lib/auth/require-membership", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/require-membership")>("@/lib/auth/require-membership");
  return { ...actual, requireSchemeMembership: vi.fn(async () => ({ profile: { id: "adviser" } })) };
});
vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/queries/activity-log", () => ({ logActivity: vi.fn(async () => {}), getAuditTrailForExport: vi.fn(), formatAuditTrailCsv: vi.fn() }));
vi.mock("@/lib/jurisdiction/scheme-time", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/scheme-time")>("@/lib/jurisdiction/scheme-time");
  return { ...actual, schemeToday: async () => today.value };
});
vi.mock("@/lib/jurisdiction/scheme-rules", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/scheme-rules")>("@/lib/jurisdiction/scheme-rules");
  const { PENDING_RULE_PACKS } = await import("@/config/statutory");
  const forState = (state: string | null | undefined) => (state === "QLD-SHAPED" ? { pack: null, rules: PENDING_RULE_PACKS.QLD.rules, label: "AU-QLD test" } : actual.rulesForState(state));
  return {
    ...actual,
    rulesForState: forState,
    rulesForScheme: async (schemeId: string) => {
      const { sharedFake } = await import("@/test/fake-orm");
      return forState(sharedFake.table("Scheme").find((s) => s.id === schemeId)?.state as string);
    },
  };
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
vi.mock("@/lib/queries/account-codes", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries/account-codes")>("@/lib/queries/account-codes");
  return { ...actual, getSystemAccountBySubType: async (_s: string, sub: string) => ({ id: `acc-${sub}` }) };
});
vi.mock("@/lib/queries/journal-entries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries/journal-entries")>("@/lib/queries/journal-entries");
  return { ...actual, getNextEntryNumber: async () => "JE-1", createJournalEntry: async () => ({ id: "je" }), postJournalEntry: async () => {} };
});
vi.mock("@/lib/queries/schemes", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries/schemes")>("@/lib/queries/schemes");
  return { ...actual, getSchemeById: async () => ({ id: "s1", financialYearEnd: "06-30", autoApplyOwnerCredit: true }) };
});

const { sharedFake } = await import("@/test/fake-orm");
const { issueScheduleNoticesAction } = await import("@/app/(portal)/adviser/schemes/[id]/finance/actions");
const { budgetedInsuranceCents, contributionInsurance } = await import("./contribution-insurance");
const { levyNoticeBlocks } = await import("@/lib/pdf/documents");
const { PENDING_RULE_PACKS } = await import("@/config/statutory");

// Contribution schedule 10, 20, 30; interest schedule 30, 30, 40.
function seed(opts: { planFormat?: string | null; fundId?: string; interest?: Array<number | null>; insurance?: string | null; budgetAmount?: string } = {}) {
  const interest = opts.interest ?? [30, 30, 40];
  sharedFake.reset({
    Scheme: [{ id: "s1", state: "QLD-SHAPED", timeZone: "Australia/Brisbane", financialYearEnd: "06-30", autoApplyOwnerCredit: true, planFormat: opts.planFormat === undefined ? "BUILDING" : opts.planFormat }],
    Fund: [
      { id: "admin", schemeId: "s1", name: "Administrative Fund", fundType: "ADMINISTRATIVE", isActive: true },
      { id: "sink", schemeId: "s1", name: "Sinking Fund", fundType: "CAPITAL_WORKS", isActive: true },
    ],
    Lot: [10, 20, 30].map((entitlement, i) => ({ id: `l${i + 1}`, schemeId: "s1", lotNumber: String(i + 1), entitlement, interestScheduleEntitlement: interest[i] })),
    AccountCode: [
      { id: "acc-ins", schemeId: "s1", code: "5-1100", name: "Insurance", accountType: "EXPENSE", accountSubType: "INSURANCE_EXPENSE", fundId: "admin" },
      { id: "acc-mnt", schemeId: "s1", code: "5-1200", name: "Maintenance and Repairs", accountType: "EXPENSE", accountSubType: "MAINTENANCE_EXPENSE", fundId: "admin" },
      // Another building's insurance account: never read for this one.
      { id: "acc-other", schemeId: "s2", code: "5-1100", name: "Insurance", accountType: "EXPENSE", accountSubType: "INSURANCE_EXPENSE", fundId: "x" },
    ],
    Budget: [
      { id: "b-old", schemeId: "s1", fundId: "admin", financialYear: 2026, version: 1, status: "SUPERSEDED" },
      { id: "b-admin", schemeId: "s1", fundId: "admin", financialYear: 2026, version: 2, status: "ADOPTED" },
      { id: "b-sink", schemeId: "s1", fundId: "sink", financialYear: 2026, version: 1, status: "ADOPTED" },
    ],
    BudgetLine: [
      { id: "bl0", fundId: "admin", accountCodeId: "acc-ins", financialYear: 2026, budgetId: "b-old", budgetAmount: "9999.00" },
      ...(opts.insurance === null ? [] : [{ id: "bl1", fundId: "admin", accountCodeId: "acc-ins", financialYear: 2026, budgetId: "b-admin", budgetAmount: opts.insurance ?? "400.01" }]),
      { id: "bl2", fundId: "admin", accountCodeId: "acc-mnt", financialYear: 2026, budgetId: "b-admin", budgetAmount: "599.99" },
      { id: "bl3", fundId: "admin", accountCodeId: "acc-other", financialYear: 2026, budgetId: "b-admin", budgetAmount: "5000.00" },
      { id: "bl4", fundId: "sink", accountCodeId: "acc-mnt", financialYear: 2026, budgetId: "b-sink", budgetAmount: "1200.00" },
    ],
    LevySchedule: [
      {
        id: "ls1",
        schemeId: "s1",
        fundId: opts.fundId ?? "admin",
        financialYear: 2026,
        budgetAmount: opts.budgetAmount ?? "1000.00",
        frequency: "QUARTERLY",
        levyType: "ORDINARY",
        totalLots: 3,
        totalEntitlement: "60",
        status: "APPROVED",
        approvedBy: "adviser",
      },
    ],
    SchemeMembership: [{ id: "m-adv", schemeId: "s1", profileId: "adviser", role: "ADVISER", isActive: true }],
    LevyNotice: [],
  });
}

const generate = () => issueScheduleNoticesAction("s1", "ls1", {}, new FormData());
const notices = () => sharedFake.table("LevyNotice");
const cents = (v: unknown) => Math.round(Number(v) * 100);
const byLot = (field: string) => ["l1", "l2", "l3"].map((id) => notices().filter((n) => n.lotId === id).reduce((a, n) => a + cents(n[field]), 0));

beforeEach(() => {
  today.value = "2026-05-01";
});

describe("a building format plan", () => {
  it("stores each notice's insurance part: insurance by the interest schedule, the rest by the contribution schedule, exact to the cent", async () => {
    seed({ planFormat: "BUILDING" });
    const r = await generate();
    expect(r).toMatchObject({ success: true, data: { planned: 12 } });
    expect(notices()).toHaveLength(12);
    expect(byLot("amountDue")).toEqual([22_000, 32_000, 46_000]);
    expect(byLot("insuranceAmount")).toEqual([12_000, 12_000, 16_001]);
    expect(notices().reduce((a, n) => a + cents(n.amountDue), 0)).toBe(100_000);
    expect(notices().reduce((a, n) => a + cents(n.insuranceAmount), 0)).toBe(40_001);
    for (const n of notices()) expect(cents(n.insuranceAmount)).toBeLessThanOrEqual(cents(n.amountDue));
    expect(sharedFake.table("LevySchedule")[0].status).toBe("ACTIVE");
  });
});

describe("a volumetric format plan", () => {
  it("is split the same way", async () => {
    seed({ planFormat: "VOLUMETRIC" });
    expect(await generate()).toMatchObject({ success: true });
    expect(byLot("amountDue")).toEqual([22_000, 32_000, 46_000]);
    expect(byLot("insuranceAmount")).toEqual([12_000, 12_000, 16_001]);
  });
});

describe("refused, with nothing created", () => {
  const refused = async (message: RegExp | string) => {
    const r = await generate();
    expect(r.error).toEqual(typeof message === "string" ? message : expect.stringMatching(message));
    expect(r.success).toBeUndefined();
    expect(notices()).toHaveLength(0);
    expect(sharedFake.table("LevySchedule")[0].status).toBe("APPROVED");
  };

  it("a standard format plan", async () => {
    seed({ planFormat: "STANDARD" });
    await refused(/^This building is recorded as a standard format plan\. .* The contributions were not issued\.$/);
  });

  it("no plan format recorded", async () => {
    seed({ planFormat: null });
    await refused("No plan format is recorded for this building. Choose it in the building settings before contributions that include insurance are raised. The contributions were not issued.");
  });

  it("a lot without an interest schedule lot entitlement", async () => {
    seed({ interest: [30, null, 40] });
    await refused(/^Lot 2 has no interest schedule lot entitlement recorded/);
  });

  it("an administrative fund budget with no insurance line", async () => {
    seed({ insurance: null });
    await refused(/^The administrative fund budget has no insurance\./);
  });
});

describe("not split", () => {
  it("a sinking fund contribution with no insurance line, even for a standard format plan", async () => {
    seed({ fundId: "sink", planFormat: "STANDARD", budgetAmount: "1200.00" });
    expect(await generate()).toMatchObject({ success: true });
    expect(byLot("amountDue")).toEqual([20_000, 40_000, 60_000]);
    expect(notices().every((n) => !("insuranceAmount" in n))).toBe(true);
  });
});

describe("a sinking fund budget with an insurance line", () => {
  it("is refused, never shared by the interest schedule (SM s 169(2))", async () => {
    seed({ fundId: "sink", budgetAmount: "1200.00" });
    sharedFake.table("BudgetLine").push({ id: "bl5", fundId: "sink", accountCodeId: "acc-ins", financialYear: 2026, budgetId: "b-sink", budgetAmount: "100.00" });
    const r = await generate();
    expect(r.error).toBe("The sinking fund budget has an insurance line, but insurance is paid from the administrative fund. Move the insurance to the administrative fund budget, then issue the contributions.");
    expect(notices()).toHaveLength(0);
    expect(sharedFake.table("LevySchedule")[0].status).toBe("APPROVED");
  });
});

describe("the insurance in the budget", () => {
  it("is every insurance line of the latest adopted version, on this building's insurance accounts only", async () => {
    seed();
    expect(await budgetedInsuranceCents("s1", "admin", 2026)).toBe(40_001);
    expect(await budgetedInsuranceCents("s1", "sink", 2026)).toBe(0);
    expect(await budgetedInsuranceCents("s1", "admin", 2027)).toBe(0);
  });

  it("is what the schedule page previews: the same split the action stores", async () => {
    seed();
    const lots = [10, 20, 30].map((entitlement, i) => ({ lotId: `l${i + 1}`, lotNumber: String(i + 1), entitlement, ownerId: null }));
    const { split, problem } = await contributionInsurance("s1", sharedFake.table("LevySchedule")[0] as never, lots);
    expect(problem).toBeNull();
    expect(split?.shares).toEqual([
      { totalCents: 22_000, insuranceCents: 12_000 },
      { totalCents: 32_000, insuranceCents: 12_000 },
      { totalCents: 46_000, insuranceCents: 16_001 },
    ]);
  });
});

describe("the notice", () => {
  const base = {
    schemeName: "Seaview",
    planNumber: "1234",
    lotNumber: "3",
    ownerNames: ["A Owner"],
    noticeNumber: "LN-0009",
    noticeDate: "2026-05-27",
    dueDate: "2026-07-01",
    periodStart: "2026-07-01",
    periodEnd: "2026-09-30",
    fundName: "Administrative Fund",
    amountCents: 11_500,
    payment: { accountName: "BC", bsb: "000-000", accountNumber: "1", reference: "LN-0009" },
    contact: { name: "Adviser", emailOrPhone: "a@example.com" },
    ledgerUrl: "https://example.com",
    noInterest: true,
    interest: { monthlyRatePercent: null, source: PENDING_RULE_PACKS.QLD.rules.LATE_CHARGE.source },
    hardship: null,
    terms: PENDING_RULE_PACKS.QLD.rules.TERMINOLOGY,
  };

  it("states the insurance part and how each part is shared", () => {
    const blocks = levyNoticeBlocks({ ...base, insurance: { cents: 4_001, basis: "Your share of the insurance is worked out by your lot's interest schedule lot entitlement, and the rest by its contribution schedule lot entitlement." } });
    const rows = blocks.find((b) => b.kind === "keyValues") as { rows: [string, string][] };
    expect(rows.rows).toContainEqual(["Includes insurance", "$40.01"]);
    expect(rows.rows.findIndex((r) => r[0] === "Includes insurance")).toBe(rows.rows.findIndex((r) => r[0] === "Amount payable") + 1);
    expect(blocks).toContainEqual({ kind: "text", text: expect.stringContaining("interest schedule lot entitlement, and the rest by its contribution schedule lot entitlement") });
  });

  it("reads as before without an insurance part", () => {
    expect(levyNoticeBlocks({ ...base, insurance: null })).toEqual(levyNoticeBlocks(base));
    expect(JSON.stringify(levyNoticeBlocks(base))).not.toContain("insurance");
  });
});
