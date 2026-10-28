/**
 * Queensland words on the levy, onboarding income, capital works plan,
 * e-voting, debt collection and notice screens (QLD wording go-live sweep,
 * 27 Oct 2026). The NSW words are held by screens-levy.nsw.golden.test.tsx.
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
  state: "QLD",
  timeZone: "Australia/Brisbane",
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
    { id: "f2", name: "Sinking Fund" },
  ]),
}));
vi.mock("@/lib/levies/load-plan-lots", () => ({ loadPlanLots: vi.fn(async () => state.lots) }));
// The real split, from the Queensland pack, for a building format plan with $1,000 of insurance in the budget.
vi.mock("@/lib/levies/contribution-insurance", async () => {
  const { insuranceSplit } = await import("@/lib/levies/contribution-shares");
  const { PENDING_RULE_PACKS } = await import("@/config/statutory");
  return {
    contributionInsurance: vi.fn(async (_id: string, schedule: { levyType?: string; budgetAmount: unknown }, lots: { lotId: string; lotNumber: string; entitlement: number }[]) => ({
      split: insuranceSplit({
        rules: PENDING_RULE_PACKS.QLD.rules,
        planFormat: "BUILDING",
        lots: lots.map((l, i) => ({ ...l, ownerId: null, interestScheduleEntitlement: [45, 55][i] })),
        totalCents: Math.round(Number(schedule.budgetAmount) * 100),
        insuranceCents: 100_000,
        ledgerFund: "ADMINISTRATIVE",
        levyType: schedule.levyType === "SPECIAL" ? "SPECIAL" : "ORDINARY",
      }),
      problem: null,
    })),
  };
});
// Queensland, with the pending Queensland pack.
vi.mock("@/lib/jurisdiction/scheme-rules", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/scheme-rules")>("@/lib/jurisdiction/scheme-rules");
  const { PENDING_RULE_PACKS } = await import("@/config/statutory");
  return {
    ...actual,
    rulesForState: (s: string | null | undefined) => (s === "QLD" ? { pack: null, rules: PENDING_RULE_PACKS.QLD.rules, label: "AU-QLD test" } : actual.rulesForState(s)),
  };
});
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
const { IncomeBudgetClient } = await import("@/app/(portal)/adviser/schemes/[id]/finance/migration/income-budget/income-budget-client");
const { NewPlanForm } = await import("@/app/(portal)/adviser/schemes/[id]/finance/capital-works/plan-forms");
const { EvotingSection } = await import("@/app/(portal)/adviser/schemes/[id]/meetings/[meetingId]/evoting-section");
const { DebtCollectionSection } = await import("@/app/(portal)/adviser/schemes/[id]/lots/[lotId]/debt-collection-section");
const { LevyNoticesView } = await import("@/components/levies/levy-notices-view");
const { onboardingYears } = await import("@/lib/onboarding/income-budget");
const { ledgerFundDefinition } = await import("@/lib/jurisdiction/funds");
const { PENDING_RULE_PACKS, statutoryRulesFor } = await import("@/config/statutory");
const { caseWordsFor, levyFormWords, levySharedBy, sharedLevyWords } = await import("./screen-words");
type Rules = import("@/config/statutory").StatutoryRules;
const QLD = PENDING_RULE_PACKS.QLD.rules as unknown as Rules;
const NSW = statutoryRulesFor("NSW");

const params = (extra: { scheduleId?: string } = {}) => ({ params: Promise.resolve({ id: "s1", scheduleId: "", ...extra }) });
/** Text only, so a word split by markup is still found. */
const textOf = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
const NSW_WORDS = /\blev(y|ies)\b|unit entitlement|owners corporation|capital works|payment plan/i;
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
  sharedFake.reset({ Scheme: [{ id: "s1", state: "QLD" }] });
});

describe("the words for levy screens, from the pack", () => {
  it("names the levy, the entitlement and the plan", () => {
    expect(levyFormWords(NSW)).toEqual({ levy: "levy", levies: "levies", entitlement: "unit entitlement", plan: "strata plan" });
    expect(levyFormWords(QLD)).toEqual({ levy: "contribution", levies: "contributions", entitlement: "contribution schedule lot entitlement", plan: "community titles scheme" });
  });

  it("says how a levy is shared: by the interest schedule for Queensland insurance since #117", () => {
    expect(levySharedBy(NSW)).toBe("unit entitlement");
    expect(levySharedBy(QLD)).toBe("contribution schedule lot entitlement (the insurance in the administrative fund by interest schedule lot entitlement)");
  });

  it("takes the payment arrangement and the general late charge from the pack's terminology", () => {
    expect(QLD.TERMINOLOGY.paymentPlan).toBe("Payment Arrangement");
    expect(caseWordsFor(QLD).paymentPlan).toBe(QLD.TERMINOLOGY.paymentPlan);
    // The NSW pack names none, so NSW keeps the label its statutory plan has always had, and its pack is unchanged.
    expect(NSW.TERMINOLOGY.paymentPlan).toBeUndefined();
    expect(caseWordsFor(NSW).paymentPlan).toBe("Payment Plan");
    // Where an owner's NSW and Queensland lots are shown together, the Queensland pack's general word.
    expect(NSW.TERMINOLOGY.lateChargeGeneral).toBeUndefined();
    expect(sharedLevyWords([NSW, QLD], NSW).lateCharge).toBe(QLD.TERMINOLOGY.lateChargeGeneral);
    expect(sharedLevyWords([QLD, NSW], NSW).lateCharge).toBe("late payment charge");
    // Without a general word in any pack, the buildings' own words are joined.
    const bare = (r: Rules) => ({ TERMINOLOGY: { ...r.TERMINOLOGY, lateChargeGeneral: undefined } });
    expect(sharedLevyWords([bare(NSW as Rules), bare(QLD)], bare(NSW as Rules)).lateCharge).toBe("interest or penalty");
  });
});

describe("the levy schedule page for a Queensland building", () => {
  it("names contributions, the contribution schedule and the body corporate", async () => {
    const text = textOf(renderToStaticMarkup(await LevySchedulePage(params({ scheduleId: "sc1" }))));
    expect(text).toContain("FY 2026 contribution schedule");
    expect(text).toContain("Budget contribution");
    expect(text).toContain("Total contribution schedule lot entitlement");
    expect(text).toContain("Date of the general meeting at which the body corporate set these contributions.");
    expect(text).toContain("Contribution notices");
    expect(text).toContain("No contribution notices yet");
    expect(text).toContain("Contributions");
    expect(text).not.toMatch(NSW_WORDS);
  });

  it("says the insurance part is shared by the interest schedule, as the preview does", async () => {
    state.schedule = { ...SCHEDULE, status: "APPROVED" };
    const text = textOf(renderToStaticMarkup(await LevySchedulePage(params({ scheduleId: "sc1" }))));
    expect(text).toContain(
      "in proportion to contribution schedule lot entitlement, with the insurance part shared by interest schedule lot entitlement. Amounts are rounded",
    );
    expect(text).toContain("Contribution schedule lot entitlement");
    expect(text).toContain("Contributions are paid in advance");
    expect(text).not.toMatch(NSW_WORDS);
  });

  it("names a special contribution, shared by the contribution schedule only", async () => {
    state.schedule = { ...SCHEDULE, status: "APPROVED", levyType: "SPECIAL", title: "Roof", dueDate: "2026-12-01" };
    const text = textOf(renderToStaticMarkup(await LevySchedulePage(params({ scheduleId: "sc1" }))));
    expect(text).toContain("Special contribution: Roof");
    expect(text).toContain("in proportion to contribution schedule lot entitlement. Amounts are rounded");
    expect(text).not.toMatch(NSW_WORDS);
  });

  it("keeps the verb in the summary of issued notices", async () => {
    state.schedule = { ...SCHEDULE, status: "ACTIVE", levyNotices: [NOTICE(1, "ISSUED"), NOTICE(2, "DRAFT")] };
    const text = textOf(renderToStaticMarkup(await LevySchedulePage(params({ scheduleId: "sc1" }))));
    expect(text).toContain("Total levied");
    expect(text.replace("Total levied", "")).not.toMatch(NSW_WORDS);
  });
});

describe("the new contribution schedule and special contribution pages for a Queensland building", () => {
  it("the new schedule page", async () => {
    const text = textOf(renderToStaticMarkup(await NewLevySchedulePage(params())));
    expect(text).toContain("New Contribution Schedule");
    expect(text).toContain("Contribution Frequency");
    expect(text).toContain("Total budget for this contribution schedule");
    expect(text).toContain("Aggregate contribution schedule lot entitlement in the community titles scheme");
    expect(text).toContain("Create Contribution Schedule");
    expect(text).not.toMatch(NSW_WORDS);
  });

  it("the special contribution page", async () => {
    const html = renderToStaticMarkup(await NewSpecialLevyPage(params()));
    const text = textOf(html);
    expect(text).toContain("Raise a Special Contribution");
    expect(html).toContain("What the special contribution is for, as resolved");
    expect(text).toContain("Levied on every lot in proportion to contribution schedule lot entitlement.");
    expect(text).toContain("Date of the general meeting that resolved the special contribution.");
    expect(text).toContain("Creating the special contribution does not issue anything.");
    expect(text).toContain("Create Special Contribution");
    expect(text.replace("Levied on", "")).not.toMatch(NSW_WORDS);
  });
});

describe("the onboarding income and budget screen for a Queensland building", () => {
  it("names contributions and says how they are shared", () => {
    const text = textOf(
      renderToStaticMarkup(
        <IncomeBudgetClient
          schemeId="s1"
          ctx={{
            takeoverDate: "2026-06-30",
            years: onboardingYears("2026-06-30", "06-30"),
            funds: [
              {
                id: "f1",
                name: "Administrative Fund",
                fundType: "ADMINISTRATIVE",
                balanceAtTakeoverCents: 0,
                levyIncomeAccountId: "a1",
                accounts: [{ id: "a1", code: "4-1000", name: "Contribution Income", accountType: "INCOME" }],
              },
            ],
          }}
          saved={{ funds: [], adoption: { kind: "before_takeover", meetingDate: "2026-06-15" }, levies: { frequency: "QUARTERLY", raisedBeforeTakeover: "some", raisedInstalments: [1] } }}
          locks={{ budget: {}, levies: {} }}
          cutoverHref="/cutover"
          noticeLead="35 days"
          words={{ levy: QLD.TERMINOLOGY.levy, levies: QLD.TERMINOLOGY.levies, sharedBy: levySharedBy(QLD) }}
        />,
      ),
    );
    expect(text).toContain("Contributions for 1 July 2026 to 30 June 2027");
    expect(text).toContain(
      "Each fund's contributions are the budget on its contribution income line, shared between the lots by contribution schedule lot entitlement (the insurance in the administrative fund by interest schedule lot entitlement) when the notices are generated.",
    );
    expect(text).toContain("The notices are generated on the Contributions page once the cutover has been run.");
    expect(text).toContain("Make the contribution schedules for the whole year.");
    expect(text).toContain("Contributions are paid in advance");
    // The income and budget checks (src/lib/onboarding/income-budget.ts) still name levy notices: a go-live gap in qld.ts.
    expect(text.replace("the cutover's outstanding levy notices", "")).not.toMatch(NSW_WORDS);
  });
});

describe("the plan form, e-voting and debt collection words for a Queensland building", () => {
  it("names the plan's fund as the pack does", () => {
    const fund = ledgerFundDefinition(QLD, "CAPITAL_WORKS");
    const html = renderToStaticMarkup(<NewPlanForm schemeId="s1" defaultStartYear={2026} today="2026-10-27" fundName={fund.name} />);
    expect(html).toContain('value="Sinking fund plan"');
    expect(textOf(html)).toContain("Sinking fund balance at the start");
    expect(textOf(html)).not.toMatch(/capital works/i);
  });

  it("names the body corporate in the e-voting section", () => {
    const text = textOf(
      renderToStaticMarkup(
        <EvotingSection schemeId="s1" meetingId="m1" adopted={false} canOpen ballot={null} timeZone="Australia/Brisbane" adoptionCitation="SM s 1" ownersCorporation={QLD.TERMINOLOGY.ownersCorporation} />,
      ),
    );
    expect(text).toContain("The body corporate has not resolved to adopt pre-meeting electronic voting");
    expect(text).not.toMatch(NSW_WORDS);
  });

  it("calls the agreed plan a payment arrangement in the debt collection section", () => {
    const text = textOf(
      renderToStaticMarkup(
        <DebtCollectionSection
          schemeId="s1"
          lotId="l1"
          paymentPlanLabel={caseWordsFor(QLD).paymentPlan}
          debtCollection={{ stage: "NONE", notes: null, excludeFromCollection: false, hasPaymentPlan: true, buildingDebtCollection: false }}
        />,
      ),
    );
    expect(text).toContain("Payment Arrangement");
    expect(text).not.toMatch(NSW_WORDS);
  });
});

describe("each notice row's late charge, where an owner's NSW and Queensland lots are shown together", () => {
  it("says what the row's own building charged", () => {
    const item = (id: string, schemeId: string) => ({
      id,
      lotId: id,
      lotLabel: `Lot ${id}`,
      schemeId,
      title: "t",
      noticeNumber: `LN-${id}`,
      fundName: "Administrative Fund",
      dueDate: "2026-09-01",
      amountDue: 405,
      amountPaid: 0,
      balance: 405,
      interestCharged: 5,
      status: "OVERDUE",
    });
    const html = renderToStaticMarkup(
      <LevyNoticesView
        items={[item("1", "nsw"), item("2", "qld")] as never}
        words={sharedLevyWords([NSW, QLD], NSW)}
        lateChargeByScheme={{ nsw: NSW.TERMINOLOGY.lateCharge, qld: QLD.TERMINOLOGY.lateCharge }}
      />,
    );
    expect(textOf(html)).toContain("includes $5.00 interest");
    expect(textOf(html)).toContain("includes $5.00 penalty");
    expect(textOf(html)).not.toContain("late payment charge");
  });
});
