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
  const { PENDING_RULE_PACKS } = await import("@/config/statutory");
  return {
    ...actual,
    rulesForState: (state: string) => {
      const r = actual.rulesForState(state);
      return lateCharge.qld ? { ...r, rules: { ...r.rules, LATE_CHARGE: PENDING_RULE_PACKS.QLD.rules.LATE_CHARGE } } : r;
    },
  };
});

const { sharedFake } = await import("@/test/fake-orm");
const { createScheme } = await import("./schemes");

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
  sharedFake.reset({ Scheme: [], SchemeMembership: [], Fund: [] });
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
