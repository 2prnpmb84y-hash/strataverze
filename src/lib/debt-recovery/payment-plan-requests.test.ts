import { beforeEach, describe, expect, it, vi } from "vitest";

/** A building whose rule pack has no payment plan workflow: nothing is written, whatever the decision (stage 2). */
const SCHEME = "aaaaaaaa-0000-0000-0000-000000000001";
const writes: string[] = [];
const requestFirst = vi.fn();
const lotFirst = vi.fn();
const write = (name: string) => vi.fn(async () => {
  writes.push(name);
  return 1;
});
vi.mock("@/prisma/db", () => {
  const table = (name: string, first: () => unknown) => ({
    create: write(`${name}.create`),
    where: () => ({ first, update: write(`${name}.update`), updateAndCount: write(`${name}.updateAndCount`), limit: () => ({ all: async () => [] }) }),
  });
  return {
    db: {
      orm: { public: { PaymentPlanRequest: table("PaymentPlanRequest", requestFirst), Lot: table("Lot", lotFirst), PaymentPlan: table("PaymentPlan", async () => null), PaymentPlanInstalment: table("PaymentPlanInstalment", async () => null) } },
      transaction: write("transaction"),
    },
  };
});
vi.mock("@/lib/jurisdiction/scheme-rules", () => ({
  rulesForScheme: vi.fn(async () => ({
    rules: { TERMINOLOGY: { jurisdictionShort: "Qld" }, FEATURES: { statutoryPaymentPlans: false } },
    label: "AU-QLD test",
  })),
}));
vi.mock("@/lib/jurisdiction/scheme-time", () => ({ schemeToday: vi.fn(async () => "2026-10-27") }));
vi.mock("@/lib/billing/capture", () => ({ captureUsageFee: write("captureUsageFee") }));
vi.mock("@/lib/queries/debt-recovery", () => ({ logDebtRecoveryActivity: write("logDebtRecoveryActivity"), updateDebtRecoveryCase: write("updateDebtRecoveryCase") }));

const { PaymentPlanError, recordPaymentPlanDecision, recordPaymentPlanRequest } = await import("./payment-plan-requests");

beforeEach(() => {
  writes.length = 0;
  requestFirst.mockResolvedValue({ id: "req-1", schemeId: SCHEME, lotId: "lot-1", status: "RECEIVED", receivedOn: "2026-10-20", interestWaiverRequested: false });
  lotFirst.mockResolvedValue({ id: "lot-1", schemeId: SCHEME });
});

describe("payment plans for a pack without the workflow", () => {
  it.each(["APPROVED", "REFUSED"] as const)("a %s decision is refused before any write", async (decision) => {
    const run = recordPaymentPlanDecision({
      schemeId: SCHEME,
      requestId: "req-1",
      actorId: "adviser-1",
      decision: { decision, body: "STRATA_COMMITTEE", meetingOn: "2026-10-25" } as never,
      terms: null,
      feeConfirmedCents: null,
    });
    await expect(run).rejects.toBeInstanceOf(PaymentPlanError);
    await expect(run).rejects.toThrow("This is not available for this building.");
    expect(writes).toEqual([]);
  });

  it("a request is refused before any write", async () => {
    const run = recordPaymentPlanRequest({ schemeId: SCHEME, lotId: "lot-1", source: "RECEIVED", submittedBy: "adviser-1", form: {} as never });
    await expect(run).rejects.toThrow("This is not available for this building.");
    expect(writes).toEqual([]);
  });
});
