/**
 * More NSW screens are unchanged (golden; QLD wording go-live sweep,
 * 27 Oct 2026). Recorded against origin/main before these screens took their
 * levy, entitlement and payment plan words from the building's rule pack: the
 * owner statement page, the statement view, the owner dashboard, the
 * building's edit form and the adviser debt recovery list.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const state = vi.hoisted(() => ({
  ownerSchemes: [] as unknown[],
  notices: [] as unknown[],
  roles: ["OWNER"] as string[],
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
// The state choices as they were when this golden was recorded: NSW only. Since the
// Queensland switch-on (28 Oct 2026) the form offers New South Wales and Queensland, asks
// the state first and names both in its help (checked with the real choices in
// onboarding.qld.test.tsx). Pinned here so this golden still shows everything else is unchanged.
vi.mock("@/config/jurisdictions", async () => {
  const actual = await vi.importActual<typeof import("@/config/jurisdictions")>("@/config/jurisdictions");
  return {
    ...actual,
    SUPPORTED_SCHEME_STATES: ["NSW"],
    SCHEME_STATE_OPTIONS: [{ value: "NSW", label: "New South Wales" }],
    SCHEME_STATE_HELP: "Only New South Wales buildings can be set up for now.",
  };
});
vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("@/lib/queries/profiles", () => ({ getCurrentProfile: vi.fn(async () => ({ id: "owner-1" })) }));
vi.mock("@/lib/owner/selected-scheme", () => ({
  getVerifiedSelectedSchemeId: vi.fn(async () => null),
  getSelectedOwnerScheme: vi.fn(async () => ({ schemeId: "s1", roles: state.roles })),
}));
const SCHEME = {
  id: "s1",
  name: "Harbour View",
  planNumber: "SP 12345",
  state: "NSW",
  timeZone: "Australia/Sydney",
  funds: [
    { id: "f1", name: "Administrative Fund", fundType: "ADMINISTRATIVE", balance: 1000 },
    { id: "f2", name: "Capital Works Fund", fundType: "CAPITAL_WORKS", balance: 2000 },
  ],
  memberships: [{ profileId: "owner-1", role: "OWNER", lotId: "l1", lot: { lotNumber: "1", unitNumber: "3" } }],
};
vi.mock("@/lib/queries/schemes", () => ({
  getSchemesForOwner: vi.fn(async () => state.ownerSchemes),
  getSchemeById: vi.fn(async () => SCHEME),
}));
vi.mock("@/lib/finance/fund-position", () => ({ withLedgerBalances: vi.fn(async (f: unknown) => f) }));
vi.mock("@/lib/queries/meetings", () => ({ getUpcomingMeetingsForOwner: vi.fn(async () => []) }));
vi.mock("@/lib/queries/work-orders", () => ({ getWorkOrdersForSchemes: vi.fn(async () => []) }));
vi.mock("@/lib/queries/reports", () => ({
  getDashboardFinancialSummary: vi.fn(async () => ({ cashIn: 100, cashOut: 50, billsAwaitingCount: 1, billsAwaiting: 20, billsOverdueCount: 0, billsOverdue: 0 })),
}));
vi.mock("@/lib/queries/levies", () => ({ getLevyNoticesForLots: vi.fn(async () => state.notices) }));
vi.mock("@/lib/queries/levy-schedules", () => ({ getLevyPaymentsForNotices: vi.fn(async () => []) }));
vi.mock("@/lib/finance/owner-credits", () => ({ getCreditMovements: vi.fn(async () => []) }));
vi.mock("@/lib/jurisdiction/time-zone", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/time-zone")>("@/lib/jurisdiction/time-zone");
  return { ...actual, todayIn: () => "2026-10-27", platformToday: () => "2026-10-27" };
});
vi.mock("@/lib/actions/debt-recovery", () => ({ initiateDebtRecoveryAction: vi.fn() }));
vi.mock("@/app/(portal)/adviser/schemes/actions", () => ({ createSchemeAction: vi.fn(), updateSchemeAction: vi.fn() }));

const { sharedFake } = await import("@/test/fake-orm");
const { default: OwnerStatementPage } = await import("@/app/(portal)/owner/(scheme)/levies/statement/page");
const { default: OwnerDashboard } = await import("@/app/(portal)/owner/(scheme)/dashboard/page");
const { StatementView } = await import("@/components/levies/statement-view");
const { SchemeForm } = await import("@/app/(portal)/adviser/schemes/scheme-form");
const { DebtRecoveryListClient } = await import("@/app/(portal)/adviser/schemes/[id]/finance/debt-recovery/debt-recovery-client");
const { statutoryRulesFor } = await import("@/config/statutory");
const { caseWordsFor, lotWordsFor } = await import("@/lib/jurisdiction/screen-words");
const { planNumberLabel } = await import("@/lib/onboarding/onboarding-words");
// The NSW words, from the NSW pack, as the server pages pass them (added after the snapshots were recorded on main).
const NSW = statutoryRulesFor("NSW");

const NOTICE = {
  id: "n1",
  lotId: "l1",
  schemeId: "s1",
  noticeNumber: "LN-1",
  status: "ISSUED",
  dueDate: "2026-09-01",
  periodStart: "2026-07-01",
  periodEnd: "2026-09-30",
  amountDue: "400",
  amountPaid: "100",
  balanceOutstanding: "305",
  interestCharged: "5",
  fund: { name: "Administrative Fund" },
  levySchedule: { levyType: "SPECIAL", title: "Roof", financialYear: "2026-27" },
};

beforeEach(() => {
  state.ownerSchemes = [{ ...SCHEME }];
  state.notices = [NOTICE];
  state.roles = ["OWNER"];
  sharedFake.reset({ Scheme: [{ id: "s1", state: "NSW" }] });
});

describe("NSW owner statement and dashboard (golden)", () => {
  it("the statement page, with a lot shown", async () => {
    expect(renderToStaticMarkup(await OwnerStatementPage({ searchParams: Promise.resolve({}) }))).toMatchSnapshot();
  });

  it("the statement page, before a lot is chosen", async () => {
    state.ownerSchemes = [{ ...SCHEME, memberships: [...SCHEME.memberships, { profileId: "owner-1", role: "OWNER", lotId: "l2", lot: { lotNumber: "2", unitNumber: null } }] }];
    expect(renderToStaticMarkup(await OwnerStatementPage({ searchParams: Promise.resolve({}) }))).toMatchSnapshot();
  });

  it("the statement view, empty", () => {
    expect(
      renderToStaticMarkup(
        <StatementView lotLabel="Lot 1" pdfHref={null} periodLabel="All periods" openingBalance={0} totalCharges={0} totalPayments={0} closingBalance={0} lines={[]} levy={NSW.TERMINOLOGY.levy} />,
      ),
    ).toMatchSnapshot();
  });

  it("the dashboard, for an owner and for the committee", async () => {
    expect(renderToStaticMarkup(await OwnerDashboard())).toMatchSnapshot("owner");
    state.roles = ["COMMITTEE"];
    expect(renderToStaticMarkup(await OwnerDashboard())).toMatchSnapshot("committee");
  });
});

describe("NSW building form and adviser debt recovery list (golden)", () => {
  it("the building's edit form", () => {
    expect(
      renderToStaticMarkup(
        <SchemeForm
          words={{ ...lotWordsFor(NSW), planNumber: planNumberLabel(NSW.TERMINOLOGY) }}
          mode="edit" schemeId="s1" today="2026-10-27" lockCore defaults={{ name: "Harbour View", planNumber: "SP 12345", state: "NSW", totalLots: 2, totalEntitlement: 100 }} />,
      ),
    ).toMatchSnapshot();
  });

  it("the adviser debt recovery list", () => {
    const rules = statutoryRulesFor("NSW");
    expect(
      renderToStaticMarkup(
        <DebtRecoveryListClient
          schemeId="s1"
          cases={[
            { id: "c1", caseNumber: "DR-1", lotId: "l1", ownerId: "o1", status: "PAYMENT_PLAN", priority: "NORMAL", totalOwed: 100, currentStep: "HARDSHIP_REVIEW", createdAt: "2026-09-01" },
            { id: "c2", caseNumber: "DR-2", lotId: "l1", ownerId: "o1", status: "OPEN", priority: "HIGH", totalOwed: 200, currentStep: "INITIAL_CONTACT", createdAt: "2026-09-02" },
          ]}
          lotsWithOwners={[{ id: "l1", lotNumber: "1", unitNumber: null, ownerId: "o1", ownerName: "J CITIZEN" } as never]}
          stepLabels={rules.DEBT_RECOVERY_STEP_LABELS!}
          levies={rules.TERMINOLOGY.levies}
          paymentPlanLabel={caseWordsFor(NSW).paymentPlan}
        />,
      ),
    ).toMatchSnapshot();
  });
});
