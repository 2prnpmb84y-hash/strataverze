/**
 * NSW and Queensland charts of accounts, unchanged by seeding only the
 * ledger funds a building has (VIC, ACT and WA stage 2, PR 3 review). The
 * snapshots were recorded on feat/state-selectors (19fb6ac), before the
 * change, and must match byte for byte: what seedDefaultChartOfAccounts
 * creates, or the error it throws, for each set of funds a building may hold.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("@/lib/jurisdiction/scheme-rules", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/scheme-rules")>("@/lib/jurisdiction/scheme-rules");
  const { QLD_RULE_PACK } = await import("@/config/statutory");
  const { sharedFake } = await import("@/test/fake-orm");
  // A Queensland building: the Queensland pack (live from the switch-on, 28 Oct 2026).
  const forState = (state: string) => (state === "QLD" ? { pack: null, rules: QLD_RULE_PACK.rules, label: "AU-QLD test" } : actual.rulesForState(state));
  return {
    ...actual,
    rulesForState: forState,
    rulesForScheme: async (schemeId: string) => forState(String(sharedFake.table("Scheme").find((s) => s.id === schemeId)?.state)),
  };
});

const { sharedFake } = await import("@/test/fake-orm");
const { seedDefaultChartOfAccounts } = await import("./seed-chart-of-accounts");

const FUNDS: Record<string, { id: string; fundType: string }[]> = {
  both: [
    { id: "fa", fundType: "ADMINISTRATIVE" },
    { id: "fc", fundType: "CAPITAL_WORKS" },
  ],
  bothAndSpecial: [
    { id: "fa", fundType: "ADMINISTRATIVE" },
    { id: "fc", fundType: "CAPITAL_WORKS" },
    { id: "fs", fundType: "SPECIAL" },
  ],
  adminOnly: [{ id: "fa", fundType: "ADMINISTRATIVE" }],
  capitalOnly: [{ id: "fc", fundType: "CAPITAL_WORKS" }],
  legacy: [
    { id: "fl", fundType: "ADMIN" },
    { id: "fs", fundType: "SINKING" },
  ],
  none: [],
};

const shape = (rows: Record<string, unknown>[]) =>
  rows.map((a) => ({ code: a.code, name: a.name, accountType: a.accountType, accountSubType: a.accountSubType, fundId: a.fundId, isSystemAccount: a.isSystemAccount, gstApplicable: a.gstApplicable }));

describe.each(["NSW", "QLD"])("%s chart of accounts", (state) => {
  it.each(Object.keys(FUNDS))("funds %s", async (name) => {
    sharedFake.reset({ Scheme: [{ id: "s", state }], Fund: FUNDS[name].map((f) => ({ ...f, schemeId: "s" })), AccountCode: [] });
    const first = await seedDefaultChartOfAccounts("s").then(
      (rows) => ({ created: shape(rows as Record<string, unknown>[]) }),
      (e: unknown) => ({ error: e instanceof Error ? e.message : String(e) }),
    );
    // Seeding again creates nothing new.
    const again = await seedDefaultChartOfAccounts("s").then(
      (rows) => ({ created: rows.length }),
      (e: unknown) => ({ error: e instanceof Error ? e.message : String(e) }),
    );
    expect({ first, again, table: shape(sharedFake.table("AccountCode")) }).toMatchSnapshot();
  });
});
