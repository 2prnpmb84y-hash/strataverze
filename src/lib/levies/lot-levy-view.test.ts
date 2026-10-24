import { describe, expect, it, vi } from "vitest";
import { levyItemTotals, levyItems } from "./levy-ledger";

/**
 * A lot's levies as its owner sees them (24 Oct 2026): the list the owner's
 * levies page shows, and the Adviser's "Owner's view" of the same lot.
 */

const notice = (over: Record<string, unknown>) => ({
  id: "n1",
  lotId: "l14",
  schemeId: "s1",
  noticeNumber: "LN-0001",
  dueDate: "2026-07-01",
  periodStart: "2026-07-01",
  periodEnd: "2026-09-30",
  amountDue: "250.12",
  amountPaid: "0",
  balanceOutstanding: "263.56",
  interestCharged: "13.44",
  status: "ISSUED",
  fund: { name: "Administrative Fund" },
  levySchedule: null,
  ...over,
});

const lots = new Map([["l14", { label: "Lot 14 (Unit 14)", schemeId: "s1" }]]);

describe("levyItems", () => {
  it("lists issued notices newest first, with interest in the amount due", () => {
    const items = levyItems(
      [notice({}), notice({ id: "n2", noticeNumber: "LN-0002", dueDate: "2026-10-01", amountDue: "100", interestCharged: "0", balanceOutstanding: "100" })],
      "2026-08-01",
      lots,
    );
    expect(items.map((i) => i.noticeNumber)).toEqual(["LN-0002", "LN-0001"]);
    expect(items[1]).toMatchObject({ lotLabel: "Lot 14 (Unit 14)", amountDue: 263.56, balance: 263.56, interestCharged: 13.44, status: "OVERDUE" });
    expect(levyItemTotals(items)).toEqual({ totalDue: 363.56, totalPaid: 0, totalOutstanding: 363.56 });
  });

  it("never lists a planned notice (DRAFT)", () => {
    expect(levyItems([notice({ status: "DRAFT" })], "2026-08-01", lots)).toEqual([]);
  });
});

// ─── The lot loader ─────────────────────────────────────────────────────────

const data = vi.hoisted(() => ({ notices: [] as Record<string, unknown>[] }));
vi.mock("@/lib/queries/levies", () => ({ getLevyNoticesForLots: async () => data.notices }));
vi.mock("@/lib/queries/levy-schedules", () => ({
  getLevyPaymentsForNotices: async () => [{ id: "p1", levyNoticeId: "n1", amount: "100", paymentDate: "2026-07-10" }],
}));
vi.mock("@/lib/finance/owner-credits", () => ({ getCreditMovements: async () => [] }));

const { loadLotLevyView } = await import("./lot-levy-view");

describe("loadLotLevyView", () => {
  it("shows the lot's issued notices and statement, and nothing planned or from another building", async () => {
    data.notices = [
      notice({ amountPaid: "100", balanceOutstanding: "163.56" }),
      notice({ id: "n9", status: "DRAFT", dueDate: "2026-10-01" }),
      notice({ id: "n8", schemeId: "other" }),
    ];
    const v = await loadLotLevyView("s1", "l14", "Lot 14 (Unit 14)", "2026-08-01");
    expect(v.items.map((i) => i.id)).toEqual(["n1"]);
    expect(v.totals).toEqual({ totalDue: 263.56, totalPaid: 100, totalOutstanding: 163.56 });
    expect(v.statement.lines.map((l) => [l.date, l.type, l.charge, l.payment, l.balance])).toEqual([
      ["2026-07-01", "Levy", 250.12, 0, 250.12],
      ["2026-07-01", "Interest", 13.44, 0, 263.56],
      ["2026-07-10", "Payment", 0, 100, 163.56],
    ]);
    expect(v.statement.closingBalance).toBe(163.56);
  });
});
