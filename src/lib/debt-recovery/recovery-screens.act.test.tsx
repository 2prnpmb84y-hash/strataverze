/**
 * The adviser case page under the ACT draft pack (stage 2, PR 9b), as if it
 * were switched on: the Decision to Start Proceedings step asks for an
 * executive committee motion or a general meeting ordinary resolution, the
 * Statutory Charge step whether a charge was declared and lodged (and if so
 * the motion and the day), the Proceedings step for a court (ACAT's civil
 * jurisdiction and its limit shown to advisers as notes only), and a lodged
 * charge shows a panel that records its revocation. The owner case page sends
 * the committee to the adviser's page for those steps and never states the
 * ACAT limit, the Magistrates Court or the guidance forum.
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
const recordChargeRevocationAction = vi.hoisted(() => vi.fn(async () => ({ success: true })));
vi.mock("@/lib/actions/debt-recovery", () => ({
  completeDebtRecoveryStepAction: vi.fn(),
  closeDebtRecoveryCaseAction: vi.fn(),
  addDebtRecoveryNoteAction: vi.fn(),
  recordInstalmentPaymentAction: vi.fn(),
  recordChargeRevocationAction,
}));
vi.mock("@/lib/jurisdiction/scheme-rules", async (orig) => {
  const actual = await orig<typeof import("@/lib/jurisdiction/scheme-rules")>();
  const { PENDING_RULE_PACKS } = await import("@/config/statutory");
  const act = PENDING_RULE_PACKS.ACT;
  const rules = act.rules as unknown as import("@/config/statutory").StatutoryRules;
  const actRules = () => ({ pack: { code: act.code, state: act.state, name: act.name, version: act.version, reviewer: act.reviewer, reviewedOn: null, rules }, rules, label: `${act.code} ${act.version}` });
  return { ...actual, rulesForScheme: async () => actRules(), rulesForState: (s: string) => (s === "ACT" ? actRules() : actual.rulesForState(s)) };
});

const { sharedFake } = await import("@/test/fake-orm");
const { PENDING_RULE_PACKS } = await import("@/config/statutory");
const { default: AdviserCasePage } = await import("@/app/(portal)/adviser/schemes/[id]/finance/debt-recovery/[caseId]/page");
const { default: OwnerCasePage } = await import("@/app/(portal)/owner/(scheme)/levies/debt-recovery/[caseId]/page");

const STEPS = PENDING_RULE_PACKS.ACT.rules.DEBT_RECOVERY_STEPS;
const order = (t: string) => STEPS.find((s) => s.stepType === t)!.stepOrder;

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-02T01:00:00.000Z"));
});
afterAll(() => vi.useRealTimers());
afterEach(() => cleanup());

const AUTHORITY = { id: "r-1", caseId: "case-1", kind: "AUTHORITY_TO_SUE", decidedOn: "2026-10-20", resolutionKind: "COMMITTEE", amount: "1235.50", recordedAt: "2026-10-21T02:00:00.000Z" };
const CHARGE = { id: "r-2", caseId: "case-1", kind: "STATUTORY_CHARGE_LODGED", decidedOn: "2026-10-20", lodgedOn: "2026-10-22", resolutionKind: "COMMITTEE", recordedAt: "2026-10-22T02:00:00.000Z" };
const REVOKED = { id: "r-3", caseId: "case-1", kind: "STATUTORY_CHARGE_REVOKED", decidedOn: "2026-10-30", lodgedOn: "2026-10-30", recordedAt: "2026-10-30T02:00:00.000Z" };

function seed(current: string, records: Record<string, unknown>[] = []) {
  const memberships = [
    { id: "m-adviser", schemeId: "act-1", lotId: null, profileId: "adviser", role: "ADVISER", isActive: true, profile: { firstName: "Ada", lastName: "Viser" } },
    { id: "m-chair", schemeId: "act-1", lotId: null, profileId: "chair", role: "COMMITTEE", isActive: true, profile: { firstName: "Cher", lastName: "Chair" } },
    { id: "m-owner", schemeId: "act-1", lotId: "lot-1", profileId: "debtor", role: "OWNER", isActive: true, profile: { firstName: "Dee", lastName: "Btor" } },
  ];
  state.scheme = { id: "act-1", name: "Lake View", state: "ACT", timeZone: "Australia/Sydney", lots: [{ id: "lot-1", lotNumber: "1", unitNumber: null }], memberships };
  sharedFake.reset({
    Scheme: [{ id: "act-1", name: "Lake View", state: "ACT", timeZone: "Australia/Sydney" }],
    SchemeMembership: memberships.map(({ profile: _p, ...m }) => m),
    Meeting: [
      { id: "exec", schemeId: "act-1", meetingType: "COMMITTEE", status: "MINUTES_DRAFT", title: "Executive committee meeting", scheduledAt: "2026-10-20T02:00:00.000Z", timezone: null },
      { id: "agm", schemeId: "act-1", meetingType: "AGM", status: "PUBLISHED", title: "Annual general meeting", scheduledAt: "2026-10-10T02:00:00.000Z", timezone: null },
    ],
    AgendaItem: [
      { id: "e-carried", meetingId: "exec", position: 1, title: "Declare a charge over unit 1", status: "CARRIED", outcome: "RESOLVED" },
      { id: "g-carried", meetingId: "agm", position: 2, title: "Recover arrears", status: "CARRIED", outcome: "RESOLVED" },
    ],
    DebtRecoveryCase: [
      { id: "case-1", schemeId: "act-1", lotId: "lot-1", ownerId: "debtor", caseNumber: "DR-1", status: "IN_PROGRESS", priority: "NORMAL", currentStep: current, principalOwed: "1200", interestOwed: "35.50", costsOwed: "0", totalOwed: "1235.50", createdAt: "2026-10-01T02:00:00.000Z" },
    ],
    DebtRecoveryStep: STEPS.map(({ status: _r, ...s }) => ({ ...s, noticeType: s.noticeType ?? null, id: `step-${s.stepOrder}`, caseId: "case-1", status: s.stepOrder < order(current) ? "COMPLETED" : "PENDING", completedAt: s.stepOrder < order(current) ? "2026-10-25T02:00:00.000Z" : null })),
    DebtRecoveryDocument: [],
    DebtRecoveryActivity: [],
    PaymentPlan: [],
    DebtRecoveryRecord: records,
    PendingResolution: [],
  });
}

const adviserPage = async () => renderToStaticMarkup((await AdviserCasePage({ params: Promise.resolve({ id: "act-1", caseId: "case-1" }) })) as ReactElement);
const ownerPage = async () => renderToStaticMarkup((await OwnerCasePage({ params: Promise.resolve({ caseId: "case-1" }) })) as ReactElement);
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");

describe("the ACT adviser case page", () => {
  it("asks for an executive committee motion or a general meeting ordinary resolution at the decision step", async () => {
    state.profile = { id: "adviser" };
    seed("COMMITTEE_REVIEW");
    const html = await adviserPage();
    expect(text(html)).toContain("The decision to start proceedings: a motion carried at an executive committee meeting or an ordinary resolution at a general meeting.");
    expect(html).toContain(`id="authority-meeting-step-${order("COMMITTEE_REVIEW")}"`);
    expect(html).toContain("Executive committee meeting (20 Oct 2026)");
    expect(html).not.toContain('id="charge-meeting-');
    // No charge is lodged, so there is no charge panel.
    expect(html).not.toContain('id="charge-revocation-lodged"');
  });

  it("asks at the Statutory Charge step whether a charge was declared and lodged, then for the motion and the day", async () => {
    seed("STATUTORY_CHARGE", [AUTHORITY]);
    const html = await adviserPage();
    expect(text(html)).toContain("Was a statutory charge over the unit lease declared and lodged?");
    expect(html).toContain(`name="charge-declared-step-${order("STATUTORY_CHARGE")}"`);
    // The motion and the day are asked only once "Yes" is chosen.
    expect(html).not.toContain('id="charge-meeting-');
    expect(html).not.toContain('id="authority-meeting-');
    const { container } = render((await AdviserCasePage({ params: Promise.resolve({ id: "act-1", caseId: "case-1" }) })) as ReactElement);
    fireEvent.click(container.querySelector('input[value="YES"]') as HTMLElement);
    const after = text(container.innerHTML);
    expect(after).toContain("Declared by a motion carried at an executive committee meeting or a motion carried at a general meeting.");
    expect(after).toContain("Day lodged with the registrar-general");
    expect(container.querySelector(`#charge-meeting-step-${order("STATUTORY_CHARGE")}`)).not.toBeNull();
    expect(container.querySelector(`#charge-lodged-step-${order("STATUTORY_CHARGE")}`)?.getAttribute("type")).toBe("date");
    expect(container.innerHTML).toContain("Annual general meeting (10 Oct 2026)");
  });

  it("asks for a court at the Proceedings step, with ACAT's civil jurisdiction and its limit as notes only", async () => {
    seed("PROCEEDINGS", [AUTHORITY]);
    const html = await adviserPage();
    expect(html).toContain('<option value="COURT">a court, which includes ACAT (UTMA dictionary)</option>');
    expect(html).not.toContain('value="ACAT"');
    expect(text(html)).toContain("Guidance, not confirmed: ACAT's civil jurisdiction");
    expect(text(html)).toContain("Guidance, not confirmed, never applied: ACAT hears a civil claim up to $25,000");
  });

  it("shows a lodged charge and offers to record its revocation, up to the building's day", async () => {
    seed("LEGAL_REFERRAL", [AUTHORITY, CHARGE]);
    const html = await adviserPage();
    const t = text(html);
    expect(t).toContain("Statutory Charge");
    expect(t).toContain("A statutory charge over the unit lease was lodged with the registrar-general on 22/10/2026.");
    expect(t).toContain("Its revocation is not recorded yet. The case cannot be closed until it is.");
    expect(t).toContain("Day the revocation was lodged with the registrar-general");
    expect(html).toMatch(/id="charge-revocation-lodged"[^>]*max="2026-11-02"|max="2026-11-02"[^>]*id="charge-revocation-lodged"/);
    // The completed charge step shows what the case records.
    const { container, getByText } = render((await AdviserCasePage({ params: Promise.resolve({ id: "act-1", caseId: "case-1" }) })) as ReactElement);
    const label = [...container.querySelectorAll("div.mt-2.hidden button")].find((b) => b.textContent === "Statutory Charge") as HTMLElement;
    fireEvent.click(label);
    expect(text(container.innerHTML)).toContain(
      "A statutory charge over the unit lease declared by a motion carried at an executive committee meeting, which took effect on 20/10/2026, and lodged with the registrar-general on 22/10/2026.",
    );
    // Recording the revocation sends the day to the action.
    fireEvent.change(container.querySelector("#charge-revocation-lodged") as HTMLElement, { target: { value: "2026-10-30" } });
    fireEvent.click(getByText("Record the revocation"));
    await vi.waitFor(() => expect(recordChargeRevocationAction).toHaveBeenCalledWith("case-1", "act-1", "2026-10-30"));
  });

  it("once the revocation is recorded, shows it and offers nothing more", async () => {
    seed("LEGAL_REFERRAL", [AUTHORITY, CHARGE, REVOKED]);
    const html = await adviserPage();
    expect(text(html)).toContain("Its revocation was lodged on 30/10/2026.");
    expect(html).not.toContain('id="charge-revocation-lodged"');
  });
});

describe("the ACT owner case page", () => {
  it("sends the committee to the adviser's case page for the decision, charge and proceedings steps", async () => {
    state.profile = { id: "chair" };
    for (const step of ["COMMITTEE_REVIEW", "STATUTORY_CHARGE", "PROCEEDINGS"]) {
      seed(step, [AUTHORITY]);
      const html = await ownerPage();
      expect(text(html), step).toContain("Complete this step from the adviser's case page.");
      expect(html, step).not.toContain("Mark Complete");
    }
    seed("FINAL_NOTICE");
    expect(await ownerPage()).toContain("Mark Complete");
  });

  it("states the confirmed law only: a court, which includes ACAT, never the limit, the Magistrates Court or the guidance forum", async () => {
    for (const profile of ["chair", "debtor"]) {
      state.profile = { id: profile };
      seed("PROCEEDINGS", [AUTHORITY, CHARGE]);
      const html = text(await ownerPage());
      expect(html, profile).toContain("a court, which includes ACAT (UTMA dictionary)");
      expect(html, profile).not.toMatch(/\$25,000|Magistrates|civil jurisdiction|may be recovered as a debt in/);
    }
  });
});
