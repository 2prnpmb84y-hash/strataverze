/**
 * The order of the recovery steps and the legal referral, checked by the
 * server (debt recovery step order fix, 29 Oct 2026, approved by Matthew
 * Wrigley). The case screens offer to complete only the case's current step
 * while the case is open (adviser case page and the committee's owner case
 * page), and no screen skips a step or sets REFERRED_LEGAL. The actions are
 * called directly, as a caller bypassing the screens would, on the in-memory
 * database, whose row locks behave as Postgres's do.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const who = vi.hoisted(() => ({ profileId: "adviser", roles: ["ADVISER"] as string[] }));

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-membership", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/require-membership")>()),
  requireSchemeMembership: vi.fn(async () => ({ profile: { id: who.profileId }, membership: {}, roles: who.roles })),
}));
const captureUsageFee = vi.fn();
vi.mock("@/lib/billing/capture", () => ({ captureUsageFee: (...a: unknown[]) => captureUsageFee(...a) }));

const { sharedFake } = await import("@/test/fake-orm");
const actions = await import("./debt-recovery");
const { RULE_PACKS } = await import("@/config/statutory");

const SCHEME = "scheme-1";

/** A case on lot 1 with the pack's steps, those before `currentOrder` complete and that one current. */
function seed(st: "NSW" | "QLD", currentOrder: number, opts: { caseStatus?: string; currentStep?: string; plan?: boolean } = {}) {
  const steps = RULE_PACKS[st].rules.DEBT_RECOVERY_STEPS ?? [];
  sharedFake.reset({
    Scheme: [{ id: SCHEME, state: st }],
    SchemeMembership: [{ id: "m1", schemeId: SCHEME, lotId: "lot-1", profileId: "debtor", role: "OWNER", isActive: true, endDate: null }],
    PaymentPlan: opts.plan ? [{ id: "plan-1", lotId: "lot-1", status: "ACTIVE", caseId: "case-1" }] : [],
    DebtRecoveryCase: [
      {
        id: "case-1",
        schemeId: SCHEME,
        lotId: "lot-1",
        ownerId: "debtor",
        status: opts.caseStatus ?? "OPEN",
        currentStep: opts.currentStep ?? steps.find((s) => s.stepOrder === currentOrder)?.stepType ?? "CLOSED",
      },
    ],
    DebtRecoveryStep: steps.map(({ status: _rule, ...s }) => ({
      ...s,
      id: `step-${s.stepOrder}`,
      caseId: "case-1",
      status: s.stepOrder < currentOrder ? "COMPLETED" : "PENDING",
    })),
    DebtRecoveryActivity: [],
  });
}

const stepRow = (order: number) => sharedFake.table("DebtRecoveryStep").find((s) => s.id === `step-${order}`)!;
const caseRow = () => sharedFake.table("DebtRecoveryCase")[0];
const activities = () => sharedFake.table("DebtRecoveryActivity");
const form = (fee?: number) => {
  const f = new FormData();
  f.set("outcome", "Done");
  if (fee != null) f.set("feeConfirmedCents", String(fee));
  return f;
};
const complete = (order: number, fee?: number) => actions.completeDebtRecoveryStepAction(`step-${order}`, "case-1", SCHEME, form(fee));
const setStatus = (status: string, extra: Record<string, string> = {}) => {
  const f = new FormData();
  f.set("status", status);
  for (const [k, v] of Object.entries(extra)) f.set(k, v);
  return actions.updateDebtRecoveryCaseAction("case-1", SCHEME, f);
};

/** Nothing was written: no step completed past `before`, the case unchanged, no fee and no activity. */
function nothingWritten(completedBefore: number, currentStep: string) {
  for (const s of sharedFake.table("DebtRecoveryStep")) {
    expect(s.status).toBe(Number(s.stepOrder) < completedBefore ? "COMPLETED" : "PENDING");
  }
  expect(caseRow().currentStep).toBe(currentStep);
  expect(captureUsageFee).not.toHaveBeenCalled();
  expect(activities()).toEqual([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  who.profileId = "adviser";
  who.roles = ["ADVISER"];
});

describe("completeDebtRecoveryStepAction: only the current step", () => {
  it("refuses a later step, writing nothing (NSW)", async () => {
    seed("NSW", 1);
    const r = await complete(4, 1100);
    expect(r).toEqual({ error: "Steps are completed in order. Complete Ledger Verification first." });
    nothingWritten(1, "LEDGER_VERIFICATION");
  });

  it("refuses passing over the Queensland waiver request, in the building's words", async () => {
    seed("QLD", 5);
    const r = await complete(6);
    expect(r).toEqual({ error: "Steps are completed in order. Complete Waiver Request first." });
    nothingWritten(5, "HARDSHIP_REVIEW");
  });

  it("completes the current step and moves the case to the next, in one transaction under the case lock", async () => {
    seed("NSW", 4);
    const r = await complete(4, 1100);
    expect(r).toEqual({ success: true });
    expect(stepRow(4).status).toBe("COMPLETED");
    expect(caseRow().currentStep).toBe("HARDSHIP_REVIEW");
    expect(captureUsageFee).toHaveBeenCalledTimes(1);
    expect(sharedFake.locks).toContainEqual({ table: "DebtRecoveryCase", ids: ["case-1"], inTransaction: true });
    // Every write under the lock went through the transaction.
    expect(sharedFake.globalCallsUnderLock).toEqual([]);
    expect(activities()).toHaveLength(1);
  });

  it("completes every NSW and QLD step in order, the hardship or waiver step through the same form (no screen skips it)", async () => {
    for (const st of ["NSW", "QLD"] as const) {
      seed(st, 1);
      const steps = RULE_PACKS[st].rules.DEBT_RECOVERY_STEPS ?? [];
      for (const s of steps) {
        expect(await complete(s.stepOrder, 1)).toEqual({ success: true });
      }
      expect(sharedFake.table("DebtRecoveryStep").every((s) => s.status === "COMPLETED")).toBe(true);
      // The last step has no next step: the case stays at it.
      expect(caseRow().currentStep).toBe("CLOSED");
      expect(await complete(10)).toEqual({ error: "This step is already complete" });
    }
  });

  it("lets a committee member complete the current step, as the owner case page offers", async () => {
    who.profileId = "committee-member";
    who.roles = ["COMMITTEE"];
    seed("QLD", 2);
    expect(await complete(2)).toEqual({ success: true });
    expect(caseRow().currentStep).toBe("REMINDER_NOTICE");
    expect(await complete(4)).toEqual({ error: "Steps are completed in order. Complete Reminder Notice first." });
  });

  it("refuses any step of a closed case, writing nothing", async () => {
    seed("NSW", 10, { caseStatus: "CLOSED_PAID", currentStep: "CLOSED" });
    expect(await complete(10)).toEqual({ error: "This case is closed, so its steps cannot be completed." });
    nothingWritten(10, "CLOSED");
  });

  it("refuses when the case's current step and its steps disagree, rather than pass over a step", async () => {
    // Recorded as at FINAL_NOTICE, but LEDGER_VERIFICATION is not complete.
    seed("NSW", 1, { currentStep: "FINAL_NOTICE" });
    expect(await complete(4, 1100)).toEqual({ error: "Steps are completed in order, and this step is not the current step." });
    expect(await complete(1)).toEqual({ error: "Steps are completed in order, and this step is not the current step." });
    nothingWritten(1, "FINAL_NOTICE");
  });

  it("still refuses a step paused by a payment plan being followed (NSW) before the order is checked", async () => {
    seed("NSW", 4, { plan: true });
    const r = await complete(4, 1100);
    expect(r.error).toMatch(/payment plan is being followed/);
    nothingWritten(4, "FINAL_NOTICE");
  });
});

describe("completeDebtRecoveryStepAction: two completions at once", () => {
  it("completes the current step once when it is sent twice: one fee, one activity", async () => {
    seed("NSW", 3);
    const results = await Promise.all([complete(3, 550), complete(3, 550)]);
    expect(results).toContainEqual({ success: true });
    expect(results).toContainEqual({ error: "This step is already complete" });
    expect(captureUsageFee).toHaveBeenCalledTimes(1);
    expect(activities()).toHaveLength(1);
    expect(caseRow().currentStep).toBe("FINAL_NOTICE");
    expect(stepRow(4).status).toBe("PENDING");
  });

  it("never completes a step while an earlier one is incomplete, whichever of two completions locks first", async () => {
    seed("NSW", 3);
    const results = await Promise.all([complete(4, 1100), complete(3, 550)]);
    expect(results[1]).toEqual({ success: true });
    // The later step is completed only if it locked after the earlier one was complete.
    if (results[0].success) {
      expect(caseRow().currentStep).toBe("HARDSHIP_REVIEW");
    } else {
      expect(results[0]).toEqual({ error: "Steps are completed in order. Complete Reminder Notice first." });
      expect(stepRow(4).status).toBe("PENDING");
      expect(caseRow().currentStep).toBe("FINAL_NOTICE");
    }
    const steps = [...sharedFake.table("DebtRecoveryStep")].sort((a, b) => Number(a.stepOrder) - Number(b.stepOrder));
    const firstOpen = steps.findIndex((s) => s.status !== "COMPLETED");
    expect(steps.slice(firstOpen).every((s) => s.status !== "COMPLETED")).toBe(true);
  });
});

describe("updateDebtRecoveryCaseAction: REFERRED_LEGAL only after the legal referral step", () => {
  for (const st of ["NSW", "QLD"] as const) {
    it(`refuses it before the step, writing nothing (${st})`, async () => {
      seed(st, 7);
      expect(await setStatus("REFERRED_LEGAL")).toEqual({ error: "Complete the Legal Referral step before referring this case for legal recovery." });
      expect(caseRow().status).toBe("OPEN");
      expect(activities()).toEqual([]);
    });

    it(`allows it once the step is complete (${st})`, async () => {
      seed(st, 7);
      expect(await complete(7, 2200)).toEqual({ success: true });
      expect(await setStatus("REFERRED_LEGAL", { solicitorName: "Smith Lawyers" })).toEqual({ success: true });
      expect(caseRow().status).toBe("REFERRED_LEGAL");
      expect(caseRow().solicitorName).toBe("Smith Lawyers");
    });
  }

  it("keeps the payment plan refusal first for NSW", async () => {
    seed("NSW", 4, { plan: true });
    expect((await setStatus("REFERRED_LEGAL")).error).toMatch(/payment plan is being followed/);
  });

  it("leaves the other statuses, and a case already referred, as they were", async () => {
    seed("NSW", 2);
    expect(await setStatus("ON_HOLD")).toEqual({ success: true });
    expect(caseRow().status).toBe("ON_HOLD");
    seed("QLD", 2, { caseStatus: "REFERRED_LEGAL" });
    expect(await setStatus("REFERRED_LEGAL", { courtFileNumber: "2026/0042" })).toEqual({ success: true });
    expect(caseRow().courtFileNumber).toBe("2026/0042");
  });
});
