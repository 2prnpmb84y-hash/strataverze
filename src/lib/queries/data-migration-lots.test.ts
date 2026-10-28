/**
 * The CSV lot import (QLD stage 2, step 10): a building whose lots hold a
 * second entitlement (Queensland's interest schedule) needs it on every row,
 * as a positive whole number, and the import writes it. NSW rows are checked
 * and written as before.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("@/lib/queries/activity-log", () => ({ logActivity: vi.fn(async () => {}) }));
vi.mock("@/lib/jurisdiction/scheme-rules", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/scheme-rules")>("@/lib/jurisdiction/scheme-rules");
  const { QLD_RULE_PACK } = await import("@/config/statutory");
  const forState = (state: string | null | undefined) =>
    state === "QLD-SHAPED" ? { pack: null, rules: QLD_RULE_PACK.rules, label: "AU-QLD test" } : actual.rulesForState(state);
  return {
    ...actual,
    rulesForState: forState,
    rulesForScheme: async (schemeId: string) => {
      const { sharedFake } = await import("@/test/fake-orm");
      return forState(sharedFake.table("Scheme").find((s) => s.id === schemeId)?.state as string);
    },
  };
});

const { sharedFake } = await import("@/test/fake-orm");
const { validateLots, importLots } = await import("./data-migration");

const row = (rowNumber: number, data: Record<string, string>) => ({ rowNumber, data, errors: [] as string[], warnings: [] as string[] });

beforeEach(() => {
  sharedFake.reset({ Scheme: [{ id: "nsw", state: "NSW" }, { id: "qld", state: "QLD-SHAPED" }], Lot: [] });
});

describe("validateLots", () => {
  it("needs each Queensland row's interest schedule lot entitlement, a positive whole number", async () => {
    const checked = await validateLots("qld", [
      row(2, { lotNumber: "1", entitlement: "10", interestScheduleEntitlement: "12" }),
      row(3, { lotNumber: "2", entitlement: "10" }),
      row(4, { lotNumber: "3", entitlement: "10", interestScheduleEntitlement: "0" }),
      row(5, { lotNumber: "4", entitlement: "10", interestScheduleEntitlement: "2.5" }),
    ]);
    expect(checked.map((r) => r.errors)).toEqual([
      [],
      ["Enter the interest schedule lot entitlement."],
      ["Interest Schedule Lot Entitlement must be a whole number of at least 1."],
      ["Interest Schedule Lot Entitlement must be a whole number of at least 1."],
    ]);
  });

  it("checks NSW rows as before", async () => {
    const checked = await validateLots("nsw", [row(2, { lotNumber: "1", entitlement: "10" }), row(3, { lotNumber: "1", entitlement: "-1" })]);
    expect(checked.map((r) => r.errors)).toEqual([[], ['Duplicate lot number "1" — also on row 2', "Entitlement must be positive, got -1"]]);
  });
});

describe("importLots", () => {
  it("writes a Queensland lot's interest schedule lot entitlement", async () => {
    const result = await importLots("qld", [row(2, { lotNumber: "1", entitlement: "10", interestScheduleEntitlement: "12" })], "adviser");
    expect(result).toEqual({ created: 1, errors: [] });
    expect(sharedFake.table("Lot")[0]).toMatchObject({ schemeId: "qld", lotNumber: "1", entitlement: 10, interestScheduleEntitlement: 12 });
  });

  it("writes an NSW lot as before, with no second entitlement even if a column is sent", async () => {
    await importLots("nsw", [row(2, { lotNumber: "1", entitlement: "10", interestScheduleEntitlement: "12" })], "adviser");
    const created = sharedFake.table("Lot")[0];
    expect(created).toMatchObject({ schemeId: "nsw", lotNumber: "1", entitlement: 10 });
    expect("interestScheduleEntitlement" in created).toBe(false);
  });
});
