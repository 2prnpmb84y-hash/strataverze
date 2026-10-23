import { beforeEach, describe, expect, it, vi } from "vitest";

// MFA step-up (stage S4) is tested in src/lib/auth/mfa-enforcement.test.ts.
// Here the caller has verified recently unless a test says otherwise.
const stepUp = vi.hoisted(() => ({ requireRecentMfa: vi.fn(async () => {}) }));
vi.mock("@/lib/auth/mfa-enforcement", () => ({
  requireRecentMfa: stepUp.requireRecentMfa,
  getMfaStatus: vi.fn(async () => null),
  enforceMfa: vi.fn(async () => {}),
  enforceMfaFor: vi.fn(async () => {}),
  StepUpRequiredError: class extends Error {},
}));

/**
 * Tests for the payment control server actions (security finding M3 and L6):
 * who may appoint the treasurer, who may loosen the payment policy, and which
 * bank detail changes can be rejected.
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
const currentProfile = vi.fn();
vi.mock("@/lib/queries/profiles", () => ({ getCurrentProfile: () => currentProfile() }));

const membershipFirst = vi.fn();
const membershipUpdate = vi.fn();
const versionFirst = vi.fn();
const versionUpdate = vi.fn();
vi.mock("@/prisma/db", () => ({
  db: {
    orm: {
      public: {
        SchemeMembership: { where: () => ({ first: membershipFirst, update: membershipUpdate }) },
        SupplierBankDetailVersion: { where: () => ({ first: versionFirst, update: versionUpdate }) },
      },
    },
    transaction: vi.fn(),
  },
}));
vi.mock("@prisma/orm-postgres/orm-client", () => ({ and: (...c: unknown[]) => c }));

const queries = {
  bankDetailsDiffer: vi.fn(),
  getBankDetailVersionById: vi.fn(),
  getPaymentSettings: vi.fn(),
  recordBankDetailChange: vi.fn(),
  savePaymentPolicy: vi.fn(),
};
vi.mock("@/lib/queries/payment-controls", () => queries);
const logActivity = vi.fn();
vi.mock("@/lib/queries/activity-log", () => ({ logActivity: (...a: unknown[]) => logActivity(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const actions = await import("./payment-controls");
const { AuthorisationError } = await import("@/lib/auth/require-membership");

const committee = { id: "committee-1", isPlatformAdmin: false };

beforeEach(() => {
  vi.clearAllMocks();
  currentProfile.mockResolvedValue(committee);
  membership.mockResolvedValue({ profile: committee, membership: {}, roles: ["COMMITTEE"] });
  membershipFirst.mockResolvedValue({ id: "m-2", schemeId: SCHEME_A, role: "COMMITTEE", profileId: "committee-2" });
  queries.getPaymentSettings.mockResolvedValue({
    policy: { singleApproverLimitCents: 50000, requireSecondApproverAboveCents: null, allowSelfApproval: false, allowAdviserApproval: false },
    coolingOffDays: 5,
    isDefault: false,
  });
});

describe("setTreasurerAction", () => {
  it("does not let a committee member make themselves treasurer", async () => {
    membershipFirst.mockResolvedValue({ id: "m-1", schemeId: SCHEME_A, role: "COMMITTEE", profileId: "committee-1" });
    const r = await actions.setTreasurerAction(SCHEME_A, "m-1", true);
    expect(r.error).toMatch(/cannot make yourself the treasurer/);
    expect(membershipUpdate).not.toHaveBeenCalled();
  });

  it("lets a committee member step down as treasurer", async () => {
    membershipFirst.mockResolvedValue({ id: "m-1", schemeId: SCHEME_A, role: "COMMITTEE", profileId: "committee-1" });
    const r = await actions.setTreasurerAction(SCHEME_A, "m-1", false);
    expect(r.error).toBeUndefined();
    expect(membershipUpdate).toHaveBeenCalledWith({ isTreasurer: false });
  });

  it("is for committee members only: the adviser cannot appoint the treasurer", async () => {
    membership.mockRejectedValue(new AuthorisationError("You do not have permission to perform this action."));
    const r = await actions.setTreasurerAction(SCHEME_A, "m-2", true);
    expect(membership).toHaveBeenCalledWith(SCHEME_A, ["COMMITTEE"]);
    expect(r.error).toMatch(/permission/);
    expect(membershipUpdate).not.toHaveBeenCalled();
  });

  it("rejects a membership from another scheme", async () => {
    membershipFirst.mockResolvedValue({ id: "m-9", schemeId: SCHEME_B, role: "COMMITTEE", profileId: "committee-9" });
    const r = await actions.setTreasurerAction(SCHEME_A, "m-9", true);
    expect(r.error).toBe("Member not found.");
    expect(membershipUpdate).not.toHaveBeenCalled();
  });

  it("lets another committee member appoint the treasurer, and logs it", async () => {
    const r = await actions.setTreasurerAction(SCHEME_A, "m-2", true);
    expect(r.success).toBeTruthy();
    expect(membershipUpdate).toHaveBeenCalledWith({ isTreasurer: true });
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "TREASURER_SET" }));
  });
});

describe("savePaymentPolicyAction", () => {
  const policyForm = (values: Record<string, string>) => {
    const fd = new FormData();
    fd.set("singleApproverLimit", "500");
    fd.set("coolingOffDays", "5");
    for (const [k, v] of Object.entries(values)) fd.set(k, v);
    return fd;
  };

  it("does not let a committee member who is also the adviser enable adviser approval", async () => {
    membership.mockResolvedValue({ profile: committee, membership: {}, roles: ["COMMITTEE", "ADVISER"] });
    const r = await actions.savePaymentPolicyAction(SCHEME_A, {}, policyForm({ allowAdviserApproval: "on" }));
    expect(r.error).toMatch(/cannot loosen/);
    expect(queries.savePaymentPolicy).not.toHaveBeenCalled();
  });

  it("does not let them raise the approval limit either", async () => {
    membership.mockResolvedValue({ profile: committee, membership: {}, roles: ["COMMITTEE", "ADVISER"] });
    const r = await actions.savePaymentPolicyAction(SCHEME_A, {}, policyForm({ singleApproverLimit: "5000" }));
    expect(r.error).toMatch(/cannot loosen/);
    expect(queries.savePaymentPolicy).not.toHaveBeenCalled();
  });

  it("still lets them tighten the policy", async () => {
    membership.mockResolvedValue({ profile: committee, membership: {}, roles: ["COMMITTEE", "ADVISER"] });
    const r = await actions.savePaymentPolicyAction(SCHEME_A, {}, policyForm({ singleApproverLimit: "100" }));
    expect(r.error).toBeUndefined();
    expect(queries.savePaymentPolicy).toHaveBeenCalled();
  });

  it("lets a committee member who is not the adviser loosen it, and records what was loosened", async () => {
    const r = await actions.savePaymentPolicyAction(SCHEME_A, {}, policyForm({ allowSelfApproval: "on" }));
    expect(r.error).toBeUndefined();
    expect(queries.savePaymentPolicy).toHaveBeenCalled();
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "PAYMENT_POLICY_UPDATED",
        metadata: expect.objectContaining({ loosened: ["allowSelfApproval"] }),
      }),
    );
  });
});

describe("verifySupplierBankDetailsAction (reject)", () => {
  const rejectForm = () => {
    const fd = new FormData();
    fd.set("decision", "REJECT");
    fd.set("reason", "Call-back did not match");
    return fd;
  };

  beforeEach(() => {
    membership.mockResolvedValue({ profile: { id: "checker" }, membership: {}, roles: ["COMMITTEE"] });
    versionFirst.mockResolvedValue({ id: "v-1", schemeId: SCHEME_A });
  });

  it("cannot reject verified bank details already on file", async () => {
    queries.getBankDetailVersionById.mockResolvedValue({ id: "v-1", supplierId: "s-1", status: "VERIFIED", changedById: "someone" });
    const r = await actions.verifySupplierBankDetailsAction(SCHEME_A, "v-1", {}, rejectForm());
    expect(r.error).toMatch(/waiting for verification/);
    expect(versionUpdate).not.toHaveBeenCalled();
  });

  it("rejects a change still waiting for verification", async () => {
    queries.getBankDetailVersionById.mockResolvedValue({ id: "v-1", supplierId: "s-1", status: "PENDING", changedById: "someone" });
    const r = await actions.verifySupplierBankDetailsAction(SCHEME_A, "v-1", {}, rejectForm());
    expect(r.error).toBeUndefined();
    expect(versionUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: "REJECTED" }));
  });
});
