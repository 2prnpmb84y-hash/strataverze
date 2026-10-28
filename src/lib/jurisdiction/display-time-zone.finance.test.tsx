/**
 * The finance screens that are client components show times in the
 * building's time zone, passed in by their server page (display time zone
 * fix, 28 Oct 2026): the audit trail, the committee pack, the cutover and a
 * debt recovery case. Tests run with TZ=UTC, as the server does, so a screen
 * that formatted an instant in the process's own zone would show UTC's hour
 * (and, rendered again in the browser, the viewer's, so the two could differ).
 * Calendar days (a due date, a cutover date, a last reconciled date) are shown
 * as they are stored, in every zone.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { statutoryRulesFor } from "@/config/statutory";
import { auditLabelWords, packWordsFor } from "@/lib/jurisdiction/screen-words";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }), usePathname: () => "/" }));
vi.mock("@/app/(portal)/adviser/schemes/[id]/finance/actions", () => ({ exportAuditTrailAction: vi.fn() }));
vi.mock("@/app/(portal)/adviser/schemes/[id]/finance/migration/actions", () => new Proxy({}, { get: (_t, name) => (name === "then" ? undefined : vi.fn()) }));
vi.mock("@/lib/actions/debt-recovery", () => ({ completeDebtRecoveryStepAction: vi.fn(), closeDebtRecoveryCaseAction: vi.fn(), addDebtRecoveryNoteAction: vi.fn() }));

const { AuditTrailClient } = await import("@/app/(portal)/adviser/schemes/[id]/finance/reports/audit-trail/audit-trail-client");
const { CommitteePackClient } = await import("@/app/(portal)/adviser/schemes/[id]/finance/reports/committee-pack/committee-pack-client");
const { CutoverClient } = await import("@/app/(portal)/adviser/schemes/[id]/finance/migration/cutover/cutover-client");
const { CaseDetailClient } = await import("@/app/(portal)/adviser/schemes/[id]/finance/debt-recovery/[caseId]/case-detail-client");

/** 2026-10-28T14:30:00Z: 29 Oct 2026, 1:30 am in Sydney (AEDT, +11) and 28 Oct 2026, 10:30 pm in Perth (+8). */
const AT = "2026-10-28T14:30:00.000Z";
/** A calendar day (a date column). */
const DAY = "2026-11-05";
const SYDNEY = "Australia/Sydney";
const PERTH = "Australia/Perth";

const NSW = statutoryRulesFor("NSW");
const AUDIT_WORDS = auditLabelWords(NSW);
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const count = (s: string, part: string) => s.split(part).length - 1;

/**
 * Runs `fn` with the process in a zone west of UTC, as a browser in Los
 * Angeles would render a client component (Node applies a TZ change at
 * runtime). A calendar day read at UTC midnight and shown in the local zone
 * would show there as the day before.
 */
function westOfUtc<T>(fn: () => T): T {
  const before = process.env.TZ;
  process.env.TZ = "America/Los_Angeles";
  try {
    // Check the change took effect, so the guard cannot pass vacuously.
    expect(new Date("2026-11-05T00:00:00Z").getDate()).toBe(4);
    return fn();
  } finally {
    process.env.TZ = before;
  }
}

afterEach(() => cleanup());

describe("the audit trail", () => {
  const rows = [{ id: "r1", createdAt: AT, actorName: "Ann Lee", actorEmail: "a@x", action: "INTEREST_CHARGED", entityType: "LevyNotice", entityId: "n1", metadata: null }];
  const show = (timeZone: string) =>
    text(renderToStaticMarkup(<AuditTrailClient schemeId="s1" rows={rows} page={1} hasMore={false} actors={[]} filters={{}} words={AUDIT_WORDS} timeZone={timeZone} />));

  it("shows when each entry was recorded in the building's time zone", () => {
    expect(show(SYDNEY)).toContain("29 Oct 2026 01:30 am");
    expect(show(PERTH)).toContain("28 Oct 2026 10:30 pm");
  });
});

describe("the committee pack", () => {
  const pack = {
    schemeName: "Harbour View",
    reportDate: AT,
    periodLabel: "FY 2026/27",
    startDate: "2026-07-01",
    endDate: "2027-06-30",
    fundSummaries: [],
    totalFundBalance: 0,
    arrearsSnapshot: { current: 0, days30: 0, days60: 0, days90: 0, days90Plus: 0, total: 0, lotCount: 0 },
    budgetComparisons: [],
    bankSummaries: [{ bankAccountName: "Operating", closingBalance: 300, unmatchedCount: 0, lastReconciledDate: DAY }],
    recentActivity: [{ action: "INTEREST_CHARGED", entityType: "LevyNotice", actorName: "Ann Lee", createdAt: AT }],
    levyCollectionRate: 0,
    cashPosition: 0,
  };
  const show = (timeZone: string) =>
    text(
      renderToStaticMarkup(
        <CommitteePackClient schemeId="s1" financialYear={2026} fyOptions={[{ value: "2026", label: "FY 2026/2027" }]} startDate="2026-07-01" endDate="2027-06-30" pack={pack} catalogue={NSW.FUND_CATALOGUE} words={AUDIT_WORDS} timeZone={timeZone} />,
      ),
    );

  it("shows the activity times and when it was generated in the building's time zone", () => {
    const sydney = show(SYDNEY);
    expect(sydney).toContain("29 Oct 2026 01:30 am");
    expect(sydney).toContain("Report generated 29 Oct 2026 at 01:30 am");
    expect(sydney).not.toContain("28 Oct 2026");
    const perth = show(PERTH);
    expect(perth).toContain("28 Oct 2026 10:30 pm");
    expect(perth).toContain("Report generated 28 Oct 2026 at 10:30 pm");
    expect(perth).not.toContain("29 Oct 2026");
  });

  it("shows the last reconciled date (a calendar day) as it is stored", () => {
    expect(show(SYDNEY)).toContain("Last Reconciled 05 Nov 2026");
    expect(show(PERTH)).toContain("Last Reconciled 05 Nov 2026");
    const west = westOfUtc(() => show(SYDNEY));
    expect(west).toContain("Last Reconciled 05 Nov 2026");
    expect(west).not.toContain("04 Nov 2026");
  });
});

describe("the cutover", () => {
  const view = {
    id: "c1",
    sourceLabel: "StrataMax",
    template: null,
    cutoverDate: DAY,
    status: "EXECUTED",
    staged: [],
    files: [],
    rowProblems: [],
    readiness: { trialBalance: { balanced: true, debitCents: 0, creditCents: 0, lines: 0 }, tieOuts: [], problems: [], canSignOff: false },
    signOff: { signedOffBy: "p1", signedOffByName: "Ann Lee", signedOffAt: AT, sourceSystem: "stratamax", cutoverDate: DAY, files: [], acknowledgedDifferences: [], note: null },
    results: { entryNumber: "JE-0001", openingLines: 4, notices: 2, invoices: 1, credits: 1, bankAccounts: 1 },
    executedAt: AT,
    executedByName: "Ann Lee",
  };
  const labels = { opening_balances: "Opening trial balance", levy_arrears: "Outstanding levy notices", unpaid_invoices: "Unpaid supplier invoices", owner_credits: "Owner credit balances", bank_balances: "Bank reconciled balances" };
  const show = (timeZone: string) =>
    text(
      renderToStaticMarkup(
        <CutoverClient schemeId="s1" sources={[]} batches={[]} view={view as never} labels={labels} fields={{}} funds={{}} words={packWordsFor(NSW)} timeZone={timeZone} />,
      ),
    );

  it("shows when it was executed and signed off in the building's time zone, and the cutover date as stored", () => {
    const sydney = show(SYDNEY);
    expect(sydney).toContain("Executed 29/10/2026, 1:30:00 am by Ann Lee.");
    expect(sydney).toContain("Signed off by Ann Lee on 29/10/2026, 1:30:00 am, cutover 5 Nov 2026.");
    const perth = show(PERTH);
    expect(perth).toContain("Executed 28/10/2026, 10:30:00 pm by Ann Lee.");
    expect(perth).toContain("Signed off by Ann Lee on 28/10/2026, 10:30:00 pm, cutover 5 Nov 2026.");
  });
});

describe("a debt recovery case", () => {
  const props = (timeZone: string) => ({
    timeZone,
    schemeId: "s1",
    lotNumber: "1",
    unitNumber: null,
    ownerName: "Ann Lee",
    stepGuidance: NSW.DEBT_RECOVERY_GUIDANCE ?? {},
    stepLabels: NSW.DEBT_RECOVERY_STEP_LABELS ?? {},
    lateChargeLabel: "Interest",
    paymentPlans: true,
    paymentPlanLabel: "Payment Plan",
    debtCase: {
      id: "dc1",
      caseNumber: "DR-1",
      lotId: "l1",
      ownerId: "o1",
      status: "OPEN",
      priority: "NORMAL",
      principalOwed: 100,
      interestOwed: 0,
      costsOwed: 0,
      totalOwed: 100,
      currentStep: "REMINDER",
      notes: null,
      solicitorRef: null,
      solicitorName: null,
      courtFileNumber: null,
      excludeFromRecovery: false,
      exclusionReason: null,
      createdAt: AT,
      closedAt: null,
      closedReason: null,
    },
    steps: [
      {
        id: "st1",
        stepType: "REMINDER",
        stepOrder: 1,
        actionRequired: "Send a reminder",
        legalBasis: null,
        responsibleParty: "ADVISER",
        approvalRequired: false,
        status: "COMPLETED",
        completedAt: AT,
        outcome: null,
        evidenceNotes: null,
        noticeType: null,
        noticeMethod: "EMAIL",
        noticeSentAt: AT,
      },
    ],
    paymentPlan: { id: "pp1", totalAmount: 100, instalmentAmount: 50, frequency: "MONTHLY", startDate: DAY, endDate: DAY, numberOfInstalments: 2, status: "ACTIVE", requestId: null },
    instalments: [{ id: "in1", instalmentNumber: 1, dueDate: DAY, amount: 50, status: "PENDING", amountPaid: null, paidAt: null }],
    documents: [{ id: "doc1", documentType: "REMINDER_LETTER", title: "Reminder", isDraft: false, createdAt: AT, issuedAt: AT }],
    activities: [{ id: "a1", activityType: "NOTE", description: "Called the owner", createdAt: AT }],
  });

  function show(timeZone: string) {
    cleanup();
    render(<CaseDetailClient {...props(timeZone)} />);
    const main = document.body.textContent ?? "";
    fireEvent.click(screen.getByRole("button", { name: /Documents/ }));
    const documents = document.body.textContent ?? "";
    fireEvent.click(screen.getByRole("button", { name: /Activity Log/ }));
    const activity = document.body.textContent ?? "";
    fireEvent.click(screen.getByRole("button", { name: /Payment Plan/ }));
    const payment = document.body.textContent ?? "";
    return { main, documents, activity, payment };
  }

  it("shows when it was opened, the step completed and the notice sent in the building's time zone", () => {
    const sydney = show(SYDNEY).main;
    expect(sydney).toContain("Opened29 Oct 2026");
    expect(sydney).toContain("Completed 29 Oct 2026");
    expect(sydney).toContain("on 29 Oct 2026");
    expect(sydney).not.toContain("28 Oct 2026");
    const perth = show(PERTH).main;
    expect(perth).toContain("Opened28 Oct 2026");
    expect(perth).toContain("Completed 28 Oct 2026");
    expect(perth).toContain("on 28 Oct 2026");
    expect(perth).not.toContain("29 Oct 2026");
  });

  it("shows the documents' dates and the activity times in the building's time zone", () => {
    const sydney = show(SYDNEY);
    expect(sydney.documents).toContain("REMINDER LETTER — 29 Oct 2026");
    expect(sydney.activity).toContain("29 Oct 2026, 01:30 am");
    const perth = show(PERTH);
    expect(perth.documents).toContain("REMINDER LETTER — 28 Oct 2026");
    expect(perth.activity).toContain("28 Oct 2026, 10:30 pm");
    expect(count(perth.activity, "29 Oct 2026")).toBe(0);
  });

  it("shows an instalment's due date (a calendar day) as it is stored", () => {
    expect(show(SYDNEY).payment).toContain("5 Nov 2026");
    expect(show(PERTH).payment).toContain("5 Nov 2026");
    const west = westOfUtc(() => show(SYDNEY).payment);
    expect(west).toContain("5 Nov 2026");
    expect(west).not.toContain("4 Nov 2026");
  });
});
