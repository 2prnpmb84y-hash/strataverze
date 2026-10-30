/**
 * The debt recovery case amount (review C1, "Balance only", 30 Oct 2026):
 * the total is the balances, the interest part is the late charge still
 * owing with payments applied in the pack's order (the split lotArrears, the
 * payment plan figure, uses), and the principal is the rest. All in cents.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QLD_RULE_PACK, statutoryRulesFor } from "@/config/statutory";

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));

const { sharedFake } = await import("@/test/fake-orm");
const { caseAmountCents, balancesCents, MAX_RECEIPTS, NoticeFiguresDisagreeError } = await import("./case-amount");
const { lotArrears } = await import("./payment-plan-requests");
const { UnreadableNoticeError } = await import("@/lib/levies/overdue");

const NSW = statutoryRulesFor("NSW").PAYMENT_ALLOCATION_ORDER;
const QLD = QLD_RULE_PACK.rules.PAYMENT_ALLOCATION_ORDER;

/** Notices whose balance includes the late charge (amount due + late charge - amount paid). */
const notices = [
  // $500.50 levy and $50.00 late charge, nothing paid.
  { id: "n1", schemeId: "s", lotId: "l", status: "ISSUED", dueDate: "2026-07-01", amountDue: "500.50", amountPaid: "0.00", interestCharged: "50.00", balanceOutstanding: "550.50" },
  // $500.50 levy and $50.00 late charge, $300.00 paid.
  { id: "n2", schemeId: "s", lotId: "l", status: "PARTIALLY_PAID", dueDate: "2026-08-01", amountDue: "500.50", amountPaid: "300.00", interestCharged: "50.00", balanceOutstanding: "250.50" },
  // $300.00 levy and $10.00 late charge, $305.00 paid: $5.00 of the late charge owing.
  { id: "n3", schemeId: "s", lotId: "l", status: "PARTIALLY_PAID", dueDate: "2026-09-01", amountDue: "300.00", amountPaid: "305.00", interestCharged: "10.00", balanceOutstanding: "5.00" },
];

beforeEach(() => {
  sharedFake.reset({ Scheme: [{ id: "s", state: "NSW", timeZone: "Australia/Sydney" }], LevyNotice: notices.map((n) => ({ ...n })), LevyPayment: [] });
});

describe("caseAmountCents", () => {
  it("totals the balances, never adding the late charge again", async () => {
    expect(balancesCents(notices)).toBe(55_050 + 25_050 + 500);
    expect((await caseAmountCents(notices, NSW)).totalCents).toBe(80_600);
  });

  it("NSW (levy first): payments pay the levy, then the late charge", async () => {
    // n1: 5000 late charge owing; n2: 300.00 paid to the levy, 5000 owing; n3: 300.00 to the levy, 5.00 to the late charge, 500 owing.
    expect(await caseAmountCents(notices, NSW)).toEqual({ totalCents: 80_600, lateChargeCents: 10_500, principalCents: 70_100 });
  });

  it("Queensland (penalty first, SM s 166(5)): with no receipts, what was paid went to the penalty first", async () => {
    // n1: 5000 owing; n2 and n3: their penalty paid first, none owing.
    expect(await caseAmountCents(notices, QLD)).toEqual({ totalCents: 80_600, lateChargeCents: 5_000, principalCents: 75_600 });
  });

  it("Queensland: uses the part of each receipt recorded as paid to the penalty", async () => {
    sharedFake.reset({
      LevyPayment: [
        // n2's 300.00 was receipted with 20.00 to the penalty; a reversed receipt is left out.
        { id: "p1", levyNoticeId: "n2", paymentDate: "2026-08-10", amount: "300.00", lateChargeAmount: "20.00" },
        { id: "p2", levyNoticeId: "n2", paymentDate: "2026-08-11", amount: "50.00", lateChargeAmount: "50.00", reversedAt: "2026-08-12T00:00:00.000Z" },
      ],
    });
    expect(await caseAmountCents([notices[1]], QLD)).toEqual({ totalCents: 25_050, lateChargeCents: 3_000, principalCents: 22_050 });
  });

  it("agrees with lotArrears, the payment plan figure, for NSW and Queensland", async () => {
    for (const order of [NSW, QLD]) {
      const arrears = await lotArrears("s", "l", "2026-10-01", order);
      const amount = await caseAmountCents(notices, order);
      expect(amount.lateChargeCents).toBe(arrears.interestCents);
      expect(amount.principalCents).toBe(arrears.leviesCents);
    }
  });

  it("fails closed: an amount that cannot be read throws", async () => {
    for (const field of ["amountDue", "amountPaid", "interestCharged", "balanceOutstanding"] as const) {
      for (const bad of [null, undefined, "", "abc"]) {
        await expect(caseAmountCents([{ ...notices[0], [field]: bad }], NSW)).rejects.toThrow(UnreadableNoticeError);
        await expect(caseAmountCents([{ ...notices[0], [field]: bad }], QLD)).rejects.toThrow(UnreadableNoticeError);
      }
    }
  });

  it("fails closed: Queensland receipts that cannot be read throw", async () => {
    sharedFake.reset({ LevyPayment: [{ id: "p1", levyNoticeId: "n2", paymentDate: "2026-08-10", amount: "abc", lateChargeAmount: "20.00" }] });
    await expect(caseAmountCents([notices[1]], QLD)).rejects.toThrow(UnreadableNoticeError);
  });

  it("fails closed: a late charge owing that is more than the balance throws, as figures that do not agree (not unreadable)", async () => {
    await expect(caseAmountCents([{ ...notices[0], balanceOutstanding: "20.00" }], NSW)).rejects.toThrow(NoticeFiguresDisagreeError);
    await expect(caseAmountCents([{ ...notices[0], balanceOutstanding: "20.00" }], NSW)).rejects.toThrow(/more than its balance/);
  });

  it("fails closed: more receipts than can be read at once throws, rather than reading some", async () => {
    const many = Array.from({ length: MAX_RECEIPTS + 1 }, (_, i) => ({ id: `p${i}`, levyNoticeId: "n2", paymentDate: "2026-08-10", amount: "0.01", lateChargeAmount: null }));
    sharedFake.reset({ LevyNotice: [{ ...notices[1] }], LevyPayment: many });
    await expect(caseAmountCents([notices[1]], QLD)).rejects.toThrow(/More than 50000 receipts/);
    await expect(lotArrears("s", "l", "2026-10-01", QLD)).rejects.toThrow(/More than 50000 receipts/);
    sharedFake.reset({ LevyNotice: [{ ...notices[1] }], LevyPayment: many.slice(1) });
    await expect(caseAmountCents([notices[1]], QLD)).resolves.toMatchObject({ totalCents: 25_050 });
  });
});

/**
 * A notice brought across at takeover (M1, 30 Oct 2026): amountPaid holds the
 * late charge the old system collected (migratedInterestPaid), which paid the
 * late charge, whatever the order. Levy 1000.00, old late charge 100.00, 60.00
 * of it paid, balance 1040.00: levy 1000.00 and late charge 40.00 owing.
 */
describe("a takeover notice", () => {
  const takeover = { id: "t1", schemeId: "s", lotId: "l", status: "ISSUED", dueDate: "2026-07-01", amountDue: "1000.00", interestCharged: "100.00", migrationBatchId: "batch-1", migratedInterestPaid: "60.00", amountPaid: "60.00", balanceOutstanding: "1040.00" };
  const seedTakeover = (n: Record<string, unknown>, payments: Array<Record<string, unknown>> = []) => sharedFake.reset({ LevyNotice: [{ ...n }], LevyPayment: payments });

  it("pays the old system's late charge paid to the late charge, for NSW as for Queensland, in the case and the payment plan figure", async () => {
    seedTakeover(takeover);
    for (const order of [NSW, QLD]) {
      expect(await caseAmountCents([takeover], order)).toEqual({ totalCents: 104_000, lateChargeCents: 4_000, principalCents: 100_000 });
      expect(await lotArrears("s", "l", "2026-10-01", order)).toEqual({ leviesCents: 100_000, interestCents: 4_000 });
    }
  });

  it("applies later payments in the pack's order after it", async () => {
    // 200.00 more, receipted with 40.00 to the late charge (as Queensland receipting records it).
    const n = { ...takeover, amountPaid: "260.00", balanceOutstanding: "840.00" };
    seedTakeover(n, [{ id: "p1", levyNoticeId: "t1", paymentDate: "2026-09-01", amount: "200.00", lateChargeAmount: "40.00" }]);
    // NSW: the 200.00 pays the levy; QLD: 40.00 of it pays the late charge first.
    expect(await caseAmountCents([n], NSW)).toEqual({ totalCents: 84_000, lateChargeCents: 4_000, principalCents: 80_000 });
    expect(await caseAmountCents([n], QLD)).toEqual({ totalCents: 84_000, lateChargeCents: 0, principalCents: 84_000 });
    expect(await lotArrears("s", "l", "2026-10-01", NSW)).toEqual({ leviesCents: 80_000, interestCents: 4_000 });
  });

  it("never pays more than the late charge charged; the rest follows the order", async () => {
    // Not possible from the import (it refuses more paid than charged), but never more than is charged.
    const n = { ...takeover, migratedInterestPaid: "120.00", amountPaid: "120.00", balanceOutstanding: "980.00" };
    seedTakeover(n);
    expect(await caseAmountCents([n], NSW)).toEqual({ totalCents: 98_000, lateChargeCents: 0, principalCents: 98_000 });
    expect(await lotArrears("s", "l", "2026-10-01", NSW)).toEqual({ leviesCents: 98_000, interestCents: 0 });
  });

  it("fails closed when the late charge paid before takeover cannot be read or is more than is paid now", async () => {
    for (const bad of [null, undefined, "", "abc"]) {
      const n = { ...takeover, migratedInterestPaid: bad };
      seedTakeover(n);
      await expect(caseAmountCents([n], NSW)).rejects.toThrow(UnreadableNoticeError);
      await expect(lotArrears("s", "l", "2026-10-01", NSW)).rejects.toThrow(RangeError);
    }
    const n = { ...takeover, amountPaid: "50.00", balanceOutstanding: "1050.00" };
    seedTakeover(n);
    await expect(caseAmountCents([n], NSW)).rejects.toThrow(NoticeFiguresDisagreeError);
    await expect(lotArrears("s", "l", "2026-10-01", NSW)).rejects.toThrow(RangeError);
  });

  it("is not read for a notice not brought across", async () => {
    const n = { ...notices[1], migrationBatchId: null, migratedInterestPaid: "abc" };
    seedTakeover(n);
    expect(await caseAmountCents([n], NSW)).toMatchObject({ totalCents: 25_050 });
  });

  it("reads no payments where none can have gone to the late charge", async () => {
    sharedFake.reset({ LevyPayment: [{ id: "p1", levyNoticeId: "n1", paymentDate: "2026-08-10", amount: "abc" }] });
    // n1 has nothing paid, so its unreadable (stray) receipt is never read.
    expect(await caseAmountCents([notices[0]], QLD)).toEqual({ totalCents: 55_050, lateChargeCents: 5_000, principalCents: 50_050 });
  });
});
