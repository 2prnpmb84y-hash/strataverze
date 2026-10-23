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
};
vi.mock("@/lib/queries/debt-recovery", () => ({ ...queries, DEFAULT_RECOVERY_STEPS: [] }));

const instalmentFirst = vi.fn();
const lotFirst = vi.fn();
const ownerMembershipFirst = vi.fn();
const lotOwnersAll = vi.fn();
vi.mock("@/prisma/db", () => ({
  db: {
    orm: {
      public: {
        PaymentPlanInstalment: { where: () => ({ first: instalmentFirst }) },
        Lot: { where: () => ({ first: lotFirst }) },
        SchemeMembership: {
          where: () => ({ first: ownerMembershipFirst, limit: () => ({ all: lotOwnersAll }) }),
        },
        DebtRecoveryStep: { where: () => ({ first: vi.fn() }) },
      },
    },
    transaction: vi.fn(),
  },
}));
vi.mock("@prisma/orm-postgres/orm-client", () => ({ and: (...c: unknown[]) => c }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/billing/capture", () => ({ captureUsageFee: vi.fn() }));
vi.mock("@/lib/billing/disclosure", () => ({ confirmedCentsFrom: vi.fn(), feeErrorMessage: () => null }));
vi.mock("@/lib/billing/hook-codes", () => ({ recoveryFeeVariant: () => null }));

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
    expect(queries.updateInstalment).not.toHaveBeenCalled();
  });

  it("rejects a case id from another scheme", async () => {
    const r = await actions.recordInstalmentPaymentAction("inst-1", "case-1", SCHEME_B, 100);
    expect(r.error).toBe("Case not found.");
    expect(queries.updateInstalment).not.toHaveBeenCalled();
  });

  it("rejects the debtor recording their own payment, even with a committee role", async () => {
    membership.mockResolvedValue({ profile: { id: "debtor" }, membership: {}, roles: ["COMMITTEE"] });
    const r = await actions.recordInstalmentPaymentAction("inst-1", "case-1", SCHEME_A, 100);
    expect(r.error).toMatch(/your own lot/);
    expect(queries.updateInstalment).not.toHaveBeenCalled();
  });

  it("rejects a committee member who co-owns the debtor's lot", async () => {
    membership.mockResolvedValue({ profile: { id: "co-owner" }, membership: {}, roles: ["COMMITTEE"] });
    lotOwnersAll.mockResolvedValue([
      { profileId: "debtor", isActive: true, endDate: null },
      { profileId: "co-owner", isActive: true, endDate: null },
    ]);
    const r = await actions.recordInstalmentPaymentAction("inst-1", "case-1", SCHEME_A, 100);
    expect(r.error).toMatch(/your own lot/);
    expect(queries.updateInstalment).not.toHaveBeenCalled();
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

  it("records a part payment as partly paid, not paid", async () => {
    await actions.recordInstalmentPaymentAction("inst-1", "case-1", SCHEME_A, 0.01);
    expect(queries.updateInstalment).toHaveBeenCalledWith("inst-1", expect.objectContaining({ status: "PARTIALLY_PAID" }));
    expect(queries.updateDebtRecoveryCase).not.toHaveBeenCalled();
  });

  it("rejects an instalment that belongs to another case's plan", async () => {
    instalmentFirst.mockResolvedValue({ id: "inst-9", planId: "other-plan", status: "UPCOMING" });
    const r = await actions.recordInstalmentPaymentAction("inst-9", "case-1", SCHEME_A, 100);
    expect(r.error).toBe("Instalment not found");
    expect(queries.updateInstalment).not.toHaveBeenCalled();
  });

  it("rejects an invalid amount", async () => {
    const r = await actions.recordInstalmentPaymentAction("inst-1", "case-1", SCHEME_A, -5);
    expect(r.error).toMatch(/valid amount/);
  });

  it("records a payment for an authorised adviser on the right case", async () => {
    const r = await actions.recordInstalmentPaymentAction("inst-1", "case-1", SCHEME_A, 100);
    expect(r).toEqual({ success: true });
    expect(queries.updateInstalment).toHaveBeenCalledWith("inst-1", expect.objectContaining({ status: "PAID" }));
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
    queries.getOverdueLevyNoticesForLot.mockResolvedValue([{ balanceOutstanding: 100, interestCharged: 0 }]);
    queries.generateCaseNumber.mockResolvedValue("DR-1");
    queries.createDebtRecoveryCase.mockResolvedValue({ id: "new-case" });
    const r = await actions.initiateDebtRecoveryAction(SCHEME_A, "lot-1", "debtor", "ADVISER");
    expect(r.success).toBe(true);
    expect(queries.createDebtRecoveryCase).toHaveBeenCalledWith(
      expect.objectContaining({ initiatedRole: "COMMITTEE", schemeId: SCHEME_A }),
    );
  });
});

describe("addDebtRecoveryNoteAction", () => {
  it("rejects a cross-scheme case", async () => {
    const r = await actions.addDebtRecoveryNoteAction("case-1", SCHEME_B, "note");
    expect(r.error).toBe("Case not found.");
    expect(queries.logDebtRecoveryActivity).not.toHaveBeenCalled();
  });
});
