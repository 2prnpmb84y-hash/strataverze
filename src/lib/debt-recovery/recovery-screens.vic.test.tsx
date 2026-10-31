/**
 * The adviser case page under the Victorian draft pack (stage 2, PR 9c), as
 * if it were switched on: the Final Notice step shows why it cannot be
 * completed (D3) and cannot be completed; the Authority to Start Proceedings
 * step asks for a special resolution at a general meeting, never a committee
 * meeting (D2); the Proceedings step asks where proceedings were started
 * (VCAT or a court, no limit shown, D13). The owner case page never names the
 * Magistrates Court or a limit.
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
  const vic = PENDING_RULE_PACKS.VIC;
  const rules = vic.rules as unknown as import("@/config/statutory").StatutoryRules;
  const vicRules = () => ({ pack: { code: vic.code, state: vic.state, name: vic.name, version: vic.version, reviewer: vic.reviewer, reviewedOn: null, rules }, rules, label: `${vic.code} ${vic.version}` });
  return { ...actual, rulesForScheme: async () => vicRules(), rulesForState: (s: string) => (s === "VIC" ? vicRules() : actual.rulesForState(s)) };
});

const { sharedFake } = await import("@/test/fake-orm");
const { PENDING_RULE_PACKS } = await import("@/config/statutory");
const { default: AdviserCasePage } = await import("@/app/(portal)/adviser/schemes/[id]/finance/debt-recovery/[caseId]/page");
const { default: OwnerCasePage } = await import("@/app/(portal)/owner/(scheme)/levies/debt-recovery/[caseId]/page");

const STEPS = PENDING_RULE_PACKS.VIC.rules.DEBT_RECOVERY_STEPS;
const order = (t: string) => STEPS.find((s) => s.stepType === t)!.stepOrder;

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-02T01:00:00.000Z"));
});
afterAll(() => vi.useRealTimers());
afterEach(() => cleanup());

function seed(current: string, records: Record<string, unknown>[] = []) {
  const memberships = [
    { id: "m-adviser", schemeId: "vic-1", lotId: null, profileId: "adviser", role: "ADVISER", isActive: true, profile: { firstName: "Ada", lastName: "Viser" } },
    { id: "m-chair", schemeId: "vic-1", lotId: null, profileId: "chair", role: "COMMITTEE", isActive: true, profile: { firstName: "Cher", lastName: "Chair" } },
    { id: "m-owner", schemeId: "vic-1", lotId: "lot-1", profileId: "debtor", role: "OWNER", isActive: true, profile: { firstName: "Dee", lastName: "Btor" } },
  ];
  state.scheme = { id: "vic-1", name: "Yarra View", state: "VIC", timeZone: "Australia/Melbourne", lots: [{ id: "lot-1", lotNumber: "1", unitNumber: null }], memberships };
  sharedFake.reset({
    Scheme: [{ id: "vic-1", name: "Yarra View", state: "VIC", timeZone: "Australia/Melbourne" }],
    SchemeMembership: memberships.map(({ profile: _p, ...m }) => m),
    Meeting: [
      { id: "committee", schemeId: "vic-1", meetingType: "COMMITTEE", status: "MINUTES_DRAFT", title: "Committee meeting", scheduledAt: "2026-10-20T02:00:00.000Z", timezone: null },
      { id: "agm", schemeId: "vic-1", meetingType: "AGM", status: "PUBLISHED", title: "Annual general meeting", scheduledAt: "2026-10-10T02:00:00.000Z", timezone: null },
    ],
    AgendaItem: [
      { id: "c-carried", meetingId: "committee", position: 1, title: "Start proceedings for lot 1", status: "CARRIED", outcome: "RESOLVED" },
      { id: "g-special", meetingId: "agm", position: 3, title: "Recover arrears", status: "CARRIED", outcome: "RESOLVED", resolutionCategory: "SPECIAL" },
    ],
    DebtRecoveryCase: [
      { id: "case-1", schemeId: "vic-1", lotId: "lot-1", ownerId: "debtor", caseNumber: "DR-1", status: "IN_PROGRESS", priority: "NORMAL", currentStep: current, principalOwed: "1200", interestOwed: "0", costsOwed: "0", totalOwed: "1200", createdAt: "2026-10-01T02:00:00.000Z" },
    ],
    DebtRecoveryStep: STEPS.map(({ status: _r, ...s }) => ({ ...s, noticeType: s.noticeType ?? null, id: `step-${s.stepOrder}`, caseId: "case-1", status: s.stepOrder < order(current) ? "COMPLETED" : "PENDING", completedAt: s.stepOrder < order(current) ? "2026-10-25T02:00:00.000Z" : null })),
    DebtRecoveryDocument: [],
    DebtRecoveryActivity: [],
    PaymentPlan: [],
    DebtRecoveryRecord: records,
    PendingResolution: [],
  });
}

const adviserPage = async () => renderToStaticMarkup((await AdviserCasePage({ params: Promise.resolve({ id: "vic-1", caseId: "case-1" }) })) as ReactElement);
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");

describe("the VIC adviser case page", () => {
  it("shows why the Final Notice step cannot be completed, and does not let it be (D3)", async () => {
    state.profile = { id: "adviser" };
    seed("FINAL_NOTICE");
    const html = await adviserPage();
    expect(text(html)).toContain("StrataVerze cannot give the final fee notice yet: it must be in the approved form (Owners corporation final fee notice), which StrataVerze cannot produce yet");
    expect(text(html)).toContain("Recording a final fee notice given outside StrataVerze is refused for now");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Complete Final Notice<\/button>/);
    expect(html).not.toContain('id="final-notice-given-');
  });

  it("asks for a special resolution at a general meeting at the Authority to Start Proceedings step, never a committee meeting (D2)", async () => {
    state.profile = { id: "adviser" };
    seed("COMMITTEE_REVIEW");
    const html = await adviserPage();
    expect(text(html)).toContain("The decision to start proceedings: a special resolution at a general meeting.");
    expect(html).toContain("Annual general meeting (10 Oct 2026)");
    expect(html).not.toContain("Committee meeting (20 Oct 2026)");
    expect(html).not.toContain('id="forum-');
  });

  it("asks where proceedings were started at the Proceedings step, VCAT or a court, with no limit shown (D13)", async () => {
    state.profile = { id: "adviser" };
    seed("PROCEEDINGS", [
      { id: "r-0", caseId: "case-1", kind: "FINAL_NOTICE_GIVEN", decidedOn: "2026-10-01", recordedAt: "2026-10-02T02:00:00.000Z" },
      { id: "r-1", caseId: "case-1", kind: "AUTHORITY_TO_SUE", decidedOn: "2026-10-20", resolutionKind: "SPECIAL", amount: "1200.00", recordedAt: "2026-10-25T02:00:00.000Z" },
    ]);
    const html = await adviserPage();
    expect(html).toContain('<option value="VCAT">VCAT</option>');
    expect(html).toContain('<option value="COURT">any court of competent jurisdiction</option>');
    // No limit is a forum note; the adviser's guidance says only that none is confirmed or applied.
    expect(text(html)).not.toMatch(/Magistrates|never applied|\$\d+,\d{3}\b(?!\.)/);
    expect(text(html)).toContain("Not confirmed: any limit in the VCAT Act (not read). No limit is applied.");
    // The completed steps show what the case records.
    const { container } = render((await AdviserCasePage({ params: Promise.resolve({ id: "vic-1", caseId: "case-1" }) })) as ReactElement);
    const open = (label: string) => fireEvent.click([...container.querySelectorAll("div.mt-2.hidden button")].find((b) => b.textContent === label) as HTMLElement);
    open("Authority to Start Proceedings");
    expect(text(container.innerHTML)).toContain("Decided to start proceedings by a special resolution at a general meeting, which took effect on 20/10/2026, for $1,200.00 owing.");
    open("Final Notice");
    expect(text(container.innerHTML)).toContain("The final fee notice was given on 01/10/2026, outside StrataVerze.");
  });
});

describe("the VIC owner case page", () => {
  it("sends the committee to the adviser's case page for the Final Notice and Authority to Start Proceedings steps", async () => {
    state.profile = { id: "chair" };
    for (const current of ["FINAL_NOTICE", "COMMITTEE_REVIEW", "PROCEEDINGS"]) {
      seed(current);
      const html = renderToStaticMarkup((await OwnerCasePage({ params: Promise.resolve({ caseId: "case-1" }) })) as ReactElement);
      expect(text(html), current).toContain("Complete this step from the adviser's case page.");
      expect(html, current).not.toContain("Mark Complete");
    }
    // A step that records nothing more is marked complete there as before.
    seed("INITIAL_CONTACT");
    expect(renderToStaticMarkup((await OwnerCasePage({ params: Promise.resolve({ caseId: "case-1" }) })) as ReactElement)).toContain("Mark Complete");
  });

  it("never names the Magistrates Court or a limit, and shows VCAT and a court", async () => {
    state.profile = { id: "chair" };
    seed("PROCEEDINGS");
    const html = text(renderToStaticMarkup((await OwnerCasePage({ params: Promise.resolve({ caseId: "case-1" }) })) as ReactElement));
    expect(html).toContain("any court of competent jurisdiction");
    expect(html).toContain("VCAT");
    expect(html).not.toMatch(/Magistrates|limit|guidance/i);
  });
});
