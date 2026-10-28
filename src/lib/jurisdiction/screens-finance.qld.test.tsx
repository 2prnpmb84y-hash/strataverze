/**
 * Queensland words on the finance screens, reports, PDFs and messages (QLD
 * finance wording go-live, 28 Oct 2026). A Queensland owner or adviser sees
 * "contribution", "penalty", "body corporate" and "contribution schedule lot
 * entitlement", never "levy", "interest", "owners corporation" or "unit
 * entitlement". The NSW words are held by the *.nsw.golden tests beside this
 * file.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const state = vi.hoisted(() => ({
  schedules: [] as unknown[],
  overdue: [] as unknown[],
  journal: [] as unknown[],
  entry: null as Record<string, unknown> | null,
  notices: [] as unknown[],
  ownerSchemes: [] as unknown[],
  adviserSchemes: [] as unknown[],
  activity: [] as unknown[],
  bankAccounts: [] as unknown[],
  txns: [] as unknown[],
}));

vi.mock("next/server", () => ({ connection: async () => {} }));
// A plain image in tests.
// eslint-disable-next-line @next/next/no-img-element
vi.mock("next/image", () => ({ default: (p: { alt: string; src: string }) => <img alt={p.alt} src={p.src} /> }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/owner/levies",
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
vi.mock("@/lib/queries/profiles", async (orig) => ({ ...(await orig()), getCurrentProfile: vi.fn(async () => ({ id: "adv-1", firstName: "Ann", isPlatformAdmin: false })) }));
vi.mock("@/lib/auth/require-access", () => ({ requirePageAccess: vi.fn(async () => true) }));
vi.mock("@/lib/auth/require-membership", async (orig) => ({ ...(await orig()), requireSchemeMembership: vi.fn(async () => ({ profile: { id: "adv-1" }, roles: ["ADVISER"] })) }));
vi.mock("@/lib/owner/selected-scheme", () => ({
  getVerifiedSelectedSchemeId: vi.fn(async () => null),
  getSelectedOwnerScheme: vi.fn(async () => ({ schemeId: "q1", roles: ["COMMITTEE"], memberships: [{ role: "COMMITTEE", isTreasurer: true }] })),
}));
const SCHEME = {
  id: "q1",
  name: "Eagle Place",
  planNumber: "777",
  address: "1 Eagle St",
  suburb: "Brisbane",
  postcode: "4000",
  state: "QLD",
  timeZone: "Australia/Brisbane",
  financialYearEnd: "06-30",
  totalLots: 2,
  totalEntitlement: 100,
  autoApplyOwnerCredit: true,
  lots: [{ id: "l1", lotNumber: "1" }],
  images: [],
  funds: [
    { id: "f1", name: "Administrative Fund", fundType: "ADMINISTRATIVE" },
    { id: "f2", name: "Sinking Fund", fundType: "CAPITAL_WORKS" },
  ],
  memberships: [
    { profileId: "adv-1", role: "ADVISER" },
    { profileId: "adv-1", role: "OWNER", lotId: "l1", isTreasurer: false, lot: { lotNumber: "1", unitNumber: "3" } },
  ],
};
vi.mock("@/lib/queries/schemes", async (orig) => ({
  ...(await orig()),
  getSchemeById: vi.fn(async () => SCHEME),
  getSchemesForOwner: vi.fn(async () => state.ownerSchemes),
  getSchemesForCommittee: vi.fn(async () => []),
  getSchemesForAdviser: vi.fn(async () => state.adviserSchemes),
  getSchemeNotificationCounts: vi.fn(async () => new Map([["q1", { pendingLevies: 2, activeWorkOrders: 0, upcomingMeetings: 0 }]])),
}));
// Queensland, with the pending Queensland pack.
vi.mock("@/lib/jurisdiction/scheme-rules", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/scheme-rules")>("@/lib/jurisdiction/scheme-rules");
  const { PENDING_RULE_PACKS } = await import("@/config/statutory");
  const qld = { pack: null, rules: PENDING_RULE_PACKS.QLD.rules, label: "AU-QLD test" };
  const forState = (s: string | null | undefined) => (s === "QLD" ? qld : actual.rulesForState(s));
  return {
    ...actual,
    rulesForState: forState,
    rulesForScheme: vi.fn(async () => qld),
    messageTermsFor: vi.fn(async () => PENDING_RULE_PACKS.QLD.rules.TERMINOLOGY),
    rulesForListedStates: (states: Iterable<string | null | undefined>) => [...new Set(states)].map((s) => forState(s).rules),
    rulesForWords: (s: string | null | undefined) => forState(s).rules,
  };
});
vi.mock("@/lib/schemes/photos", () => ({ schemeThumbnails: vi.fn(async () => ({})) }));
vi.mock("@/lib/queries/funds", async (orig) => ({
  ...(await orig()),
  getFundsWithBalances: vi.fn(async () => [
    { id: "f1", name: "Administrative Fund", fundType: "ADMINISTRATIVE", balance: 1000 },
    { id: "f2", name: "Sinking Fund", fundType: "CAPITAL_WORKS", balance: 2000 },
  ]),
  getFundsForScheme: vi.fn(async () => [{ id: "f1", name: "Administrative Fund", fundType: "ADMINISTRATIVE" }]),
  getFundsForSchemes: vi.fn(async () => [{ id: "f1", schemeId: "q1", name: "Administrative Fund", fundType: "ADMINISTRATIVE", balance: 1000 }]),
}));
vi.mock("@/lib/queries/bank-accounts", async (orig) => ({ ...(await orig()), getBankAccountsForScheme: vi.fn(async () => state.bankAccounts) }));
vi.mock("@/lib/queries/bank-transactions", async (orig) => ({ ...(await orig()), getBankTransactionsForAccount: vi.fn(async () => state.txns) }));
vi.mock("@/lib/queries/account-codes", async (orig) => ({ ...(await orig()), getAccountCodesForScheme: vi.fn(async () => []) }));
vi.mock("@/lib/queries/levy-schedules", async (orig) => ({
  ...(await orig()),
  getLevySchedulesForScheme: vi.fn(async () => state.schedules),
  getOverdueLevyNotices: vi.fn(async () => state.overdue),
  getIssuedLevyNoticesForScheme: vi.fn(async () => state.notices),
  getLevyNoticesForSchemes: vi.fn(async () => state.notices),
}));
vi.mock("@/lib/queries/levies", () => ({ getLevyNoticesForLots: vi.fn(async () => state.notices) }));
vi.mock("@/lib/queries/supplier-invoices", async (orig) => ({ ...(await orig()), getSupplierInvoicesForScheme: vi.fn(async () => []), getOverdueInvoices: vi.fn(async () => []) }));
vi.mock("@/lib/queries/journal-entries", async (orig) => ({
  ...(await orig()),
  getJournalEntriesForScheme: vi.fn(async () => state.journal),
  getJournalEntryById: vi.fn(async () => state.entry),
}));
vi.mock("@/lib/finance/levy-receipt-reversal", async (orig) => ({ ...(await orig()), getLevyReceipt: vi.fn(async () => null) }));
vi.mock("@/lib/finance/bank-allocations", async (orig) => ({ ...(await orig()), getAllocationCandidates: vi.fn(async () => []), getSuspenseItems: vi.fn(async () => []) }));
vi.mock("@/lib/billing/capture", async (orig) => ({ ...(await orig()), transactionFeeTable: vi.fn(async () => null) }));
vi.mock("@/lib/finance/owner-credits", async (orig) => ({ ...(await orig()), getOwnerCredits: vi.fn(async () => []), getOwnerCreditRefunds: vi.fn(async () => []), getCreditMovements: vi.fn(async () => []) }));
vi.mock("@/components/finance/owner-credits-card", () => ({ OwnerCreditsCard: () => null }));
vi.mock("@/lib/queries/budget", async (orig) => ({ ...(await orig()), getBudgetLinesForScheme: vi.fn(async () => []), getBudgetVsActual: vi.fn(async () => null) }));
vi.mock("@/lib/finance/budgets", async (orig) => ({ ...(await orig()), getBudgets: vi.fn(async () => []) }));
vi.mock("@/lib/finance/resolutions", async (orig) => ({ ...(await orig()), resolutionMeetings: vi.fn(async () => []) }));
vi.mock("@/lib/finance/migration-batches", async (orig) => ({ ...(await orig()), listCutovers: vi.fn(async () => []) }));
vi.mock("@/lib/queries/work-orders", async (orig) => ({ ...(await orig()), getWorkOrdersForSchemes: vi.fn(async () => []) }));
vi.mock("@/lib/queries/compliance", async (orig) => ({ ...(await orig()), getComplianceForSchemes: vi.fn(async () => []) }));
vi.mock("@/lib/queries/activity-log", async (orig) => ({ ...(await orig()), getActivityForSchemes: vi.fn(async () => state.activity) }));
vi.mock("@/lib/owner/notification-feed", async (orig) => ({ ...(await orig()), ownerFeed: vi.fn((logged: unknown[]) => logged) }));
vi.mock("@/lib/documents/viewers", () => ({ hiddenDocumentIds: vi.fn(async () => new Set()) }));
vi.mock("@/lib/finance/treasurer-home-data", () => ({
  getTreasurerMonth: vi.fn(async () => ({
    month: { label: "October 2026" },
    attention: 1,
    unmatched: { count: 0, thisMonth: 0, receiptsCents: 0, paymentsCents: 0, oldestDate: null, items: [] },
    approvals: { count: 0, totalCents: 0, overdueCount: 0, items: [] },
    overdue: { count: 0, lots: 0, totalCents: 0, items: [] },
    suspense: { count: 0, netCents: 0, items: [] },
    periods: { current: null, endedOpen: [] },
  })),
}));
vi.mock("@/lib/jurisdiction/scheme-time", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/scheme-time")>("@/lib/jurisdiction/scheme-time");
  return { ...actual, schemeToday: vi.fn(async () => "2026-10-27"), schemeTimeZone: vi.fn(async () => "Australia/Brisbane") };
});
vi.mock("@/lib/jurisdiction/time-zone", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/time-zone")>("@/lib/jurisdiction/time-zone");
  return { ...actual, todayIn: () => "2026-10-27", platformToday: () => "2026-10-27" };
});
vi.mock("@/app/(portal)/adviser/schemes/[id]/finance/actions", () => ({
  excludeTransactionAction: vi.fn(),
  reconcileTransactionAction: vi.fn(),
  unmatchTransactionAction: vi.fn(),
  reverseJournalEntryAction: vi.fn(),
  postJournalEntryAction: vi.fn(),
  deleteJournalEntryAction: vi.fn(),
  createJournalEntryAction: vi.fn(),
  reallocateLevyReceiptAction: vi.fn(),
  reverseLevyReceiptAction: vi.fn(),
  exportAuditTrailAction: vi.fn(),
}));
vi.mock("@/lib/actions/reconciliation", () => ({ allocateTransactionAction: vi.fn(), clearSuspenseAction: vi.fn(), postToSuspenseAction: vi.fn(), receiptDepositAction: vi.fn() }));
vi.mock("@/lib/actions/budgets", () => ({ adoptBudgetAction: vi.fn(), proposeBudgetAction: vi.fn(), reviseBudgetAction: vi.fn() }));
vi.mock("@/app/(portal)/owner/(scheme)/finance/actions", () => ({ uploadPaymentConfirmationAction: vi.fn() }));

const { sharedFake } = await import("@/test/fake-orm");
const { PENDING_RULE_PACKS, statutoryRulesFor } = await import("@/config/statutory");
const words = await import("@/lib/jurisdiction/screen-words");
const QLD = PENDING_RULE_PACKS.QLD.rules as unknown as import("@/config/statutory").StatutoryRules;
const NSW = statutoryRulesFor("NSW");
const W = words.packWordsFor(QLD);

const { default: FinancePage } = await import("@/app/(portal)/adviser/schemes/[id]/finance/page");
const { default: FinanceLayout } = await import("@/app/(portal)/adviser/schemes/[id]/finance/layout");
const { default: LeviesPage } = await import("@/app/(portal)/adviser/schemes/[id]/finance/levies/page");
const { default: ReconciliationPage } = await import("@/app/(portal)/adviser/schemes/[id]/finance/reconciliation/page");
const { default: OwnerCreditsPage } = await import("@/app/(portal)/adviser/schemes/[id]/finance/owner-credits/page");
const { default: BudgetPage } = await import("@/app/(portal)/adviser/schemes/[id]/finance/budget/page");
const { default: CutoverPage } = await import("@/app/(portal)/adviser/schemes/[id]/finance/migration/cutover/page");
const { default: JournalPage } = await import("@/app/(portal)/adviser/schemes/[id]/finance/journal/page");
const { default: JournalEntryPage } = await import("@/app/(portal)/adviser/schemes/[id]/finance/journal/[entryId]/page");
const { default: ReportsPage } = await import("@/app/(portal)/adviser/schemes/[id]/finance/reports/page");
const { default: AccountantReportsPage } = await import("@/app/(portal)/accountant/schemes/[id]/finance/reports/page");
const { default: LevyRegisterPage } = await import("@/app/(portal)/adviser/schemes/[id]/finance/reports/levy-register/page");
const { default: AgedArrearsPage } = await import("@/app/(portal)/adviser/schemes/[id]/finance/reports/aged-arrears/page");
const { FundProjectionsClient } = await import("@/app/(portal)/adviser/schemes/[id]/finance/reports/fund-projections/fund-projections-client");
const { CashFlowClient } = await import("@/app/(portal)/adviser/schemes/[id]/finance/reports/cash-flow/cash-flow-client");
const { FundSummaryClient } = await import("@/app/(portal)/adviser/schemes/[id]/finance/reports/fund-summary/fund-summary-client");
const { GstSummaryClient } = await import("@/app/(portal)/adviser/schemes/[id]/finance/reports/gst-summary/gst-summary-client");
const { AuditTrailClient } = await import("@/app/(portal)/adviser/schemes/[id]/finance/reports/audit-trail/audit-trail-client");
const { ReportCellDrillDown } = await import("@/components/finance/report-cell-drill-down");
const { LotFinancials } = await import("@/app/(portal)/adviser/schemes/[id]/lots/[lotId]/lot-financials");
const { LeviesCard } = await import("@/app/(portal)/adviser/schemes/[id]/_sections/levies-card");
const { ActivityTimeline } = await import("@/components/activity-timeline");
const { default: OwnerFinancePage } = await import("@/app/(portal)/owner/(scheme)/finance/page");
const { default: TreasurerPage } = await import("@/app/(portal)/owner/(scheme)/finance/treasurer/page");
const { default: PaymentPage } = await import("@/app/(portal)/owner/(scheme)/finance/payment/page");
const { default: NotificationsPage } = await import("@/app/(portal)/owner/(scheme)/notifications/page");
const { default: OwnerHome } = await import("@/app/(portal)/owner/page");
const { default: AdviserSchemesPage } = await import("@/app/(portal)/adviser/schemes/page");
const { default: ReportingPage } = await import("@/app/(portal)/adviser/reporting/page");
const { PortalShell } = await import("@/components/portal-shell");
const { ownerLevyNavLabel } = await import("@/lib/owner/levy-nav");
const { IssuedByStrataVerze } = await import("@/components/vault/issued-by-strataverze");
const { DocumentUploadModal } = await import("@/components/documents/document-upload-modal");
const { committeePackBlocks, statutoryPackBlocks } = await import("@/lib/pdf/documents");
const { cutoverLabels, controlTieOuts, cutoverReadiness, parseArrearsRow } = await import("@/lib/finance/migration-cutover");
const { fieldsFor, missingFields } = await import("@/lib/finance/migration-templates");
const { checkIncomeBudget, onboardingYears } = await import("@/lib/onboarding/income-budget");
const { validateLevyNoticeContent } = await import("@/lib/finance/levy-notice-content");
const { noticeFundWords } = await import("@/lib/levies/notice-content-data");
const { parseIncomeStatement } = await import("@/lib/onboarding/read-income-statement");
const { modeLabel } = await import("@/lib/finance/drill-down");
const { formatActionLabel, formatEntityTypeLabel } = await import("@/lib/queries/activity-log-utils");
const { financialTitle } = await import("@/lib/vault/sources");
const { levyRegister } = await import("@/lib/levies/levy-ledger");
const { reversalProblem } = await import("@/lib/finance/levy-reversal");
const { checkPlan } = await import("@/lib/levies/notice-plan");
const { emailLayout } = await import("@/lib/email-templates/layout");
const { html } = await import("@/lib/email-templates/html");
const { levyScheduleActivationProblem } = await import("@/lib/finance/budget-status");
const { validateCanOpenBallot } = await import("@/lib/meetings/evoting");

/** Visible text only: attributes (links to /finance/levies, field names) are not words people read. */
const visible = (markup: string) => markup.replace(/\s(href|action|id|name|for|value|class|htmlFor|data-[\w-]+)="[^"]*"/g, "");
/** The NSW words a Queensland building must never show ("interest schedule" is a Queensland schedule). */
const NSW_WORDS = /\b(levy|levies|owners corporations?|strata committee|unit entitlement)\b|\binterest\b(?! schedule)|\bOC\b/i;
function expectQueensland(markup: string, ...present: string[]) {
  const text = visible(markup);
  expect(text.match(NSW_WORDS)?.[0] ?? null, text.slice(Math.max(0, (text.search(NSW_WORDS) ?? 0) - 120), (text.search(NSW_WORDS) ?? 0) + 80)).toBeNull();
  for (const p of present) expect(text).toContain(p);
}

const params = <T extends Record<string, string>>(extra: T = {} as T) => ({ params: Promise.resolve({ id: "q1", ...extra }) });
const NOTICE = {
  id: "n1",
  lotId: "l1",
  schemeId: "q1",
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
};
const SCHEDULES = [
  { id: "sc1", levyType: "ORDINARY", status: "ACTIVE", financialYear: 2026, frequency: "QUARTERLY", budgetAmount: "4000", title: null, fund: { name: "Administrative Fund" }, levyNotices: [NOTICE] },
  { id: "sc2", levyType: "SPECIAL", status: "APPROVED", financialYear: 2026, frequency: "ONE_OFF", budgetAmount: "900", title: "Roof", fund: { name: "Sinking Fund" }, levyNotices: [] },
  { id: "sc3", levyType: "BROUGHT_FORWARD", status: "MIGRATED", financialYear: 2026, frequency: "ONE_OFF", budgetAmount: "300", title: null, fund: { name: "Administrative Fund" }, levyNotices: [] },
];
const ENTRY = {
  id: "j1",
  schemeId: "q1",
  entryNumber: "JE-0001",
  description: "Penalty charged on overdue contribution, notice LN-1",
  transactionDate: "2026-10-01",
  entryType: "INTEREST",
  status: "POSTED",
  sourceType: "INTEREST",
  sourceId: "n1",
  lines: [{ id: "x1", debit: "5", credit: null, description: "Penalty", accountCode: { code: "1-1100", name: "Contributions Receivable" } }],
};

beforeEach(() => {
  state.schedules = [];
  state.overdue = [];
  state.journal = [];
  state.entry = null;
  state.notices = [];
  state.ownerSchemes = [SCHEME];
  state.adviserSchemes = [];
  state.activity = [];
  state.bankAccounts = [];
  state.txns = [];
  sharedFake.reset({
    Scheme: [{ id: "q1", state: "QLD", name: "Eagle Place" }],
    SchemeMembership: [{ id: "m1", profileId: "adv-1", schemeId: "q1", role: "OWNER", isActive: true }],
    LevyNotice: [{ id: "n1", schemeId: "q1", noticeNumber: "LN-1", levyScheduleId: "sc1", lotId: "l1", status: "ISSUED", dueDate: "2026-08-01", balanceOutstanding: "305" }],
  });
});

describe("the pack's words", () => {
  it("Queensland's", () => {
    expect(W).toMatchObject({
      levy: "contribution",
      Levies: "Contributions",
      LateCharge: "Penalty",
      ownersCorporation: "body corporate",
      OwnersCorporationTitle: "Body Corporate",
      OC: "BC",
      ownersCorporations: "bodies corporate",
      OwnersCorporationsTitle: "Bodies Corporate",
      committee: "committee",
      EntitlementTitle: "Contribution Schedule Lot Entitlement",
      OwnerContributions: "Contributions",
      jurisdiction: "Qld",
    });
    expect(words.entryTypeLabel("INTEREST", W)).toBe("PENALTY");
    expect(words.leviesAndContributions(W.levies)).toBe("Contributions");
    expect(words.lotFormEntitlementWords(QLD).label).toBe("Contribution Schedule Lot Entitlement");
  });

  it("NSW's are those the screens always showed", () => {
    const n = words.packWordsFor(NSW);
    expect(n).toMatchObject({ Levy: "Levy", Levies: "Levies", LateCharge: "Interest", OC: "OC", OwnersCorporationsTitle: "Owners Corporations", EntitlementTitle: "Unit Entitlement", OwnerContributions: "Levy contributions", jurisdiction: "NSW" });
    expect(words.entryTypeLabel("INTEREST", n)).toBe("INTEREST");
    expect(words.leviesAndContributions(n.levies)).toBe("Levies and contributions");
  });

  it("an owner or adviser with buildings in both states sees words for both", () => {
    const both = words.sharedPackWords([NSW, QLD], NSW);
    expect(both).toMatchObject({
      levy: "levy or contribution",
      Levies: "Levies and Contributions",
      lateCharge: "late payment charge",
      LateCharge: "Late payment charge",
      LateChargeTitle: "Late Payment Charge",
      OwnerContributions: "Levies and contributions",
      OwnersCorporationsTitle: "Owners Corporations and Bodies Corporate",
    });
    expect(words.sharedPackWords([QLD, QLD], NSW)).toEqual(W);
  });
});

describe("Queensland finance screens", () => {
  it("the overview, its tabs and the levies list", async () => {
    expectQueensland(renderToStaticMarkup(await FinancePage(params())), "Create the default Qld strata account codes", "Create contribution schedule", "Contribution Schedules", "Penalty");
    state.schedules = SCHEDULES;
    state.overdue = [NOTICE];
    state.journal = [{ ...ENTRY, lines: [{ debit: "5" }] }];
    expectQueensland(renderToStaticMarkup(await FinancePage(params())), "Overdue Contributions", "charge penalty", "PENALTY", "Special contribution: Roof", "FY 2026 budget contribution");
    expectQueensland(renderToStaticMarkup(await FinanceLayout({ children: <div />, params: Promise.resolve({ id: "q1" }) })), ">Contributions<", ">Penalty<");
    expectQueensland(renderToStaticMarkup(await LeviesPage(params())), "Raise Special Contribution", "Create Contribution Schedule", "Contributions brought forward");
    state.schedules = [];
    expectQueensland(renderToStaticMarkup(await LeviesPage(params())), "No contribution schedules");
  });

  it("reconciliation, owner credits, budget and cutover", async () => {
    expectQueensland(renderToStaticMarkup(await ReconciliationPage({ ...params(), searchParams: Promise.resolve({}) })), "several contribution notices");
    state.bankAccounts = [{ id: "b1", accountName: "Operating", bsb: "064-000", accountNumber: "1234" }];
    state.txns = [{ id: "t1", transactionDate: "2026-10-02", amount: "305", description: "Deposit lot 1", reference: "LN-1", reconciliationStatus: "UNMATCHED", isDuplicate: false }];
    expectQueensland(renderToStaticMarkup(await ReconciliationPage({ ...params(), searchParams: Promise.resolve({ account: "b1" }) })), "Split a deposit across contribution notices");
    expectQueensland(renderToStaticMarkup(await OwnerCreditsPage(params())), "a contribution notice owed", "next contribution notice");
    expectQueensland(renderToStaticMarkup(await BudgetPage({ ...params(), searchParams: Promise.resolve({ year: "2026" }) })), "Budget contributions can only be issued", "Quarterly Contribution");
    expectQueensland(renderToStaticMarkup(await CutoverPage({ ...params(), searchParams: Promise.resolve({}) })));
  });

  it("the journal", async () => {
    state.journal = [ENTRY];
    expectQueensland(renderToStaticMarkup(await JournalPage(params())), "PENALTY");
    state.entry = ENTRY;
    expectQueensland(renderToStaticMarkup(await JournalEntryPage(params({ entryId: "j1" }))), "Contribution notice LN-1", "PENALTY");
  });

  it("the lot financials, levies card and activity", () => {
    expectQueensland(
      renderToStaticMarkup(
        <LotFinancials
          timeZone="Australia/Brisbane"
          financials={{ opening: 10, annual: 400, special: 0, paid: 100, closing: 315, interest: 5 }}
          levyHistory={[{ id: "n1", levyTitle: "Administrative Fund contribution (LN-1)", levyType: "ORDINARY", dueDate: "2026-09-01", amount: 405, paidAmount: 100, status: "OVERDUE", paidAt: null }]}
          words={W}
        />,
      ),
      "+Contributions",
      "+Penalty charged",
      "Contribution History",
    );
    expectQueensland(renderToStaticMarkup(<LeviesCard id="q1" schedules={SCHEDULES as never} today="2026-10-27" words={W} />), "Raise Special Contribution", "3 contributions on record.");
    const actor = { firstName: "Ann", lastName: "Lee", email: "a@x" };
    const activities = ["LEVY_CREATED", "LEVY_ISSUED", "LEVIES_GENERATED", "LEVY_PAYMENT_RECORDED"].map((action, i) => ({ id: `a${i}`, action, entityType: "LevySchedule", entityId: null, metadata: action === "LEVIES_GENERATED" ? { count: 4 } : null, createdAt: "2026-01-01T00:00:00Z", actor }));
    expectQueensland(renderToStaticMarkup(<ActivityTimeline activities={activities} words={W} />), "created a contribution", "generated contributions", "4 contributions", "recorded a contribution payment");
  });
});

describe("Queensland reports and PDFs", () => {
  it("the report lists, the register and aged arrears", async () => {
    expectQueensland(renderToStaticMarkup(await ReportsPage(params())), "Contribution Register", "Helps plan sinking fund funding");
    expectQueensland(renderToStaticMarkup(await AccountantReportsPage(params())), "contributions raised, payments received, penalty charged");
    expectQueensland(renderToStaticMarkup(await LevyRegisterPage(params())), "No contributions raised", "Go to Contributions");
    state.notices = [NOTICE];
    expectQueensland(renderToStaticMarkup(await LevyRegisterPage(params())), "FY 2026 budget contribution, Administrative Fund", "Contribution Total", "Budget contribution");
    state.notices = [];
    expectQueensland(renderToStaticMarkup(await AgedArrearsPage(params())), "All contributions are fully paid");
  });

  it("the report screens", () => {
    const catalogue = QLD.FUND_CATALOGUE;
    const projections = { schemeName: "Eagle Place", projections: [{ fundId: "f2", fundName: "Sinking Fund", fundType: "CAPITAL_WORKS", currentBalance: 1000, years: [{ financialYear: 2026, label: "FY 2026/27", openingBalance: 1000, levyIncome: 500, expenses: 2000, netMovement: -1500, closingBalance: -500 }] }] };
    expectQueensland(renderToStaticMarkup(<FundProjectionsClient schemeId="q1" yearsAhead={5} data={projections} catalogue={catalogue} capitalWorksPlan={false} words={W} />), "Annual Contribution Income", "reviewing the contribution schedule");
    const forecast = { schemeName: "Eagle Place", startingBalance: 100, months: [{ month: "2026-11", label: "Nov 2026", levyIncome: 400, otherIncome: 0, supplierExpenses: 900, otherExpenses: 0, netFlow: -500, cumulativeBalance: -400 }], totalLevyIncome: 400, totalOtherIncome: 0, totalSupplierExpenses: 900, totalOtherExpenses: 0, totalNetFlow: -500, endingBalance: -400 };
    expectQueensland(renderToStaticMarkup(<CashFlowClient schemeId="q1" monthsAhead={6} forecast={forecast} words={W} />), "Contribution Income", "Overdue contributions are assumed collected");
    const summaries = [{ fundId: "f1", fundName: "Administrative Fund", fundType: "ADMINISTRATIVE", openingBalance: 0, totalIncome: 400, totalExpenses: 100, broughtForward: 0, netMovement: 300, closingBalance: 300, totalLevied: 400, totalCollected: 100, outstandingLevies: 305 }];
    expectQueensland(renderToStaticMarkup(<FundSummaryClient schemeId="q1" startDate="2026-07-01" endDate="2027-06-30" summaries={summaries} catalogue={catalogue} words={W} />), "Arrears (contributions and penalty)", "Contribution Collection");
    const report = { schemeName: "Eagle Place", abnOrGstRegistered: true, startDate: "2026-07-01", endDate: "2026-09-30", periodLabel: "Q1", g1TotalSales: 0, g2ExportSales: 0, g3OtherGstFreeSales: 0, g4InputTaxedSales: 0, g9GrossGstOnSales: 0, g10CapitalPurchases: 0, g11NonCapitalPurchases: 0, g14ExportPurchases: 0, g15PurchasesForInputTaxedSales: 0, g20GstOnPurchases: 0, netGstPayable: 0, incomeLines: [], expenseLines: [] };
    expectQueensland(renderToStaticMarkup(<GstSummaryClient schemeId="q1" startDate="2026-07-01" endDate="2026-09-30" quarters={[]} report={report} words={W} />), "Contributions from owners are generally not subject to GST", "if the BC is registered");
    const rows = [{ id: "r1", createdAt: "2026-10-01T00:00:00Z", actorName: "Ann Lee", actorEmail: "a@x", action: "INTEREST_CHARGED", entityType: "LevyNotice", entityId: "n1", metadata: null }];
    expectQueensland(renderToStaticMarkup(<AuditTrailClient schemeId="q1" rows={rows as never} page={1} hasMore={false} actors={[]} filters={{}} words={W} />), "Penalty Charged", "Contribution Notice", "Contribution Schedule");
    const cell = {
      account: { id: "a1", code: "4-1000", name: "Contribution Income", accountType: "INCOME" },
      fund: { id: "f1", name: "Administrative Fund" },
      params: { accountId: "a1", fundId: "f1", start: "2026-07-01", end: "2027-06-30", mode: "CASH" },
      rows: [{ entryId: "j1", entryNumber: "JE-0001", date: "2026-08-02", description: "Contribution payment received, notice LN-1", sourceType: "PAYMENT", sourceId: null, debitCents: 0, creditCents: 30500, amountCents: 30500, via: "LEVY_RECEIPT", notes: [] }],
      debitCents: 0,
      creditCents: 30500,
      totalCents: 30500,
    };
    expectQueensland(renderToStaticMarkup(<ReportCellDrillDown cell={cell as never} sources={new Map()} links={{ document: () => "/d" }} words={W} />), "Cash basis: contribution income when received", "Contribution received");
  });

  it("the committee pack and statutory statements PDFs", () => {
    const pack = {
      schemeName: "Eagle Place",
      startDate: "2026-07-01",
      endDate: "2027-06-30",
      totalFundBalance: 300,
      cashPosition: 300,
      levyCollectionRate: 25,
      fundSummaries: [{ fundName: "Administrative Fund", openingBalance: 0, totalIncome: 400, totalExpenses: 100, closingBalance: 300, outstandingLevies: 305 }],
      arrearsSnapshot: { current: 0, days30: 0, days60: 0, days90: 305, days90Plus: 0, total: 305, lotCount: 1 },
      budgetComparisons: [],
      bankSummaries: [],
    };
    expectQueensland(JSON.stringify(committeePackBlocks(pack as never, QLD.TERMINOLOGY)), "Contribution collection rate", "Contributions owing", "Contribution arrears");
    const statutory = { start: "2026-07-01", end: "2027-06-30", adopted: null, notes: [], funds: [], rules: { keyFinancialInformation: { rows: [] } } };
    expect(JSON.stringify(statutoryPackBlocks({ ...statutory, funds: [{ fundName: "Administrative Fund", basis: "CASH", keyInformation: { principalItemsNextPeriod: [] }, income: [], expenditure: [], comparative: {}, totals: {}, balanceSheet: { assets: [], liabilities: [] }, arrearsByLot: [], levyRegister: [] }] } as never, QLD.TERMINOLOGY))).toContain("Contribution register");
  });
});

describe("Queensland owner screens and lists", () => {
  it("the owner finance, treasurer, payment and notifications pages", async () => {
    state.notices = [NOTICE, { ...NOTICE, id: "n2", noticeNumber: "LN-2", amountPaid: "400", balanceOutstanding: "0", interestCharged: "0" }];
    expectQueensland(renderToStaticMarkup(await OwnerFinancePage()), "Your contributions and fund balances.", "Outstanding Contributions", "Paid Contributions", "Penalty charged", "Penalty Charged", "Administrative Fund contribution");
    state.notices = [];
    expectQueensland(renderToStaticMarkup(await OwnerFinancePage()), "No contributions yet");
    expectQueensland(renderToStaticMarkup(await TreasurerPage()), "Overdue contributions", "No contributions are overdue.");
    state.notices = [NOTICE];
    expectQueensland(renderToStaticMarkup(await PaymentPage()), "proof of payment for your contributions", "Contribution Notice (optional)", "e.g. Contribution Q1 2026 Lot 5");
    state.activity = ["LEVY_CREATED", "LEVY_ISSUED", "LEVIES_GENERATED", "LEVY_NOTICES_ISSUED"].map((action, i) => ({ id: `a${i}`, schemeId: "q1", action, entityType: "LevySchedule", entityId: null, metadata: null, createdAt: "2026-10-01T00:00:00Z", showActor: false, actor: { firstName: "Ann", lastName: "Lee", email: "a@x" } }));
    expectQueensland(renderToStaticMarkup(await NotificationsPage()), "New contribution created", "Contribution notice issued", "Contributions generated");
  });

  it("an owner with lots in both states sees words that read naturally", async () => {
    const nswScheme = { ...SCHEME, id: "s1", name: "Harbour View", state: "NSW", timeZone: "Australia/Sydney" };
    state.ownerSchemes = [SCHEME, nswScheme];
    state.notices = [NOTICE];
    const finance = visible(renderToStaticMarkup(await OwnerFinancePage()));
    expect(finance).toContain("Your levies and contributions and fund balances.");
    expect(finance).toContain("Late Payment Charges");
    expect(finance).not.toMatch(/Charge Charged|contributions or contributions/);
    const payment = visible(renderToStaticMarkup(await PaymentPage()));
    expect(payment).toContain("Notice (optional)");
    expect(payment).toContain("Select a notice...");
    expect(payment).toContain("e.g. Q1 2026 Lot 5");
    expect(payment).not.toMatch(/Levy or Contribution/);
  });

  it("the owner home, the schemes list, reporting and the portal navigation", async () => {
    expectQueensland(renderToStaticMarkup(await OwnerHome()), "2 contributions");
    state.adviserSchemes = [{ ...SCHEME, memberships: [], lots: [] }];
    expectQueensland(renderToStaticMarkup(await AdviserSchemesPage({ searchParams: Promise.resolve({}) })), "Manage the Bodies Corporate you advise.");
    expectQueensland(renderToStaticMarkup(await ReportingPage()), "Contribution collection across all schemes.");
    const label = await ownerLevyNavLabel("adv-1");
    expect(label).toBe("Contributions & Finance");
    expectQueensland(renderToStaticMarkup(<PortalShell user={{ id: "u1", email: "a@x" } as never} availablePortals={["owner"]} leviesNavLabel={label}><div /></PortalShell>), "Contributions &amp; Finance");
  });

  it("the vault card and the document library", () => {
    expectQueensland(renderToStaticMarkup(<IssuedByStrataVerze schemeId="q1" records={[{ id: "r1", title: "Contribution notice LN 1 Lot 1", recordType: "LEVY_NOTICE", createdAt: "2026-10-01T00:00:00Z", label: null }]} timeZone="Australia/Brisbane" levy={W.levy} />), "Contribution notice");
    expectQueensland(renderToStaticMarkup(<IssuedByStrataVerze schemeId="q1" records={[]} timeZone="Australia/Brisbane" levy={W.levy} />), "Contribution notices, remittance advices");
    expectQueensland(renderToStaticMarkup(<DocumentUploadModal open onClose={() => {}} onFilesReady={() => {}} schemePlanNumber="777" levy={W.levy} />));
    expect(financialTitle("LEVY_NOTICE", "Contribution-notice-LN-1-Lot-1.pdf", W.levy)).toBe("Contribution notice LN 1 Lot 1");
  });
});

describe("Queensland messages", () => {
  const t = QLD.TERMINOLOGY;

  it("the cutover's files, fields, errors, controls and problems", () => {
    expectQueensland(JSON.stringify(cutoverLabels(t)), "Outstanding contribution notices");
    expectQueensland(JSON.stringify(fieldsFor("levy_arrears", t).map((f) => f.label)), "Contribution outstanding", "Penalty charged to date", "Penalty paid");
    expectQueensland(JSON.stringify(missingFields({}, "levy_arrears", t)), "Contribution outstanding");
    const funds = [{ id: "f1", name: "Administrative Fund", fundType: "ADMINISTRATIVE" }];
    const lookups = { accounts: [], funds, lots: [{ id: "l1", lotNumber: "1" }], suppliers: [], bankAccounts: [], terms: t };
    expectQueensland(JSON.stringify(parseArrearsRow({ lotNumber: "1", dueDate: "01/08/2026", levyOutstanding: "x", interestCharged: "1", interestPaid: "2" }, 2, lookups, "2026-06-30").errors), "Contribution outstanding", "Penalty paid is more than the penalty charged.");
    const arrears = parseArrearsRow({ lotNumber: "1", dueDate: "01/08/2026", levyOutstanding: "10" }, 2, lookups, "2026-06-30");
    expectQueensland(JSON.stringify(controlTieOuts({ levy_arrears: [arrears] } as never, funds, t).map((c) => c.control)), "Contributions receivable, Administrative Fund");
    expectQueensland(JSON.stringify(cutoverReadiness({ files: [{ dataType: "levy_arrears", fileName: "a", sha256: "x", rowCount: 1, errorCount: 1 }], rows: {}, funds, cutoverDate: "2026-06-30", terms: t }).problems), "Outstanding contribution notices: 1 row has errors.");
  });

  it("the onboarding checks and the income statement reader", () => {
    const ctx = { takeoverDate: "2026-06-30", years: onboardingYears("2026-06-30", "06-30"), funds: [], words: { levy: t.levy, levies: t.levies } };
    expectQueensland(JSON.stringify(checkIncomeBudget({ funds: [], adoption: { kind: "draft", meetingDate: "" }, levies: { frequency: "", raisedBeforeTakeover: "" } }, ctx).problems), "raised the contributions for", "Choose how often contributions are raised.");
    const line = (...cells: string[]) => ({ page: 1, y: 0, cells: cells.map((text, i) => ({ x: i * 100, text })), text: cells.join("   ") });
    const s = parseIncomeStatement([line("Income and Expenditure Statement", "Special Fund"), line("Income"), line("Total Income", "0.00", "0.00")], { admin: "administrative", capitalWorks: "sinking fund" });
    expect(s.issues).toContain('"Special Fund" is not recognised as the administrative or sinking fund.');
  });

  it("the notice content check", () => {
    const empty = {
      scheme: { name: null, planNumber: null },
      lotNumber: null,
      ownerNames: [],
      noticeDate: "2026-10-01",
      dueDate: "2026-11-15",
      fundName: null,
      amountCents: 0,
      payment: { accountName: null, bsb: null, accountNumber: null, reference: null },
      contact: { name: null, emailOrPhone: null },
      includesInterestWarning: false,
      includesHardshipStatement: false,
      includesLedgerAccess: false,
    };
    expect(noticeFundWords(QLD)).toEqual({ admin: "administrative fund", capitalWorks: "sinking fund" });
    expect(noticeFundWords(NSW)).toEqual({ admin: "administrative", capitalWorks: "capital works" });
    const messages = validateLevyNoticeContent(empty, QLD.NOTICE_RULES, t, noticeFundWords(QLD)).map((m) => m.message);
    expect(messages).toEqual(expect.arrayContaining(["The community titles scheme number.", "The fund the contribution is for (administrative fund or sinking fund).", "How the owner can check their contribution ledger.", "A warning that penalty is charged on overdue amounts."]));
    expectQueensland(JSON.stringify(messages.filter((m) => !m.includes("strata roll"))));
  });

  it("the drill-down, audit, register, reversal, plan, budget, ballot and email words", () => {
    expectQueensland([modeLabel("CASH", t), modeLabel("ACCRUAL", t)].join(" "), "contribution income", "contributions when raised");
    expectQueensland(["INTEREST_CHARGED", "LEVY_NOTICE_ISSUED", "LEVIES_GENERATED"].map((a) => formatActionLabel(a, W)).join(" "), "Penalty Charged", "Contribution Notice Issued", "Contributions Generated");
    // The capital works fund by the pack's label: the sinking fund.
    const audit = words.auditLabelWords(QLD);
    expect(["CAPITAL_WORKS_LEVY_GENERATED", "CAPITAL_WORKS_FUND_UPDATED", "CAPITAL_WORKS_PLAN_CREATED"].map((a) => formatActionLabel(a, audit))).toEqual(["Sinking Fund Contribution Generated", "Sinking Fund Updated", "Sinking Fund Plan Created"]);
    expect(["CAPITAL_WORKS_LEVY_GENERATED", "CAPITAL_WORKS_FUND_UPDATED"].map((a) => formatActionLabel(a, words.auditLabelWords(NSW)))).toEqual(["Capital Works Levy Generated", "Capital Works Fund Updated"]);
    expect(words.schemesLabel(QLD.TERMINOLOGY)).toBe("Qld community titles schemes");
    expect(words.schemesLabel(NSW.TERMINOLOGY)).toBe("NSW strata schemes");
    expectQueensland(["Levy", "LevyNotice"].map((e) => formatEntityTypeLabel(e, W)).join(" "), "Contribution Notice");
    const base = { lotId: "l1", schemeId: "q1", fundId: "f1", status: "ISSUED", dueDate: "2026-08-01", amountDue: "1", amountPaid: "0", balanceOutstanding: "1", interestCharged: "0", fund: { name: "Administrative Fund" } };
    const groups = levyRegister([{ ...base, id: "n1", noticeNumber: "LN-1", levyScheduleId: "sc1", levySchedule: { levyType: "SPECIAL", title: "Roof" } }] as never, "2026-10-27", t);
    expect(groups[0].title).toBe("Special contribution: Roof");
    const check = { entryStatus: "POSTED", sourceType: "INVOICE", payments: [], credits: [], bankTransactions: [], reason: "ENTERED_IN_ERROR" as const, levy: t.levy };
    expect(reversalProblem(check)).toBe("This entry is not a contribution receipt.");
    expect(reversalProblem({ ...check, sourceType: "PAYMENT" })).toBe("No contribution payments are linked to this entry, so it cannot be reversed as a receipt.");
    const lots = [{ lotId: "a", lotNumber: "1", entitlement: 10, ownerId: null }];
    expectQueensland(checkPlan({ lots, totalEntitlement: 20, totalCents: 0, words: words.levyFormWords(QLD) }).map((i) => i.message).join(" "), "The contribution amount", "contribution schedule lot entitlement");
    expect(levyScheduleActivationProblem({ levyType: "ORDINARY", financialYear: 2026, fundName: "Administrative Fund", budgets: [], levies: t.levies })).toMatch(/before issuing these contributions\.$/);
    expect(validateCanOpenBallot({ adopted: false, meetingStatus: "DRAFT", ownersCorporation: t.ownersCorporation })).toBe("The body corporate (or committee) has not resolved to adopt pre-meeting electronic voting.");
    expect(emailLayout(html`<p>Hi</p>`, { ownersCorporation: t.ownersCorporation })).toContain("a member of a Body Corporate on StrataVerze.");
  });
});
