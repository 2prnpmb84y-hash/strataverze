/**
 * NSW and Queensland debt recovery screens, golden (VIC, ACT and WA stage 2,
 * PR 9a, 29 Oct 2026). Recorded on the step order fix (b964e1e) in a
 * temporary worktree, before the shared debt recovery engine for the draft
 * packs (the gates, the authority check, the forum and the WA pack) was
 * added, and before the adviser case page could pass a step's extra fields.
 * The markup, the props the pages pass and the tables they read for an NSW
 * and a Queensland building must stay exactly the same. Never regenerate
 * these snapshots to make a change pass: a difference is a change to NSW or
 * Queensland debt recovery.
 *
 * Covered: the adviser case page (DebtRecoveryCaseDetailPage and
 * CaseDetailClient) at the current step (a step with a notice type, and the
 * fee disclosure), then each step of the case in turn (the completed steps,
 * the approval required badge, the steps still to come), with the props the
 * page passes and the tables it reads; the adviser debt recovery list with
 * Queensland's proceedings warning; the owner debt recovery list for an
 * owner and for the committee, and the owner case page for the committee and
 * the debtor (NSW and Queensland). The date is fixed at 2 Nov 2026.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { ReactElement } from "react";
import type { PriceBookEntry } from "@/lib/billing/price-book";

const state = vi.hoisted(() => ({
  profile: { id: "adviser" } as { id: string },
  scheme: null as Record<string, unknown> | null,
  committeeSchemes: [] as Array<{ id: string; name: string; state: string }>,
  ownerSchemes: [] as unknown[],
  tablesRead: [] as string[],
}));

vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
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
vi.mock("@/prisma/db", async () => {
  const { sharedFake } = await import("@/test/fake-orm");
  // Every table a page reads is recorded, to show no new read for NSW or Queensland.
  const publicTables = new Proxy({} as Record<string, unknown>, {
    get: (_t, name: string) => {
      state.tablesRead.push(name);
      return (sharedFake.db.orm.public as Record<string, unknown>)[name];
    },
  });
  return { db: { ...sharedFake.db, orm: { ...sharedFake.db.orm, public: publicTables } } };
});
vi.mock("@/lib/queries/profiles", () => ({ getCurrentProfile: vi.fn(async () => state.profile) }));
vi.mock("@/lib/queries/schemes", () => ({
  getSchemeById: vi.fn(async () => state.scheme),
  getSchemesForCommittee: vi.fn(async () => state.committeeSchemes),
  getSchemesForOwner: vi.fn(async () => state.ownerSchemes),
}));
vi.mock("@/lib/owner/selected-scheme", () => ({
  getVerifiedSelectedSchemeId: vi.fn(async () => null),
  getSelectedOwnerScheme: vi.fn(async () => null),
}));
vi.mock("@/lib/jurisdiction/scheme-time", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/scheme-time")>("@/lib/jurisdiction/scheme-time");
  return { ...actual, schemeToday: vi.fn(async () => "2026-11-02") };
});
vi.mock("@/lib/jurisdiction/time-zone", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/time-zone")>("@/lib/jurisdiction/time-zone");
  return { ...actual, todayIn: () => "2026-11-02", platformToday: () => "2026-11-02" };
});
vi.mock("@/lib/actions/debt-recovery", () => ({
  completeDebtRecoveryStepAction: vi.fn(),
  closeDebtRecoveryCaseAction: vi.fn(),
  addDebtRecoveryNoteAction: vi.fn(),
  recordInstalmentPaymentAction: vi.fn(),
  initiateDebtRecoveryAction: vi.fn(),
  updateDebtRecoveryCaseAction: vi.fn(),
}));
vi.mock("@/lib/audit/security-audit", () => ({ recordSecurityEventLater: vi.fn(async () => {}) }));

const { sharedFake } = await import("@/test/fake-orm");
const { RULE_PACKS } = await import("@/config/statutory");
const { TEST_PRICE_BOOK } = await import("@/lib/billing/test-price-book");
const { default: AdviserCasePage } = await import("@/app/(portal)/adviser/schemes/[id]/finance/debt-recovery/[caseId]/page");
const { default: AdviserListPage } = await import("@/app/(portal)/adviser/schemes/[id]/finance/debt-recovery/page");
const { default: OwnerListPage } = await import("@/app/(portal)/owner/(scheme)/levies/debt-recovery/page");
const { default: OwnerCasePage } = await import("@/app/(portal)/owner/(scheme)/levies/debt-recovery/[caseId]/page");

type St = "NSW" | "QLD";
const STATES: readonly St[] = ["NSW", "QLD"];
const SCHEME: Record<St, { id: string; name: string; timeZone: string }> = {
  NSW: { id: "nsw-1", name: "Harbour View", timeZone: "Australia/Sydney" },
  QLD: { id: "qld-1", name: "Eagle Place", timeZone: "Australia/Brisbane" },
};

const env = { capture: process.env.PLATFORM_BILLING_CAPTURE, gst: process.env.STRATAVERZE_GST_REGISTERED };
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-02T01:00:00.000Z"));
  process.env.PLATFORM_BILLING_CAPTURE = "on";
  process.env.STRATAVERZE_GST_REGISTERED = "on";
});
afterAll(() => {
  vi.useRealTimers();
  if (env.capture === undefined) delete process.env.PLATFORM_BILLING_CAPTURE;
  else process.env.PLATFORM_BILLING_CAPTURE = env.capture;
  if (env.gst === undefined) delete process.env.STRATAVERZE_GST_REGISTERED;
  else process.env.STRATAVERZE_GST_REGISTERED = env.gst;
});
afterEach(() => cleanup());

const BOOK: PriceBookEntry[] = [
  ...TEST_PRICE_BOOK,
  { gstInclusive: false, effectiveFrom: "2026-01-01", isActive: true, code: "RECOVERY_STEP", variant: "FINAL_NOTICE", description: "Debt recovery step: final notice", amountCents: 3000, unit: "PER_STEP", payerType: "OWNER_VIA_OC", recoverableFromOwner: true },
];
const PRICE_BOOK = BOOK.map((e, i) => ({
  id: `pb-${i}`,
  code: e.code,
  variant: e.variant ?? null,
  description: e.description,
  amount: e.amountCents == null ? null : (e.amountCents / 100).toFixed(2),
  gstInclusive: e.gstInclusive,
  unit: e.unit,
  payerType: e.payerType,
  effectiveFrom: e.effectiveFrom,
  effectiveTo: null,
  isActive: e.isActive,
  recoverableFromOwner: e.recoverableFromOwner ?? false,
  bandMin: e.bandMin ?? null,
  bandMax: e.bandMax ?? null,
}));

/** The case's steps from the pack: those before FINAL_NOTICE complete (with a notice where the step has one), FINAL_NOTICE current. */
function caseSteps(st: St) {
  const steps = RULE_PACKS[st].rules.DEBT_RECOVERY_STEPS!;
  const current = steps.find((s) => s.stepType === "FINAL_NOTICE")!.stepOrder;
  return steps.map(({ status: _ruleStatus, ...s }) => {
    const done = s.stepOrder < current;
    return {
      ...s,
      noticeType: s.noticeType ?? null,
      id: `step-${String(s.stepOrder).padStart(2, "0")}`,
      caseId: "case-1",
      status: done ? "COMPLETED" : "PENDING",
      completedAt: done ? "2026-10-20T03:00:00.000Z" : null,
      completedBy: done ? "adviser" : null,
      outcome: done ? `${s.stepType} done` : null,
      evidenceNotes: done ? `Evidence for ${s.stepType}` : null,
      noticeMethod: done && s.noticeType ? "REGISTERED_POST" : null,
      noticeSentAt: done && s.noticeType ? "2026-10-20T03:00:00.000Z" : null,
    };
  });
}

function seed(st: St, opts: { profile?: string; caseStatus?: string } = {}) {
  const s = SCHEME[st];
  const lot = { id: "lot-1", schemeId: s.id, lotNumber: "1", unitNumber: "3", entitlement: 40 };
  const memberships = [
    { id: "m-adviser", schemeId: s.id, lotId: null, profileId: "adviser", role: "ADVISER", isActive: true, endDate: null, profile: { firstName: "Ada", lastName: "Viser" } },
    { id: "m-chair", schemeId: s.id, lotId: null, profileId: "chair", role: "COMMITTEE", isActive: true, endDate: null, profile: { firstName: "Cher", lastName: "Chair" } },
    { id: "m-owner", schemeId: s.id, lotId: "lot-1", profileId: "debtor", role: "OWNER", isActive: true, endDate: null, profile: { firstName: "Dee", lastName: "Btor" } },
  ];
  state.scheme = { id: s.id, name: s.name, state: st, timeZone: s.timeZone, lots: [lot], memberships };
  state.profile = { id: opts.profile ?? "adviser" };
  state.committeeSchemes = [];
  state.ownerSchemes = [];
  sharedFake.reset({
    Scheme: [{ id: s.id, name: s.name, state: st, planNumber: "SP 1", timeZone: s.timeZone, isActive: true }],
    Lot: [lot, { id: "lot-7", schemeId: s.id, lotNumber: "7", unitNumber: null, entitlement: 10 }],
    SchemeMembership: memberships.map(({ profile: _p, ...m }) => m),
    LevyNotice: [
      { id: "n-1", schemeId: s.id, lotId: "lot-1", status: "OVERDUE", dueDate: "2026-07-01", balanceOutstanding: "1200.00", interestCharged: "35.50", lot: { lotNumber: "1" } },
      { id: "n-7", schemeId: s.id, lotId: "lot-7", status: "OVERDUE", dueDate: "2024-10-27", balanceOutstanding: "500.00", interestCharged: null, lot: { lotNumber: "7" } },
    ],
    DebtRecoveryCase: [
      {
        id: "case-1",
        schemeId: s.id,
        lotId: "lot-1",
        ownerId: "debtor",
        caseNumber: "DR-2026-0001",
        status: opts.caseStatus ?? "IN_PROGRESS",
        priority: "HIGH",
        currentStep: "FINAL_NOTICE",
        principalOwed: "1200.00",
        interestOwed: "35.50",
        costsOwed: "0.00",
        totalOwed: "1235.50",
        notes: "Called twice",
        solicitorRef: null,
        solicitorName: null,
        courtFileNumber: null,
        excludeFromRecovery: false,
        exclusionReason: null,
        hasDispute: false,
        disputeDetails: null,
        hasHardshipRequest: true,
        hardshipDetails: "Lost work",
        createdAt: "2026-10-01T02:00:00.000Z",
        closedAt: null,
        closedReason: null,
        rulePack: `AU-${st} test`,
      },
    ],
    DebtRecoveryStep: caseSteps(st),
    DebtRecoveryDocument: [
      { id: "doc-1", caseId: "case-1", documentType: "REMINDER_LETTER", title: "Reminder", isDraft: false, createdAt: "2026-10-05T02:00:00.000Z", issuedAt: "2026-10-05T02:00:00.000Z" },
    ],
    DebtRecoveryActivity: [{ id: "act-1", caseId: "case-1", activityType: "CASE_OPENED", description: "Case opened", performedBy: "adviser", createdAt: "2026-10-01T02:00:00.000Z" }],
    PaymentPlan: [],
    PaymentPlanInstalment: [],
    ProceedingsDeadlineReminder: [],
    PlatformPriceBook: PRICE_BOOK,
    Profile: [],
  });
  state.tablesRead = [];
}

const tablesRead = () => [...new Set(state.tablesRead)].sort();
/** The element's props as plain data (functions named). */
const plainProps = (el: ReactElement) => JSON.parse(JSON.stringify(el.props, (_k, v) => (typeof v === "function" ? `[function ${v.name}]` : v)));

describe("the adviser case page", () => {
  for (const st of STATES) {
    it(`${st}: the props, the page at the current step, each step in turn, and the tables read`, async () => {
      seed(st);
      const el = (await AdviserCasePage({ params: Promise.resolve({ id: SCHEME[st].id, caseId: "case-1" }) })) as ReactElement;
      const reads = tablesRead();
      const { container } = render(el);
      const page = container.innerHTML;
      const labels = [...container.querySelectorAll("div.mt-2.hidden button")] as HTMLElement[];
      const stepCards: Record<string, string> = {};
      labels.forEach((button, i) => {
        fireEvent.click(button);
        const card = container.querySelector(".lg\\:col-span-2")!;
        stepCards[`${String(i + 1).padStart(2, "0")} ${button.textContent}`] = card.innerHTML;
      });
      expect({ props: plainProps(el), tablesRead: reads }).toMatchSnapshot("props");
      expect(page).toMatchSnapshot("page");
      expect(stepCards).toMatchSnapshot("steps");
    });

    it(`${st}: a closed case at its current step`, async () => {
      seed(st, { caseStatus: "CLOSED_PAID" });
      const el = (await AdviserCasePage({ params: Promise.resolve({ id: SCHEME[st].id, caseId: "case-1" }) })) as ReactElement;
      expect(renderToStaticMarkup(el)).toMatchSnapshot();
    });
  }
});

describe("the adviser debt recovery list", () => {
  for (const st of STATES) {
    it(`${st}: the list (Queensland with its proceedings warning) and the tables read`, async () => {
      seed(st);
      const html = renderToStaticMarkup(await AdviserListPage({ params: Promise.resolve({ id: SCHEME[st].id }) }));
      expect({ html, tablesRead: tablesRead() }).toMatchSnapshot();
    });
  }
});

describe("the owner screens", () => {
  for (const st of STATES) {
    it(`${st}: the owner list, for the debtor and for the committee`, async () => {
      seed(st, { profile: "debtor" });
      state.ownerSchemes = [{ id: SCHEME[st].id, name: SCHEME[st].name, state: st, timeZone: SCHEME[st].timeZone, memberships: [{ lotId: "lot-1", lot: { lotNumber: "1", unitNumber: "3" } }] }];
      const debtor = renderToStaticMarkup(await OwnerListPage());
      seed(st, { profile: "chair" });
      state.committeeSchemes = [{ id: SCHEME[st].id, name: SCHEME[st].name, state: st }];
      const committee = renderToStaticMarkup(await OwnerListPage());
      expect({ debtor, committee }).toMatchSnapshot();
    });

    it(`${st}: the owner case page, for the committee and for the debtor`, async () => {
      seed(st, { profile: "chair" });
      const committee = renderToStaticMarkup((await OwnerCasePage({ params: Promise.resolve({ caseId: "case-1" }) })) as ReactElement);
      const committeeReads = tablesRead();
      seed(st, { profile: "debtor" });
      const debtor = renderToStaticMarkup((await OwnerCasePage({ params: Promise.resolve({ caseId: "case-1" }) })) as ReactElement);
      expect({ committee, debtor, committeeReads, debtorReads: tablesRead() }).toMatchSnapshot();
    });
  }
});
