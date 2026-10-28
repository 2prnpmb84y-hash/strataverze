/**
 * A new building starts on its pack's late charge setting (QLD stage 2,
 * step 6): NSW statutory interest, as the column's default always gave;
 * Queensland no penalty until the body corporate resolves one.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("./seed-chart-of-accounts", () => ({ seedDefaultChartOfAccounts: vi.fn(async () => {}) }));
// A test may give the building Queensland's late charge rule; the rest of the pack is the real one.
const lateCharge = vi.hoisted(() => ({ qld: false }));
vi.mock("@/lib/jurisdiction/scheme-rules", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/scheme-rules")>("@/lib/jurisdiction/scheme-rules");
  const { QLD_RULE_PACK } = await import("@/config/statutory");
  return {
    ...actual,
    rulesForState: (state: string) => {
      // A Queensland building has the real Queensland pack (live from the switch-on, 28 Oct 2026).
      const r = actual.rulesForState(state);
      return lateCharge.qld ? { ...r, rules: { ...r.rules, LATE_CHARGE: QLD_RULE_PACK.rules.LATE_CHARGE } } : r;
    },
  };
});

const { sharedFake } = await import("@/test/fake-orm");
const { createScheme, SchemeDataError } = await import("./schemes");

const building = {
  name: "Harbour View",
  planNumber: "12345",
  address: "1 Harbour St",
  suburb: "Sydney",
  state: "NSW",
  postcode: "2000",
  totalLots: 2,
  totalEntitlement: 100,
};

beforeEach(() => {
  lateCharge.qld = false;
  sharedFake.reset({ Scheme: [], SchemeMembership: [], Fund: [], Lot: [], LotDetail: [] });
});

describe("createScheme", () => {
  it("starts an NSW building on statutory interest", async () => {
    const created = await createScheme(building, "adviser");
    expect(sharedFake.table("Scheme").find((s) => s.id === created.id)).toMatchObject({ interestMode: "STATUTORY" });
    expect(sharedFake.table("Scheme").find((s) => s.id === created.id)?.lateChargeMonthlyRatePercent ?? null).toBeNull();
  });

  it("starts a building on its pack's default: no penalty for Queensland's rule", async () => {
    lateCharge.qld = true;
    const created = await createScheme(building, "adviser");
    expect(sharedFake.table("Scheme").find((s) => s.id === created.id)).toMatchObject({ interestMode: "NONE" });
  });
});

describe("createScheme for a Queensland building (QLD onboarding go-live)", () => {
  it("saves the module, both lot entitlements and the pack's funds", async () => {
    const created = await createScheme(
      { ...building, state: "QLD", postcode: "4000", planNumber: "777", regulationModule: "STANDARD", planFormat: "BUILDING" },
      "adviser",
      [
        { lotNumber: "1", unitNumber: null, entitlement: 40, ownerName: "A", interestScheduleEntitlement: 45 },
        { lotNumber: "2", unitNumber: null, entitlement: 60, ownerName: "B", interestScheduleEntitlement: 55 },
      ],
    );
    expect(sharedFake.table("Scheme").find((s) => s.id === created.id)).toMatchObject({ regulationModule: "STANDARD", planFormat: "BUILDING", interestMode: "NONE" });
    expect(sharedFake.table("Lot").map((l) => [l.lotNumber, l.entitlement, l.interestScheduleEntitlement])).toEqual([
      ["1", 40, 45],
      ["2", 60, 55],
    ]);
    expect(sharedFake.table("Fund").map((f) => [f.name, f.fundType])).toEqual([
      ["Administrative Fund", "ADMINISTRATIVE"],
      ["Sinking Fund", "CAPITAL_WORKS"],
    ]);
  });

  it("creates an NSW building's lots and scheme without either field", async () => {
    const created = await createScheme(building, "adviser", [{ lotNumber: "1", unitNumber: null, entitlement: 100, ownerName: "A" }]);
    expect(sharedFake.table("Scheme").find((s) => s.id === created.id)?.regulationModule ?? null).toBeNull();
    expect(sharedFake.table("Scheme").find((s) => s.id === created.id)?.planFormat ?? null).toBeNull();
    expect(sharedFake.table("Lot")[0]?.interestScheduleEntitlement ?? null).toBeNull();
  });
});

describe("createScheme checks the pack's data itself, whatever its caller checked", () => {
  const qld = { ...building, state: "QLD", postcode: "4000", planNumber: "778" };
  const lot = (interestScheduleEntitlement?: number | null) => ({ lotNumber: "1", unitNumber: null, entitlement: 100, ownerName: "A", interestScheduleEntitlement });
  const refused = async (...args: Parameters<typeof createScheme>) => {
    const err = await createScheme(...args).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(SchemeDataError);
    // Nothing is created.
    expect(sharedFake.table("Scheme")).toHaveLength(0);
    expect(sharedFake.table("Lot")).toHaveLength(0);
    return (err as Error).message;
  };

  it("saves no module or plan format for a building whose pack has neither (the state check constraints)", async () => {
    expect(await refused({ ...building, regulationModule: "STANDARD" }, "adviser")).toBe("This building's rules have no regulation module, so none can be saved.");
    expect(await refused({ ...building, planFormat: "BUILDING" }, "adviser")).toBe("This building's rules have no plan format, so none can be saved.");
  });

  it("refuses a module StrataVerze does not apply, and an unknown one", async () => {
    expect(await refused({ ...qld, regulationModule: "COMMERCIAL" }, "adviser")).toBe(
      "StrataVerze applies the Standard Module only for now, so a building under the Commercial Module cannot be managed yet.",
    );
    expect(await refused({ ...qld, regulationModule: "" }, "adviser")).toBe("Choose the regulation module.");
    expect(await refused({ ...qld, regulationModule: "MADE_UP" }, "adviser")).toBe("Choose a valid regulation module.");
  });

  it("refuses a plan format the pack does not list, and records any listed one", async () => {
    expect(await refused({ ...qld, planFormat: "GROUP_TITLE" }, "adviser")).toBe("Choose a valid plan format.");
    const created = await createScheme({ ...qld, planFormat: "STANDARD" }, "adviser");
    expect(sharedFake.table("Scheme").find((s) => s.id === created.id)?.planFormat).toBe("STANDARD");
  });

  it("refuses an interest schedule lot entitlement that is not a positive whole number", async () => {
    for (const bad of [0, -5, 1.5, Number.NaN, 1_000_001]) {
      expect(await refused(qld, "adviser", [lot(bad)])).toBe("Lot 1: the interest schedule lot entitlement must be a whole number from 1 to 1,000,000.");
    }
  });

  it("refuses a second lot entitlement for a building whose pack holds none", async () => {
    expect(await refused(building, "adviser", [lot(45)])).toBe("Lot 1 has a second lot entitlement, which this building's rules do not hold.");
  });

  it("creates a lot without the second entitlement where none is given", async () => {
    await createScheme(qld, "adviser", [lot(null)]);
    expect(sharedFake.table("Lot")[0]?.interestScheduleEntitlement ?? null).toBeNull();
  });
});
