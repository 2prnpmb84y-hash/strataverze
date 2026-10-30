/**
 * Debt recovery actions under the Victorian draft pack (stage 2, PR 9c), as if
 * it were switched on, against the in-memory database. A case is opened only
 * for tiers 1 to 4 (D6); the Final Notice step is refused (D3), so a case
 * cannot pass it; the Authority to Start Proceedings step records only a
 * special resolution at a general meeting, an interim special resolution only
 * once carried and taken effect (D2); the Proceedings step waits until day 29
 * after the final notice was recorded as given (D4, D5); there (Matthew
 * Wrigley's decision of 30 Oct 2026) a special resolution covers a larger
 * amount owing since the decision, an ordinary one is checked again (refused
 * while the comparator has no value), and a notice the final notice did not
 * cover refuses. The amount owing is that of every notice overdue today
 * (review of 30 Oct 2026). Every record written passes the checks of migration
 * 20261125, and nothing is written on any refusal.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-membership", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/require-membership")>()),
  requireSchemeMembership: vi.fn(async () => ({ profile: { id: "adviser" }, membership: {}, roles: ["ADVISER"] })),
}));
const captureUsageFee = vi.fn(async () => {});
vi.mock("@/lib/billing/capture", () => ({ captureUsageFee: (...a: unknown[]) => (captureUsageFee as (...x: unknown[]) => unknown)(...a) }));
// Victoria as if switched on: its draft pack is the building's.
vi.mock("@/lib/jurisdiction/scheme-rules", async (orig) => {
  const actual = await orig<typeof import("@/lib/jurisdiction/scheme-rules")>();
  const { PENDING_RULE_PACKS } = await import("@/config/statutory");
  const vic = PENDING_RULE_PACKS.VIC;
  const rules = vic.rules as unknown as import("@/config/statutory").StatutoryRules;
  const vicRules = () => ({ pack: { code: vic.code, state: vic.state, name: vic.name, version: vic.version, reviewer: vic.reviewer, reviewedOn: vic.reviewedOn, rules }, rules, label: `${vic.code} ${vic.version}` });
  const rulesForState = (s: string | null | undefined) => ((s ?? "").trim().toUpperCase() === "VIC" ? vicRules() : actual.rulesForState(s));
  return {
    ...actual,
    rulesForState,
    rulesForScheme: vi.fn(async (schemeId: string) => {
      const { sharedFake } = await import("@/test/fake-orm");
      const scheme = sharedFake.table("Scheme").find((s) => s.id === schemeId);
      if (!scheme) throw new actual.SchemeNotFoundError();
      return rulesForState(String(scheme.state));
    }),
  };
});

const { sharedFake } = await import("@/test/fake-orm");
const actions = await import("./debt-recovery");
const { PENDING_RULE_PACKS } = await import("@/config/statutory");

const SCHEME = "scheme-v";
const VIC_STEPS = PENDING_RULE_PACKS.VIC.rules.DEBT_RECOVERY_STEPS;
const LABEL = `AU-VIC ${PENDING_RULE_PACKS.VIC.version}`;
const order = (t: string) => VIC_STEPS.find((s) => s.stepType === t)!.stepOrder;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-02T01:00:00.000Z"));
  captureUsageFee.mockClear();
});

const row = (over: Record<string, unknown>) => ({
  caseId: "case-1",
  schemeId: SCHEME,
  state: "VIC",
  resolutionMeetingId: null,
  resolutionItemId: null,
  resolutionKind: null,
  amount: null,
  forum: null,
  lodgedOn: null,
  rulePack: LABEL,
  recordedBy: "adviser",
  notes: null,
  ...over,
});
const AUTHORITY_RECORD = row({ id: "r-1", kind: "AUTHORITY_TO_SUE", decidedOn: "2026-10-20", recordedAt: "2026-10-21T00:00:00.000Z", amount: "1200.00", resolutionMeetingId: "agm", resolutionItemId: "g-special", resolutionKind: "SPECIAL" });
const finalNoticeRecord = (decidedOn: string) => row({ id: "r-0", kind: "FINAL_NOTICE_GIVEN", decidedOn, recordedAt: "2026-10-02T00:00:00.000Z" });

const lotsOf = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `lot-${i + 1}`, schemeId: SCHEME, lotNumber: String(i + 1), lotType: "RESIDENTIAL", occupiable: true }));

/** A Victorian building (5 occupiable lots, tier 4, unless said) with a case on lot 1, the steps before `currentOrder` complete. */
function seed(opts: { lots?: number; several?: string | null; currentOrder?: number; records?: Record<string, unknown>[]; noCase?: boolean; notices?: Record<string, unknown>[] } = {}) {
  const lots = lotsOf(opts.lots ?? 5);
  const current = opts.currentOrder ?? 1;
  sharedFake.reset({
    Scheme: [{ id: SCHEME, state: "VIC", timeZone: "Australia/Melbourne", totalLots: lots.length, servicesOnly: false }],
    Lot: lots,
    SchemeSelectorValue: opts.several === null ? [] : [{ id: "sv-1", schemeId: SCHEME, key: "severalOwnersCorporations", value: opts.several ?? "NO" }],
    SchemeMembership: [
      { id: "m-owner", schemeId: SCHEME, lotId: "lot-1", profileId: "debtor", role: "OWNER", isActive: true, endDate: null },
      { id: "m-adviser", schemeId: SCHEME, lotId: null, profileId: "adviser", role: "ADVISER", isActive: true, endDate: null },
    ],
    LevyNotice: opts.notices ?? [
      { id: "n-1", schemeId: SCHEME, lotId: "lot-1", noticeNumber: "F-1", status: "OVERDUE", dueDate: "2026-07-01", issuedAt: "2026-06-01T00:00:00.000Z", amountDue: "1200.00", amountPaid: "0.00", balanceOutstanding: "1200.00", interestCharged: "0", rulePack: LABEL, migrationBatchId: null },
    ],
    PaymentPlan: [],
    Meeting: [
      { id: "agm", schemeId: SCHEME, meetingType: "AGM", status: "PUBLISHED", title: "AGM", scheduledAt: "2026-10-20T02:00:00.000Z", timezone: null },
      { id: "committee", schemeId: SCHEME, meetingType: "COMMITTEE", status: "PUBLISHED", title: "Committee", scheduledAt: "2026-10-21T02:00:00.000Z", timezone: null },
    ],
    AgendaItem: [
      { id: "g-special", meetingId: "agm", position: 1, title: "Start proceedings for lot 1", status: "CARRIED", outcome: "RESOLVED", resolutionCategory: "SPECIAL" },
      { id: "g-ordinary", meetingId: "agm", position: 2, title: "Start proceedings for lot 1", status: "CARRIED", outcome: "RESOLVED", resolutionCategory: "ORDINARY" },
      { id: "g-interim", meetingId: "agm", position: 3, title: "Start proceedings for lot 1", status: "INTERIM", outcome: "INTERIM", resolutionCategory: "SPECIAL" },
      { id: "g-interim-carried", meetingId: "agm", position: 4, title: "Start proceedings for lot 1", status: "CARRIED", outcome: "RESOLVED", resolutionCategory: "SPECIAL" },
      { id: "c-carried", meetingId: "committee", position: 1, title: "Start proceedings for lot 1", status: "CARRIED", outcome: "RESOLVED", resolutionCategory: null },
    ],
    PendingResolution: [
      { id: "p-1", schemeId: SCHEME, meetingId: "agm", agendaItemId: "g-interim", kind: "INTERIM_SPECIAL", takesEffectAs: "SPECIAL", status: "PENDING", effectiveOn: null },
      { id: "p-2", schemeId: SCHEME, meetingId: "agm", agendaItemId: "g-interim-carried", kind: "INTERIM_SPECIAL", takesEffectAs: "SPECIAL", status: "CARRIED", effectiveOn: "2026-10-30" },
    ],
    DebtRecoveryCase: opts.noCase
      ? []
      : [
          {
            id: "case-1",
            schemeId: SCHEME,
            lotId: "lot-1",
            ownerId: "debtor",
            caseNumber: "DR-2026-0001",
            status: "IN_PROGRESS",
            currentStep: VIC_STEPS.find((s) => s.stepOrder === current)?.stepType ?? "CLOSED",
            totalOwed: "1200.00",
            createdAt: "2026-10-01T02:00:00.000Z",
            rulePack: LABEL,
          },
        ],
    DebtRecoveryStep: opts.noCase
      ? []
      : VIC_STEPS.map(({ status: _rule, ...s }) => ({ ...s, id: `step-${s.stepOrder}`, caseId: "case-1", status: s.stepOrder < current ? "COMPLETED" : "PENDING" })),
    DebtRecoveryActivity: [],
    DebtRecoveryRecord: opts.records ?? [],
  });
}

const form = (fields: Record<string, string> = {}) => {
  const f = new FormData();
  f.set("outcome", "Done");
  f.set("evidenceNotes", "");
  f.set("noticeMethod", "");
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const complete = (stepType: string, fields: Record<string, string> = {}) => actions.completeDebtRecoveryStepAction(`step-${order(stepType)}`, "case-1", SCHEME, form(fields));
const records = () => sharedFake.table("DebtRecoveryRecord");
const theCase = () => sharedFake.table("DebtRecoveryCase")[0];
const step = (t: string) => sharedFake.table("DebtRecoveryStep").find((s) => s.id === `step-${order(t)}`)!;

function expectNothingWritten(stepType: string, recordCount: number) {
  expect(step(stepType).status).toBe("PENDING");
  expect(theCase().currentStep).toBe(stepType);
  expect(sharedFake.table("DebtRecoveryActivity")).toEqual([]);
  expect(captureUsageFee).not.toHaveBeenCalled();
  expect(records()).toHaveLength(recordCount);
}

/** The checks of migration 20261125 (debt_recovery_records). */
function migrationProblems(r: Record<string, unknown>): string[] {
  const set = (k: string) => r[k] != null;
  const out: string[] = [];
  if (!["VIC", "ACT", "WA"].includes(String(r.state))) out.push("state");
  if (!["AUTHORITY_TO_SUE", "FINAL_NOTICE_GIVEN", "PROCEEDINGS_STARTED", "STATUTORY_CHARGE_LODGED", "STATUTORY_CHARGE_REVOKED"].includes(String(r.kind))) out.push("kind");
  if (!set("decidedOn") || !set("caseId") || !set("schemeId") || !set("rulePack") || !set("recordedBy")) out.push("not null");
  if (set("resolutionMeetingId") !== set("resolutionItemId") || set("resolutionItemId") !== set("resolutionKind")) out.push("resolution together");
  if (r.kind === "AUTHORITY_TO_SUE" && !set("resolutionItemId")) out.push("authority resolution");
  if (!["AUTHORITY_TO_SUE", "STATUTORY_CHARGE_LODGED"].includes(String(r.kind)) && set("resolutionItemId")) out.push("resolution kind");
  if (set("resolutionKind") && !["GENERAL_MEETING", "ORDINARY", "SPECIAL", "COMMITTEE"].includes(String(r.resolutionKind))) out.push("resolution value");
  if ((r.kind === "AUTHORITY_TO_SUE") !== set("amount")) out.push("amount");
  if ((r.kind === "PROCEEDINGS_STARTED") !== set("forum") || (set("forum") && !["VCAT", "ACAT", "COURT"].includes(String(r.forum)))) out.push("forum");
  if (["STATUTORY_CHARGE_LODGED", "STATUTORY_CHARGE_REVOKED"].includes(String(r.kind)) !== set("lodgedOn")) out.push("lodged");
  if (String(r.rulePack ?? "").length > 40) out.push("rule pack length");
  return out;
}
const expectRecordsValid = () => {
  for (const r of records()) expect(migrationProblems(r), String(r.kind)).toEqual([]);
};

describe("opening a Victorian case (D6)", () => {
  it("opens one for a tier 4 owners corporation, with the Victorian steps", async () => {
    seed({ noCase: true });
    expect(await actions.initiateDebtRecoveryAction(SCHEME, "lot-1", "debtor")).toMatchObject({ success: true });
    expect(sharedFake.table("DebtRecoveryStep").map((s) => s.stepType)).toEqual(VIC_STEPS.map((s) => s.stepType));
    expect(theCase().rulePack).toBe(LABEL);
  });

  it("refuses a tier 5 owners corporation, with nothing written", async () => {
    seed({ noCase: true, lots: 2 });
    expect(await actions.initiateDebtRecoveryAction(SCHEME, "lot-1", "debtor")).toEqual({ error: expect.stringMatching(/^This is a tier 5 owners corporation .+ A case cannot be opened\. Nothing was saved\.$/) });
    expect(sharedFake.table("DebtRecoveryCase")).toEqual([]);
    expect(sharedFake.table("DebtRecoveryStep")).toEqual([]);
    expect(sharedFake.table("DebtRecoveryActivity")).toEqual([]);
  });

  it("refuses where the tier cannot be worked out, with nothing written", async () => {
    seed({ noCase: true, several: null });
    expect(await actions.initiateDebtRecoveryAction(SCHEME, "lot-1", "debtor")).toEqual({ error: expect.stringMatching(/^This owners corporation's tier cannot be worked out/) });
    expect(sharedFake.table("DebtRecoveryCase")).toEqual([]);
    expect(sharedFake.table("DebtRecoveryActivity")).toEqual([]);
  });
});

describe("the Final Notice step (D3)", () => {
  it("is refused, whatever is entered, with nothing written", async () => {
    seed({ currentOrder: order("FINAL_NOTICE") });
    const result = await complete("FINAL_NOTICE", { finalNoticeGivenOn: "2026-10-30" });
    expect(result.error).toMatch(/^StrataVerze cannot give the final fee notice yet: it must be in the approved form \(Owners corporation final fee notice\)/);
    expect(result.error).toMatch(/cannot be recorded either\. Recording a final fee notice given outside StrataVerze is refused for now/);
    expectNothingWritten("FINAL_NOTICE", 0);
  });
});

describe("the Authority to Start Proceedings step (D2)", () => {
  it.each([
    ["the adviser alone", {}, "Choose the meeting and the motion carried at it: a special resolution at a general meeting."],
    ["an ordinary resolution", { authorityMeetingId: "agm", authorityItemId: "g-ordinary" }, "That motion is not recorded as a special resolution at a general meeting. Choose a motion carried as a special resolution at a general meeting."],
    ["a committee motion", { authorityMeetingId: "committee", authorityItemId: "c-carried" }, "Choose a special resolution at a general meeting."],
    ["an interim special resolution still pending", { authorityMeetingId: "agm", authorityItemId: "g-interim" }, "That motion was not carried, so it cannot be relied on."],
  ])("refuses %s, with nothing written", async (_what, fields: Record<string, string>, error) => {
    seed({ currentOrder: order("COMMITTEE_REVIEW") });
    expect(await complete("COMMITTEE_REVIEW", fields)).toEqual({ error });
    expectNothingWritten("COMMITTEE_REVIEW", 0);
  });

  it("records a special resolution, with the amount owing", async () => {
    seed({ currentOrder: order("COMMITTEE_REVIEW") });
    expect(await complete("COMMITTEE_REVIEW", { authorityMeetingId: "agm", authorityItemId: "g-special" })).toEqual({ success: true });
    expect(records()).toEqual([expect.objectContaining({ state: "VIC", kind: "AUTHORITY_TO_SUE", decidedOn: "2026-10-20", resolutionKind: "SPECIAL", amount: "1200.00", rulePack: LABEL })]);
    expectRecordsValid();
  });

  it("records the amount owing on every notice overdue today, an issued one past its due day too, with its interest (review of 30 Oct 2026)", async () => {
    const issued = { id: "n-2", schemeId: SCHEME, lotId: "lot-1", noticeNumber: "F-2", status: "ISSUED", dueDate: "2026-10-01", issuedAt: "2026-09-01T00:00:00.000Z", balanceOutstanding: "300.00", interestCharged: "5.05", rulePack: LABEL, migrationBatchId: null };
    const notYetDue = { ...issued, id: "n-3", noticeNumber: "F-3", dueDate: "2026-11-30", interestCharged: "0" };
    seed({ currentOrder: order("COMMITTEE_REVIEW"), notices: [{ id: "n-1", schemeId: SCHEME, lotId: "lot-1", noticeNumber: "F-1", status: "OVERDUE", dueDate: "2026-07-01", issuedAt: "2026-06-01T00:00:00.000Z", balanceOutstanding: "1200.00", interestCharged: "0", rulePack: LABEL, migrationBatchId: null }, issued, notYetDue] });
    expect(await complete("COMMITTEE_REVIEW", { authorityMeetingId: "agm", authorityItemId: "g-special" })).toEqual({ success: true });
    expect(records()).toEqual([expect.objectContaining({ kind: "AUTHORITY_TO_SUE", amount: "1505.05" })]);
    expectRecordsValid();
  });

  it("refuses where a notice's amount cannot be read, never recording a smaller amount, with nothing written", async () => {
    seed({ currentOrder: order("COMMITTEE_REVIEW"), notices: [{ id: "n-1", schemeId: SCHEME, lotId: "lot-1", noticeNumber: "F-1", status: "OVERDUE", dueDate: "2026-07-01", issuedAt: "2026-06-01T00:00:00.000Z", balanceOutstanding: "not money", interestCharged: "0", rulePack: LABEL, migrationBatchId: null }] });
    expect(await complete("COMMITTEE_REVIEW", { authorityMeetingId: "agm", authorityItemId: "g-special" })).toEqual({ error: "Could not work out the amount owing. Nothing was saved." });
    expectNothingWritten("COMMITTEE_REVIEW", 0);
  });

  it("records an interim special resolution once carried and taken effect, as of the day it took effect", async () => {
    seed({ currentOrder: order("COMMITTEE_REVIEW") });
    expect(await complete("COMMITTEE_REVIEW", { authorityMeetingId: "agm", authorityItemId: "g-interim-carried" })).toEqual({ success: true });
    expect(records()[0]).toMatchObject({ kind: "AUTHORITY_TO_SUE", decidedOn: "2026-10-30", resolutionKind: "SPECIAL" });
    expectRecordsValid();
  });
});

describe("the tier is checked again where proceedings are decided and started (review L4)", () => {
  it("refuses the Authority to Start Proceedings step for a building now tier 5, or whose tier cannot be worked out, with nothing written", async () => {
    seed({ currentOrder: order("COMMITTEE_REVIEW"), lots: 2 });
    expect(await complete("COMMITTEE_REVIEW", { authorityMeetingId: "agm", authorityItemId: "g-special" })).toEqual({ error: expect.stringMatching(/^This is a tier 5 owners corporation .+ This step cannot be completed\. Nothing was saved\.$/) });
    expectNothingWritten("COMMITTEE_REVIEW", 0);
    seed({ currentOrder: order("COMMITTEE_REVIEW"), several: null });
    expect(await complete("COMMITTEE_REVIEW", { authorityMeetingId: "agm", authorityItemId: "g-special" })).toEqual({ error: expect.stringMatching(/^This owners corporation's tier cannot be worked out/) });
    expectNothingWritten("COMMITTEE_REVIEW", 0);
  });

  it("refuses the Proceedings step for a building now tier 5, with nothing written", async () => {
    seed({ currentOrder: order("PROCEEDINGS"), records: [finalNoticeRecord("2026-10-01"), AUTHORITY_RECORD], lots: 2 });
    expect(await complete("PROCEEDINGS", { forum: "VCAT" })).toEqual({ error: expect.stringMatching(/^This is a tier 5 owners corporation /) });
    expectNothingWritten("PROCEEDINGS", 2);
  });
});

describe("the Proceedings step (D4, D5, D13)", () => {
  it("is refused with no final notice recorded as given, with nothing written", async () => {
    seed({ currentOrder: order("PROCEEDINGS"), records: [AUTHORITY_RECORD] });
    expect(await complete("PROCEEDINGS", { forum: "VCAT" })).toEqual({ error: "The final fee notice is not recorded as given on this case, so Proceedings cannot be completed. Nothing was saved." });
    expectNothingWritten("PROCEEDINGS", 1);
  });

  it.each(["VCAT", "COURT"])("%s: refused on day 28 after the final notice, recorded from day 29", async (forum) => {
    // The building's day is 2 Nov: day 28 after a final notice given on 5 Oct (refused, from 3 Nov), day 29 after one given on 4 Oct.
    seed({ currentOrder: order("PROCEEDINGS"), records: [finalNoticeRecord("2026-10-05"), AUTHORITY_RECORD] });
    expect(await complete("PROCEEDINGS", { forum })).toEqual({ error: expect.stringMatching(/^Proceedings can be completed from 03\/11\/2026: an application to VCAT for payment can only be made/) });
    expectNothingWritten("PROCEEDINGS", 2);
    seed({ currentOrder: order("PROCEEDINGS"), records: [finalNoticeRecord("2026-10-04"), AUTHORITY_RECORD] });
    expect(await complete("PROCEEDINGS", { forum })).toEqual({ success: true });
    expect(records().map((r) => [r.kind, r.forum])).toEqual([
      ["FINAL_NOTICE_GIVEN", null],
      ["AUTHORITY_TO_SUE", null],
      ["PROCEEDINGS_STARTED", forum],
    ]);
    expectRecordsValid();
  });

  const overdue = (id: string, dueDate: string, issuedAt: string, over: Record<string, unknown> = {}) => ({
    id,
    schemeId: SCHEME,
    lotId: "lot-1",
    noticeNumber: id.toUpperCase(),
    status: "OVERDUE",
    dueDate,
    issuedAt,
    balanceOutstanding: "300.00",
    interestCharged: "0",
    rulePack: LABEL,
    migrationBatchId: null,
    ...over,
  });
  const F1 = overdue("f-1", "2026-07-01", "2026-06-01T00:00:00.000Z", { balanceOutstanding: "1200.00" });

  it("a special resolution: a larger amount owing since the decision (interest on the notice the final notice covered) is no longer refused", async () => {
    // 1,235.00 owing now; 1,200.00 was recorded with the decision.
    seed({ currentOrder: order("PROCEEDINGS"), records: [finalNoticeRecord("2026-10-01"), AUTHORITY_RECORD], notices: [{ ...F1, interestCharged: "35.00" }] });
    expect(await complete("PROCEEDINGS", { forum: "VCAT" })).toEqual({ success: true });
    expect(records().map((r) => [r.kind, r.forum, r.amount])).toEqual([
      ["FINAL_NOTICE_GIVEN", null, null],
      ["AUTHORITY_TO_SUE", null, "1200.00"],
      ["PROCEEDINGS_STARTED", "VCAT", null],
    ]);
    expectRecordsValid();
  });

  it("an ordinary resolution recorded with the decision is refused (the comparator has no value), with nothing written", async () => {
    const ordinary = { ...AUTHORITY_RECORD, resolutionItemId: "g-ordinary", resolutionKind: "ORDINARY" };
    seed({ currentOrder: order("PROCEEDINGS"), records: [finalNoticeRecord("2026-10-01"), ordinary] });
    expect(await complete("PROCEEDINGS", { forum: "VCAT" })).toEqual({
      error: expect.stringMatching(/^The decision to start proceedings was recorded as an ordinary resolution at a general meeting, .+ Only a special resolution at a general meeting may decide it, so this step cannot be completed\. Nothing was saved\.$/),
    });
    expectNothingWritten("PROCEEDINGS", 2);
  });

  it("is refused where a notice became overdue after the final notice was given, with nothing written", async () => {
    // F-2 fell due on 1 Oct 2026, the day the final notice was recorded as given, so it was overdue only from 2 Oct.
    seed({ currentOrder: order("PROCEEDINGS"), records: [finalNoticeRecord("2026-10-01"), AUTHORITY_RECORD], notices: [F1, overdue("f-2", "2026-10-01", "2026-09-01T00:00:00.000Z")] });
    expect(await complete("PROCEEDINGS", { forum: "VCAT" })).toEqual({
      error:
        "Notice F-2 was not yet overdue on the day the final fee notice was recorded as given (01/10/2026), so the final fee notice did not cover it. StrataVerze limits a claim to the notices the final fee notice covered (StrataVerze practice, decision of 30 Oct 2026) and does not record which notices a claim includes, so Proceedings cannot be completed while such a notice is overdue. Wait until it is paid, or close this case and open a new one. Nothing was saved.",
    });
    expectNothingWritten("PROCEEDINGS", 2);
  });

  it("reads as overdue an issued notice past its due day with a balance, not one paid, not yet due or of another lot", async () => {
    const notices = [
      F1,
      overdue("f-3", "2026-10-15", "2026-09-10T00:00:00.000Z", { status: "ISSUED" }),
      overdue("f-4", "2026-10-16", "2026-09-11T00:00:00.000Z", { status: "PARTIALLY_PAID", balanceOutstanding: "0.00" }),
      overdue("f-5", "2026-11-30", "2026-10-26T00:00:00.000Z", { status: "ISSUED" }),
      overdue("f-6", "2026-10-15", "2026-09-10T00:00:00.000Z", { status: "PAID", balanceOutstanding: "0.00" }),
      overdue("f-7", "2026-10-15", "2026-09-10T00:00:00.000Z", { lotId: "lot-2" }),
    ];
    seed({ currentOrder: order("PROCEEDINGS"), records: [finalNoticeRecord("2026-10-01"), AUTHORITY_RECORD], notices });
    expect(await complete("PROCEEDINGS", { forum: "VCAT" })).toEqual({ error: expect.stringMatching(/^Notice F-3 was not yet overdue on the day the final fee notice was recorded as given \(01\/10\/2026\)/) });
    expectNothingWritten("PROCEEDINGS", 2);
  });

  it("is refused for a notice brought across at takeover, with nothing written", async () => {
    seed({ currentOrder: order("PROCEEDINGS"), records: [finalNoticeRecord("2026-10-01"), AUTHORITY_RECORD], notices: [F1, overdue("t-1", "2026-06-01", "2026-05-01T00:00:00.000Z", { rulePack: null, migrationBatchId: "batch-1" })] });
    expect(await complete("PROCEEDINGS", { forum: "VCAT" })).toEqual({ error: expect.stringMatching(/^Notice T-1 was not issued under this building's rules in StrataVerze/) });
    expectNothingWritten("PROCEEDINGS", 2);
  });

  it("refuses a forum that is not VCAT or a court", async () => {
    seed({ currentOrder: order("PROCEEDINGS"), records: [finalNoticeRecord("2026-10-01"), AUTHORITY_RECORD] });
    expect(await complete("PROCEEDINGS", { forum: "ACAT" })).toEqual({ error: "Choose where proceedings were started: VCAT or any court of competent jurisdiction." });
    expectNothingWritten("PROCEEDINGS", 2);
  });
});

describe("closing a Victorian case", () => {
  it("closes as before: Victoria has no statutory charge", async () => {
    seed({ currentOrder: order("LEGAL_REFERRAL"), records: [AUTHORITY_RECORD] });
    expect(await actions.closeDebtRecoveryCaseAction("case-1", SCHEME, "Paid", "CLOSED_PAID")).toEqual({ success: true });
    expect(theCase()).toMatchObject({ status: "CLOSED_PAID", currentStep: "CLOSED" });
  });
});
