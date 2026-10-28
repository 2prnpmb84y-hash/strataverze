/**
 * What a lot owes on its overdue notices, with each notice's payments applied
 * in the building's order (QLD stage 2, step 6): NSW levy first, as before;
 * Queensland's order (penalty first) when it is given.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QLD_RULE_PACK, statutoryRulesFor } from "@/config/statutory";

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
// A Queensland-shaped building: its late charge setting is read for the penalty first order.
vi.mock("@/lib/jurisdiction/scheme-rules", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/scheme-rules")>("@/lib/jurisdiction/scheme-rules");
  const { QLD_RULE_PACK } = await import("@/config/statutory");
  const forState = (state: string | null | undefined) =>
    state === "QLD-SHAPED" ? { pack: null, rules: QLD_RULE_PACK.rules, label: "AU-QLD test" } : actual.rulesForState(state);
  return { ...actual, rulesForState: forState };
});

const { sharedFake } = await import("@/test/fake-orm");
const { lotArrears } = await import("./payment-plan-requests");

beforeEach(() => {
  sharedFake.reset({
    Scheme: [{ id: "s", state: "QLD-SHAPED", interestMode: "RESOLVED_RATE", lateChargeMonthlyRatePercent: "2.50", timeZone: "Australia/Brisbane" }],
    LevyNotice: [
      // $500 levy and $20 interest, $100 paid.
      { id: "n1", schemeId: "s", lotId: "l", status: "PARTIALLY_PAID", dueDate: "2026-07-01", amountDue: "500.00", amountPaid: "100.00", interestCharged: "20.00" },
      // Paid more than the levy: the rest goes to interest.
      { id: "n2", schemeId: "s", lotId: "l", status: "PARTIALLY_PAID", dueDate: "2026-08-01", amountDue: "300.00", amountPaid: "305.00", interestCharged: "10.00" },
      // Not yet due: left out.
      { id: "n3", schemeId: "s", lotId: "l", status: "ISSUED", dueDate: "2026-12-01", amountDue: "300.00", amountPaid: "0", interestCharged: "0" },
    ],
  });
});

describe("lotArrears", () => {
  it("applies NSW payments to the levy first, with or without the pack's order", async () => {
    const expected = { leviesCents: 40_000, interestCents: 2_000 + 500 };
    expect(await lotArrears("s", "l", "2026-10-01")).toEqual(expected);
    expect(await lotArrears("s", "l", "2026-10-01", statutoryRulesFor("NSW").PAYMENT_ALLOCATION_ORDER)).toEqual(expected);
  });

  it("applies Queensland payments to the penalty first", async () => {
    // No receipts are recorded, so what was paid has no date and goes to the penalty charged first.
    // n1: $20 penalty then $80 of the levy. n2: $10 penalty then $295 of the levy.
    expect(await lotArrears("s", "l", "2026-10-01", QLD_RULE_PACK.rules.PAYMENT_ALLOCATION_ORDER)).toEqual({ leviesCents: 42_000 + 500, interestCents: 0 });
  });
});
