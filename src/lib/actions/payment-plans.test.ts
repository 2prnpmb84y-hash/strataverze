import { beforeEach, describe, expect, it, vi } from "vitest";

/** Who may do what with payment plans (the actions called directly, bypassing the UI). */

const SCHEME = "aaaaaaaa-0000-0000-0000-000000000001";
const membership = vi.fn();
vi.mock("@/lib/auth/require-membership", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/require-membership")>("@/lib/auth/require-membership");
  return { ...actual, requireSchemeMembership: (...a: unknown[]) => membership(...a) };
});
const ownsFirst = vi.fn();
vi.mock("@/prisma/db", () => ({ db: { orm: { public: { SchemeMembership: { where: () => ({ first: ownsFirst }) } } } } }));
vi.mock("@prisma/orm-postgres/orm-client", () => ({ and: (...c: unknown[]) => c }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/jurisdiction/scheme-time", () => ({ schemeToday: vi.fn(async () => "2026-10-26") }));
const store = {
  recordPaymentPlanRequest: vi.fn(async () => ({ id: "req-1", replyDueOn: "2026-11-23", caseId: null })),
  recordPaymentPlanDecision: vi.fn(async () => ({ planId: "plan-1", caseId: null })),
  recordPaymentPlanReply: vi.fn(),
  withdrawPaymentPlanRequest: vi.fn(),
  markPaymentPlanNotFollowed: vi.fn(),
  recordPlanInstalmentPayment: vi.fn(),
};
vi.mock("@/lib/debt-recovery/payment-plan-requests", async () => {
  const actual = await vi.importActual<typeof import("@/lib/debt-recovery/payment-plan-requests")>("@/lib/debt-recovery/payment-plan-requests");
  return { PaymentPlanError: actual.PaymentPlanError, ...store };
});
vi.mock("@/lib/debt-recovery/payment-plan-notify", () => ({ notifyPaymentPlanRequest: vi.fn(), notifyPaymentPlanDecision: vi.fn() }));

const actions = await import("./payment-plans");
const { AuthorisationError } = await import("@/lib/auth/require-membership");

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

beforeEach(() => {
  vi.clearAllMocks();
  membership.mockResolvedValue({ profile: { id: "owner-1" }, membership: {}, roles: ["OWNER"] });
});

describe("owner request", () => {
  it("is refused for a lot the owner does not own", async () => {
    ownsFirst.mockResolvedValue(null);
    const r = await actions.ownerRequestPaymentPlanAction(SCHEME, "lot-9", {}, form({ ownerNames: "Jo", hardshipStatement: "on" }));
    expect(r.error).toMatch(/only for a lot you own/);
    expect(store.recordPaymentPlanRequest).not.toHaveBeenCalled();
  });

  it("is received today, from the portal, as the owner gave it", async () => {
    ownsFirst.mockResolvedValue({ id: "m1" });
    const r = await actions.ownerRequestPaymentPlanAction(SCHEME, "lot-1", {}, form({ ownerNames: "Jo", hardshipStatement: "on", currentDebt: "1,250.50", proposedMonths: "6", interestWaiverRequested: "on" }));
    expect(r.success).toMatch(/2026-11-23/);
    expect(store.recordPaymentPlanRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        schemeId: SCHEME,
        lotId: "lot-1",
        source: "OWNER_PORTAL",
        submittedBy: "owner-1",
        form: expect.objectContaining({ receivedOn: "2026-10-26", currentDebtCents: 125_050, proposedMonths: 6, interestWaiverRequested: true, hardshipStatement: true }),
      }),
    );
  });

  it("needs an owner membership", async () => {
    membership.mockRejectedValue(new AuthorisationError("You do not have permission to perform this action."));
    const r = await actions.ownerRequestPaymentPlanAction(SCHEME, "lot-1", {}, form({}));
    expect(r.error).toMatch(/permission/);
  });
});

describe("adviser actions", () => {
  it("need the adviser role", async () => {
    membership.mockRejectedValue(new AuthorisationError("You do not have permission to perform this action."));
    for (const call of [
      () => actions.recordPaymentPlanRequestAction(SCHEME, {}, form({})),
      () => actions.recordPaymentPlanDecisionAction(SCHEME, "req-1", {}, form({ decision: "APPROVED" })),
      () => actions.recordPaymentPlanReplyAction(SCHEME, "req-1", {}, form({})),
      () => actions.markPaymentPlanNotFollowedAction(SCHEME, "plan-1", {}, form({})),
      () => actions.recordPlanInstalmentPaymentAction(SCHEME, "plan-1", {}, form({})),
      () => actions.withdrawPaymentPlanRequestAction(SCHEME, "req-1"),
    ]) {
      const r = await call();
      expect(r.error).toMatch(/permission/);
    }
    for (const c of membership.mock.calls) expect(c[1]).toEqual(["ADVISER"]);
    expect(store.recordPaymentPlanDecision).not.toHaveBeenCalled();
  });

  it("pass a refusal without terms or a fee", async () => {
    membership.mockResolvedValue({ profile: { id: "adviser-1" }, membership: {}, roles: ["ADVISER"] });
    await actions.recordPaymentPlanDecisionAction(SCHEME, "req-1", {}, form({ decision: "REFUSED", body: "STRATA_COMMITTEE", meetingOn: "2026-10-25", majorityVote: "on", refusalReasons: "The fund would be short." }));
    expect(store.recordPaymentPlanDecision).toHaveBeenCalledWith(expect.objectContaining({ terms: null, feeConfirmedCents: null, decision: expect.objectContaining({ decision: "REFUSED", majorityVote: true }) }));
  });
});
