/**
 * More NSW screens are unchanged (golden; QLD wording and onboarding go-live,
 * 27 Oct 2026). Recorded against origin/main before these screens took their
 * levy, entitlement, fund and body corporate words from the building's rule
 * pack: the levy schedule page (approval, issue and notices), the new levy
 * schedule and special levy pages and forms, the onboarding income and budget
 * screen, the capital works fund plan page, the pre-meeting e-voting section
 * and the lot's debt collection section. The props marked "words" were added
 * after the snapshots were recorded on main.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const state = vi.hoisted(() => ({
  schedule: null as Record<string, unknown> | null,
  lots: [] as unknown[],
  plans: [] as unknown[],
}));

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
const SCHEME = {
  id: "s1",
  name: "Harbour View",
  planNumber: "SP 12345",
  state: "NSW",
  timeZone: "Australia/Sydney",
  financialYearEnd: "06-30",
  totalLots: 2,
  totalEntitlement: 100,
  memberships: [{ profileId: "adv-1", role: "ADVISER" }],
};
vi.mock("@/lib/queries/schemes", () => ({ getSchemeById: vi.fn(async () => SCHEME) }));
vi.mock("@/lib/queries/levy-schedules", () => ({ getLevyScheduleById: vi.fn(async () => state.schedule) }));
vi.mock("@/lib/queries/funds", () => ({
  getFundsForScheme: vi.fn(async () => [
    { id: "f1", name: "Administrative Fund" },
    { id: "f2", name: "Capital Works Fund" },
  ]),
}));
vi.mock("@/lib/levies/load-plan-lots", () => ({ loadPlanLots: vi.fn(async () => state.lots) }));
vi.mock("@/lib/levies/contribution-insurance", () => ({ contributionInsurance: vi.fn(async () => ({ split: null, problem: null })) }));
vi.mock("@/lib/billing/capture", () => ({ transactionFeeTable: vi.fn(async () => null) }));
vi.mock("@/lib/finance/capital-works-plans", () => ({ getPlans: vi.fn(async () => state.plans) }));
vi.mock("@/lib/jurisdiction/scheme-time", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/scheme-time")>("@/lib/jurisdiction/scheme-time");
  return { ...actual, schemeToday: vi.fn(async () => "2026-10-27") };
});
vi.mock("@/lib/jurisdiction/time-zone", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/time-zone")>("@/lib/jurisdiction/time-zone");
  return { ...actual, todayIn: () => "2026-10-27", platformToday: () => "2026-10-27" };
});
vi.mock("@/app/(portal)/adviser/schemes/[id]/finance/actions", () => ({
  approveLevyScheduleAction: vi.fn(),
  issueOverdueNoticesAction: vi.fn(),
  issueScheduleNoticesAction: vi.fn(),
  stopPlannedNoticesAction: vi.fn(),
  recordLevyPaymentFormAction: vi.fn(),
  createLevyScheduleAction: vi.fn(),
  createSpecialLevyAction: vi.fn(),
}));
vi.mock("@/app/(portal)/adviser/schemes/[id]/finance/migration/income-budget/actions", () => ({
  readIncomeStatementAction: vi.fn(),
  saveIncomeBudgetAction: vi.fn(),
}));
vi.mock("@/lib/actions/capital-works-plans", () => ({
  addPlanItemAction: vi.fn(),
  adoptPlanAction: vi.fn(),
  createPlanAction: vi.fn(),
  generateLevyFromPlanAction: vi.fn(),
  removePlanItemAction: vi.fn(),
  reviewPlanAction: vi.fn(),
  updatePlanSettingsAction: vi.fn(),
}));
vi.mock("@/app/(portal)/adviser/schemes/[id]/meetings/[meetingId]/evoting-actions", () => ({ openBallotAction: vi.fn(), closeBallotAction: vi.fn() }));
vi.mock("@/app/(portal)/adviser/schemes/[id]/lots/[lotId]/lot-workflow-actions", () => ({ updateDebtCollectionAction: vi.fn() }));

const { sharedFake } = await import("@/test/fake-orm");
const { default: LevySchedulePage } = await import("@/app/(portal)/adviser/schemes/[id]/finance/levies/[scheduleId]/page");
const { default: NewLevySchedulePage } = await import("@/app/(portal)/adviser/schemes/[id]/finance/levies/new/page");
const { default: NewSpecialLevyPage } = await import("@/app/(portal)/adviser/schemes/[id]/finance/levies/special/new/page");
const { default: CapitalWorksPlansPage } = await import("@/app/(portal)/adviser/schemes/[id]/finance/capital-works/page");
const { IncomeBudgetClient } = await import("@/app/(portal)/adviser/schemes/[id]/finance/migration/income-budget/income-budget-client");
const { EvotingSection } = await import("@/app/(portal)/adviser/schemes/[id]/meetings/[meetingId]/evoting-section");
const { DebtCollectionSection } = await import("@/app/(portal)/adviser/schemes/[id]/lots/[lotId]/debt-collection-section");
const { onboardingYears } = await import("@/lib/onboarding/income-budget");
const { statutoryRulesFor } = await import("@/config/statutory");
const { caseWordsFor, levySharedBy } = await import("@/lib/jurisdiction/screen-words"); /* words */
const NSW = statutoryRulesFor("NSW");

const params = (extra: { scheduleId?: string } = {}) => ({ params: Promise.resolve({ id: "s1", scheduleId: "", ...extra }) });
const NOTICE = (n: number, status: string) => ({
  id: `n${n}`,
  noticeNumber: `LN-${n}`,
  status,
  dueDate: "2026-12-01",
  amountDue: "500",
  amountPaid: status === "ISSUED" ? "100" : "0",
  balanceOutstanding: status === "ISSUED" ? "400" : "500",
  lot: { lotNumber: String(n) },
});
const SCHEDULE = {
  id: "sc1",
  schemeId: "s1",
  fundId: "f1",
  status: "DRAFT",
  levyType: "ORDINARY",
  frequency: "QUARTERLY",
  financialYear: 2026,
  budgetAmount: "4000",
  totalLots: 2,
  totalEntitlement: 100,
  title: null,
  description: null,
  approvedAt: "2026-06-15",
  dueDate: null,
  fund: { name: "Administrative Fund" },
  levyNotices: [] as unknown[],
};

beforeEach(() => {
  state.schedule = { ...SCHEDULE };
  state.lots = [
    { lotId: "l1", lotNumber: "1", entitlement: 40, ownerId: "o1" },
    { lotId: "l2", lotNumber: "2", entitlement: 60, ownerId: null },
  ];
  state.plans = [];
  sharedFake.reset({ Scheme: [{ id: "s1", state: "NSW" }] });
});

describe("NSW levy schedule page (golden)", () => {
  it("a budget levy schedule waiting for approval", async () => {
    expect(renderToStaticMarkup(await LevySchedulePage(params({ scheduleId: "sc1" })))).toMatchSnapshot();
  });

  it("an approved budget levy schedule, with the notices to issue", async () => {
    state.schedule = { ...SCHEDULE, status: "APPROVED" };
    expect(renderToStaticMarkup(await LevySchedulePage(params({ scheduleId: "sc1" })))).toMatchSnapshot();
  });

  it("an approved special levy, with the notices to issue", async () => {
    state.schedule = { ...SCHEDULE, status: "APPROVED", levyType: "SPECIAL", title: "Roof", description: "Roof repairs", dueDate: "2026-12-01" };
    expect(renderToStaticMarkup(await LevySchedulePage(params({ scheduleId: "sc1" })))).toMatchSnapshot();
  });

  it("an issued schedule, with planned and issued notices", async () => {
    state.schedule = { ...SCHEDULE, status: "ACTIVE", levyNotices: [NOTICE(1, "ISSUED"), NOTICE(2, "DRAFT")] };
    expect(renderToStaticMarkup(await LevySchedulePage(params({ scheduleId: "sc1" })))).toMatchSnapshot();
  });
});

describe("NSW new levy schedule and special levy pages (golden)", () => {
  it("the new levy schedule page", async () => {
    expect(renderToStaticMarkup(await NewLevySchedulePage(params()))).toMatchSnapshot();
  });

  it("the new special levy page", async () => {
    expect(renderToStaticMarkup(await NewSpecialLevyPage(params()))).toMatchSnapshot();
  });
});

describe("NSW onboarding income and budget screen (golden)", () => {
  it("the levies section", () => {
    const years = onboardingYears("2026-06-30", "06-30");
    expect(
      renderToStaticMarkup(
        <IncomeBudgetClient
          schemeId="s1"
          ctx={{
            takeoverDate: "2026-06-30",
            years,
            funds: [
              {
                id: "f1",
                name: "Administrative Fund",
                fundType: "ADMINISTRATIVE",
                balanceAtTakeoverCents: 0,
                levyIncomeAccountId: "a1",
                accounts: [
                  { id: "a1", code: "4-1000", name: "Levy Income", accountType: "INCOME" },
                  { id: "a2", code: "5-1100", name: "Insurance", accountType: "EXPENSE" },
                ],
              },
            ],
          }}
          saved={{ funds: [], adoption: { kind: "before_takeover", meetingDate: "2026-06-15" }, levies: { frequency: "QUARTERLY", raisedBeforeTakeover: "some", raisedInstalments: [1] } }}
          locks={{ budget: {}, levies: {} }}
          cutoverHref="/cutover"
          noticeLead="5 weeks"
          words={{ levy: NSW.TERMINOLOGY.levy, levies: NSW.TERMINOLOGY.levies, sharedBy: levySharedBy(NSW) }} /* words */
        />,
      ),
    ).toMatchSnapshot();
  });
});

describe("NSW capital works fund plan page (golden)", () => {
  it("with no plan adopted", async () => {
    expect(renderToStaticMarkup(await CapitalWorksPlansPage(params()))).toMatchSnapshot();
  });

  it("with an adopted plan due for review", async () => {
    state.plans = [{ id: "p1", title: "Capital works fund plan", status: "ADOPTED", periodStartYear: 2016, reviewDueAt: "2021-07-01", items: [{ estimatedCost: "1000" }] }];
    expect(renderToStaticMarkup(await CapitalWorksPlansPage(params()))).toMatchSnapshot();
  });
});

describe("NSW e-voting and debt collection sections (golden)", () => {
  const evoting = (adopted: boolean) =>
    renderToStaticMarkup(
      <EvotingSection
        schemeId="s1"
        meetingId="m1"
        adopted={adopted}
        canOpen
        ballot={null}
        timeZone="Australia/Sydney"
        adoptionCitation="Reg cl 14"
        ownersCorporation={NSW.TERMINOLOGY.ownersCorporation} /* words */
      />,
    );

  it("the e-voting section, not adopted and adopted", () => {
    expect(evoting(false)).toMatchSnapshot("not adopted");
    expect(evoting(true)).toMatchSnapshot("adopted");
  });

  it("the lot's debt collection section", () => {
    expect(
      renderToStaticMarkup(
        <DebtCollectionSection
          schemeId="s1"
          lotId="l1"
          paymentPlanLabel={caseWordsFor(NSW).paymentPlan} /* words */
          debtCollection={{ stage: "LETTER_1", notes: "Called", excludeFromCollection: false, hasPaymentPlan: true, buildingDebtCollection: true }}
        />,
      ),
    ).toMatchSnapshot();
  });
});
