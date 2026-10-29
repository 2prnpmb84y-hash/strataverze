/**
 * Debt recovery actions under the Western Australian draft pack (VIC, ACT and
 * WA stage 2, PR 9a), as if it were switched on, against the in-memory
 * database (whose transactions roll back and whose row locks behave as
 * Postgres's do). The Decision to Start Proceedings step records a motion
 * carried at a council or general meeting, never the adviser alone (D9); the
 * Proceedings step records a court, never SAT (D13); each record is written
 * in the step's transaction; the legal referral needs the decision; nothing
 * is written on a refusal. NSW and Queensland read and write no record.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const spy = vi.hoisted(() => ({ tablesRead: [] as string[], failFee: false, failCaseMove: false }));

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => {
  const { sharedFake } = await import("@/test/fake-orm");
  // Every table read or written through the global db.orm is recorded, to show what NSW and Queensland never touch.
  const publicTables = new Proxy({} as Record<string, unknown>, {
    get: (_t, name: string) => {
      spy.tablesRead.push(name);
      return (sharedFake.db.orm.public as Record<string, unknown>)[name];
    },
  });
  return { db: { ...sharedFake.db, orm: { ...sharedFake.db.orm, public: publicTables } } };
});
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
vi.mock("@/lib/auth/require-membership", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/require-membership")>()),
  requireSchemeMembership: vi.fn(async () => ({ profile: { id: "adviser" }, membership: {}, roles: ["ADVISER"] })),
}));
const captureUsageFee = vi.fn(async () => {
  if (spy.failFee) throw new Error("fee store down");
});
vi.mock("@/lib/billing/capture", () => ({ captureUsageFee: (...a: unknown[]) => (captureUsageFee as (...x: unknown[]) => unknown)(...a) }));
// Western Australia as if switched on: its draft pack is the building's.
vi.mock("@/lib/jurisdiction/scheme-rules", async (orig) => {
  const actual = await orig<typeof import("@/lib/jurisdiction/scheme-rules")>();
  const { PENDING_RULE_PACKS } = await import("@/config/statutory");
  const wa = PENDING_RULE_PACKS.WA;
  const waRules = () => ({
    pack: { code: wa.code, state: wa.state, name: wa.name, version: wa.version, reviewer: wa.reviewer, reviewedOn: wa.reviewedOn, rules: wa.rules as unknown as import("@/config/statutory").StatutoryRules },
    rules: wa.rules as unknown as import("@/config/statutory").StatutoryRules,
    label: `${wa.code} ${wa.version}`,
  });
  const rulesForState = (s: string | null | undefined) => ((s ?? "").trim().toUpperCase() === "WA" ? waRules() : actual.rulesForState(s));
  return {
    ...actual,
    rulesForState,
    rulesForScheme: async (schemeId: string) => {
      const { sharedFake } = await import("@/test/fake-orm");
      const scheme = sharedFake.table("Scheme").find((s) => s.id === schemeId);
      if (!scheme) throw new actual.SchemeNotFoundError();
      return rulesForState(String(scheme.state));
    },
  };
});

const { sharedFake } = await import("@/test/fake-orm");
const actions = await import("./debt-recovery");
const { PENDING_RULE_PACKS, RULE_PACKS } = await import("@/config/statutory");

const SCHEME = "scheme-1";
const WA_STEPS = PENDING_RULE_PACKS.WA.rules.DEBT_RECOVERY_STEPS;
const order = (t: string) => WA_STEPS.find((s) => s.stepType === t)!.stepOrder;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-02T01:00:00.000Z"));
  spy.failFee = false;
  spy.failCaseMove = false;
  captureUsageFee.mockClear();
});

/** A WA (or `st`) building with a case on lot 1, the steps before `currentOrder` complete; meetings and motions to choose from. */
function seed(opts: { st?: "WA" | "NSW" | "QLD"; currentOrder?: number; records?: Record<string, unknown>[]; caseStatus?: string; noCase?: boolean } = {}) {
  const st = opts.st ?? "WA";
  const steps = st === "WA" ? WA_STEPS : (RULE_PACKS[st].rules.DEBT_RECOVERY_STEPS ?? []);
  const current = opts.currentOrder ?? 1;
  sharedFake.reset({
    Scheme: [{ id: SCHEME, state: st, timeZone: st === "WA" ? "Australia/Perth" : "Australia/Sydney" }, { id: "scheme-2", state: "WA", timeZone: "Australia/Perth" }],
    Lot: [{ id: "lot-1", schemeId: SCHEME, lotNumber: "1" }],
    SchemeMembership: [
      { id: "m-owner", schemeId: SCHEME, lotId: "lot-1", profileId: "debtor", role: "OWNER", isActive: true, endDate: null },
      { id: "m-adviser", schemeId: SCHEME, lotId: null, profileId: "adviser", role: "ADVISER", isActive: true, endDate: null },
    ],
    LevyNotice: [{ id: "n-1", schemeId: SCHEME, lotId: "lot-1", status: "OVERDUE", dueDate: "2026-07-01", balanceOutstanding: "1200.00", interestCharged: "35.50" }],
    PaymentPlan: [],
    Meeting: [
      { id: "council", schemeId: SCHEME, meetingType: "COMMITTEE", title: "Council meeting", scheduledAt: "2026-10-20T02:00:00.000Z", timezone: null },
      { id: "agm", schemeId: SCHEME, meetingType: "AGM", title: "AGM", scheduledAt: "2026-10-10T02:00:00.000Z", timezone: null },
      { id: "future", schemeId: SCHEME, meetingType: "COMMITTEE", title: "Next council meeting", scheduledAt: "2026-11-20T02:00:00.000Z", timezone: null },
      { id: "elsewhere", schemeId: "scheme-2", meetingType: "COMMITTEE", title: "Another building's council", scheduledAt: "2026-10-20T02:00:00.000Z", timezone: null },
    ],
    AgendaItem: [
      { id: "c-carried", meetingId: "council", position: 1, title: "Start proceedings for lot 1", status: "CARRIED", outcome: "RESOLVED", resolutionCategory: "ORDINARY" },
      { id: "c-lost", meetingId: "council", position: 2, title: "Start proceedings for lot 1", status: "LOST", outcome: "MOTION_LOST", resolutionCategory: "ORDINARY" },
      { id: "g-carried", meetingId: "agm", position: 1, title: "Start proceedings for lot 1", status: "CARRIED", outcome: "RESOLVED", resolutionCategory: "ORDINARY" },
      { id: "f-carried", meetingId: "future", position: 1, title: "Start proceedings for lot 1", status: "CARRIED", outcome: "RESOLVED", resolutionCategory: "ORDINARY" },
      { id: "e-carried", meetingId: "elsewhere", position: 1, title: "x", status: "CARRIED", outcome: "RESOLVED", resolutionCategory: "ORDINARY" },
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
            totalOwed: "1235.50",
            rulePack: st === "WA" ? `AU-WA ${PENDING_RULE_PACKS.WA.version}` : `AU-${st} test`,
          },
        ],
    DebtRecoveryStep: opts.noCase
      ? []
      : steps.map(({ status: _rule, ...s }) => ({ ...s, id: `step-${s.stepOrder}`, caseId: "case-1", status: s.stepOrder < current ? "COMPLETED" : "PENDING" })),
    DebtRecoveryActivity: [],
    DebtRecoveryRecord: opts.records ?? [],
  });
  spy.tablesRead.length = 0;
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
const step = (t: string) => sharedFake.table("DebtRecoveryStep").find((s) => s.id === `step-${order(t)}`)!;
const AUTHORITY_RECORD = { id: "r-1", caseId: "case-1", schemeId: SCHEME, state: "WA", kind: "AUTHORITY_TO_SUE", decidedOn: "2026-10-20", recordedAt: "2026-10-21T00:00:00.000Z", amount: "1235.50" };

/** Nothing written: the step, the case, the activities and the records as seeded. */
function expectNothingWritten(stepType: string) {
  expect(step(stepType).status).toBe("PENDING");
  expect(sharedFake.table("DebtRecoveryCase")[0].currentStep).toBe(stepType);
  expect(sharedFake.table("DebtRecoveryActivity")).toEqual([]);
  expect(captureUsageFee).not.toHaveBeenCalled();
}

describe("opening a WA case", () => {
  it("copies the WA steps onto the case", async () => {
    seed({ noCase: true });
    expect(await actions.initiateDebtRecoveryAction(SCHEME, "lot-1", "debtor")).toMatchObject({ success: true });
    expect(sharedFake.table("DebtRecoveryStep").map((s) => s.stepType)).toEqual(WA_STEPS.map((s) => s.stepType));
    expect(sharedFake.table("DebtRecoveryCase")[0].rulePack).toBe(`AU-WA ${PENDING_RULE_PACKS.WA.version}`);
  });
});

describe("the Decision to Start Proceedings step (D9)", () => {
  it("refuses the adviser alone, with nothing written", async () => {
    seed({ currentOrder: order("COMMITTEE_REVIEW") });
    expect(await complete("COMMITTEE_REVIEW")).toEqual({
      error: "Choose the meeting and the motion carried at it: a motion carried at a council meeting or a motion carried at a general meeting.",
    });
    expectNothingWritten("COMMITTEE_REVIEW");
    expect(records()).toEqual([]);
  });

  it.each([
    ["a motion not carried", "council", "c-lost", "That motion was not carried, so it cannot be relied on."],
    ["another building's meeting", "elsewhere", "e-carried", "Choose a meeting of this scheme."],
    ["a meeting not yet held", "future", "f-carried", "That resolution has not taken effect yet, so it cannot be relied on."],
  ])("refuses %s, with nothing written", async (_what, meeting, item, error) => {
    seed({ currentOrder: order("COMMITTEE_REVIEW") });
    expect(await complete("COMMITTEE_REVIEW", { authorityMeetingId: meeting, authorityItemId: item })).toEqual({ error });
    expectNothingWritten("COMMITTEE_REVIEW");
    expect(records()).toEqual([]);
  });

  it.each([
    ["a council motion", "council", "c-carried", "COMMITTEE", "2026-10-20"],
    ["a general meeting motion", "agm", "g-carried", "GENERAL_MEETING", "2026-10-10"],
  ])("records %s with the step, and the amount owing", async (_what, meeting, item, kind, day) => {
    seed({ currentOrder: order("COMMITTEE_REVIEW") });
    expect(await complete("COMMITTEE_REVIEW", { authorityMeetingId: meeting, authorityItemId: item })).toEqual({ success: true });
    expect(step("COMMITTEE_REVIEW").status).toBe("COMPLETED");
    expect(records()).toHaveLength(1);
    expect(records()[0]).toMatchObject({
      caseId: "case-1",
      schemeId: SCHEME,
      state: "WA",
      kind: "AUTHORITY_TO_SUE",
      decidedOn: day,
      resolutionMeetingId: meeting,
      resolutionItemId: item,
      resolutionKind: kind,
      amount: "1235.50",
      forum: null,
      lodgedOn: null,
      rulePack: `AU-WA ${PENDING_RULE_PACKS.WA.version}`,
      recordedBy: "adviser",
    });
  });

  it("writes the record in the step's transaction: a failure later in it leaves neither", async () => {
    seed({ currentOrder: order("COMMITTEE_REVIEW") });
    // The case's move to the next step, written after the record in the same transaction, fails: both are rolled back.
    spy.failCaseMove = true;
    expect(await complete("COMMITTEE_REVIEW", { authorityMeetingId: "council", authorityItemId: "c-carried" })).toEqual({ error: "Failed to complete step" });
    expect(records()).toEqual([]);
    expect(step("COMMITTEE_REVIEW").status).toBe("PENDING");
    expect(sharedFake.table("DebtRecoveryCase")[0].currentStep).toBe("COMMITTEE_REVIEW");
  });

  it("is still completed in order: the step order check refuses it out of order, with nothing written", async () => {
    seed({ currentOrder: order("FINAL_NOTICE") });
    expect(await complete("COMMITTEE_REVIEW", { authorityMeetingId: "council", authorityItemId: "c-carried" })).toEqual({
      error: "Steps are completed in order. Complete Final Notice first.",
    });
    expect(records()).toEqual([]);
  });
});

describe("the steps after the decision", () => {
  it("the legal referral needs the decision recorded (a case whose record is missing is refused)", async () => {
    seed({ currentOrder: order("LEGAL_REFERRAL") });
    expect(await complete("LEGAL_REFERRAL", { feeConfirmedCents: "0" })).toEqual({ error: "Record the decision to start proceedings on the Decision to Start Proceedings step first." });
    expectNothingWritten("LEGAL_REFERRAL");
    seed({ currentOrder: order("LEGAL_REFERRAL"), records: [AUTHORITY_RECORD] });
    expect(await complete("LEGAL_REFERRAL")).toEqual({ success: true });
    expect(records()).toHaveLength(1);
  });

  it("the Proceedings step refuses SAT and an unknown forum, and records a court (D13)", async () => {
    seed({ currentOrder: order("PROCEEDINGS"), records: [AUTHORITY_RECORD] });
    expect(await complete("PROCEEDINGS", { forum: "SAT" })).toEqual({
      error: "The State Administrative Tribunal (SAT) cannot hear this claim: a dispute about an amount owed as a debt is not a scheme dispute (STA s 197(3)(f)).",
    });
    expectNothingWritten("PROCEEDINGS");
    expect(await complete("PROCEEDINGS")).toEqual({ error: "Choose where proceedings were started: a court of competent jurisdiction." });
    expect(records()).toHaveLength(1);
    expect(await complete("PROCEEDINGS", { forum: "COURT" })).toEqual({ success: true });
    expect(records().map((r) => [r.kind, r.forum, r.decidedOn])).toEqual([
      ["AUTHORITY_TO_SUE", undefined, "2026-10-20"],
      ["PROCEEDINGS_STARTED", "COURT", "2026-11-02"],
    ]);
  });

  it("marking the case as referred for legal recovery needs the decision recorded, as well as the referral step", async () => {
    // The referral step complete but the decision record missing (a case changed outside StrataVerze): refused.
    seed({ currentOrder: order("PROCEEDINGS") });
    const f = new FormData();
    f.set("status", "REFERRED_LEGAL");
    expect(await actions.updateDebtRecoveryCaseAction("case-1", SCHEME, f)).toEqual({
      error: "Record the decision to start proceedings on the Decision to Start Proceedings step before referring this case for legal recovery.",
    });
    expect(sharedFake.table("DebtRecoveryCase")[0].status).toBe("IN_PROGRESS");
    seed({ currentOrder: order("PROCEEDINGS"), records: [AUTHORITY_RECORD] });
    expect(await actions.updateDebtRecoveryCaseAction("case-1", SCHEME, f)).toEqual({ success: true });
    expect(sharedFake.table("DebtRecoveryCase")[0].status).toBe("REFERRED_LEGAL");
  });

  it("closing a WA case passes the gates", async () => {
    seed({ currentOrder: order("FINAL_NOTICE") });
    expect(await actions.closeDebtRecoveryCaseAction("case-1", SCHEME, "Paid", "CLOSED_PAID")).toEqual({ success: true });
  });
});

describe("NSW and Queensland read and write no record", () => {
  const RECORD_TABLES = ["DebtRecoveryRecord", "Meeting", "AgendaItem", "PendingResolution"];
  for (const st of ["NSW", "QLD"] as const) {
    it(`${st}: every step, the referral, the status and closing`, async () => {
      const steps = RULE_PACKS[st].rules.DEBT_RECOVERY_STEPS!;
      for (const s of steps) {
        seed({ st, currentOrder: s.stepOrder });
        const result = await actions.completeDebtRecoveryStepAction(`step-${s.stepOrder}`, "case-1", SCHEME, form({ feeConfirmedCents: "0" }));
        expect(result, s.stepType).not.toHaveProperty("error", expect.stringMatching(/decision to start proceedings|record/i));
        expect(spy.tablesRead.filter((t) => RECORD_TABLES.includes(t)), s.stepType).toEqual([]);
      }
      seed({ st, currentOrder: 9 });
      const f = new FormData();
      f.set("status", "REFERRED_LEGAL");
      expect(await actions.updateDebtRecoveryCaseAction("case-1", SCHEME, f)).toEqual({ success: true });
      expect(await actions.closeDebtRecoveryCaseAction("case-1", SCHEME, "Paid", "CLOSED_PAID")).toEqual({ success: true });
      seed({ st, noCase: true });
      await actions.initiateDebtRecoveryAction(SCHEME, "lot-1", "debtor");
      expect(spy.tablesRead.filter((t) => RECORD_TABLES.includes(t))).toEqual([]);
      expect(records()).toEqual([]);
    });
  }

  it("closing an NSW or Queensland case reads no building: the case's own pack label decides", async () => {
    seed({ st: "NSW", currentOrder: 4 });
    expect(await actions.closeDebtRecoveryCaseAction("case-1", SCHEME, "Paid", "CLOSED_PAID")).toEqual({ success: true });
    expect(spy.tablesRead).not.toContain("Scheme");
  });
});
