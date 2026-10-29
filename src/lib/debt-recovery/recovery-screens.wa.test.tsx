/**
 * The adviser case page under the Western Australian draft pack (VIC, ACT and
 * WA stage 2, PR 9a), as if it were switched on: the Decision to Start
 * Proceedings step asks for the meeting and the motion (council and general
 * meetings with carried motions), the Proceedings step for where proceedings
 * were started (a court; SAT and the Magistrates Court limits shown to
 * advisers as notes only), and a completed step shows what the case records.
 * The owner case page never names SAT or the Magistrates Court.
 */
import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { ReactElement } from "react";

const state = vi.hoisted(() => ({ profile: { id: "adviser" } as { id: string }, scheme: null as Record<string, unknown> | null }));

vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("@/lib/queries/profiles", () => ({ getCurrentProfile: vi.fn(async () => state.profile) }));
vi.mock("@/lib/queries/schemes", () => ({ getSchemeById: vi.fn(async () => state.scheme) }));
vi.mock("@/lib/actions/debt-recovery", () => ({
  completeDebtRecoveryStepAction: vi.fn(),
  closeDebtRecoveryCaseAction: vi.fn(),
  addDebtRecoveryNoteAction: vi.fn(),
  recordInstalmentPaymentAction: vi.fn(),
}));
vi.mock("@/lib/jurisdiction/scheme-rules", async (orig) => {
  const actual = await orig<typeof import("@/lib/jurisdiction/scheme-rules")>();
  const { PENDING_RULE_PACKS } = await import("@/config/statutory");
  const wa = PENDING_RULE_PACKS.WA;
  const rules = wa.rules as unknown as import("@/config/statutory").StatutoryRules;
  const waRules = () => ({ pack: { code: wa.code, state: wa.state, name: wa.name, version: wa.version, reviewer: wa.reviewer, reviewedOn: null, rules }, rules, label: `${wa.code} ${wa.version}` });
  return { ...actual, rulesForScheme: async () => waRules(), rulesForState: (s: string) => (s === "WA" ? waRules() : actual.rulesForState(s)) };
});

const { sharedFake } = await import("@/test/fake-orm");
const { PENDING_RULE_PACKS } = await import("@/config/statutory");
const { default: AdviserCasePage } = await import("@/app/(portal)/adviser/schemes/[id]/finance/debt-recovery/[caseId]/page");
const { default: OwnerCasePage } = await import("@/app/(portal)/owner/(scheme)/levies/debt-recovery/[caseId]/page");

const STEPS = PENDING_RULE_PACKS.WA.rules.DEBT_RECOVERY_STEPS;
const order = (t: string) => STEPS.find((s) => s.stepType === t)!.stepOrder;

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-02T01:00:00.000Z"));
});
afterAll(() => vi.useRealTimers());
afterEach(() => cleanup());

function seed(current: string, records: Record<string, unknown>[] = []) {
  const memberships = [
    { id: "m-adviser", schemeId: "wa-1", lotId: null, profileId: "adviser", role: "ADVISER", isActive: true, profile: { firstName: "Ada", lastName: "Viser" } },
    { id: "m-chair", schemeId: "wa-1", lotId: null, profileId: "chair", role: "COMMITTEE", isActive: true, profile: { firstName: "Cher", lastName: "Chair" } },
    { id: "m-owner", schemeId: "wa-1", lotId: "lot-1", profileId: "debtor", role: "OWNER", isActive: true, profile: { firstName: "Dee", lastName: "Btor" } },
  ];
  state.scheme = { id: "wa-1", name: "Swan View", state: "WA", timeZone: "Australia/Perth", lots: [{ id: "lot-1", lotNumber: "1", unitNumber: null }], memberships };
  sharedFake.reset({
    Scheme: [{ id: "wa-1", name: "Swan View", state: "WA", timeZone: "Australia/Perth" }],
    SchemeMembership: memberships.map(({ profile: _p, ...m }) => m),
    Meeting: [
      { id: "council", schemeId: "wa-1", meetingType: "COMMITTEE", title: "Council meeting", scheduledAt: "2026-10-20T02:00:00.000Z", timezone: null },
      { id: "agm", schemeId: "wa-1", meetingType: "AGM", title: "Annual general meeting", scheduledAt: "2026-10-10T02:00:00.000Z", timezone: null },
    ],
    AgendaItem: [
      { id: "c-carried", meetingId: "council", position: 1, title: "Start proceedings for lot 1", status: "CARRIED", outcome: "RESOLVED" },
      { id: "c-lost", meetingId: "council", position: 2, title: "Something else", status: "LOST", outcome: "MOTION_LOST" },
      { id: "g-carried", meetingId: "agm", position: 3, title: "Recover arrears", status: "CARRIED", outcome: "RESOLVED" },
    ],
    DebtRecoveryCase: [
      { id: "case-1", schemeId: "wa-1", lotId: "lot-1", ownerId: "debtor", caseNumber: "DR-1", status: "IN_PROGRESS", priority: "NORMAL", currentStep: current, principalOwed: "1200", interestOwed: "35.50", costsOwed: "0", totalOwed: "1235.50", createdAt: "2026-10-01T02:00:00.000Z" },
    ],
    DebtRecoveryStep: STEPS.map(({ status: _r, ...s }) => ({ ...s, noticeType: s.noticeType ?? null, id: `step-${s.stepOrder}`, caseId: "case-1", status: s.stepOrder < order(current) ? "COMPLETED" : "PENDING", completedAt: s.stepOrder < order(current) ? "2026-10-25T02:00:00.000Z" : null })),
    DebtRecoveryDocument: [],
    DebtRecoveryActivity: [],
    PaymentPlan: [],
    DebtRecoveryRecord: records,
    PendingResolution: [],
  });
}

const adviserPage = async () => renderToStaticMarkup((await AdviserCasePage({ params: Promise.resolve({ id: "wa-1", caseId: "case-1" }) })) as ReactElement);
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

describe("the WA adviser case page", () => {
  it("asks for the council or general meeting decision at the Decision to Start Proceedings step", async () => {
    state.profile = { id: "adviser" };
    seed("COMMITTEE_REVIEW");
    const html = await adviserPage();
    expect(text(html)).toContain("The decision to start proceedings: a motion carried at a council meeting or a motion carried at a general meeting.");
    expect(html).toContain('id="authority-meeting-step-6"');
    expect(html).toContain("Annual general meeting (10 Oct 2026)");
    expect(html).toContain("Council meeting (20 Oct 2026)");
    // Motions appear once a meeting is chosen; none is offered before.
    expect(html).not.toContain("Start proceedings for lot 1</option>");
    expect(html).not.toContain('id="forum-');
  });

  it("asks where proceedings were started at the Proceedings step, with SAT and the court limits as notes", async () => {
    seed("PROCEEDINGS", [{ id: "r-1", caseId: "case-1", kind: "AUTHORITY_TO_SUE", decidedOn: "2026-10-20", resolutionKind: "COMMITTEE", amount: "1235.50", recordedAt: "2026-10-25T02:00:00.000Z" }]);
    const html = await adviserPage();
    expect(html).toContain('<option value="COURT">a court of competent jurisdiction</option>');
    expect(html).not.toContain('value="SAT"');
    expect(text(html)).toContain("Guidance, not confirmed, never applied: The Act names no particular court.");
    expect(text(html)).toContain("Not the State Administrative Tribunal (SAT): a dispute about an amount owed as a debt is not a scheme dispute (STA s 197(3)(f)).");
    expect(html).not.toContain('id="authority-meeting-');
    // The completed decision step shows what the case records.
    const { container } = render((await AdviserCasePage({ params: Promise.resolve({ id: "wa-1", caseId: "case-1" }) })) as ReactElement);
    const label = [...container.querySelectorAll("div.mt-2.hidden button")].find((b) => b.textContent === "Decision to Start Proceedings") as HTMLElement;
    fireEvent.click(label);
    expect(text(container.innerHTML)).toContain("Decided to start proceedings by a motion carried at a council meeting, which took effect on 20/10/2026, for $1,235.50 owing.");
  });

  it("refuses nothing on the page for a step with no extra fields, and adds no field there", async () => {
    seed("FINAL_NOTICE");
    const html = await adviserPage();
    expect(html).not.toContain('id="authority-meeting-');
    expect(html).not.toContain('id="forum-');
  });
});

describe("the WA owner case page", () => {
  it("never names SAT or the Magistrates Court, and shows the court", async () => {
    state.profile = { id: "chair" };
    seed("PROCEEDINGS");
    const html = text(renderToStaticMarkup((await OwnerCasePage({ params: Promise.resolve({ caseId: "case-1" }) })) as ReactElement));
    expect(html).toContain("a court of competent jurisdiction");
    expect(html).not.toMatch(/\bSAT\b|State Administrative Tribunal|Magistrates/);
  });
});
