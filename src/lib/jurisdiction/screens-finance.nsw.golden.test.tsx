/**
 * The adviser's finance screens are unchanged for an NSW building (golden;
 * QLD finance wording go-live, 28 Oct 2026). Recorded against
 * origin/feat/qld-two-year-reminder before these screens took their levy,
 * late charge, owners corporation and entitlement words from the building's
 * rule pack: the finance overview and its tabs, the levies list, the
 * reconciliation page and workbench, owner credits, the budget screens, the
 * cutover, the data migration page, the journal pages, the finance documents
 * pages, the periods form, the lot financials, the building page's levies
 * card, the activity timeline and the delete button. The props marked
 * "words" were added after the snapshots were recorded.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const state = vi.hoisted(() => ({
  accountCodes: [] as unknown[],
  schedules: [] as unknown[],
  overdue: [] as unknown[],
  journal: [] as unknown[],
  bankAccounts: [] as unknown[],
  txns: [] as unknown[],
  credits: [] as unknown[],
  entry: null as Record<string, unknown> | null,
  receipt: null as unknown,
  doc: null as Record<string, unknown> | null,
  docs: [] as unknown[],
  activities: [] as unknown[],
}));

vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/adviser/schemes/s1/finance/levies",
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
vi.mock("@/lib/auth/require-access", () => ({ requirePageAccess: vi.fn(async () => true) }));
vi.mock("@/lib/auth/require-membership", async (orig) => ({ ...(await orig()), requireSchemeMembership: vi.fn(async () => ({ profile: { id: "adv-1" }, roles: ["ADVISER"] })) }));
const SCHEME = {
  id: "s1",
  name: "Harbour View",
  planNumber: "SP 12345",
  state: "NSW",
  timeZone: "Australia/Sydney",
  financialYearEnd: "06-30",
  totalLots: 2,
  totalEntitlement: 100,
  autoApplyOwnerCredit: true,
  lots: [{ id: "l1", lotNumber: "1" }],
  funds: [
    { id: "f1", name: "Administrative Fund", fundType: "ADMINISTRATIVE" },
    { id: "f2", name: "Capital Works Fund", fundType: "CAPITAL_WORKS" },
  ],
  memberships: [{ profileId: "adv-1", role: "ADVISER" }],
};
vi.mock("@/lib/queries/schemes", async (orig) => ({ ...(await orig()), getSchemeById: vi.fn(async () => SCHEME) }));
vi.mock("@/lib/queries/funds", async (orig) => ({
  ...(await orig()),
  getFundsWithBalances: vi.fn(async () => [
    { id: "f1", name: "Administrative Fund", fundType: "ADMINISTRATIVE", balance: 1000 },
    { id: "f2", name: "Capital Works Fund", fundType: "CAPITAL_WORKS", balance: 2000 },
  ]),
  getFundsForScheme: vi.fn(async () => [{ id: "f1", name: "Administrative Fund", fundType: "ADMINISTRATIVE" }]),
}));
vi.mock("@/lib/queries/bank-accounts", async (orig) => ({ ...(await orig()), getBankAccountsForScheme: vi.fn(async () => state.bankAccounts) }));
vi.mock("@/lib/queries/bank-transactions", async (orig) => ({ ...(await orig()), getBankTransactionsForAccount: vi.fn(async () => state.txns) }));
vi.mock("@/lib/queries/account-codes", async (orig) => ({ ...(await orig()), getAccountCodesForScheme: vi.fn(async () => state.accountCodes) }));
vi.mock("@/lib/queries/levy-schedules", async (orig) => ({
  ...(await orig()),
  getLevySchedulesForScheme: vi.fn(async () => state.schedules),
  getOverdueLevyNotices: vi.fn(async () => state.overdue),
}));
vi.mock("@/lib/queries/supplier-invoices", async (orig) => ({
  ...(await orig()),
  getSupplierInvoicesForScheme: vi.fn(async () => []),
  getOverdueInvoices: vi.fn(async () => []),
}));
vi.mock("@/lib/queries/journal-entries", async (orig) => ({
  ...(await orig()),
  getJournalEntriesForScheme: vi.fn(async () => state.journal),
  getJournalEntryById: vi.fn(async () => state.entry),
}));
vi.mock("@/lib/finance/levy-receipt-reversal", async (orig) => ({ ...(await orig()), getLevyReceipt: vi.fn(async () => state.receipt) }));
vi.mock("@/lib/finance/bank-allocations", async (orig) => ({
  ...(await orig()),
  getAllocationCandidates: vi.fn(async () => []),
  getSuspenseItems: vi.fn(async () => []),
}));
vi.mock("@/lib/billing/capture", async (orig) => ({ ...(await orig()), transactionFeeTable: vi.fn(async () => null) }));
vi.mock("@/lib/finance/owner-credits", async (orig) => ({
  ...(await orig()),
  getOwnerCredits: vi.fn(async () => state.credits),
  getOwnerCreditRefunds: vi.fn(async () => []),
}));
vi.mock("@/lib/queries/budget", async (orig) => ({
  ...(await orig()),
  getBudgetLinesForScheme: vi.fn(async () => []),
  getBudgetVsActual: vi.fn(async () => null),
}));
vi.mock("@/lib/finance/budgets", async (orig) => ({ ...(await orig()), getBudgets: vi.fn(async () => []) }));
vi.mock("@/lib/finance/resolutions", async (orig) => ({ ...(await orig()), resolutionMeetings: vi.fn(async () => []) }));
vi.mock("@/lib/finance/migration-batches", async (orig) => ({ ...(await orig()), listCutovers: vi.fn(async () => []) }));
vi.mock("@/lib/queries/financial-documents", async (orig) => ({
  ...(await orig()),
  getFinancialDocumentsForScheme: vi.fn(async () => state.docs),
  getUnreviewedDocuments: vi.fn(async () => []),
  getFinancialDocumentById: vi.fn(async () => state.doc),
}));
vi.mock("@/lib/queries/activity-log", async (orig) => ({ ...(await orig()), getActivityForScheme: vi.fn(async () => state.activities) }));
vi.mock("@/lib/jurisdiction/scheme-time", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/scheme-time")>("@/lib/jurisdiction/scheme-time");
  return { ...actual, schemeToday: vi.fn(async () => "2026-10-27"), schemeTimeZone: vi.fn(async () => "Australia/Sydney") };
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
  uploadFinancialDocumentAction: vi.fn(),
  reviewFinancialDocumentAction: vi.fn(),
  updateFinancialDocumentAction: vi.fn(),
  deleteFinancialDocumentAction: vi.fn(),
  generatePeriodsAction: vi.fn(),
}));
vi.mock("@/lib/actions/reconciliation", () => ({ allocateTransactionAction: vi.fn(), clearSuspenseAction: vi.fn(), postToSuspenseAction: vi.fn(), receiptDepositAction: vi.fn() }));
vi.mock("@/lib/actions/owner-credits", async (orig) => ({ ...(await orig()) }));
vi.mock("@/lib/actions/budgets", () => ({ adoptBudgetAction: vi.fn(), proposeBudgetAction: vi.fn(), reviseBudgetAction: vi.fn() }));
vi.mock("@/app/(portal)/adviser/schemes/actions", () => ({ deleteSchemeAction: vi.fn() }));

const { sharedFake } = await import("@/test/fake-orm");
const { default: FinancePage } = await import("@/app/(portal)/adviser/schemes/[id]/finance/page");
const { default: FinanceLayout } = await import("@/app/(portal)/adviser/schemes/[id]/finance/layout");
const { default: LeviesPage } = await import("@/app/(portal)/adviser/schemes/[id]/finance/levies/page");
const { default: ReconciliationPage } = await import("@/app/(portal)/adviser/schemes/[id]/finance/reconciliation/page");
const { default: OwnerCreditsPage } = await import("@/app/(portal)/adviser/schemes/[id]/finance/owner-credits/page");
const { default: BudgetPage } = await import("@/app/(portal)/adviser/schemes/[id]/finance/budget/page");
const { default: CutoverPage } = await import("@/app/(portal)/adviser/schemes/[id]/finance/migration/cutover/page");
const { CutoverClient } = await import("@/app/(portal)/adviser/schemes/[id]/finance/migration/cutover/cutover-client");
const { default: MigrationPage } = await import("@/app/(portal)/adviser/schemes/[id]/finance/migration/page");
const { default: JournalPage } = await import("@/app/(portal)/adviser/schemes/[id]/finance/journal/page");
const { default: JournalEntryPage } = await import("@/app/(portal)/adviser/schemes/[id]/finance/journal/[entryId]/page");
const { default: NewJournalPage } = await import("@/app/(portal)/adviser/schemes/[id]/finance/journal/new/page");
const { default: DocumentsPage } = await import("@/app/(portal)/adviser/schemes/[id]/finance/documents/page");
const { default: DocumentPage } = await import("@/app/(portal)/adviser/schemes/[id]/finance/documents/[docId]/page");
const { default: UploadPage } = await import("@/app/(portal)/adviser/schemes/[id]/finance/documents/upload/page");
const { default: NewPeriodsPage } = await import("@/app/(portal)/adviser/schemes/[id]/finance/periods/new/page");
const { default: ActivityPage } = await import("@/app/(portal)/adviser/schemes/[id]/activity/page");
const { LotFinancials } = await import("@/app/(portal)/adviser/schemes/[id]/lots/[lotId]/lot-financials");
const { LeviesCard } = await import("@/app/(portal)/adviser/schemes/[id]/_sections/levies-card");
const { ActivityTimeline } = await import("@/components/activity-timeline");
const { DeleteSchemeButton } = await import("@/app/(portal)/adviser/schemes/[id]/delete-button");
const { statutoryRulesFor } = await import("@/config/statutory");
const screenWords = await import("@/lib/jurisdiction/screen-words");
const NSW = statutoryRulesFor("NSW");
/* words: the NSW words, as the server pages pass them (absent before this change, when the props were ignored). */
const W = (typeof (screenWords as Record<string, unknown>).packWordsFor === "function"
  ? (screenWords as unknown as { packWordsFor: (r: typeof NSW) => Record<string, string> }).packWordsFor(NSW)
  : {}) as never;

const params = <T extends Record<string, string>>(extra: T = {} as T) => ({ params: Promise.resolve({ id: "s1", ...extra }) });
const NOTICE = { id: "n1", noticeNumber: "LN-1", dueDate: "2026-09-01", balanceOutstanding: "305", status: "ISSUED", lot: { lotNumber: "1" }, fund: { name: "Administrative Fund" } };
const SCHEDULES = [
  { id: "sc1", levyType: "ORDINARY", status: "ACTIVE", financialYear: 2026, frequency: "QUARTERLY", budgetAmount: "4000", title: null, fund: { name: "Administrative Fund" }, levyNotices: [NOTICE] },
  { id: "sc2", levyType: "SPECIAL", status: "APPROVED", financialYear: 2026, frequency: "ONE_OFF", budgetAmount: "900", title: "Roof", fund: { name: "Capital Works Fund" }, levyNotices: [] },
  { id: "sc3", levyType: "BROUGHT_FORWARD", status: "MIGRATED", financialYear: 2026, frequency: "ONE_OFF", budgetAmount: "300", title: null, fund: { name: "Administrative Fund" }, levyNotices: [] },
];
const ENTRY = {
  id: "j1",
  schemeId: "s1",
  entryNumber: "JE-0001",
  description: "Interest charged on overdue levy — notice LN-1",
  transactionDate: "2026-10-01",
  entryType: "INTEREST",
  status: "POSTED",
  sourceType: "INTEREST",
  sourceId: "n1",
  lines: [{ id: "x1", debit: "5", credit: null, description: "Interest", accountCode: { code: "1-1100", name: "Levies Receivable" } }],
};

beforeEach(() => {
  state.accountCodes = [];
  state.schedules = [];
  state.overdue = [];
  state.journal = [];
  state.bankAccounts = [];
  state.txns = [];
  state.credits = [];
  state.entry = null;
  state.receipt = null;
  state.doc = null;
  state.docs = [];
  state.activities = [];
  sharedFake.reset({
    Scheme: [{ id: "s1", state: "NSW", name: "Harbour View" }],
    LevyNotice: [{ id: "n1", schemeId: "s1", noticeNumber: "LN-1", levyScheduleId: "sc1", lotId: "l1", status: "ISSUED", dueDate: "2026-09-01", balanceOutstanding: "305" }],
  });
});

describe("NSW finance overview and tabs (golden)", () => {
  it("the overview before the chart of accounts is set up", async () => {
    expect(renderToStaticMarkup(await FinancePage(params()))).toMatchSnapshot();
  });

  it("the overview with levies, overdue notices and an interest entry", async () => {
    state.accountCodes = [{ id: "a1", code: "1-1000", name: "Bank" }];
    state.schedules = SCHEDULES;
    state.overdue = [NOTICE];
    state.journal = [{ ...ENTRY, lines: [{ debit: "5" }] }];
    expect(renderToStaticMarkup(await FinancePage(params()))).toMatchSnapshot();
  });

  it("the finance tabs", async () => {
    expect(renderToStaticMarkup(await FinanceLayout({ children: <div />, params: Promise.resolve({ id: "s1" }) }))).toMatchSnapshot();
  });
});

describe("NSW levies list (golden)", () => {
  it("empty", async () => {
    expect(renderToStaticMarkup(await LeviesPage(params()))).toMatchSnapshot();
  });

  it("with a budget levy, a special levy and levies brought forward", async () => {
    state.schedules = SCHEDULES;
    state.overdue = [NOTICE];
    expect(renderToStaticMarkup(await LeviesPage(params()))).toMatchSnapshot();
  });
});

describe("NSW reconciliation (golden)", () => {
  it("with no bank account", async () => {
    expect(renderToStaticMarkup(await ReconciliationPage({ ...params(), searchParams: Promise.resolve({}) }))).toMatchSnapshot();
  });

  it("the workbench with a deposit to match", async () => {
    state.bankAccounts = [{ id: "b1", accountName: "Operating", bsb: "062-000", accountNumber: "1234" }];
    state.txns = [{ id: "t1", transactionDate: "2026-10-02", amount: "305", description: "Deposit lot 1", reference: "LN-1", reconciliationStatus: "UNMATCHED", isDuplicate: false }];
    expect(renderToStaticMarkup(await ReconciliationPage({ ...params(), searchParams: Promise.resolve({ account: "b1" }) }))).toMatchSnapshot();
  });
});

describe("NSW owner credits and budget (golden)", () => {
  it("the owner credits page", async () => {
    state.credits = [{ lotId: "l1", fundId: "f1", balanceCents: 5000, availableCents: 5000, pendingRefundsCents: 0, lotNumber: "1", fundName: "Administrative Fund" }];
    expect(renderToStaticMarkup(await OwnerCreditsPage(params()))).toMatchSnapshot();
  });

  it("the budget page", async () => {
    expect(renderToStaticMarkup(await BudgetPage({ ...params(), searchParams: Promise.resolve({ year: "2026" }) }))).toMatchSnapshot();
  });
});

describe("NSW cutover and data migration (golden)", () => {
  it("the cutover page with no cutover yet", async () => {
    expect(renderToStaticMarkup(await CutoverPage({ ...params(), searchParams: Promise.resolve({}) }))).toMatchSnapshot();
  });

  it("the cutover client with a draft cutover", () => {
    const view = {
      id: "c1",
      sourceLabel: "StrataMax",
      template: null,
      cutoverDate: "2026-06-30",
      status: "DRAFT",
      staged: [],
      files: [],
      rowProblems: [],
      readiness: { trialBalance: { balanced: false, debitCents: 0, creditCents: 0, lines: 0 }, tieOuts: [], problems: ["Add the opening trial balance."], canSignOff: false },
      signOff: null,
      results: null,
      executedAt: null,
      executedByName: null,
    };
    const labels = { opening_balances: "Opening trial balance", levy_arrears: "Outstanding levy notices", unpaid_invoices: "Unpaid supplier invoices", owner_credits: "Owner credit balances", bank_balances: "Bank reconciled balances" };
    const html = renderToStaticMarkup(
      <CutoverClient
        schemeId="s1"
        sources={[{ value: "stratamax", label: "StrataMax" }]}
        batches={[{ id: "c1", sourceLabel: "StrataMax", cutoverDate: "2026-06-30", status: "DRAFT", createdAt: "2026-10-01" }]}
        view={view as never}
        labels={labels}
        fields={{}}
        funds={{ f1: "Administrative Fund" }}
        words={W} /* words */
        timeZone="Australia/Sydney"
      />,
    );
    expect(html).toMatchSnapshot();
    const done = renderToStaticMarkup(
      <CutoverClient
        schemeId="s1"
        sources={[]}
        batches={[]}
        view={{ ...view, status: "EXECUTED", results: { entryNumber: "JE-0001", openingLines: 4, notices: 2, invoices: 1, credits: 1, bankAccounts: 1 }, executedAt: "2026-10-02" } as never}
        labels={labels}
        fields={{}}
        funds={{}}
        words={W} /* words */
        timeZone="Australia/Sydney"
      />,
    );
    expect(done).toMatchSnapshot("executed");
  });

  it("the data migration page", async () => {
    expect(renderToStaticMarkup(await MigrationPage(params()))).toMatchSnapshot();
  });
});

describe("NSW journal pages (golden)", () => {
  it("the journal list with an interest entry", async () => {
    state.journal = [ENTRY];
    expect(renderToStaticMarkup(await JournalPage(params()))).toMatchSnapshot();
  });

  it("an interest entry, from its levy notice", async () => {
    state.entry = ENTRY;
    expect(renderToStaticMarkup(await JournalEntryPage(params({ entryId: "j1" })))).toMatchSnapshot();
  });

  it("a levy receipt, with its reversal panel", async () => {
    state.entry = { ...ENTRY, entryType: "AUTO", sourceType: "PAYMENT", sourceId: null, description: "Levy payment received — notice LN-1" };
    state.receipt = {
      entry: { id: "j1", status: "POSTED", sourceType: "PAYMENT" },
      payments: [{ id: "p1", levyNoticeId: "n1", amount: "305", reversedAt: null }],
      notices: [{ id: "n1", noticeNumber: "LN-1", lot: { lotNumber: "1" } }],
      credits: [],
      allocations: [],
      bankTransactions: [],
    };
    expect(renderToStaticMarkup(await JournalEntryPage(params({ entryId: "j1" })))).toMatchSnapshot();
  });

  it("the new journal entry page", async () => {
    expect(renderToStaticMarkup(await NewJournalPage(params()))).toMatchSnapshot();
  });
});

describe("NSW finance documents (golden)", () => {
  const DOC = { id: "d1", schemeId: "s1", documentType: "LEVY_NOTICE", documentStatus: "UPLOADED", verificationStatus: "PENDING", fileName: "notice.pdf", fileUrl: "x", fileSize: 2048, createdAt: "2026-10-01", title: "Levy notice LN-1", levyNotice: { noticeNumber: "LN-1" } };

  it("the list", async () => {
    state.docs = [DOC];
    expect(renderToStaticMarkup(await DocumentsPage({ ...params(), searchParams: Promise.resolve({}) }))).toMatchSnapshot();
  });

  it("a levy notice document, and one with no links", async () => {
    state.doc = DOC;
    expect(renderToStaticMarkup(await DocumentPage(params({ docId: "d1" })))).toMatchSnapshot();
    state.doc = { ...DOC, documentType: "RECEIPT", levyNotice: null };
    expect(renderToStaticMarkup(await DocumentPage(params({ docId: "d1" })))).toMatchSnapshot("no links");
  });

  it("the upload page", async () => {
    expect(renderToStaticMarkup(await UploadPage(params()))).toMatchSnapshot();
  });

  it("the new periods page", async () => {
    expect(renderToStaticMarkup(await NewPeriodsPage(params()))).toMatchSnapshot();
  });
});

describe("NSW lot financials, levies card, activity and danger zone (golden)", () => {
  it("the lot financials", () => {
    expect(
      renderToStaticMarkup(
        <LotFinancials
          timeZone="Australia/Sydney"
          financials={{ opening: 10, annual: 400, special: 0, paid: 100, closing: 315, interest: 5 }}
          levyHistory={[{ id: "n1", levyTitle: "Administrative Fund levy, 1 Jul 2026 to 30 Sep 2026 (LN-1)", levyType: "ORDINARY", dueDate: "2026-09-01", amount: 405, paidAmount: 100, status: "OVERDUE", paidAt: null }]}
          words={W} /* words */
        />,
      ),
    ).toMatchSnapshot();
    expect(renderToStaticMarkup(<LotFinancials timeZone="Australia/Sydney" financials={{ opening: 0, annual: 0, special: 0, paid: 0, closing: 0, interest: 0 }} levyHistory={[]} words={W} /* words */ />)).toMatchSnapshot("empty");
  });

  it("the levies card, empty and with levies", () => {
    expect(renderToStaticMarkup(<LeviesCard id="s1" schedules={[]} today="2026-10-27" words={W} /* words */ />)).toMatchSnapshot("empty");
    expect(renderToStaticMarkup(<LeviesCard id="s1" schedules={SCHEDULES.slice(0, 2) as never} today="2026-10-27" words={W} /* words */ />)).toMatchSnapshot("levies");
    expect(renderToStaticMarkup(<LeviesCard id="s1" schedules={SCHEDULES.slice(0, 1) as never} today="2026-10-27" words={W} /* words */ />)).toMatchSnapshot("one levy");
  });

  it("the activity timeline and page", async () => {
    const actor = { firstName: "Ann", lastName: "Lee", email: "a@x" };
    state.activities = ["LEVY_CREATED", "LEVY_ISSUED", "LEVIES_GENERATED", "LEVY_PAYMENT_RECORDED"].map((action, i) => ({
      id: `a${i}`,
      action,
      entityType: "LevySchedule",
      entityId: null,
      metadata: action === "LEVIES_GENERATED" ? { count: 4 } : action === "LEVY_PAYMENT_RECORDED" ? { amount: 305 } : null,
      createdAt: "2026-01-01T00:00:00Z",
      actor,
    }));
    expect(renderToStaticMarkup(<ActivityTimeline activities={state.activities as never} words={W} /* words */ />)).toMatchSnapshot("timeline");
    expect(renderToStaticMarkup(await ActivityPage(params()))).toMatchSnapshot("page");
  });

  it("the delete button", () => {
    expect(renderToStaticMarkup(<DeleteSchemeButton schemeId="s1" schemeName="Harbour View" levies={NSW.TERMINOLOGY.levies} /* words */ />)).toMatchSnapshot();
  });
});
