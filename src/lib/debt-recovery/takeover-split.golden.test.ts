/**
 * How what a lot owes splits into levy and late charge for notices brought
 * across at takeover, golden (M1, the NSW takeover split, decided by Matthew
 * Wrigley on 30 Oct 2026, "Fix in this PR"). Recorded on 2e82c7f in a
 * temporary worktree, before the fix. Never regenerate these snapshots to
 * make a change pass: a difference is a change to the payment plan figure
 * (lotArrears, also used by certificates) or to the debt recovery case
 * amount (caseAmountCents).
 *
 * A takeover notice (migration-batches.ts) stores the levy still owing as
 * amountDue, the old system's late charge as interestCharged (and
 * migratedInterestCharged), and the late charge the old system collected as
 * amountPaid (and migratedInterestPaid), so balance = amountDue +
 * interestCharged - amountPaid. Later payments here add to amountPaid, each
 * with a receipt (LevyPayment).
 *
 * Each entry is one notice on its own lot: lotArrears with the NSW and the
 * Queensland payment order, and caseAmountCents with each. The day is
 * 2 Nov 2026 and every notice is past due.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QLD_RULE_PACK, statutoryRulesFor } from "@/config/statutory";

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));

const { sharedFake } = await import("@/test/fake-orm");
const { lotArrears } = await import("./payment-plan-requests");
const { caseAmountCents } = await import("./case-amount");

const NSW = statutoryRulesFor("NSW").PAYMENT_ALLOCATION_ORDER;
const QLD = QLD_RULE_PACK.rules.PAYMENT_ALLOCATION_ORDER;
const TODAY = "2026-11-02";

type Receipt = { amount: string; lateChargeAmount?: string | null; reversed?: boolean };
interface Scenario {
  takeover: boolean;
  amountDue: string;
  interestCharged: string;
  /** The old system's late charge paid (takeover only). */
  oldPaid?: string;
  amountPaid: string;
  balanceOutstanding: string;
  status?: string;
  receipts?: Receipt[];
}

const scenarios: Array<[string, Scenario]> = [
  ["takeover, old late charge paid 0", { takeover: true, amountDue: "1000.00", interestCharged: "100.00", oldPaid: "0.00", amountPaid: "0.00", balanceOutstanding: "1100.00" }],
  ["takeover, old late charge part paid (60.00 of 100.00)", { takeover: true, amountDue: "1000.00", interestCharged: "100.00", oldPaid: "60.00", amountPaid: "60.00", balanceOutstanding: "1040.00" }],
  ["takeover, old late charge paid in full", { takeover: true, amountDue: "1000.00", interestCharged: "100.00", oldPaid: "100.00", amountPaid: "100.00", balanceOutstanding: "1000.00" }],
  ["takeover, old part paid, a later receipt of 200.00 (40.00 recorded to the late charge)", {
    takeover: true, amountDue: "1000.00", interestCharged: "100.00", oldPaid: "60.00", amountPaid: "260.00", balanceOutstanding: "840.00", status: "PARTIALLY_PAID",
    receipts: [{ amount: "200.00", lateChargeAmount: "40.00" }],
  }],
  ["takeover, old paid in full, a later receipt of 300.00", {
    takeover: true, amountDue: "1000.00", interestCharged: "100.00", oldPaid: "100.00", amountPaid: "400.00", balanceOutstanding: "700.00", status: "PARTIALLY_PAID",
    receipts: [{ amount: "300.00", lateChargeAmount: "0.00" }],
  }],
  ["takeover, old part paid, a later receipt reversed", {
    takeover: true, amountDue: "1000.00", interestCharged: "100.00", oldPaid: "60.00", amountPaid: "60.00", balanceOutstanding: "1040.00",
    receipts: [{ amount: "200.00", lateChargeAmount: "40.00", reversed: true }],
  }],
  ["takeover, old part paid, a later receipt with no late charge part recorded", {
    takeover: true, amountDue: "1000.00", interestCharged: "100.00", oldPaid: "60.00", amountPaid: "160.00", balanceOutstanding: "940.00", status: "PARTIALLY_PAID",
    receipts: [{ amount: "100.00", lateChargeAmount: null }],
  }],
  ["takeover, old part paid, 30.00 more late charge charged here", { takeover: true, amountDue: "1000.00", interestCharged: "130.00", oldPaid: "60.00", amountPaid: "60.00", balanceOutstanding: "1070.00" }],
  ["takeover, paid off by a later receipt", {
    takeover: true, amountDue: "1000.00", interestCharged: "100.00", oldPaid: "60.00", amountPaid: "1100.00", balanceOutstanding: "0.00", status: "PAID",
    receipts: [{ amount: "1040.00", lateChargeAmount: "40.00" }],
  }],
  ["not takeover, 60.00 paid (a control)", {
    takeover: false, amountDue: "1000.00", interestCharged: "100.00", amountPaid: "60.00", balanceOutstanding: "1040.00", status: "PARTIALLY_PAID",
    receipts: [{ amount: "60.00", lateChargeAmount: "60.00" }],
  }],
  ["not takeover, nothing paid (a control)", { takeover: false, amountDue: "1000.00", interestCharged: "100.00", amountPaid: "0.00", balanceOutstanding: "1100.00" }],
  ["not takeover, 260.00 paid in two receipts (a control)", {
    takeover: false, amountDue: "1000.00", interestCharged: "100.00", amountPaid: "260.00", balanceOutstanding: "840.00", status: "PARTIALLY_PAID",
    receipts: [{ amount: "60.00", lateChargeAmount: "60.00" }, { amount: "200.00", lateChargeAmount: "40.00" }],
  }],
  ["not takeover, paid with no receipts (a control)", { takeover: false, amountDue: "1000.00", interestCharged: "100.00", amountPaid: "60.00", balanceOutstanding: "1040.00", status: "PARTIALLY_PAID" }],
];

function seed(s: Scenario) {
  const notice = {
    id: "n-1",
    schemeId: "s",
    lotId: "l",
    status: s.status ?? "ISSUED",
    dueDate: "2026-07-01",
    issuedAt: s.takeover ? "2026-08-01T00:00:00.000Z" : "2026-06-01T00:00:00.000Z",
    amountDue: s.amountDue,
    amountPaid: s.amountPaid,
    interestCharged: s.interestCharged,
    balanceOutstanding: s.balanceOutstanding,
    migrationBatchId: s.takeover ? "batch-1" : null,
    migratedInterestCharged: s.takeover ? s.interestCharged : "0.00",
    migratedInterestPaid: s.takeover ? s.oldPaid : "0.00",
  };
  sharedFake.reset({
    Scheme: [{ id: "s", state: "NSW", timeZone: "Australia/Sydney" }],
    LevyNotice: [notice],
    LevyPayment: (s.receipts ?? []).map((r, i) => ({
      id: `p-${i + 1}`,
      levyNoticeId: "n-1",
      paymentDate: `2026-09-0${i + 1}`,
      amount: r.amount,
      lateChargeAmount: r.lateChargeAmount ?? null,
      reversedAt: r.reversed ? "2026-09-20T00:00:00.000Z" : null,
    })),
  });
  return notice;
}

async function entry(s: Scenario) {
  const notice = seed(s);
  const caseAmount = async (order: typeof NSW) => {
    try {
      return await caseAmountCents([notice], order);
    } catch (err) {
      return { thrown: err instanceof Error ? err.message : String(err) };
    }
  };
  return {
    nsw: { lotArrears: await lotArrears("s", "l", TODAY, NSW), caseAmount: await caseAmount(NSW) },
    qld: { lotArrears: await lotArrears("s", "l", TODAY, QLD), caseAmount: await caseAmount(QLD) },
  };
}

beforeEach(() => {
  sharedFake.reset({});
});

describe("the levy and late charge owing on a notice", () => {
  for (const [name, s] of scenarios) {
    it(name, async () => {
      expect(await entry(s)).toMatchSnapshot();
    });
  }
});
