/**
 * NSW and Queensland funds, unchanged by the fund conditions (VIC, ACT and WA
 * stage 2, PR 3). The snapshots were recorded on feat/state-selectors
 * (19fb6ac), before the change, and must match byte for byte: the funds a new
 * building is given (defaultFunds and createScheme), what the "Building data
 * missing" notice says with the building's funds, the funds card and the
 * Add Property wizard's words.
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("@/lib/queries/seed-chart-of-accounts", () => ({ seedDefaultChartOfAccounts: vi.fn(async () => {}) }));
vi.mock("@/lib/jurisdiction/scheme-rules", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/scheme-rules")>("@/lib/jurisdiction/scheme-rules");
  const { PENDING_RULE_PACKS } = await import("@/config/statutory");
  return {
    ...actual,
    // A Queensland building: the pending Queensland pack, lent the NSW default
    // accounting basis (a go-live gap in qld.ts), as schemes.test.ts does.
    rulesForState: (state: string) => {
      if (state !== "QLD") return actual.rulesForState(state);
      const nsw = actual.rulesForState("NSW").rules;
      return { pack: null, rules: { ...PENDING_RULE_PACKS.QLD.rules, defaultAccountingBasis: nsw.defaultAccountingBasis }, label: "AU-QLD test" };
    },
  };
});

const { PENDING_RULE_PACKS, statutoryRulesFor } = await import("@/config/statutory");
const { defaultFunds } = await import("./funds");
const { buildingDataProblems } = await import("./building-data");
const { FundsCard } = await import("@/app/(portal)/adviser/schemes/[id]/_sections/funds-card");
const { BuildingDataNotice } = await import("@/app/(portal)/adviser/schemes/[id]/_sections/building-data-notice");
const { onboardingWordsFor } = await import("@/lib/onboarding/onboarding-words");
const { sharedFake } = await import("@/test/fake-orm");
const { createScheme } = await import("@/lib/queries/schemes");

const NSW = statutoryRulesFor("NSW");
const QLD = PENDING_RULE_PACKS.QLD.rules as unknown as typeof NSW;

const lots = (n: number) => Array.from({ length: n }, (_, i) => ({ lotNumber: String(i + 1), entitlement: 10, interestScheduleEntitlement: 4, lotType: "RESIDENTIAL", occupiable: null }));
const FUNDS = {
  none: [],
  both: [
    { id: "a", name: "Administrative Fund", fundType: "ADMINISTRATIVE", balance: 100 },
    { id: "c", name: "Capital Works Fund", fundType: "CAPITAL_WORKS", balance: 200 },
  ],
  legacy: [
    { id: "l", name: "Old admin", fundType: "ADMIN", balance: 0 },
    { id: "s", name: "Old sinking fund", fundType: "SINKING", balance: 5 },
  ],
  adminOnly: [{ id: "a", name: "Administrative Fund", fundType: "ADMINISTRATIVE", balance: 0 }],
  special: [{ id: "x", name: "Roof levy", fundType: "SPECIAL", balance: 0 }],
};
const BUILDINGS = { noLots: 0, twoLots: 2, threeLots: 3, fourLots: 4, tenLots: 10 };

describe.each([
  ["NSW", NSW],
  ["QLD", QLD],
] as const)("%s funds", (code, rules) => {
  it("default funds", () => {
    const building = (n: number) => ({ scheme: { totalLots: n, servicesOnly: null, replacementCost: null }, lots: lots(n), recorded: {} });
    // The building is passed as onboarding passes it after the change; the funds must not depend on it.
    const call = defaultFunds as (...a: unknown[]) => unknown;
    expect({
      catalogue: call(rules.FUND_CATALOGUE),
      rules: call(rules),
      ...Object.fromEntries(Object.entries(BUILDINGS).map(([name, n]) => [name, call(rules, building(n))])),
    }).toMatchSnapshot();
  });

  for (const [fundsName, funds] of Object.entries(FUNDS)) {
    for (const [buildingName, n] of Object.entries(BUILDINGS)) {
      it(`building data missing and funds card: funds ${fundsName}, ${buildingName}`, () => {
        const scheme = { regulationModule: code === "QLD" ? "STANDARD" : null, planFormat: code === "QLD" ? "BUILDING" : null, totalLots: n, servicesOnly: null, replacementCost: null };
        // The building's funds are passed as the scheme page passes them after the change.
        const problems = (buildingDataProblems as (...a: unknown[]) => string[])(rules, scheme, lots(n), {}, funds);
        expect({
          problems,
          notice: renderToStaticMarkup(<BuildingDataNotice problems={problems} />),
          card: renderToStaticMarkup(<FundsCard id="s1" funds={funds} catalogue={rules.FUND_CATALOGUE} />),
        }).toMatchSnapshot();
      });
    }
  }

  it("Add Property wizard words", () => {
    expect(onboardingWordsFor(code, rules)).toMatchSnapshot();
  });

  it.each(Object.entries(BUILDINGS).filter(([, n]) => n > 0))("funds createScheme gives a building, %s", async (_name, n) => {
    sharedFake.reset({ Scheme: [], SchemeMembership: [], Fund: [], Lot: [], LotDetail: [] });
    const qld = code === "QLD" ? { regulationModule: "STANDARD", planFormat: "BUILDING" } : {};
    await createScheme(
      { name: "Harbour View", planNumber: "12345", address: "1 Harbour St", suburb: "Sydney", state: code, postcode: code === "QLD" ? "4000" : "2000", totalLots: n, totalEntitlement: n * 10, ...qld },
      "adviser",
      Array.from({ length: n }, (_, i) => ({ lotNumber: String(i + 1), unitNumber: null, entitlement: 10, ownerName: null, ...(code === "QLD" ? { interestScheduleEntitlement: 4 } : {}) })),
    );
    expect(sharedFake.table("Fund").map((f) => ({ name: f.name, fundType: f.fundType, accountingBasis: f.accountingBasis }))).toMatchSnapshot();
  });
});
