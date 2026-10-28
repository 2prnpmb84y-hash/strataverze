/**
 * Every building a pack with fund conditions lets StrataVerze set up gets a
 * ledger (stage 2, PR 3 review). createScheme and the chart of accounts run
 * here unmocked, with the draft packs lent to them, since no building can be
 * set up in their states yet: the accounts are seeded for the funds the
 * building has, and a building that would have no fund is refused in plain
 * words, never created without a ledger.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("@/lib/jurisdiction/scheme-rules", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/scheme-rules")>("@/lib/jurisdiction/scheme-rules");
  const { PENDING_RULE_PACKS } = await import("@/config/statutory");
  const { sharedFake } = await import("@/test/fake-orm");
  // A draft pack, lent the NSW accounting basis and late charge, which the drafts do not have yet.
  const forState = (state: string) => {
    const draft = (PENDING_RULE_PACKS as Record<string, { rules: object }>)[state];
    if (!draft || state === "QLD") return actual.rulesForState(state);
    const nsw = actual.rulesForState("NSW").rules;
    return { pack: null, rules: { ...draft.rules, defaultAccountingBasis: nsw.defaultAccountingBasis, LATE_CHARGE: nsw.LATE_CHARGE }, label: `AU-${state} test` };
  };
  return {
    ...actual,
    rulesForState: forState,
    rulesForScheme: async (schemeId: string) => forState(String(sharedFake.table("Scheme").find((s) => s.id === schemeId)?.state)),
  };
});

const { PENDING_RULE_PACKS } = await import("@/config/statutory");
const { sharedFake } = await import("@/test/fake-orm");
const { createScheme, SchemeDataError } = await import("@/lib/queries/schemes");
const { seedDefaultChartOfAccounts } = await import("@/lib/queries/seed-chart-of-accounts");
const { fundProblems } = await import("./funds");
type Rules = Parameters<typeof fundProblems>[0];
const WA = PENDING_RULE_PACKS.WA.rules as unknown as Rules;

const reset = () => sharedFake.reset({ Scheme: [], SchemeMembership: [], Fund: [], Lot: [], LotDetail: [], AccountCode: [] });
beforeEach(reset);

const create = (state: string, postcode: string, n: number) =>
  createScheme(
    { name: "Harbour View", planNumber: "12345", address: "1 Harbour St", suburb: "City", state, postcode, totalLots: n, totalEntitlement: n * 10 },
    "adviser",
    Array.from({ length: n }, (_, i) => ({ lotNumber: String(i + 1), unitNumber: null, entitlement: 10, ownerName: null })),
  );

/** The building's funds, and the fund type of each account's fund. */
const ledger = () => {
  const funds = sharedFake.table("Fund");
  const typeOf = new Map(funds.map((f) => [f.id, f.fundType]));
  const accounts = sharedFake.table("AccountCode");
  return {
    funds: funds.map((f) => f.name),
    accounts: accounts.length,
    accountFunds: [...new Set(accounts.map((a) => typeOf.get(a.fundId)))],
  };
};

describe("a ledger for every building onboarding sets up", () => {
  it("VIC: the administrative fund is given (a ledger choice), so the chart is seeded", async () => {
    await create("VIC", "3000", 60);
    expect(ledger()).toMatchObject({ funds: ["Administrative Fund"], accountFunds: ["ADMINISTRATIVE"] });
    expect(ledger().accounts).toBeGreaterThan(0);
  });

  it("ACT under 4 units: the administrative fund only, with its accounts", async () => {
    await create("ACT", "2600", 3);
    expect(ledger()).toMatchObject({ funds: ["Administrative Fund"], accountFunds: ["ADMINISTRATIVE"] });
  });

  it("ACT of 4 units: both funds and the whole chart, as for NSW", async () => {
    await create("ACT", "2600", 4);
    expect(ledger()).toMatchObject({ funds: ["Administrative Fund", "Sinking Fund"], accountFunds: ["ADMINISTRATIVE", "CAPITAL_WORKS"] });
  });

  it("WA of 6 to 9 lots: the administrative fund only, with its accounts", async () => {
    for (const n of [6, 9]) {
      reset();
      await create("WA", "6000", n);
      expect(ledger()).toMatchObject({ funds: ["Administrative Fund"], accountFunds: ["ADMINISTRATIVE"] });
    }
  });

  it("WA 2 to 5 lots: refused in plain words, nothing created", async () => {
    for (const n of [2, 3, 5]) {
      reset();
      const err = await create("WA", "6000", n).then(
        () => null,
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(SchemeDataError);
      expect((err as Error).message).toBe("StrataVerze cannot set up this building yet. None of its funds can be worked out from the lots entered, so it would have no ledger.");
      expect(sharedFake.table("Scheme")).toEqual([]);
    }
  });
});

describe("the chart of accounts for a building already set up", () => {
  const building = (state: string, funds: string[]) =>
    sharedFake.reset({ Scheme: [{ id: "s", state }], Fund: funds.map((t, i) => ({ id: `f${i}`, schemeId: "s", fundType: t })), AccountCode: [] });

  it("WA, 6 to 9 lots and not designated: the administrative fund's accounts only", async () => {
    building("WA", ["ADMINISTRATIVE"]);
    const created = await seedDefaultChartOfAccounts("s");
    expect(created.length).toBeGreaterThan(0);
    expect(new Set(created.map((a) => a.fundId))).toEqual(new Set(["f0"]));
  });

  it("WA 2-lot with a reserve fund only: the reserve fund's accounts only", async () => {
    building("WA", ["CAPITAL_WORKS"]);
    const created = await seedDefaultChartOfAccounts("s");
    expect(created.length).toBeGreaterThan(0);
    expect(new Set(created.map((a) => a.fundId))).toEqual(new Set(["f0"]));
  });

  it("WA 2-lot with no fund: seeding is refused in plain words, and the building is flagged", async () => {
    building("WA", []);
    await expect(seedDefaultChartOfAccounts("s")).rejects.toThrow("This building has no administrative fund and no reserve fund, so StrataVerze cannot set up its ledger. Set up the funds it needs first.");
    expect(sharedFake.table("AccountCode")).toEqual([]);
    const twoLot = {
      scheme: { totalLots: 2, replacementCost: "100.00" },
      lots: [{ lotNumber: "1" }, { lotNumber: "2" }],
      recorded: { schemeType: "STRATA", administrativeFundByLaws: "NEITHER" },
    };
    expect(fundProblems(WA, twoLot, [])).toEqual([
      "This building has no administrative fund and no reserve fund, so StrataVerze cannot keep its ledger. Its rules require neither, and StrataVerze does not handle such a building yet.",
    ]);
  });
});
