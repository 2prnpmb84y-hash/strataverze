/**
 * What a lot owes on its overdue notices, with each notice's payments applied
 * in the building's order (QLD stage 2, step 6): NSW levy first, as before;
 * Queensland's order (penalty first) when it is given.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PENDING_RULE_PACKS, statutoryRulesFor } from "@/config/statutory";

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));

const { sharedFake } = await import("@/test/fake-orm");
const { lotArrears } = await import("./payment-plan-requests");

beforeEach(() => {
  sharedFake.reset({
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
    // n1: $20 penalty then $80 of the levy. n2: $10 penalty then $295 of the levy.
    expect(await lotArrears("s", "l", "2026-10-01", PENDING_RULE_PACKS.QLD.rules.PAYMENT_ALLOCATION_ORDER)).toEqual({ leviesCents: 42_000 + 500, interestCents: 0 });
  });
});
