/**
 * The finance reports are unchanged for an NSW building (golden; QLD finance
 * wording go-live, 28 Oct 2026). Recorded against
 * origin/feat/qld-two-year-reminder before the reports took their levy,
 * late charge, owners corporation and fund words from the building's rule
 * pack: the adviser and accountant reports pages, the levy register, aged
 * arrears, fund projections, cash flow, fund summary, committee pack (screen
 * and PDF), owner statement, statutory statements (screen and PDF), GST
 * summary, audit trail (screen and CSV) and the drill-down. The props marked
 * "words" were added after the snapshots were recorded.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const state = vi.hoisted(() => ({ notices: [] as unknown[], lots: [] as unknown[] }));

vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (u: string) => {
    throw new Error(`REDIRECT ${u}`);
  },
}));
vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("@/lib/queries/profiles", () => ({ getCurrentProfile: vi.fn(async () => ({ id: "adv-1" })) }));
vi.mock("@/lib/auth/require-accountant-access", () => ({ requireFinancialReadAccess: vi.fn(async () => ({ profile: { id: "acc-1" } })) }));
const SCHEME = {
  id: "s1",
  name: "Harbour View",
  planNumber: "SP 12345",
  state: "NSW",
  timeZone: "Australia/Sydney",
  financialYearEnd: "06-30",
  memberships: [{ profileId: "adv-1", role: "ADVISER" }],
};
vi.mock("@/lib/queries/schemes", async (orig) => ({ ...(await orig()), getSchemeById: vi.fn(async () => SCHEME) }));
vi.mock("@/lib/queries/levy-schedules", async (orig) => ({
  ...(await orig()),
  getIssuedLevyNoticesForScheme: vi.fn(async () => state.notices),
  getIssuedLevyNoticesForLot: vi.fn(async () => state.notices),
  getLevyPaymentsForNotices: vi.fn(async () => []),
}));
vi.mock("@/lib/queries/lots", async (orig) => ({ ...(await orig()), getLotsForScheme: vi.fn(async () => state.lots) }));
vi.mock("@/lib/finance/owner-credits", async (orig) => ({ ...(await orig()), getCreditMovements: vi.fn(async () => []) }));
vi.mock("@/components/finance/owner-credits-card", () => ({ OwnerCreditsCard: () => null }));
vi.mock("@/lib/jurisdiction/scheme-time", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/scheme-time")>("@/lib/jurisdiction/scheme-time");
  return { ...actual, schemeToday: vi.fn(async () => "2026-10-27") };
});
vi.mock("@/lib/jurisdiction/time-zone", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/time-zone")>("@/lib/jurisdiction/time-zone");
  return {
    ...actual,
    todayIn: () => "2026-10-27",
    platformToday: () => "2026-10-27",
    formatDateIn: (_tz: string, _d: unknown, _o?: unknown) => "27/10/2026",
  };
});
vi.mock("@/app/(portal)/adviser/schemes/[id]/finance/actions", () => ({ exportAuditTrailAction: vi.fn() }));

const { sharedFake } = await import("@/test/fake-orm");
const { default: AdviserReports } = await import("@/app/(portal)/adviser/schemes/[id]/finance/reports/page");
const { default: AccountantReports } = await import("@/app/(portal)/accountant/schemes/[id]/finance/reports/page");
const { default: AdviserLevyRegister } = await import("@/app/(portal)/adviser/schemes/[id]/finance/reports/levy-register/page");
const { default: AccountantLevyRegister } = await import("@/app/(portal)/accountant/schemes/[id]/finance/reports/levy-register/page");
const { default: AdviserAgedArrears } = await import("@/app/(portal)/adviser/schemes/[id]/finance/reports/aged-arrears/page");
const { default: AccountantAgedArrears } = await import("@/app/(portal)/accountant/schemes/[id]/finance/reports/aged-arrears/page");
const { default: AdviserOwnerStatement } = await import("@/app/(portal)/adviser/schemes/[id]/finance/reports/owner-statement/page");
const { FundProjectionsClient } = await import("@/app/(portal)/adviser/schemes/[id]/finance/reports/fund-projections/fund-projections-client");
const { CashFlowClient } = await import("@/app/(portal)/adviser/schemes/[id]/finance/reports/cash-flow/cash-flow-client");
const { FundSummaryClient } = await import("@/app/(portal)/adviser/schemes/[id]/finance/reports/fund-summary/fund-summary-client");
const { CommitteePackClient } = await import("@/app/(portal)/adviser/schemes/[id]/finance/reports/committee-pack/committee-pack-client");
const { OwnerStatementClient } = await import("@/app/(portal)/adviser/schemes/[id]/finance/reports/owner-statement/owner-statement-client");
const { GstSummaryClient } = await import("@/app/(portal)/adviser/schemes/[id]/finance/reports/gst-summary/gst-summary-client");
const { AuditTrailClient } = await import("@/app/(portal)/adviser/schemes/[id]/finance/reports/audit-trail/audit-trail-client");
const { ReportCellDrillDown } = await import("@/components/finance/report-cell-drill-down");
const { StatutoryPackView } = await import("@/components/finance/statutory-pack-view");
const { committeePackBlocks, statutoryPackBlocks, ownerStatementBlocks } = await import("@/lib/pdf/documents");
const { formatAuditTrailCsv } = await import("@/lib/queries/activity-log");
const { statutoryRulesFor } = await import("@/config/statutory");
const screenWords = await import("@/lib/jurisdiction/screen-words");
const NSW = statutoryRulesFor("NSW");
/* words: the NSW words, as the server pages pass them (absent before this change, when the props were ignored). */
const W = (typeof (screenWords as Record<string, unknown>).packWordsFor === "function"
  ? (screenWords as unknown as { packWordsFor: (r: typeof NSW) => Record<string, string> }).packWordsFor(NSW)
  : {}) as never;

const params = { params: Promise.resolve({ id: "s1" }) };
const NOTICES = [
  {
    id: "n1",
    lotId: "l1",
    schemeId: "s1",
    levyScheduleId: "sc1",
    noticeNumber: "LN-1",
    status: "ISSUED",
    dueDate: "2026-08-01",
    periodStart: "2026-07-01",
    periodEnd: "2026-09-30",
    amountDue: "400",
    amountPaid: "100",
    balanceOutstanding: "305",
    interestCharged: "5",
    lot: { lotNumber: "1", unitNumber: "3" },
    fund: { name: "Administrative Fund" },
    levySchedule: { id: "sc1", levyType: "ORDINARY", financialYear: 2026, title: null },
  },
  {
    id: "n2",
    lotId: "l2",
    schemeId: "s1",
    levyScheduleId: "sc2",
    noticeNumber: "LN-2",
    status: "ISSUED",
    dueDate: "2026-11-01",
    amountDue: "900",
    amountPaid: "0",
    balanceOutstanding: "900",
    interestCharged: "0",
    lot: { lotNumber: "2", unitNumber: null },
    fund: { name: "Capital Works Fund" },
    levySchedule: { id: "sc2", levyType: "SPECIAL", financialYear: 2026, title: "Roof" },
  },
];

beforeEach(() => {
  state.notices = [];
  state.lots = [];
  sharedFake.reset({ Scheme: [{ id: "s1", state: "NSW", name: "Harbour View" }] });
});

describe("NSW reports pages (golden)", () => {
  it("the adviser and accountant report lists", async () => {
    expect(renderToStaticMarkup(await AdviserReports(params))).toMatchSnapshot("adviser");
    expect(renderToStaticMarkup(await AccountantReports(params))).toMatchSnapshot("accountant");
  });

  it("the levy register, empty and with notices", async () => {
    expect(renderToStaticMarkup(await AdviserLevyRegister(params))).toMatchSnapshot("adviser, empty");
    expect(renderToStaticMarkup(await AccountantLevyRegister(params))).toMatchSnapshot("accountant, empty");
    state.notices = NOTICES;
    expect(renderToStaticMarkup(await AdviserLevyRegister(params))).toMatchSnapshot("adviser");
    expect(renderToStaticMarkup(await AccountantLevyRegister(params))).toMatchSnapshot("accountant");
  });

  it("aged arrears, empty and with arrears", async () => {
    expect(renderToStaticMarkup(await AdviserAgedArrears(params))).toMatchSnapshot("adviser, empty");
    expect(renderToStaticMarkup(await AccountantAgedArrears(params))).toMatchSnapshot("accountant, empty");
    state.notices = NOTICES;
    expect(renderToStaticMarkup(await AdviserAgedArrears(params))).toMatchSnapshot("adviser");
  });

  it("the owner statement page, with no lots and with a lot chosen", async () => {
    expect(renderToStaticMarkup(await AdviserOwnerStatement({ ...params, searchParams: Promise.resolve({}) }))).toMatchSnapshot("no lots");
    state.lots = [{ id: "l1", lotNumber: "1", unitNumber: "3", memberships: [{ role: "OWNER", profile: { firstName: "Ann", lastName: "Lee" } }] }];
    state.notices = [NOTICES[0]];
    expect(renderToStaticMarkup(await AdviserOwnerStatement({ ...params, searchParams: Promise.resolve({ lot: "l1" }) }))).toMatchSnapshot("a lot");
  });
});

describe("NSW report screens (golden)", () => {
  const catalogue = NSW.FUND_CATALOGUE;

  it("fund projections, with a fund going into deficit", () => {
    const data = {
      schemeName: "Harbour View",
      projections: [
        {
          fundId: "f2",
          fundName: "Capital Works Fund",
          fundType: "CAPITAL_WORKS",
          currentBalance: 1000,
          years: [
            { financialYear: 2026, label: "FY 2026/27", openingBalance: 1000, levyIncome: 500, expenses: 2000, netMovement: -1500, closingBalance: -500 },
          ],
        },
      ],
    };
    expect(renderToStaticMarkup(<FundProjectionsClient schemeId="s1" yearsAhead={5} data={data} catalogue={catalogue} capitalWorksPlan words={W} /* words */ />)).toMatchSnapshot();
  });

  it("the cash flow forecast, below zero", () => {
    const forecast = {
      schemeName: "Harbour View",
      startingBalance: 100,
      months: [{ month: "2026-11", label: "Nov 2026", levyIncome: 400, otherIncome: 0, supplierExpenses: 900, otherExpenses: 0, netFlow: -500, cumulativeBalance: -400 }],
      totalLevyIncome: 400,
      totalOtherIncome: 0,
      totalSupplierExpenses: 900,
      totalOtherExpenses: 0,
      totalNetFlow: -500,
      endingBalance: -400,
    };
    expect(renderToStaticMarkup(<CashFlowClient schemeId="s1" monthsAhead={6} forecast={forecast} words={W} /* words */ />)).toMatchSnapshot();
  });

  it("the fund summary", () => {
    const summaries = [
      { fundId: "f1", fundName: "Administrative Fund", fundType: "ADMINISTRATIVE", openingBalance: 0, totalIncome: 400, totalExpenses: 100, broughtForward: 0, netMovement: 300, closingBalance: 300, totalLevied: 400, totalCollected: 100, outstandingLevies: 305 },
    ];
    expect(renderToStaticMarkup(<FundSummaryClient schemeId="s1" startDate="2026-07-01" endDate="2027-06-30" summaries={summaries} catalogue={catalogue} words={W} /* words */ />)).toMatchSnapshot();
  });

  const PACK = {
    schemeName: "Harbour View",
    reportDate: "2026-10-27",
    periodLabel: "FY 2026/27",
    startDate: "2026-07-01",
    endDate: "2027-06-30",
    fundSummaries: [{ fundId: "f1", fundName: "Administrative Fund", fundType: "ADMINISTRATIVE", openingBalance: 0, totalIncome: 400, totalExpenses: 100, netMovement: 300, closingBalance: 300, totalLevied: 400, totalCollected: 100, outstandingLevies: 305 }],
    totalFundBalance: 300,
    arrearsSnapshot: { current: 0, days30: 0, days60: 0, days90: 305, days90Plus: 0, total: 305, lotCount: 1 },
    budgetComparisons: [],
    bankSummaries: [{ bankAccountName: "Operating", closingBalance: 300, unmatchedCount: 1, lastReconciledDate: null }],
    recentActivity: [
      { action: "LEVY_NOTICES_ISSUED", entityType: "LevySchedule", actorName: "Ann Lee", createdAt: "2026-10-01T00:00:00Z" },
      { action: "INTEREST_CHARGED", entityType: "LevyNotice", actorName: "Ann Lee", createdAt: "2026-10-02T00:00:00Z" },
    ],
    levyCollectionRate: 25,
    cashPosition: 300,
  };

  it("the committee pack, empty and full, and its PDF", () => {
    const html = (pack: typeof PACK) =>
      renderToStaticMarkup(
        <CommitteePackClient schemeId="s1" financialYear={2026} fyOptions={[{ value: "2026", label: "FY 2026/2027" }]} startDate="2026-07-01" endDate="2027-06-30" pack={pack} catalogue={catalogue} words={W} /* words */ />,
      );
    expect(html(PACK)).toMatchSnapshot("full");
    expect(html({ ...PACK, fundSummaries: [], totalFundBalance: 0, bankSummaries: [], recentActivity: [] })).toMatchSnapshot("empty");
    expect(committeePackBlocks(PACK as never, NSW.TERMINOLOGY)).toMatchSnapshot("PDF");
  });

  it("the owner statement screen, empty, and its PDF", () => {
    expect(
      renderToStaticMarkup(
        <OwnerStatementClient
          schemeId="s1"
          lotOptions={[{ id: "l1", label: "Lot 1" }]}
          selectedLotId="l1"
          selectedLotLabel="Lot 1"
          selectedOwnerName="Ann Lee"
          startDate=""
          endDate=""
          openingBalance={0}
          totalCharges={0}
          totalPayments={0}
          closingBalance={0}
          statementLines={[]}
          words={W} /* words */
        />,
      ),
    ).toMatchSnapshot("screen");
    expect(
      ownerStatementBlocks({
        schemeName: "Harbour View",
        planNumber: "12345",
        lotLabel: "Lot 1",
        ownerName: "Ann Lee",
        startDate: null,
        endDate: null,
        openingBalance: 0,
        lines: [{ id: "x", date: "2026-08-01", kind: "LATE_CHARGE", type: "Interest", description: "Interest on LN-1", charge: 5, payment: 0, balance: 5 }],
        totalCharges: 5,
        totalPayments: 0,
        closingBalance: -1,
        terms: NSW.TERMINOLOGY,
      } as never),
    ).toMatchSnapshot("PDF");
  });

  it("the GST summary", () => {
    const report = {
      schemeName: "Harbour View",
      abnOrGstRegistered: true,
      startDate: "2026-07-01",
      endDate: "2026-09-30",
      periodLabel: "Q1",
      g1TotalSales: 0,
      g2ExportSales: 0,
      g3OtherGstFreeSales: 0,
      g4InputTaxedSales: 0,
      g9GrossGstOnSales: 0,
      g10CapitalPurchases: 0,
      g11NonCapitalPurchases: 0,
      g14ExportPurchases: 0,
      g15PurchasesForInputTaxedSales: 0,
      g20GstOnPurchases: 0,
      netGstPayable: 0,
      incomeLines: [],
      expenseLines: [],
    };
    expect(renderToStaticMarkup(<GstSummaryClient schemeId="s1" startDate="2026-07-01" endDate="2026-09-30" quarters={[]} report={report} words={W} /* words */ />)).toMatchSnapshot();
  });

  it("the audit trail, and its CSV", () => {
    const rows = [
      { id: "r1", createdAt: "2026-10-01T00:00:00Z", actorName: "Ann Lee", actorEmail: "a@x", action: "INTEREST_CHARGED", entityType: "LevyNotice", entityId: "n1", metadata: null },
      { id: "r2", createdAt: "2026-10-02T00:00:00Z", actorName: "Ann Lee", actorEmail: "a@x", action: "LEVY_SCHEDULE_CREATED", entityType: "LevySchedule", entityId: "sc1", metadata: { amount: 4000 } },
    ];
    expect(renderToStaticMarkup(<AuditTrailClient schemeId="s1" rows={rows as never} page={1} hasMore={false} actors={[]} filters={{}} words={W} /* words */ />)).toMatchSnapshot("screen");
    expect(formatAuditTrailCsv(rows as never, "Australia/Sydney", W)).toMatchSnapshot("CSV");
  });

  it("the drill-down", () => {
    const cell = {
      account: { id: "a1", code: "4-1000", name: "Levy Income", accountType: "INCOME" },
      fund: { id: "f1", name: "Administrative Fund" },
      params: { accountId: "a1", fundId: "f1", start: "2026-07-01", end: "2027-06-30", mode: "CASH" },
      rows: [{ entryId: "j1", entryNumber: "JE-0001", date: "2026-08-02", description: "Levy payment received — notice LN-1", sourceType: "PAYMENT", sourceId: null, debitCents: 0, creditCents: 30500, amountCents: 30500, via: "LEVY_RECEIPT", notes: [] }],
      debitCents: 0,
      creditCents: 30500,
      totalCents: 30500,
    };
    const sources = new Map([["j1", { source: { kind: "LEVY_NOTICE", id: "n1", label: "Levy receipt for notices LN-1 (Lot 1)", levyScheduleId: "sc1" }, documents: [], bankTransactions: [] }]]);
    const links = { entry: (e: string) => `/j/${e}`, source: () => "/s", document: () => "/d" };
    expect(renderToStaticMarkup(<ReportCellDrillDown cell={cell as never} sources={sources as never} links={links} words={W} /* words */ />)).toMatchSnapshot("cash");
    expect(renderToStaticMarkup(<ReportCellDrillDown cell={{ ...cell, params: { ...cell.params, mode: "ACCRUAL" } } as never} sources={sources as never} links={links} words={W} /* words */ />)).toMatchSnapshot("accrual");
  });
});

describe("NSW statutory statements (golden)", () => {
  const fund = {
    fundId: "a",
    fundName: "Administrative Fund",
    fundType: "ADMINISTRATIVE",
    basis: "CASH" as const,
    keyInformation: {
      balanceCarriedForwardCents: 500_000,
      totalIncomeReceivedCents: 800_000,
      totalInterestEarnedCents: 0,
      totalContributionsPaidCents: 800_000,
      totalUnpaidContributionsCents: 200_000,
      maintenanceExpenditureCents: 300_000,
      administrationExpenditureCents: 50_000,
      balanceAtEndCents: 950_000,
      principalItemsNextPeriod: [],
    },
    income: [],
    expenditure: [],
    comparative: { incomeCents: 0, expenseCents: 0, surplusCents: 0 },
    totals: { incomeCents: 800_000, expenseCents: 350_000, surplusCents: 450_000 },
    balanceSheet: { assets: [], liabilities: [], ownersFundsCents: 950_000 },
    levyRegister: [{ lotNumber: "3", noticeNumber: "LN-3", dueDate: "2026-08-01", owedCents: 200_000, paidByYearEndCents: 0, unpaidAtYearEndCents: 200_000 }],
    arrearsByLot: [{ lotNumber: "3", unpaidCents: 200_000 }],
  };
  const pack = {
    scheme: { name: "Harbour View", planNumber: "12345", lots: 12 },
    financialYear: 2026,
    start: "2026-07-01",
    end: "2027-06-30",
    generatedAt: "2027-07-10T00:00:00Z",
    funds: [fund],
    notes: ["An audit is not required by size."],
    audit: { required: false, byLots: false, byBudget: false, annualBudgetCents: 1 },
    rules: { rulePack: "AU-NSW test", keyFinancialInformation: NSW.KEY_FINANCIAL_INFORMATION, auditThreshold: NSW.AUDIT_THRESHOLD },
    adopted: null,
  };

  it("the screen and the PDF", () => {
    expect(renderToStaticMarkup(<StatutoryPackView pack={pack as never} reportsBase="/r" words={W} /* words */ />)).toMatchSnapshot("screen");
    expect(statutoryPackBlocks(pack as never, NSW.TERMINOLOGY)).toMatchSnapshot("PDF");
  });
});
