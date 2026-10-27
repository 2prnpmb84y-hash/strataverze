/**
 * NSW screens are unchanged (golden; QLD wording and onboarding go-live,
 * 27 Oct 2026). Recorded against origin/main before these screens took their
 * words from the building's rule pack: the lots card, the strata roll table,
 * the committee's lot page, the owner debt recovery list and case pages, the
 * owner levies page, the fee schedule and fee views, and the reasons a
 * resolution count gives.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const state = vi.hoisted(() => ({
  profile: { id: "owner-1" } as { id: string },
  committeeSchemes: [] as { id: string; name: string; state: string }[],
  selected: null as string | null,
  ownCases: [] as Record<string, unknown>[],
  schemeCases: [] as Record<string, unknown>[],
  ownerSchemes: [] as unknown[],
  notices: [] as unknown[],
}));

vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("@/lib/queries/profiles", () => ({ getCurrentProfile: vi.fn(async () => state.profile) }));
vi.mock("@/lib/owner/selected-scheme", () => ({
  getVerifiedSelectedSchemeId: vi.fn(async () => state.selected),
  getSelectedOwnerScheme: vi.fn(async () => ({ schemeId: "s1", roles: ["COMMITTEE"] })),
}));
vi.mock("@/lib/queries/schemes", () => ({
  getSchemesForCommittee: vi.fn(async () => state.committeeSchemes),
  getSchemesForOwner: vi.fn(async () => state.ownerSchemes),
  getSchemeById: vi.fn(async () => ({ id: "s1", name: "Harbour View", planNumber: "SP 12345", state: "NSW", timeZone: "Australia/Sydney" })),
}));
vi.mock("@/lib/queries/debt-recovery", () => ({
  getDebtRecoveryCasesForOwner: vi.fn(async () => state.ownCases),
  getDebtRecoveryCasesForSchemes: vi.fn(async (ids: string[]) => (ids.length ? state.schemeCases : [])),
}));
vi.mock("@/lib/queries/levies", () => ({ getLevyNoticesForLots: vi.fn(async () => state.notices) }));
vi.mock("@/lib/queries/lots", () => ({
  getLotInScheme: vi.fn(async () => ({ id: "l1", lotNumber: "1", unitNumber: "3", entitlement: 40, interestScheduleEntitlement: 45 })),
  getStrataRollData: vi.fn(async () => [ROLL_ROW]),
}));
vi.mock("@/lib/queries/lot-workflows", () => ({
  getLotDetailExtended: vi.fn(async () => ({ rollOwnerName: "J CITIZEN", ownerEmail: "j@example.com", ownerMobile: null, ownerPhone: null, ownerAddress: null, lastSettled: null })),
}));
vi.mock("@/lib/audit/security-audit", () => ({ recordSecurityEventLater: vi.fn(async () => {}) }));
vi.mock("@/lib/jurisdiction/scheme-time", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/scheme-time")>("@/lib/jurisdiction/scheme-time");
  return { ...actual, schemeToday: vi.fn(async () => "2026-10-27") };
});
vi.mock("@/lib/jurisdiction/time-zone", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/time-zone")>("@/lib/jurisdiction/time-zone");
  return { ...actual, todayIn: () => "2026-10-27", platformToday: () => "2026-10-27" };
});
vi.mock("@/lib/actions/debt-recovery", () => ({
  completeDebtRecoveryStepAction: vi.fn(),
  addDebtRecoveryNoteAction: vi.fn(),
  recordInstalmentPaymentAction: vi.fn(),
}));
vi.mock("@/lib/actions/change-owner", () => ({ changeOwnerAction: vi.fn() }));
vi.mock("@/lib/storage/client-upload", () => ({ stageFormFile: vi.fn(), stageUpload: vi.fn() }));

const { sharedFake } = await import("@/test/fake-orm");
const { LotsCard } = await import("@/app/(portal)/adviser/schemes/[id]/_sections/lots-card");
const { StrataRollTable } = await import("@/app/(portal)/adviser/schemes/[id]/strata-roll-table");
const { default: CommitteeLotPage } = await import("@/app/(portal)/owner/(scheme)/scheme/lots/[lotId]/page");
const { default: OwnerDebtRecoveryPage } = await import("@/app/(portal)/owner/(scheme)/levies/debt-recovery/page");
const { CaseDetailOwnerClient } = await import("@/app/(portal)/owner/(scheme)/levies/debt-recovery/[caseId]/case-detail-owner-client");
const { default: OwnerLeviesPage } = await import("@/app/(portal)/owner/(scheme)/levies/page");
const { LevyNoticesView } = await import("@/components/levies/levy-notices-view");
const { PlatformFeesView } = await import("@/components/billing/platform-fees-view");
const { feeSchedule } = await import("@/lib/billing/fee-schedule");
const { feeWordingFor, toFeeView } = await import("@/lib/billing/disclosure");
const { TEST_PRICE_BOOK } = await import("@/lib/billing/test-price-book");
const { evaluateResolution } = await import("@/lib/meetings/rules");
const { statutoryRulesFor } = await import("@/config/statutory");
const { caseWordsFor, lotWordsFor } = await import("@/lib/jurisdiction/screen-words");
// The NSW words, from the NSW pack, as the server pages pass them (added after the snapshots were recorded on main).
const NSW_LOT_WORDS = lotWordsFor(statutoryRulesFor("NSW"));

const ROLL_ROW = {
  id: "l1",
  lotNumber: "1",
  unitNumber: "3",
  entitlement: 40,
  ownerNames: "J CITIZEN",
  opening: 10,
  annual: 400,
  special: 0,
  paid: 300,
  closing: 110,
  interest: 2.5,
  financial: false,
  overdueCents: 11000,
  oldestOverdue: "2026-09-01",
};

const CASE = {
  id: "c1",
  caseNumber: "DR-0001",
  schemeId: "s1",
  lotId: "l1",
  ownerId: "owner-1",
  status: "PAYMENT_PLAN",
  currentStep: "HARDSHIP_REVIEW",
  priority: "HIGH",
  totalOwed: "1200.50",
  principalOwed: "1100",
  interestOwed: "100.50",
  createdAt: "2026-09-01T00:00:00.000Z",
};

beforeEach(() => {
  state.profile = { id: "owner-1" };
  state.committeeSchemes = [];
  state.selected = null;
  state.ownCases = [];
  state.schemeCases = [];
  state.ownerSchemes = [];
  state.notices = [];
  sharedFake.reset({
    Scheme: [{ id: "s1", name: "Harbour View", state: "NSW", planNumber: "SP 12345", timeZone: "Australia/Sydney" }],
    SchemeMembership: [{ id: "m1", profileId: "owner-1", schemeId: "s1", lotId: "l1", role: "OWNER", isActive: true }],
    Lot: [{ id: "l1", schemeId: "s1", lotNumber: "1", unitNumber: "3", entitlement: 40 }],
  });
});

describe("NSW lots and roll screens (golden)", () => {
  it("the lots card", () => {
    expect(renderToStaticMarkup(<LotsCard id="s1" rows={[ROLL_ROW] as never} totalLots={2} words={NSW_LOT_WORDS} />)).toMatchSnapshot();
  });

  it("the strata roll table, with and without money", () => {
    expect(renderToStaticMarkup(<StrataRollTable rows={[ROLL_ROW]} schemeId="s1" words={NSW_LOT_WORDS} />)).toMatchSnapshot("adviser");
    expect(renderToStaticMarkup(<StrataRollTable rows={[ROLL_ROW]} schemeId="s1" lotHrefBase="/owner/scheme/lots/" showMoney={false} words={NSW_LOT_WORDS} />)).toMatchSnapshot("committee");
  });

  it("the committee's lot page", async () => {
    expect(renderToStaticMarkup(await CommitteeLotPage({ params: Promise.resolve({ lotId: "l1" }) }))).toMatchSnapshot();
  });
});

describe("NSW owner debt recovery (golden)", () => {
  it("the list, for an owner and for the committee", async () => {
    state.ownCases = [CASE];
    expect(renderToStaticMarkup(await OwnerDebtRecoveryPage())).toMatchSnapshot("owner");
    state.committeeSchemes = [{ id: "s1", name: "Harbour View", state: "NSW" }];
    state.schemeCases = [CASE, { ...CASE, id: "c2", caseNumber: "DR-0002", status: "REFERRED_LEGAL", currentStep: "LEGAL_REFERRAL" }];
    expect(renderToStaticMarkup(await OwnerDebtRecoveryPage())).toMatchSnapshot("committee");
  });

  it("the case page", () => {
    const debtCase = {
      ...CASE,
      totalOwed: 1200.5,
      principalOwed: 1100,
      interestOwed: 100.5,
      costsOwed: 0,
      solicitorName: null,
      solicitorRef: null,
      courtFileNumber: null,
      hasDispute: true,
      disputeDetails: null,
      hasHardshipRequest: true,
      hardshipDetails: "Lost work",
      notes: null,
      closedAt: null,
      closedReason: null,
      steps: [],
      paymentPlan: {
        id: "p1",
        totalAmount: 1200,
        instalmentAmount: 100,
        frequency: "MONTHLY",
        startDate: "2026-10-01",
        endDate: "2027-09-01",
        numberOfInstalments: 12,
        status: "ACTIVE",
      },
      instalments: [],
      documents: [],
      activities: [],
    };
    const html = renderToStaticMarkup(
      <CaseDetailOwnerClient
        debtCase={debtCase}
        isCommittee={false}
        recoveryLaw="NSW Strata Schemes Management Act 2015"
        stepLabels={statutoryRulesFor("NSW").DEBT_RECOVERY_STEP_LABELS!}
        lateChargeLabel="Interest"
        caseWords={caseWordsFor(statutoryRulesFor("NSW"))}
      />,
    );
    expect(html).toMatchSnapshot();
  });
});

describe("NSW owner levies (golden)", () => {
  const notice = (over: Record<string, unknown>) => ({
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
    levySchedule: { levyType: "ANNUAL", title: "Budget", financialYear: "2026-27" },
    ...over,
  });

  it("the owner levies page", async () => {
    state.ownerSchemes = [
      { id: "s1", name: "Harbour View", state: "NSW", timeZone: "Australia/Sydney", memberships: [{ lotId: "l1", lot: { lotNumber: "1", unitNumber: "3" } }] },
    ];
    state.notices = [notice({}), notice({ id: "n2", noticeNumber: "LN-2", amountPaid: "400", balanceOutstanding: "0", interestCharged: "0", status: "PAID", levySchedule: { levyType: "SPECIAL", title: "Roof" } })];
    expect(renderToStaticMarkup(await OwnerLeviesPage())).toMatchSnapshot();
  });

  it("the levy list, empty", () => {
    expect(renderToStaticMarkup(<LevyNoticesView items={[]} emptyDescription="No levies have been issued for this lot yet." words={statutoryRulesFor("NSW").TERMINOLOGY} />)).toMatchSnapshot();
  });
});

describe("NSW fee views (golden)", () => {
  it("the fee schedule rows and the fee views", () => {
    const schedule = feeSchedule(TEST_PRICE_BOOK, "2026-07-01");
    expect(schedule).toMatchSnapshot("schedule");
    const views = TEST_PRICE_BOOK.map((e) =>
      toFeeView({
        code: e.code,
        variant: e.variant ?? null,
        description: e.description,
        exGstCents: e.amountCents ?? 0,
        gstCents: 0,
        totalCents: e.amountCents ?? 0,
        payerType: e.payerType,
        recoverableFromOwner: e.recoverableFromOwner ?? false,
      } as never),
    );
    expect(views).toMatchSnapshot("views");
  });

  it("the platform fees page", () => {
    const schedule = feeSchedule(TEST_PRICE_BOOK, "2026-07-01");
    const data = {
      captureEnabled: true,
      today: "2026-10-27",
      subscription: {
        exists: true,
        status: "ACTIVE",
        promotional: false,
        promotionEnd: null,
        lotCount: 12,
        price: { tier: "SMALL", monthlyCents: 9900, gstInclusive: false },
      },
      uninvoiced: { exGstCents: 100, gstCents: 10, totalCents: 110, count: 1 },
      events: [
        { id: "e1", code: "TXN_FEE", description: "Payment fee", sourceType: "LevyPayment", status: "ACCRUED", occurredAt: "2026-10-01T00:00:00.000Z", exGstCents: 100, gstCents: 10, totalCents: 110, payerType: "OC", recoverableFromOwner: false, invoiced: false },
        { id: "e2", code: "RECOVERY_STEP", description: "Reminder", sourceType: "DebtRecoveryStep", status: "ACCRUED", occurredAt: "2026-10-02T00:00:00.000Z", exGstCents: 100, gstCents: 10, totalCents: 110, payerType: "OWNER_VIA_OC", recoverableFromOwner: true, invoiced: false },
        { id: "e3", code: "RECOVERY_STEP", description: "Payment plan", sourceType: "PaymentPlan", status: "ACCRUED", occurredAt: "2026-10-03T00:00:00.000Z", exGstCents: 100, gstCents: 10, totalCents: 110, payerType: "OC", recoverableFromOwner: false, invoiced: false },
      ],
      invoices: [],
      schedule,
      referralIncome: null,
      // The NSW fee words, as getPlatformFeesData now adds them (added after the snapshots were recorded on main).
      wording: feeWordingFor(statutoryRulesFor("NSW")),
    };
    expect(renderToStaticMarkup(<PlatformFeesView data={data as never} />)).toMatchSnapshot();
  });
});

describe("NSW resolution reasons (golden)", () => {
  it("are as before", () => {
    const rules = statutoryRulesFor("NSW").MEETING_RULES;
    const out = (["ORDINARY", "SPECIAL", "UNANIMOUS"] as const).flatMap((c) =>
      [
        { forCount: 3, againstCount: 1, forUE: 30, againstUE: 10, poll: true },
        { forCount: 1, againstCount: 3, forUE: 10, againstUE: 30, poll: true },
        { forCount: 3, againstCount: 1 },
        { forCount: 3, againstCount: 1, forUE: 30, againstUE: 10 },
      ].map((t) => evaluateResolution(rules, c as never, t)),
    );
    expect(out).toMatchSnapshot();
  });
});
