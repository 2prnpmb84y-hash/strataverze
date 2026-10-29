/**
 * Debt recovery actions under the ACT draft pack (stage 2, PR 9b), as if it
 * were switched on, against the in-memory database (whose transactions roll
 * back and whose row locks behave as Postgres's do). The Decision to Start
 * Proceedings step records a motion carried at an executive committee meeting
 * or an ordinary resolution at a general meeting (D7); the Statutory Charge
 * step records a declared and lodged charge, or none (D8); the Proceedings
 * step records a court (D13); the revocation is recorded under the case lock,
 * once; a case with a lodged charge not revoked cannot be closed in any
 * status. Every record written passes the checks of migration 20261125, and
 * nothing is written on any refusal.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const spy = vi.hoisted(() => ({ failCaseMove: false, failRecord: false }));

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// The case's move to its next step, the last write of the step's transaction, can be made to fail.
vi.mock("@/lib/queries/debt-recovery", async (orig) => {
  const real = await orig<typeof import("@/lib/queries/debt-recovery")>();
  return {
    ...real,
    updateDebtRecoveryCase: async (...a: Parameters<typeof real.updateDebtRecoveryCase>) => {
      if (spy.failCaseMove && a[1] && "currentStep" in a[1]) throw new Error("case move failed");
      return real.updateDebtRecoveryCase(...a);
    },
  };
});
// Writing a record can be made to fail, after the checks.
vi.mock("@/lib/debt-recovery/recovery-records-repo", async (orig) => {
  const real = await orig<typeof import("@/lib/debt-recovery/recovery-records-repo")>();
  return {
    ...real,
    createRecoveryRecords: async (...a: Parameters<typeof real.createRecoveryRecords>) => {
      if (spy.failRecord) throw new Error("record store down");
      return real.createRecoveryRecords(...a);
    },
  };
});
vi.mock("@/lib/auth/require-membership", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/require-membership")>()),
  requireSchemeMembership: vi.fn(async () => ({ profile: { id: "adviser" }, membership: {}, roles: ["ADVISER"] })),
}));
const captureUsageFee = vi.fn(async () => {});
vi.mock("@/lib/billing/capture", () => ({ captureUsageFee: (...a: unknown[]) => (captureUsageFee as (...x: unknown[]) => unknown)(...a) }));
// The ACT as if switched on: its draft pack is the building's.
vi.mock("@/lib/jurisdiction/scheme-rules", async (orig) => {
  const actual = await orig<typeof import("@/lib/jurisdiction/scheme-rules")>();
  const { PENDING_RULE_PACKS } = await import("@/config/statutory");
  const act = PENDING_RULE_PACKS.ACT;
  const actRules = () => ({
    pack: { code: act.code, state: act.state, name: act.name, version: act.version, reviewer: act.reviewer, reviewedOn: act.reviewedOn, rules: act.rules as unknown as import("@/config/statutory").StatutoryRules },
    rules: act.rules as unknown as import("@/config/statutory").StatutoryRules,
    label: `${act.code} ${act.version}`,
  });
  const rulesForState = (s: string | null | undefined) => ((s ?? "").trim().toUpperCase() === "ACT" ? actRules() : actual.rulesForState(s));
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
const { PENDING_RULE_PACKS, RULE_PACKS } = await import("@/config/statutory");

const SCHEME = "scheme-1";
const ACT_STEPS = PENDING_RULE_PACKS.ACT.rules.DEBT_RECOVERY_STEPS;
const LABEL = `AU-ACT ${PENDING_RULE_PACKS.ACT.version}`;
const order = (t: string) => ACT_STEPS.find((s) => s.stepType === t)!.stepOrder;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-02T01:00:00.000Z"));
  spy.failCaseMove = false;
  spy.failRecord = false;
  captureUsageFee.mockClear();
});

/** Records as the database holds them (every column, so they pass the migration's checks too). */
const row = (over: Record<string, unknown>) => ({
  caseId: "case-1",
  schemeId: SCHEME,
  state: "ACT",
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
const AUTHORITY_RECORD = row({ id: "r-1", kind: "AUTHORITY_TO_SUE", decidedOn: "2026-10-20", recordedAt: "2026-10-21T00:00:00.000Z", amount: "1235.50", resolutionMeetingId: "exec", resolutionItemId: "e-carried", resolutionKind: "COMMITTEE" });
const CHARGE_RECORD = row({ id: "r-2", kind: "STATUTORY_CHARGE_LODGED", decidedOn: "2026-10-20", lodgedOn: "2026-10-22", recordedAt: "2026-10-22T00:00:00.000Z", resolutionMeetingId: "exec", resolutionItemId: "e-carried", resolutionKind: "COMMITTEE" });
const REVOKED_RECORD = row({ id: "r-3", kind: "STATUTORY_CHARGE_REVOKED", decidedOn: "2026-10-30", lodgedOn: "2026-10-30", recordedAt: "2026-10-30T00:00:00.000Z" });

/** An ACT (or `st`) building with a case on unit 1, the steps before `currentOrder` complete; meetings and motions to choose from. */
function seed(opts: { st?: "ACT" | "NSW"; currentOrder?: number; records?: Record<string, unknown>[]; caseStatus?: string; noCase?: boolean; openedAt?: string } = {}) {
  const st = opts.st ?? "ACT";
  const steps = st === "ACT" ? ACT_STEPS : (RULE_PACKS[st].rules.DEBT_RECOVERY_STEPS ?? []);
  const current = opts.currentOrder ?? 1;
  sharedFake.reset({
    Scheme: [{ id: SCHEME, state: st, timeZone: "Australia/Sydney" }],
    Lot: [{ id: "lot-1", schemeId: SCHEME, lotNumber: "1" }],
    SchemeMembership: [
      { id: "m-owner", schemeId: SCHEME, lotId: "lot-1", profileId: "debtor", role: "OWNER", isActive: true, endDate: null },
      { id: "m-adviser", schemeId: SCHEME, lotId: null, profileId: "adviser", role: "ADVISER", isActive: true, endDate: null },
    ],
    LevyNotice: [{ id: "n-1", schemeId: SCHEME, lotId: "lot-1", status: "OVERDUE", dueDate: "2026-07-01", balanceOutstanding: "1200.00", interestCharged: "35.50" }],
    PaymentPlan: [],
    Meeting: [
      { id: "exec", schemeId: SCHEME, meetingType: "COMMITTEE", status: "MINUTES_DRAFT", title: "Executive committee meeting", scheduledAt: "2026-10-20T02:00:00.000Z", timezone: null },
      { id: "agm", schemeId: SCHEME, meetingType: "AGM", status: "PUBLISHED", title: "AGM", scheduledAt: "2026-10-10T02:00:00.000Z", timezone: null },
    ],
    AgendaItem: [
      { id: "e-carried", meetingId: "exec", position: 1, title: "Start proceedings and declare a charge for unit 1", status: "CARRIED", outcome: "RESOLVED", resolutionCategory: "ORDINARY" },
      { id: "e-lost", meetingId: "exec", position: 2, title: "Declare a charge", status: "LOST", outcome: "MOTION_LOST", resolutionCategory: "ORDINARY" },
      { id: "g-ordinary", meetingId: "agm", position: 1, title: "Start proceedings for unit 1", status: "CARRIED", outcome: "RESOLVED", resolutionCategory: "ORDINARY" },
      { id: "g-special", meetingId: "agm", position: 2, title: "Start proceedings for unit 1", status: "CARRIED", outcome: "RESOLVED", resolutionCategory: "SPECIAL" },
    ],
    PendingResolution: [],
    DebtRecoveryCase: opts.noCase
      ? []
      : [
          {
            id: "case-1",
            schemeId: SCHEME,
            lotId: "lot-1",
            ownerId: "debtor",
            caseNumber: "DR-2026-0001",
            status: opts.caseStatus ?? "IN_PROGRESS",
            currentStep: steps.find((s) => s.stepOrder === current)?.stepType ?? "CLOSED",
            totalOwed: "1000.00",
            createdAt: opts.openedAt ?? "2026-10-01T02:00:00.000Z",
            rulePack: st === "ACT" ? LABEL : `AU-${st} test`,
          },
        ],
    DebtRecoveryStep: opts.noCase
      ? []
      : steps.map(({ status: _rule, ...s }) => ({ ...s, id: `step-${s.stepOrder}`, caseId: "case-1", status: s.stepOrder < current ? "COMPLETED" : "PENDING" })),
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

/** Nothing written: the step, the case, the activities and the records as seeded. */
function expectNothingWritten(stepType: string, recordCount: number) {
  expect(step(stepType).status).toBe("PENDING");
  expect(theCase().currentStep).toBe(stepType);
  expect(sharedFake.table("DebtRecoveryActivity")).toEqual([]);
  expect(captureUsageFee).not.toHaveBeenCalled();
  expect(records()).toHaveLength(recordCount);
}

/** The checks of migration 20261125 (debt_recovery_records), as the database applies them. */
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

describe("opening an ACT case", () => {
  it("copies the ACT steps, with the Statutory Charge step after the decision", async () => {
    seed({ noCase: true });
    expect(await actions.initiateDebtRecoveryAction(SCHEME, "lot-1", "debtor")).toMatchObject({ success: true });
    const types = sharedFake.table("DebtRecoveryStep").map((s) => s.stepType);
    expect(types).toEqual(ACT_STEPS.map((s) => s.stepType));
    expect(types.indexOf("STATUTORY_CHARGE")).toBe(types.indexOf("COMMITTEE_REVIEW") + 1);
    expect(theCase().rulePack).toBe(LABEL);
  });
});

describe("the Decision to Start Proceedings step (D7)", () => {
  it("refuses the adviser alone, and a general meeting motion recorded as a special resolution, with nothing written", async () => {
    seed({ currentOrder: order("COMMITTEE_REVIEW") });
    expect(await complete("COMMITTEE_REVIEW")).toEqual({
      error: "Choose the meeting and the motion carried at it: a motion carried at an executive committee meeting or an ordinary resolution at a general meeting.",
    });
    expectNothingWritten("COMMITTEE_REVIEW", 0);
    // A general meeting held before the case was opened is not taken to be about it.
    seed({ currentOrder: order("COMMITTEE_REVIEW"), openedAt: "2026-10-15T02:00:00.000Z" });
    expect(await complete("COMMITTEE_REVIEW", { authorityMeetingId: "agm", authorityItemId: "g-ordinary" })).toEqual({
      error: "That resolution took effect before this case was opened, so it cannot be relied on for it. Choose the motion that decided to start proceedings for this case.",
    });
    expectNothingWritten("COMMITTEE_REVIEW", 0);
  });

  it.each([
    ["an executive committee motion", "exec", "e-carried", "COMMITTEE"],
    ["a general meeting ordinary resolution", "agm", "g-ordinary", "ORDINARY"],
  ])("records %s with the step", async (_what, meeting, item, kind) => {
    seed({ currentOrder: order("COMMITTEE_REVIEW") });
    expect(await complete("COMMITTEE_REVIEW", { authorityMeetingId: meeting, authorityItemId: item })).toEqual({ success: true });
    expect(records()).toHaveLength(1);
    expect(records()[0]).toMatchObject({ state: "ACT", kind: "AUTHORITY_TO_SUE", resolutionKind: kind, amount: "1235.50", lodgedOn: null, rulePack: LABEL });
    expectRecordsValid();
  });

  it("refuses a special resolution where an ordinary one is accepted", async () => {
    seed({ currentOrder: order("COMMITTEE_REVIEW") });
    expect(await complete("COMMITTEE_REVIEW", { authorityMeetingId: "agm", authorityItemId: "g-special" })).toEqual({
      error: "That motion is not recorded as an ordinary resolution at a general meeting. Choose a motion carried as an ordinary resolution at a general meeting.",
    });
    expectNothingWritten("COMMITTEE_REVIEW", 0);
  });
});

describe("the Statutory Charge step (D8)", () => {
  const at = (openedAt?: string) => seed({ currentOrder: order("STATUTORY_CHARGE"), records: [AUTHORITY_RECORD], ...(openedAt ? { openedAt } : {}) });
  const declare = (fields: Record<string, string> = {}) =>
    complete("STATUTORY_CHARGE", { chargeDeclared: "YES", chargeMeetingId: "exec", chargeItemId: "e-carried", chargeLodgedOn: "2026-10-22", ...fields });

  it("refuses with no choice made, with nothing written", async () => {
    at();
    expect(await complete("STATUTORY_CHARGE")).toEqual({ error: "Say whether a statutory charge over the unit lease was declared and lodged." });
    expectNothingWritten("STATUTORY_CHARGE", 1);
  });

  it("no charge declared completes the step and writes no record", async () => {
    at();
    expect(await complete("STATUTORY_CHARGE", { chargeDeclared: "NO", chargeMeetingId: "exec", chargeItemId: "e-carried", chargeLodgedOn: "2026-10-22" })).toEqual({ success: true });
    expect(step("STATUTORY_CHARGE").status).toBe("COMPLETED");
    expect(theCase().currentStep).toBe("LEGAL_REFERRAL");
    expect(records()).toHaveLength(1);
    // No fee: the step is unpriced.
    expect(captureUsageFee).not.toHaveBeenCalled();
  });

  it("a declared and lodged charge is recorded with the step, with the resolution and both days", async () => {
    at();
    expect(await declare()).toEqual({ success: true });
    expect(records()).toHaveLength(2);
    expect(records()[1]).toMatchObject({
      caseId: "case-1",
      schemeId: SCHEME,
      state: "ACT",
      kind: "STATUTORY_CHARGE_LODGED",
      decidedOn: "2026-10-20",
      lodgedOn: "2026-10-22",
      resolutionMeetingId: "exec",
      resolutionItemId: "e-carried",
      resolutionKind: "COMMITTEE",
      amount: null,
      forum: null,
      rulePack: LABEL,
      recordedBy: "adviser",
    });
    expectRecordsValid();
  });

  it.each([
    ["a motion not carried", { chargeItemId: "e-lost" }, "That motion was not carried, so it cannot be relied on."],
    ["no meeting chosen", { chargeMeetingId: "" }, "Choose the meeting and the motion carried at it: a motion carried at an executive committee meeting or a motion carried at a general meeting."],
    ["no day lodged", { chargeLodgedOn: "" }, "Enter the day it was lodged with the registrar-general."],
    ["a day lodged after today", { chargeLodgedOn: "2026-11-03" }, "The day it was lodged with the registrar-general cannot be after today (02/11/2026)."],
    ["a day lodged before it was declared", { chargeLodgedOn: "2026-10-19" }, "It cannot have been lodged before the resolution that declared it took effect (20/10/2026)."],
    ["a declaration before the case was opened", { chargeMeetingId: "agm", chargeItemId: "g-ordinary", openedAt: "2026-10-15T02:00:00.000Z" }, "That resolution took effect before this case was opened, so it cannot be relied on for it. Choose the motion that declared the charge for this case."],
  ])("refuses %s, with nothing written", async (_what, { openedAt, ...fields }: Record<string, string>, error) => {
    at(openedAt);
    expect(await declare(fields)).toEqual({ error });
    expectNothingWritten("STATUTORY_CHARGE", 1);
  });

  it("writes the record in the step's transaction: a failure later in it leaves neither", async () => {
    at();
    spy.failCaseMove = true;
    expect(await declare()).toEqual({ error: "Failed to complete step" });
    expect(records()).toHaveLength(1);
    expect(step("STATUTORY_CHARGE").status).toBe("PENDING");
    expect(theCase().currentStep).toBe("STATUTORY_CHARGE");
  });

  it("is completed in order, and only after the decision is recorded", async () => {
    // Out of order (a decision on record, the case still at the decision step): the step order check refuses it.
    seed({ currentOrder: order("COMMITTEE_REVIEW"), records: [AUTHORITY_RECORD] });
    expect(await declare()).toEqual({ error: "Steps are completed in order. Complete Decision to Start Proceedings first." });
    expect(records()).toHaveLength(1);
    seed({ currentOrder: order("STATUTORY_CHARGE") });
    expect(await declare()).toEqual({ error: "Record the decision to start proceedings on the Decision to Start Proceedings step first." });
    expect(records()).toEqual([]);
  });
});

describe("the Proceedings step (D13)", () => {
  it("records a court, which covers ACAT, and refuses ACAT as a forum of its own", async () => {
    seed({ currentOrder: order("PROCEEDINGS"), records: [AUTHORITY_RECORD] });
    expect(await complete("PROCEEDINGS", { forum: "ACAT" })).toEqual({ error: "Choose where proceedings were started: a court, which includes ACAT (UTMA dictionary)." });
    expectNothingWritten("PROCEEDINGS", 1);
    expect(await complete("PROCEEDINGS", { forum: "COURT" })).toEqual({ success: true });
    expect(records().map((r) => [r.kind, r.forum])).toEqual([
      ["AUTHORITY_TO_SUE", null],
      ["PROCEEDINGS_STARTED", "COURT"],
    ]);
    expectRecordsValid();
  });
});

describe("recording the revocation", () => {
  const revoke = (day: string) => actions.recordChargeRevocationAction("case-1", SCHEME, day);
  const revocations = () => records().filter((r) => r.kind === "STATUTORY_CHARGE_REVOKED");

  it("is refused with no charge lodged, with nothing written", async () => {
    seed({ currentOrder: order("LEGAL_REFERRAL"), records: [AUTHORITY_RECORD] });
    expect(await revoke("2026-10-30")).toEqual({ error: "No charge is recorded as lodged on this case, so there is nothing to revoke. Nothing was saved." });
    expect(records()).toHaveLength(1);
    expect(sharedFake.table("DebtRecoveryActivity")).toEqual([]);
  });

  it.each([
    ["before the charge was lodged", "2026-10-21", "The revocation cannot have been lodged before the charge was (on 22/10/2026)."],
    ["after today", "2026-11-03", "The day the revocation was lodged cannot be after today (02/11/2026)."],
    ["with no day", "", "Enter the day the revocation was lodged with the registrar-general."],
  ])("is refused %s, with nothing written", async (_what, day, error) => {
    seed({ currentOrder: order("LEGAL_REFERRAL"), records: [AUTHORITY_RECORD, CHARGE_RECORD] });
    expect(await revoke(day)).toEqual({ error });
    expect(revocations()).toEqual([]);
    expect(sharedFake.table("DebtRecoveryActivity")).toEqual([]);
  });

  it("records the revocation on an open case, once: a second request records nothing", async () => {
    seed({ currentOrder: order("LEGAL_REFERRAL"), records: [AUTHORITY_RECORD, CHARGE_RECORD] });
    expect(await revoke("2026-10-30")).toEqual({ success: true });
    expect(revocations()).toHaveLength(1);
    expect(revocations()[0]).toMatchObject({ state: "ACT", kind: "STATUTORY_CHARGE_REVOKED", decidedOn: "2026-10-30", lodgedOn: "2026-10-30", resolutionItemId: null, amount: null, forum: null, rulePack: LABEL, recordedBy: "adviser" });
    expectRecordsValid();
    expect(sharedFake.table("DebtRecoveryActivity").map((a) => a.activityType)).toEqual(["CHARGE_REVOKED"]);
    expect(theCase().status).toBe("IN_PROGRESS");
    expect(await revoke("2026-10-31")).toEqual({ error: "The revocation of this charge is already recorded (lodged on 30/10/2026). Nothing was saved." });
    expect(revocations()).toHaveLength(1);
  });

  it("two requests at once record one revocation (the case lock)", async () => {
    seed({ currentOrder: order("LEGAL_REFERRAL"), records: [AUTHORITY_RECORD, CHARGE_RECORD] });
    const results = await Promise.all([revoke("2026-10-30"), revoke("2026-10-31")]);
    expect(results.filter((r) => r.success)).toHaveLength(1);
    expect(revocations()).toHaveLength(1);
  });

  it("a failed write records nothing", async () => {
    seed({ currentOrder: order("LEGAL_REFERRAL"), records: [AUTHORITY_RECORD, CHARGE_RECORD] });
    spy.failRecord = true;
    expect(await revoke("2026-10-30")).toEqual({ error: "Failed to record the revocation" });
    expect(revocations()).toEqual([]);
    expect(sharedFake.table("DebtRecoveryActivity")).toEqual([]);
  });

  it("is not available for a building whose pack has no charge (NSW)", async () => {
    seed({ st: "NSW", currentOrder: 4, records: [] });
    expect(await revoke("2026-10-30")).toEqual({ error: "This is not available for this building." });
    expect(records()).toEqual([]);
  });
});

describe("closing an ACT case", () => {
  const close = (status: "CLOSED_PAID" | "CLOSED_WRITTEN_OFF" | "CLOSED_SETTLED") => actions.closeDebtRecoveryCaseAction("case-1", SCHEME, "Done", status);

  it.each(["CLOSED_PAID", "CLOSED_SETTLED", "CLOSED_WRITTEN_OFF"] as const)("a lodged charge not revoked refuses closing as %s, with nothing written", async (status) => {
    seed({ currentOrder: order("PROCEEDINGS"), records: [AUTHORITY_RECORD, CHARGE_RECORD] });
    expect(await close(status)).toEqual({
      error: "A statutory charge over the unit lease was lodged with the registrar-general on 22/10/2026, and its revocation is not recorded as lodged. Record the revocation before closing this case. Nothing was saved.",
    });
    expect(theCase()).toMatchObject({ status: "IN_PROGRESS", currentStep: "PROCEEDINGS" });
    expect(sharedFake.table("DebtRecoveryActivity")).toEqual([]);
  });

  it.each(["CLOSED_PAID", "CLOSED_SETTLED", "CLOSED_WRITTEN_OFF"] as const)("closes as %s once the revocation is recorded", async (status) => {
    seed({ currentOrder: order("PROCEEDINGS"), records: [AUTHORITY_RECORD, CHARGE_RECORD, REVOKED_RECORD] });
    expect(await close(status)).toEqual({ success: true });
    expect(theCase()).toMatchObject({ status, currentStep: "CLOSED" });
  });

  it("closes a case with no charge, and refuses closing it twice", async () => {
    seed({ currentOrder: order("FINAL_NOTICE") });
    expect(await close("CLOSED_PAID")).toEqual({ success: true });
    expect(await close("CLOSED_PAID")).toEqual({ error: "This case is already closed" });
  });

  it("the Closed step cannot be completed while the revocation is not recorded, with nothing written", async () => {
    seed({ currentOrder: order("CLOSED"), records: [AUTHORITY_RECORD, CHARGE_RECORD] });
    expect(await complete("CLOSED")).toEqual({
      error: "A statutory charge over the unit lease was lodged with the registrar-general on 22/10/2026, and its revocation is not recorded as lodged. Record the revocation before closing this case. Nothing was saved.",
    });
    expectNothingWritten("CLOSED", 2);
    seed({ currentOrder: order("CLOSED"), records: [AUTHORITY_RECORD, CHARGE_RECORD, REVOKED_RECORD] });
    expect(await complete("CLOSED")).toEqual({ success: true });
  });

  it("after recording the revocation through the action, the case closes", async () => {
    seed({ currentOrder: order("PROCEEDINGS"), records: [AUTHORITY_RECORD, CHARGE_RECORD] });
    expect(await close("CLOSED_PAID")).toHaveProperty("error");
    expect(await actions.recordChargeRevocationAction("case-1", SCHEME, "2026-11-01")).toEqual({ success: true });
    expect(await close("CLOSED_PAID")).toEqual({ success: true });
  });
});
