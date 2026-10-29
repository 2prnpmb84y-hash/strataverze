/**
 * Owner and adviser screens for a Queensland building (QLD wording go-live,
 * 27 Oct 2026), with the Queensland pack injected as the building's (it was pending then):
 * the lot and roll screens name the contribution schedule lot entitlement,
 * the levy screens say contribution and penalty, a debt recovery case shows a
 * waiver request and no statutory payment plan, the fee views say body
 * corporate and contribution, and a poll is counted by the contribution
 * schedule. NSW keeps its words (the goldens in *.nsw.golden.test.tsx).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const state = vi.hoisted(() => ({
  committeeSchemes: [] as { id: string; name: string; state: string }[],
  ownerSchemes: [] as unknown[],
  ownCases: [] as Record<string, unknown>[],
  schemeCases: [] as Record<string, unknown>[],
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
vi.mock("@/lib/queries/profiles", () => ({ getCurrentProfile: vi.fn(async () => ({ id: "owner-1" })) }));
vi.mock("@/lib/owner/selected-scheme", () => ({
  getVerifiedSelectedSchemeId: vi.fn(async () => null),
  getSelectedOwnerScheme: vi.fn(async () => ({ schemeId: "q1", roles: ["COMMITTEE"] })),
}));
vi.mock("@/lib/queries/schemes", () => ({
  getSchemesForCommittee: vi.fn(async () => state.committeeSchemes),
  getSchemesForOwner: vi.fn(async () => state.ownerSchemes),
  getSchemeById: vi.fn(async () => ({ id: "q1", name: "Eagle Place", planNumber: "777", state: "QLD", timeZone: "Australia/Brisbane" })),
}));
vi.mock("@/lib/queries/debt-recovery", () => ({
  getDebtRecoveryCasesForOwner: vi.fn(async () => state.ownCases),
  getDebtRecoveryCasesForSchemes: vi.fn(async (ids: string[]) => (ids.length ? state.schemeCases : [])),
}));
vi.mock("@/lib/queries/levies", () => ({ getLevyNoticesForLots: vi.fn(async () => state.notices) }));
vi.mock("@/lib/queries/lots", () => ({
  getLotInScheme: vi.fn(async () => ({ id: "l1", lotNumber: "1", unitNumber: null, entitlement: 40, interestScheduleEntitlement: 45 })),
  getStrataRollData: vi.fn(async () => []),
}));
vi.mock("@/lib/queries/lot-workflows", () => ({ getLotDetailExtended: vi.fn(async () => null) }));
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
// A Queensland building has the Queensland pack.
vi.mock("@/lib/jurisdiction/scheme-rules", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/scheme-rules")>("@/lib/jurisdiction/scheme-rules");
  const { QLD_RULE_PACK } = await import("@/config/statutory");
  return {
    ...actual,
    rulesForState: (s: string | null | undefined) => (s === "QLD" ? { pack: null, rules: QLD_RULE_PACK.rules, label: "AU-QLD test" } : actual.rulesForState(s)),
  };
});

const { sharedFake } = await import("@/test/fake-orm");
const { QLD_RULE_PACK, statutoryRulesFor } = await import("@/config/statutory");
type Rules = import("@/config/statutory").StatutoryRules;
const QLD = QLD_RULE_PACK.rules as unknown as Rules;
const NSW = statutoryRulesFor("NSW");
const { caseWordsFor, lotWordsFor, sharedLevyWords } = await import("./screen-words");
const { LotsCard } = await import("@/app/(portal)/adviser/schemes/[id]/_sections/lots-card");
const { StrataRollTable } = await import("@/app/(portal)/adviser/schemes/[id]/strata-roll-table");
const { default: CommitteeLotPage } = await import("@/app/(portal)/owner/(scheme)/scheme/lots/[lotId]/page");
const { default: OwnerDebtRecoveryPage } = await import("@/app/(portal)/owner/(scheme)/levies/debt-recovery/page");
const { CaseDetailOwnerClient } = await import("@/app/(portal)/owner/(scheme)/levies/debt-recovery/[caseId]/case-detail-owner-client");
const { default: OwnerLeviesPage } = await import("@/app/(portal)/owner/(scheme)/levies/page");
const { PlatformFeesView } = await import("@/components/billing/platform-fees-view");
const { feeSchedule } = await import("@/lib/billing/fee-schedule");
const { feeWordingFor, inBuildingWords, toFeeView } = await import("@/lib/billing/disclosure");
const { TEST_PRICE_BOOK } = await import("@/lib/billing/test-price-book");
const { evaluateResolution } = await import("@/lib/meetings/rules");
const { resolveOutcome } = await import("@/lib/meetings/conduct");
const { outcomeDisagreement } = await import("@/lib/meetings/conduct-tally");

const NSW_WORDS = /\b(levy|levies|owners corporation|unit entitlement|capital works|hardship request|payment plans?|SSMA|NSW)\b/i;
const visibleText = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'");

const ROW = { id: "l1", lotNumber: "1", unitNumber: null, entitlement: 40, ownerNames: "A", opening: 0, annual: 400, special: 0, paid: 0, closing: 400, interest: 2, financial: true, overdueCents: 0, oldestOverdue: null };
const CASE = {
  id: "c1",
  caseNumber: "DR-1",
  schemeId: "q1",
  lotId: "l1",
  ownerId: "owner-1",
  status: "OPEN",
  currentStep: "HARDSHIP_REVIEW",
  priority: "NORMAL",
  totalOwed: "100",
  principalOwed: "100",
  interestOwed: "0",
  createdAt: "2026-09-01T00:00:00.000Z",
};

beforeEach(() => {
  state.committeeSchemes = [];
  state.ownerSchemes = [];
  state.ownCases = [];
  state.schemeCases = [];
  state.notices = [];
  sharedFake.reset({
    Scheme: [{ id: "q1", name: "Eagle Place", state: "QLD", planNumber: "777", timeZone: "Australia/Brisbane" }],
    SchemeMembership: [{ id: "m1", profileId: "owner-1", schemeId: "q1", lotId: "l1", role: "OWNER", isActive: true }],
    Lot: [{ id: "l1", schemeId: "q1", lotNumber: "1", unitNumber: null, entitlement: 40 }],
  });
});

describe("words from the Queensland pack", () => {
  it("the lot, levy and case words", () => {
    expect(lotWordsFor(QLD)).toEqual({ entitlement: "Contribution Schedule Lot Entitlement", entitlementLabel: "Contribution schedule lot entitlement", levies: "Contributions", lateCharge: "Penalty" });
    expect(lotWordsFor(NSW)).toEqual({ entitlement: "Unit Entitlement", entitlementLabel: "Unit entitlement", levies: "Levies", lateCharge: "Interest" });
    expect(caseWordsFor(QLD)).toEqual({ hardshipRequest: "Waiver Request", paymentPlan: "Payment Arrangement" });
    expect(caseWordsFor(NSW)).toEqual({ hardshipRequest: "Hardship Request", paymentPlan: "Payment Plan" });
  });

  it("a page showing NSW and Queensland buildings together uses words for both", () => {
    expect(sharedLevyWords([QLD, QLD], NSW)).toEqual({ levy: "contribution", levies: "contributions", lateCharge: "penalty", shared: true });
    expect(sharedLevyWords([NSW, QLD], NSW)).toEqual({ levy: "levy or contribution", levies: "levies and contributions", lateCharge: "late payment charge", shared: false });
    expect(sharedLevyWords([], NSW).levies).toBe("levies");
  });
});

describe("lot and roll screens", () => {
  it("name the contribution schedule lot entitlement, contributions and the penalty", () => {
    const html = renderToStaticMarkup(<StrataRollTable rows={[ROW]} schemeId="q1" words={lotWordsFor(QLD)} />) + renderToStaticMarkup(<LotsCard id="q1" rows={[ROW] as never} totalLots={1} words={lotWordsFor(QLD)} />);
    expect(html).toContain(">Contribution Schedule Lot Entitlement<");
    expect(html).toContain(">+Contributions<");
    expect(html).toContain(">+Penalty charged<");
    expect(visibleText(html)).not.toMatch(NSW_WORDS);
  });

  it("the committee's lot page shows both lot entitlements", async () => {
    const html = renderToStaticMarkup(await CommitteeLotPage({ params: Promise.resolve({ lotId: "l1" }) }));
    expect(html).toContain("Contribution schedule lot entitlement</dt>");
    expect(html).toContain("Interest schedule lot entitlement</dt><dd class=\"break-words text-ink\">45</dd>");
    expect(visibleText(html)).not.toMatch(NSW_WORDS);
  });
});

describe("owner debt recovery", () => {
  it("the list names contributions, and has no payment plans", async () => {
    state.committeeSchemes = [{ id: "q1", name: "Eagle Place", state: "QLD" }];
    state.schemeCases = [CASE, { ...CASE, id: "c2", caseNumber: "DR-2", status: "PAYMENT_PLAN" }];
    const html = renderToStaticMarkup(await OwnerDebtRecoveryPage());
    expect(html).toContain("Manage contribution debt recovery cases across your schemes.");
    expect(html).toContain("Back to Contributions");
    expect(html).toContain("Payment Arrangement");
    expect(html).toContain("Waiver Request");
    expect(visibleText(html)).not.toMatch(NSW_WORDS);
  });

  it("the list for NSW and Queensland buildings together names neither alone", async () => {
    sharedFake.table("Scheme").push({ id: "n1", name: "Harbour View", state: "NSW" });
    state.committeeSchemes = [
      { id: "q1", name: "Eagle Place", state: "QLD" },
      { id: "n1", name: "Harbour View", state: "NSW" },
    ];
    const html = renderToStaticMarkup(await OwnerDebtRecoveryPage());
    expect(html).toContain("Manage debt recovery cases across your schemes.");
    expect(html).toContain("Back to Levies and Contributions");
    // The NSW building has the statutory payment plan.
    expect(html).toContain("Payment Plans");
  });

  it("the case page shows a waiver request and a payment arrangement", () => {
    const html = renderToStaticMarkup(
      <CaseDetailOwnerClient
        debtCase={{
          ...CASE,
          status: "PAYMENT_PLAN",
          totalOwed: 100,
          principalOwed: 100,
          interestOwed: 0,
          costsOwed: 0,
          solicitorName: null,
          solicitorRef: null,
          courtFileNumber: null,
          hasDispute: false,
          disputeDetails: null,
          hasHardshipRequest: true,
          hardshipDetails: null,
          notes: null,
          closedAt: null,
          closedReason: null,
          steps: [],
          paymentPlan: { id: "p", totalAmount: 100, instalmentAmount: 50, frequency: "MONTHLY", startDate: "2026-10-01", endDate: "2026-11-01", numberOfInstalments: 2, status: "ACTIVE" },
          instalments: [],
          documents: [],
          activities: [],
        }}
        isCommittee={false}
        recoveryLaw="Qld Body Corporate and Community Management Act 1997"
        stepLabels={QLD.DEBT_RECOVERY_STEP_LABELS!}
        lateChargeLabel="Penalty"
        caseWords={caseWordsFor(QLD)}
      />,
    );
    expect(html).toContain(">Waiver Request<");
    expect(html).toContain("Payment Arrangement");
    expect(visibleText(html)).not.toMatch(NSW_WORDS);
  });

  it("offers the committee Mark Complete only on the current step while it is not complete (step order fix)", () => {
    const step = (stepOrder: number, stepType: string, status: string) => ({
      id: `s${stepOrder}`, stepType, stepOrder, actionRequired: "Do it", legalBasis: null, responsibleParty: "ADVISER", status, completedAt: null, outcome: null, evidenceNotes: null,
    });
    const page = (currentStep: string, steps: ReturnType<typeof step>[]) =>
      renderToStaticMarkup(
        <CaseDetailOwnerClient
          debtCase={{
            ...CASE, status: "OPEN", currentStep, totalOwed: 100, principalOwed: 100, interestOwed: 0, costsOwed: 0,
            solicitorName: null, solicitorRef: null, courtFileNumber: null, hasDispute: false, disputeDetails: null,
            hasHardshipRequest: false, hardshipDetails: null, notes: null, closedAt: null, closedReason: null,
            steps, paymentPlan: null, instalments: [], documents: [], activities: [],
          }}
          isCommittee
          recoveryLaw="Qld Body Corporate and Community Management Act 1997"
          stepLabels={QLD.DEBT_RECOVERY_STEP_LABELS!}
          lateChargeLabel="Penalty"
          caseWords={caseWordsFor(QLD)}
        />,
      );
    expect(page("ENFORCEMENT", [step(9, "ENFORCEMENT", "PENDING"), step(10, "CLOSED", "PENDING")]).match(/Mark Complete/g)).toHaveLength(1);
    // The last step completed: the case stays at it, and it is not offered again.
    expect(page("CLOSED", [step(9, "ENFORCEMENT", "COMPLETED"), step(10, "CLOSED", "COMPLETED")])).not.toContain("Mark Complete");
  });
});

describe("owner levies", () => {
  it("say contribution and penalty", async () => {
    state.ownerSchemes = [{ id: "q1", name: "Eagle Place", state: "QLD", timeZone: "Australia/Brisbane", memberships: [{ lotId: "l1", lot: { lotNumber: "1", unitNumber: null } }] }];
    state.notices = [
      { id: "n1", lotId: "l1", schemeId: "q1", noticeNumber: "CN-1", status: "ISSUED", dueDate: "2026-09-01", periodStart: "2026-07-01", periodEnd: "2026-09-30", amountDue: "400", amountPaid: "0", balanceOutstanding: "405", interestCharged: "5", fund: { name: "Sinking Fund" }, levySchedule: { levyType: "ANNUAL" } },
      { id: "n2", lotId: "l1", schemeId: "q1", noticeNumber: "CN-2", status: "PAID", dueDate: "2026-08-01", amountDue: "100", amountPaid: "100", balanceOutstanding: "0", interestCharged: "0", levySchedule: { levyType: "SPECIAL", title: "Roof" } },
    ];
    const html = renderToStaticMarkup(await OwnerLeviesPage());
    expect(html).toContain("My Contributions");
    expect(html).toContain("Sinking Fund contribution, Jul–Sep 2026");
    expect(html).toContain("Special contribution: Roof");
    expect(html).toContain("includes $5.00 penalty");
    expect(html).toContain("1 contribution with amounts due.");
    expect(visibleText(html.replace(/Levies and contributions due for your lots\./, ""))).not.toMatch(NSW_WORDS);
  });
});

describe("fee views", () => {
  const quote = (code: string) => {
    const e = TEST_PRICE_BOOK.find((x) => x.code === code)!;
    return { code, variant: e.variant ?? null, description: e.description, exGstCents: 100, gstCents: 10, totalCents: 110, payerType: e.payerType, recoverableFromOwner: e.recoverableFromOwner ?? false } as never;
  };

  it("say body corporate and contribution, and are unchanged for NSW", () => {
    const txn = toFeeView(quote("TXN_FEE"), feeWordingFor(QLD));
    expect(txn.explanation).toBe("StrataVerze's flat service fee for processing this payment. It is charged to the body corporate, never added to an owner's contribution.");
    expect(txn.payerLabel).toBe("Charged to the body corporate");
    expect(toFeeView(quote("TXN_FEE"), feeWordingFor(NSW))).toEqual(toFeeView(quote("TXN_FEE")));
    expect(feeSchedule(TEST_PRICE_BOOK, "2026-07-01", { wording: feeWordingFor(NSW) })).toEqual(feeSchedule(TEST_PRICE_BOOK, "2026-07-01"));
    const rows = feeSchedule(TEST_PRICE_BOOK, "2026-07-01", { wording: feeWordingFor(QLD) });
    expect(rows.map((r) => `${r.explanation} ${r.payerLabel}`).join(" ")).not.toMatch(/\b(levy|levies|owners corporation|SSMA)\b/);
    expect(inBuildingWords("Charged to the owners corporation and recoverable from the owner in arrears (SSMA s 86)", feeWordingFor(QLD))).toBe(
      `Charged to the body corporate and ${QLD.RECOVERY_COSTS_RECOVERABLE}`,
    );
  });

  it("the platform fees page names the building's payments and payer", () => {
    const data = {
      captureEnabled: true,
      today: "2026-10-27",
      subscription: { exists: true, status: "ACTIVE", promotional: false, promotionEnd: null, lotCount: 2, price: { tier: "SMALL", monthlyCents: 9900, gstInclusive: false } },
      uninvoiced: { exGstCents: 0, gstCents: 0, totalCents: 0, count: 0 },
      events: [
        { id: "e1", code: "TXN_FEE", description: "Payment fee", sourceType: "LevyPayment", status: "ACCRUED", occurredAt: "2026-10-01T00:00:00.000Z", exGstCents: 1, gstCents: 0, totalCents: 1, payerType: "OC", recoverableFromOwner: false, invoiced: false },
        { id: "e2", code: "RECOVERY_STEP", description: "Reminder", sourceType: "DebtRecoveryStep", status: "ACCRUED", occurredAt: "2026-10-02T00:00:00.000Z", exGstCents: 1, gstCents: 0, totalCents: 1, payerType: "OWNER_VIA_OC", recoverableFromOwner: true, invoiced: false },
      ],
      invoices: [],
      schedule: feeSchedule(TEST_PRICE_BOOK, "2026-07-01", { wording: feeWordingFor(QLD) }),
      referralIncome: null,
      wording: feeWordingFor(QLD),
    };
    const html = renderToStaticMarkup(<PlatformFeesView data={data as never} />);
    expect(html).toContain("Contribution payment");
    expect(html).toContain("Body corporate, recoverable from owner");
    expect(html).toContain(">the body corporate<");
    expect(html).not.toMatch(/owners corporation|Levy payment|SSMA/i);
  });
});

describe("meeting counts", () => {
  it("name the contribution schedule when a poll decides, and keep the NSW reason", () => {
    const ordinary = QLD.MEETING_RULES;
    const tally = { forCount: 1, againstCount: 2, forUE: 60, againstUE: 40, poll: true };
    expect(evaluateResolution(ordinary, "ORDINARY", tally, "contribution schedule lot entitlement").reason).toBe("Majority by contribution schedule lot entitlement on a poll");
    expect(evaluateResolution(NSW.MEETING_RULES, "ORDINARY", tally).reason).toBe("Majority by unit entitlement on a poll");
    const result = resolveOutcome(ordinary, { requestedOutcome: "MOTION_LOST", resolutionCategory: "ORDINARY", tally, pollEntitlement: "contribution schedule lot entitlement" });
    expect(outcomeDisagreement("MOTION_LOST", result)).toContain("Majority by contribution schedule lot entitlement on a poll.");
  });
});
