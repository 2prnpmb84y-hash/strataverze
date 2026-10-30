import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cross-scheme and role tests for the debt recovery server actions
 * (security finding SEC-003). The actions are called directly, as an
 * attacker would call them, bypassing the UI.
 */

const SCHEME_A = "aaaaaaaa-0000-0000-0000-000000000001";
const SCHEME_B = "bbbbbbbb-0000-0000-0000-000000000002";

const membership = vi.fn();
vi.mock("@/lib/auth/require-membership", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/require-membership")>(
    "@/lib/auth/require-membership",
  );
  return { ...actual, requireSchemeMembership: (...a: unknown[]) => membership(...a) };
});

const queries = {
  getDebtRecoveryCaseById: vi.fn(),
  getPaymentPlanForCase: vi.fn(),
  updateInstalment: vi.fn(),
  updateDebtRecoveryCase: vi.fn(),
  updatePaymentPlan: vi.fn(),
  logDebtRecoveryActivity: vi.fn(),
  createDebtRecoveryCase: vi.fn(),
  createDebtRecoveryStep: vi.fn(),
  generateCaseNumber: vi.fn(),
  getOverdueLevyNoticesForLot: vi.fn(),
  createDebtRecoveryDocument: vi.fn(),
  getInstalmentsForPlan: vi.fn(),
  updateDebtRecoveryStep: vi.fn(),
};
vi.mock("@/lib/queries/debt-recovery", () => ({ ...queries, getDebtRecoverySteps: vi.fn(async () => []), readDebtRecoverySteps: vi.fn(async () => []) }));
const schemeRules = vi.fn();
vi.mock("@/lib/jurisdiction/scheme-rules", async () => {
  const { PAYMENT_PLANS, FEATURES, TERMINOLOGY } = await vi.importActual<typeof import("@/config/statutory")>("@/config/statutory");
  schemeRules.mockImplementation(async () => ({ rules: { DEBT_RECOVERY_STEPS: [], PAYMENT_PLANS, FEATURES, TERMINOLOGY }, label: "AU-NSW test" }));
  return { rulesForScheme: (...a: unknown[]) => schemeRules(...a) };
});

const instalmentFirst = vi.fn();
const lotFirst = vi.fn();
const ownerMembershipFirst = vi.fn();
const lotOwnersAll = vi.fn();
const stepFirst = vi.fn();
const lotPlansAll = vi.fn(async () => [] as Array<{ status: string }>);
const planFirst = vi.fn(async () => null as null | { id: string; caseId: string | null });
const planUpdate = vi.fn();
vi.mock("@/prisma/db", () => ({
  db: {
    orm: {
      public: {
        PaymentPlanInstalment: { where: () => ({ first: instalmentFirst }) },
        Lot: { where: () => ({ first: lotFirst }) },
        SchemeMembership: {
          where: () => ({ first: ownerMembershipFirst, limit: () => ({ all: lotOwnersAll }) }),
        },
        DebtRecoveryStep: { where: () => ({ first: stepFirst }) },
        PaymentPlan: { where: () => ({ limit: () => ({ all: lotPlansAll }), first: planFirst, update: planUpdate }) },
      },
    },
    transaction: vi.fn(),
  },
}));
vi.mock("@prisma/orm-postgres/orm-client", () => ({ and: (...c: unknown[]) => c }));
const recordPlanInstalmentPayment = vi.fn(async () => ({ completed: false }));
vi.mock("@/lib/debt-recovery/payment-plan-requests", () => ({ recordPlanInstalmentPayment: (...a: unknown[]) => recordPlanInstalmentPayment(...(a as [])) }));
vi.mock("@/lib/jurisdiction/scheme-time", () => ({ schemeToday: vi.fn(async () => "2026-10-26") }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const captureUsageFee = vi.fn();
vi.mock("@/lib/billing/capture", () => ({ captureUsageFee: (...a: unknown[]) => captureUsageFee(...a) }));
vi.mock("@/lib/billing/disclosure", () => ({ confirmedCentsFrom: vi.fn(), feeErrorMessage: () => null }));
const feeVariant = vi.fn((_stepType: string) => null as string | null);
vi.mock("@/lib/billing/hook-codes", () => ({ recoveryFeeVariant: (t: string) => feeVariant(t) }));

const actions = await import("./debt-recovery");
const { AuthorisationError } = await import("@/lib/auth/require-membership");

const adviser = { id: "adviser-profile" };
const caseInA = { id: "case-1", schemeId: SCHEME_A, lotId: "lot-1", ownerId: "debtor", status: "PAYMENT_PLAN" };

beforeEach(() => {
  vi.clearAllMocks();
  membership.mockResolvedValue({ profile: adviser, membership: {}, roles: ["ADVISER"] });
  queries.getDebtRecoveryCaseById.mockResolvedValue(caseInA);
  queries.getPaymentPlanForCase.mockResolvedValue({ id: "plan-1" });
  queries.getInstalmentsForPlan.mockResolvedValue([{ status: "UPCOMING" }]);
  instalmentFirst.mockResolvedValue({ id: "inst-1", planId: "plan-1", status: "UPCOMING", amount: 100 });
  lotOwnersAll.mockResolvedValue([{ profileId: "debtor", isActive: true, endDate: null }]);
});

describe("recordInstalmentPaymentAction", () => {
  it("rejects a caller with no adviser or committee role (for example the defaulting owner)", async () => {
    membership.mockRejectedValue(new AuthorisationError("You do not have permission to perform this action."));
    const r = await actions.recordInstalmentPaymentAction("inst-1", "case-1", SCHEME_A, 100);
    expect(r.error).toMatch(/permission/);
    expect(recordPlanInstalmentPayment).not.toHaveBeenCalled();
  });

  it("rejects a case id from another scheme", async () => {
    const r = await actions.recordInstalmentPaymentAction("inst-1", "case-1", SCHEME_B, 100);
    expect(r.error).toBe("Case not found.");
    expect(recordPlanInstalmentPayment).not.toHaveBeenCalled();
  });

  it("rejects the debtor recording their own payment, even with a committee role", async () => {
    membership.mockResolvedValue({ profile: { id: "debtor" }, membership: {}, roles: ["COMMITTEE"] });
    const r = await actions.recordInstalmentPaymentAction("inst-1", "case-1", SCHEME_A, 100);
    expect(r.error).toMatch(/your own lot/);
    expect(recordPlanInstalmentPayment).not.toHaveBeenCalled();
  });

  it("rejects a committee member who co-owns the debtor's lot", async () => {
    membership.mockResolvedValue({ profile: { id: "co-owner" }, membership: {}, roles: ["COMMITTEE"] });
    lotOwnersAll.mockResolvedValue([
      { profileId: "debtor", isActive: true, endDate: null },
      { profileId: "co-owner", isActive: true, endDate: null },
    ]);
    const r = await actions.recordInstalmentPaymentAction("inst-1", "case-1", SCHEME_A, 100);
    expect(r.error).toMatch(/your own lot/);
    expect(recordPlanInstalmentPayment).not.toHaveBeenCalled();
    const close = await actions.closeDebtRecoveryCaseAction("case-1", SCHEME_A, "x", "CLOSED_WRITTEN_OFF");
    expect(close.error).toMatch(/your own lot/);
  });

  it("rejects a former owner of the lot within 30 days", async () => {
    membership.mockResolvedValue({ profile: { id: "seller" }, membership: {}, roles: ["COMMITTEE"] });
    lotOwnersAll.mockResolvedValue([
      { profileId: "seller", isActive: false, endDate: new Date(Date.now() - 5 * 86400000).toISOString() },
    ]);
    const r = await actions.addDebtRecoveryNoteAction("case-1", SCHEME_A, "note");
    expect(r.error).toMatch(/your own lot/);
  });

  it("records a part payment through the plan's own payment record, in cents", async () => {
    await actions.recordInstalmentPaymentAction("inst-1", "case-1", SCHEME_A, 0.01);
    expect(recordPlanInstalmentPayment).toHaveBeenCalledWith(expect.objectContaining({ planId: "plan-1", instalmentId: "inst-1", amountCents: 1, paidOn: "2026-10-26" }));
    expect(queries.updateDebtRecoveryCase).not.toHaveBeenCalled();
  });

  it("rejects an instalment that belongs to another case's plan", async () => {
    instalmentFirst.mockResolvedValue({ id: "inst-9", planId: "other-plan", status: "UPCOMING" });
    const r = await actions.recordInstalmentPaymentAction("inst-9", "case-1", SCHEME_A, 100);
    expect(r.error).toBe("Instalment not found");
    expect(recordPlanInstalmentPayment).not.toHaveBeenCalled();
  });

  it("rejects an invalid amount", async () => {
    const r = await actions.recordInstalmentPaymentAction("inst-1", "case-1", SCHEME_A, -5);
    expect(r.error).toMatch(/valid amount/);
  });

  it("records a payment for an authorised adviser on the right case", async () => {
    const r = await actions.recordInstalmentPaymentAction("inst-1", "case-1", SCHEME_A, 100);
    expect(r).toEqual({ success: true });
    expect(recordPlanInstalmentPayment).toHaveBeenCalledWith(expect.objectContaining({ instalmentId: "inst-1", amountCents: 10_000, actorId: "adviser-profile" }));
  });
});

describe("closeDebtRecoveryCaseAction", () => {
  it("rejects a status outside the closing statuses", async () => {
    const r = await actions.closeDebtRecoveryCaseAction("case-1", SCHEME_A, "x", "OPEN" as never);
    expect(r.error).toMatch(/Invalid closing status/);
    expect(queries.updateDebtRecoveryCase).not.toHaveBeenCalled();
  });

  it("rejects a cross-scheme case", async () => {
    const r = await actions.closeDebtRecoveryCaseAction("case-1", SCHEME_B, "paid", "CLOSED_PAID");
    expect(r.error).toBe("Case not found.");
    expect(queries.updateDebtRecoveryCase).not.toHaveBeenCalled();
  });

  it("requires a reason", async () => {
    const r = await actions.closeDebtRecoveryCaseAction("case-1", SCHEME_A, "  ", "CLOSED_WRITTEN_OFF");
    expect(r.error).toMatch(/reason/);
  });
});

describe("updateDebtRecoveryCaseAction", () => {
  it("rejects an unknown status written from the form", async () => {
    const fd = new FormData();
    fd.set("status", "FORGIVEN");
    const r = await actions.updateDebtRecoveryCaseAction("case-1", SCHEME_A, fd);
    expect(r.error).toMatch(/Invalid case status/);
    expect(queries.updateDebtRecoveryCase).not.toHaveBeenCalled();
  });

  it("does not allow closing through the update form", async () => {
    const fd = new FormData();
    fd.set("status", "CLOSED_WRITTEN_OFF");
    const r = await actions.updateDebtRecoveryCaseAction("case-1", SCHEME_A, fd);
    expect(r.error).toMatch(/close case form/);
  });

  it("requires a reason to exclude from recovery", async () => {
    const fd = new FormData();
    fd.set("excludeFromRecovery", "on");
    const r = await actions.updateDebtRecoveryCaseAction("case-1", SCHEME_A, fd);
    expect(r.error).toMatch(/reason/);
  });
});

describe("initiateDebtRecoveryAction", () => {
  it("rejects a lot from another scheme", async () => {
    lotFirst.mockResolvedValue({ id: "lot-1", schemeId: SCHEME_B });
    const r = await actions.initiateDebtRecoveryAction(SCHEME_A, "lot-1", "debtor", "ADVISER");
    expect(r.error).toBe("Lot not found");
    expect(queries.createDebtRecoveryCase).not.toHaveBeenCalled();
  });

  it("rejects an owner id that is not an owner of the lot", async () => {
    lotFirst.mockResolvedValue({ id: "lot-1", schemeId: SCHEME_A });
    ownerMembershipFirst.mockResolvedValue(null);
    const r = await actions.initiateDebtRecoveryAction(SCHEME_A, "lot-1", "stranger", "ADVISER");
    expect(r.error).toMatch(/not an owner/);
  });

  it("records the role from the caller's memberships, not the client", async () => {
    membership.mockResolvedValue({ profile: { id: "committee-member" }, membership: {}, roles: ["COMMITTEE"] });
    lotFirst.mockResolvedValue({ id: "lot-1", schemeId: SCHEME_A });
    ownerMembershipFirst.mockResolvedValue({ id: "m" });
    queries.getOverdueLevyNoticesForLot.mockResolvedValue([{ id: "n-1", amountDue: 100, amountPaid: 0, balanceOutstanding: 100, interestCharged: 0 }]);
    queries.generateCaseNumber.mockResolvedValue("DR-1");
    queries.createDebtRecoveryCase.mockResolvedValue({ id: "new-case" });
    const r = await actions.initiateDebtRecoveryAction(SCHEME_A, "lot-1", "debtor", "ADVISER");
    expect(r.success).toBe(true);
    expect(queries.createDebtRecoveryCase).toHaveBeenCalledWith(
      expect.objectContaining({ initiatedRole: "COMMITTEE", schemeId: SCHEME_A }),
    );
  });
});

describe("initiateDebtRecoveryAction for a pack without the recovery steps", () => {
  const ready = () => {
    membership.mockResolvedValue({ profile: { id: "committee-member" }, membership: {}, roles: ["COMMITTEE"] });
    lotFirst.mockResolvedValue({ id: "lot-1", schemeId: SCHEME_A });
    ownerMembershipFirst.mockResolvedValue({ id: "m" });
    queries.getOverdueLevyNoticesForLot.mockResolvedValue([{ id: "n-1", amountDue: 100, amountPaid: 0, balanceOutstanding: 100, interestCharged: 0 }]);
    queries.generateCaseNumber.mockResolvedValue("DR-1");
    queries.createDebtRecoveryCase.mockResolvedValue({ id: "new-case" });
  };
  const sharedOnly = (debtRecoverySteps: boolean) => ({
    rules: { TERMINOLOGY: { jurisdictionShort: "Qld" }, FEATURES: { debtRecoverySteps } },
    label: "AU-QLD test",
  });

  it("resolves the steps before creating the case, so no case is left behind", async () => {
    ready();
    schemeRules.mockResolvedValueOnce(sharedOnly(true));
    const r = await actions.initiateDebtRecoveryAction(SCHEME_A, "lot-1", "debtor", "ADVISER");
    expect(r.error).toBe("Failed to initiate debt recovery case");
    expect(queries.createDebtRecoveryCase).not.toHaveBeenCalled();
    expect(queries.createDebtRecoveryStep).not.toHaveBeenCalled();
  });

  it("refuses when the pack does not switch the steps on, writing nothing", async () => {
    ready();
    schemeRules.mockResolvedValueOnce(sharedOnly(false));
    const r = await actions.initiateDebtRecoveryAction(SCHEME_A, "lot-1", "debtor", "ADVISER");
    expect(r.error).toBe("This is not available for this building.");
    expect(queries.generateCaseNumber).not.toHaveBeenCalled();
    expect(queries.createDebtRecoveryCase).not.toHaveBeenCalled();
  });
});

describe("initiateDebtRecoveryAction for a Queensland building (stage 2, step 8)", () => {
  it("starts at PAYMENT_PLAN for an active plan only where the pack has the payment plan workflow", async () => {
    const { QLD_RULE_PACK, RULE_PACKS } = await vi.importActual<typeof import("@/config/statutory")>("@/config/statutory");
    const ready = () => {
      membership.mockResolvedValue({ profile: { id: "committee-member" }, membership: {}, roles: ["COMMITTEE"] });
      lotFirst.mockResolvedValue({ id: "lot-1", schemeId: SCHEME_A });
      ownerMembershipFirst.mockResolvedValue({ id: "m" });
      queries.getOverdueLevyNoticesForLot.mockResolvedValue([{ id: "n-1", amountDue: 100, amountPaid: 0, balanceOutstanding: 100, interestCharged: 0 }]);
      queries.generateCaseNumber.mockResolvedValue("DR-1");
      queries.createDebtRecoveryCase.mockResolvedValue({ id: "new-case" });
      planFirst.mockResolvedValue({ id: "plan-1", caseId: null });
    };
    ready();
    schemeRules.mockResolvedValueOnce({ rules: QLD_RULE_PACK.rules, label: "AU-QLD test" });
    expect(await actions.initiateDebtRecoveryAction(SCHEME_A, "lot-1", "debtor", "ADVISER")).toEqual({ success: true, id: "new-case" });
    expect(planFirst).not.toHaveBeenCalled();
    expect(queries.updateDebtRecoveryCase).not.toHaveBeenCalled();

    vi.clearAllMocks();
    ready();
    schemeRules.mockResolvedValueOnce({ rules: RULE_PACKS.NSW.rules, label: "AU-NSW test" });
    expect(await actions.initiateDebtRecoveryAction(SCHEME_A, "lot-1", "debtor", "ADVISER")).toEqual({ success: true, id: "new-case" });
    expect(planUpdate).toHaveBeenCalledWith({ caseId: "new-case" });
    expect(queries.updateDebtRecoveryCase).toHaveBeenCalledWith("new-case", { status: "PAYMENT_PLAN" });
    planFirst.mockResolvedValue(null);
  });

  it("copies the Queensland pack's steps onto the case, without the rule status", async () => {
    const { QLD_RULE_PACK } = await vi.importActual<typeof import("@/config/statutory")>("@/config/statutory");
    const qld = QLD_RULE_PACK.rules;
    membership.mockResolvedValue({ profile: { id: "committee-member" }, membership: {}, roles: ["COMMITTEE"] });
    lotFirst.mockResolvedValue({ id: "lot-1", schemeId: SCHEME_A });
    ownerMembershipFirst.mockResolvedValue({ id: "m" });
    queries.getOverdueLevyNoticesForLot.mockResolvedValue([{ id: "n-1", amountDue: 100, amountPaid: 0, balanceOutstanding: 100, interestCharged: 0 }]);
    queries.generateCaseNumber.mockResolvedValue("DR-1");
    queries.createDebtRecoveryCase.mockResolvedValue({ id: "new-case" });
    schemeRules.mockResolvedValueOnce({ rules: qld, label: "AU-QLD test" });

    const r = await actions.initiateDebtRecoveryAction(SCHEME_A, "lot-1", "debtor", "ADVISER");
    expect(r).toEqual({ success: true, id: "new-case" });
    const created = queries.createDebtRecoveryStep.mock.calls.map(([step]) => step as Record<string, unknown>);
    expect(created.map((s) => s.stepType)).toEqual(qld.DEBT_RECOVERY_STEPS.map((s) => s.stepType));
    expect(created.find((s) => s.stepType === "HARDSHIP_REVIEW")?.legalBasis).toContain("166(6)");
    for (const step of created) {
      expect(step.caseId).toBe("new-case");
      expect("status" in step).toBe(false);
    }
  });
});

describe("completeDebtRecoveryStepAction for a Queensland building (stage 2, step 8)", () => {
  it("completes a step: there is no statutory payment plan to pause it", async () => {
    const { QLD_RULE_PACK } = await vi.importActual<typeof import("@/config/statutory")>("@/config/statutory");
    schemeRules.mockResolvedValueOnce({ rules: QLD_RULE_PACK.rules, pack: { state: "QLD" }, label: "AU-QLD test" });
    stepFirst.mockResolvedValue({ id: "step-4", caseId: "case-1", stepType: "FINAL_NOTICE", stepOrder: 4, status: "PENDING" });
    lotPlansAll.mockResolvedValue([{ status: "ACTIVE" }]);
    const r = await actions.completeDebtRecoveryStepAction("step-4", "case-1", SCHEME_A, new FormData());
    expect(r).toEqual({ success: true });
  });

  it("captures the step fee with the building's state, so its pack decides what the owner can be charged", async () => {
    const { QLD_RULE_PACK } = await vi.importActual<typeof import("@/config/statutory")>("@/config/statutory");
    const { db } = await import("@/prisma/db");
    // The transaction locks the case and reads its steps: FINAL_NOTICE is the current step.
    const finalNotice = { id: "step-4", caseId: "case-1", stepType: "FINAL_NOTICE", stepOrder: 4, status: "PENDING" };
    const txOrm = {
      public: {
        DebtRecoveryCase: { where: () => ({ forNoKeyUpdate: () => ({ first: async () => ({ ...caseInA, status: "OPEN", currentStep: "FINAL_NOTICE" }) }) }) },
        DebtRecoveryStep: { where: () => ({ orderBy: () => ({ all: async () => [finalNotice] }) }) },
      },
    };
    vi.mocked(db.transaction).mockImplementationOnce((async (fn: (tx: { orm: unknown }) => Promise<unknown>) => fn({ orm: txOrm })) as never);
    feeVariant.mockReturnValueOnce("FINAL_NOTICE");
    schemeRules.mockResolvedValueOnce({ rules: QLD_RULE_PACK.rules, pack: { state: "QLD" }, label: "AU-QLD test" });
    stepFirst.mockResolvedValue({ id: "step-4", caseId: "case-1", stepType: "FINAL_NOTICE", stepOrder: 4, status: "PENDING" });
    const r = await actions.completeDebtRecoveryStepAction("step-4", "case-1", SCHEME_A, new FormData());
    expect(r).toEqual({ success: true });
    expect(captureUsageFee).toHaveBeenCalledWith(txOrm, expect.objectContaining({ code: "RECOVERY_STEP", variant: "FINAL_NOTICE", state: "QLD", payerProfileId: "debtor" }));
  });
});

describe("updateDebtRecoveryCaseAction referral while a payment plan is followed", () => {
  const referral = () => {
    const f = new FormData();
    f.set("status", "REFERRED_LEGAL");
    return f;
  };

  it("refuses the referral for an NSW building (payment plan workflow on)", async () => {
    lotPlansAll.mockResolvedValue([{ status: "ACTIVE" }]);
    const r = await actions.updateDebtRecoveryCaseAction("case-1", SCHEME_A, referral());
    expect(r.error).toMatch(/cannot be referred for legal recovery/);
    expect(queries.updateDebtRecoveryCase).not.toHaveBeenCalled();
  });

  it("allows it for a pack without the payment plan workflow", async () => {
    const { QLD_RULE_PACK } = await vi.importActual<typeof import("@/config/statutory")>("@/config/statutory");
    const { readDebtRecoverySteps } = await import("@/lib/queries/debt-recovery");
    schemeRules.mockResolvedValueOnce({ rules: QLD_RULE_PACK.rules, pack: { state: "QLD" }, label: "AU-QLD test" });
    lotPlansAll.mockResolvedValue([{ status: "ACTIVE" }]);
    // The case's legal referral step is complete.
    vi.mocked(readDebtRecoverySteps).mockResolvedValueOnce([{ stepType: "LEGAL_REFERRAL", status: "COMPLETED" }] as never);
    const r = await actions.updateDebtRecoveryCaseAction("case-1", SCHEME_A, referral());
    expect(r).toEqual({ success: true });
    expect(queries.updateDebtRecoveryCase).toHaveBeenCalledWith("case-1", expect.objectContaining({ status: "REFERRED_LEGAL" }));
  });
});

describe("updateDebtRecoveryCaseAction referral when the steps cannot be read", () => {
  it("says the steps could not be checked, not that the referral step is incomplete, and saves nothing", async () => {
    const { QLD_RULE_PACK } = await vi.importActual<typeof import("@/config/statutory")>("@/config/statutory");
    const { readDebtRecoverySteps } = await import("@/lib/queries/debt-recovery");
    schemeRules.mockResolvedValueOnce({ rules: QLD_RULE_PACK.rules, pack: { state: "QLD" }, label: "AU-QLD test" });
    vi.mocked(readDebtRecoverySteps).mockRejectedValueOnce(new Error("connection lost"));
    const f = new FormData();
    f.set("status", "REFERRED_LEGAL");
    const r = await actions.updateDebtRecoveryCaseAction("case-1", SCHEME_A, f);
    expect(r).toEqual({ error: "Could not check the case's steps. Nothing was saved." });
    expect(queries.updateDebtRecoveryCase).not.toHaveBeenCalled();
    expect(queries.logDebtRecoveryActivity).not.toHaveBeenCalled();
  });
});

describe("addDebtRecoveryNoteAction", () => {
  it("rejects a cross-scheme case", async () => {
    const r = await actions.addDebtRecoveryNoteAction("case-1", SCHEME_B, "note");
    expect(r.error).toBe("Case not found.");
    expect(queries.logDebtRecoveryActivity).not.toHaveBeenCalled();
  });
});

describe("completeDebtRecoveryStepAction while a payment plan is followed", () => {
  const form = () => new FormData();

  it("refuses the notice before action and later steps", async () => {
    stepFirst.mockResolvedValue({ id: "step-4", caseId: "case-1", stepType: "FINAL_NOTICE", stepOrder: 4, status: "PENDING" });
    lotPlansAll.mockResolvedValue([{ status: "ACTIVE" }]);
    const r = await actions.completeDebtRecoveryStepAction("step-4", "case-1", SCHEME_A, form());
    expect(r.error).toMatch(/payment plan is being followed/);
  });

  it("allows earlier steps", async () => {
    stepFirst.mockResolvedValue({ id: "step-3", caseId: "case-1", stepType: "REMINDER_NOTICE", stepOrder: 3, status: "PENDING" });
    lotPlansAll.mockResolvedValue([{ status: "ACTIVE" }]);
    const r = await actions.completeDebtRecoveryStepAction("step-3", "case-1", SCHEME_A, form());
    expect(r.error ?? "").not.toMatch(/payment plan is being followed/);
  });
});
