/**
 * NSW levy apportionment, golden (QLD go-live gap: insurance in
 * contributions, 27 Oct 2026).
 *
 * The notices a budget levy or special levy raises for an NSW building, run
 * end to end on the fake database through the generate action, and the pure
 * planner on its own. The NSW admin fund budget here has an insurance line,
 * which NSW shares by unit entitlement with everything else. The snapshots
 * were recorded against origin/main before Queensland's insurance split was
 * added, so NSW must produce exactly the same notices, journals, activity and
 * results. Never regenerate them to make a change pass: a difference is a
 * change to NSW.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const today = vi.hoisted(() => ({ value: "2026-05-01" }));
const calls = vi.hoisted(() => [] as Array<[string, unknown]>);

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
vi.mock("@/lib/queries/activity-log", () => ({
  logActivity: vi.fn(async (a: unknown) => {
    calls.push(["logActivity", a]);
  }),
  getAuditTrailForExport: vi.fn(),
  formatAuditTrailCsv: vi.fn(),
}));
vi.mock("@/lib/jurisdiction/scheme-time", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/scheme-time")>("@/lib/jurisdiction/scheme-time");
  return { ...actual, schemeToday: async () => today.value };
});
vi.mock("@/lib/levies/load-plan-lots", () => ({
  loadPlanLots: async () => [
    { lotId: "l1", lotNumber: "1", entitlement: 17, ownerId: "o1" },
    { lotId: "l2", lotNumber: "2", entitlement: 23, ownerId: "o2" },
    { lotId: "l3", lotNumber: "3", entitlement: 31, ownerId: null },
    { lotId: "l4", lotNumber: "4", entitlement: 29, ownerId: "o4" },
    { lotId: "l5", lotNumber: "5", entitlement: 7, ownerId: "o5" },
  ],
}));
vi.mock("@/lib/levies/notice-content-data", () => ({
  checkPlannedNotices: async () => [],
  sendIssuedNotices: async (i: { notices: Array<{ noticeId?: string; noticeNumber: string; dueDate: string; amountCents: number }>; onSent?: (id: string) => Promise<void> }) => {
    calls.push(["sendIssuedNotices", i.notices.map((n) => ({ noticeNumber: n.noticeNumber, dueDate: n.dueDate, amountCents: n.amountCents }))]);
    for (const n of i.notices) if (n.noticeId) await i.onSent?.(n.noticeId);
    return i.notices.length;
  },
}));
vi.mock("@/lib/finance/owner-credits", () => ({ applyOwnerCredit: async () => 0, recordCreditMovement: async () => ({ id: "credit-1" }) }));
vi.mock("@/lib/queries/account-codes", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries/account-codes")>("@/lib/queries/account-codes");
  return { ...actual, getSystemAccountBySubType: async (_s: string, sub: string, fund: string) => ({ id: `acc-${sub}-${fund}` }) };
});
vi.mock("@/lib/queries/journal-entries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries/journal-entries")>("@/lib/queries/journal-entries");
  return {
    ...actual,
    getNextEntryNumber: async () => "JE-1",
    createJournalEntry: async (e: unknown) => {
      calls.push(["createJournalEntry", e]);
      return { id: "je" };
    },
    postJournalEntry: async () => {},
  };
});
vi.mock("@/lib/queries/schemes", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries/schemes")>("@/lib/queries/schemes");
  return { ...actual, getSchemeById: async () => ({ id: "s1", financialYearEnd: "06-30", autoApplyOwnerCredit: true, totalLots: 5, totalEntitlement: 107, funds: [{ id: "admin" }, { id: "cw" }] }) };
});

const { sharedFake } = await import("@/test/fake-orm");
const { issueScheduleNoticesAction } = await import("@/app/(portal)/adviser/schemes/[id]/finance/actions");
const { planNotices } = await import("./notice-plan");

function seed(schedule: Record<string, unknown>) {
  sharedFake.reset({
    Scheme: [{ id: "s1", state: "NSW", timeZone: "Australia/Sydney", financialYearEnd: "06-30", autoApplyOwnerCredit: true, totalLots: 5, totalEntitlement: 107 }],
    Fund: [
      { id: "admin", schemeId: "s1", name: "Administrative Fund", fundType: "ADMINISTRATIVE", isActive: true },
      { id: "cw", schemeId: "s1", name: "Capital Works Fund", fundType: "CAPITAL_WORKS", isActive: true },
    ],
    Lot: [1, 2, 3, 4, 5].map((n) => ({ id: `l${n}`, schemeId: "s1", lotNumber: String(n), entitlement: [17, 23, 31, 29, 7][n - 1] })),
    AccountCode: [
      { id: "acc-ins", schemeId: "s1", code: "5-1100", name: "Insurance", accountType: "EXPENSE", accountSubType: "INSURANCE_EXPENSE", fundId: "admin" },
      { id: "acc-mnt", schemeId: "s1", code: "5-1200", name: "Maintenance and Repairs", accountType: "EXPENSE", accountSubType: "MAINTENANCE_EXPENSE", fundId: "admin" },
      { id: "acc-cw", schemeId: "s1", code: "5-2000", name: "Capital works", accountType: "EXPENSE", accountSubType: "CAPITAL_WORKS_EXPENSE", fundId: "cw" },
    ],
    Budget: [
      { id: "b-admin", schemeId: "s1", fundId: "admin", financialYear: 2026, version: 1, status: "ADOPTED" },
      { id: "b-cw", schemeId: "s1", fundId: "cw", financialYear: 2026, version: 1, status: "ADOPTED" },
    ],
    BudgetLine: [
      { id: "bl1", fundId: "admin", accountCodeId: "acc-ins", financialYear: 2026, budgetId: "b-admin", budgetAmount: "4321.09" },
      { id: "bl2", fundId: "admin", accountCodeId: "acc-mnt", financialYear: 2026, budgetId: "b-admin", budgetAmount: "8024.58" },
      { id: "bl3", fundId: "cw", accountCodeId: "acc-cw", financialYear: 2026, budgetId: "b-cw", budgetAmount: "5000.01" },
    ],
    LevySchedule: [{ id: "ls1", schemeId: "s1", totalLots: 5, totalEntitlement: "107", status: "APPROVED", approvedBy: "adviser", ...schedule }],
    SchemeMembership: [{ id: "m-adv", schemeId: "s1", profileId: "adviser", role: "ADVISER", isActive: true }],
    LevyNotice: [],
  });
  calls.length = 0;
}

const generate = (confirmLate = false) => {
  const fd = new FormData();
  if (confirmLate) fd.set("confirmLate", "on");
  return issueScheduleNoticesAction("s1", "ls1", {}, fd);
};

/** What the run left: every notice (without generated ids and times), the schedule, and the calls made. */
const outcome = (result: unknown) => ({
  result,
  notices: sharedFake
    .table("LevyNotice")
    .map((n) => Object.fromEntries(Object.entries(n).filter(([k]) => !["id", "createdAt", "updatedAt", "issuedAt", "emailedAt"].includes(k))))
    .sort((a, b) => String(a.noticeNumber).localeCompare(String(b.noticeNumber))),
  schedule: sharedFake.table("LevySchedule").map((s) => ({ status: s.status })),
  calls: [...calls],
});

beforeEach(() => {
  today.value = "2026-05-01";
});

describe("NSW budget levies (golden)", () => {
  it("a quarterly admin fund levy with an insurance line is shared by unit entitlement, all planned", async () => {
    seed({ fundId: "admin", financialYear: 2026, budgetAmount: "12345.67", frequency: "QUARTERLY", levyType: "ORDINARY" });
    expect(outcome(await generate())).toMatchSnapshot();
  });

  it("a monthly admin fund levy sent late on confirmation", async () => {
    today.value = "2026-06-10";
    seed({ fundId: "admin", financialYear: 2026, budgetAmount: "9999.99", frequency: "MONTHLY", levyType: "ORDINARY" });
    expect(outcome(await generate(true))).toMatchSnapshot();
  });

  it("a half-yearly capital works fund levy", async () => {
    seed({ fundId: "cw", financialYear: 2026, budgetAmount: "5000.01", frequency: "HALF_YEARLY", levyType: "ORDINARY" });
    expect(outcome(await generate())).toMatchSnapshot();
  });

  it("an annual admin fund levy whose earlier instalments the previous manager raised", async () => {
    seed({ fundId: "admin", financialYear: 2026, budgetAmount: "107.00", frequency: "QUARTERLY", levyType: "ORDINARY", raisedBeforeTakeover: "1,2" });
    expect(outcome(await generate())).toMatchSnapshot();
  });
});

describe("NSW special levies (golden)", () => {
  it("a special levy on the admin fund goes out now, by unit entitlement", async () => {
    seed({ fundId: "admin", financialYear: 2026, budgetAmount: "999.99", frequency: "ONE_OFF", levyType: "SPECIAL", dueDate: "2026-07-15", approvedAt: "2026-05-01T00:00:00.000Z", title: "Roof" });
    expect(outcome(await generate())).toMatchSnapshot();
  });
});

describe("NSW levy planner (golden)", () => {
  const lots = [
    { lotId: "a", lotNumber: "1", entitlement: 1, ownerId: null },
    { lotId: "b", lotNumber: "2", entitlement: 2, ownerId: "o2" },
    { lotId: "c", lotNumber: "3", entitlement: 997, ownerId: "o3" },
  ];
  it.each([
    ["MONTHLY", 100_001],
    ["QUARTERLY", 7],
    ["HALF_YEARLY", 1_234_567],
    ["ANNUALLY", 3],
    ["ONE_OFF", 50_000],
  ] as const)("%s, %i cents", (frequency, totalCents) => {
    expect(planNotices({ lots, totalCents, frequency, periodStart: "2026-07-01", firstDueDate: "2026-07-01" })).toMatchSnapshot();
  });
});
