/**
 * Fund conditions on onboarding and the fund screens (VIC, ACT and WA stage
 * 2, PR 3). The draft packs are lent to createScheme here, since no building
 * can be set up in their states yet: a new building is given each fund the law
 * requires of it from what onboarding knows, never a fund that cannot be
 * worked out, and the funds card says which funds it needs and why.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("@/lib/queries/seed-chart-of-accounts", () => ({ seedDefaultChartOfAccounts: vi.fn(async () => {}) }));
vi.mock("@/lib/jurisdiction/scheme-rules", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/scheme-rules")>("@/lib/jurisdiction/scheme-rules");
  const { PENDING_RULE_PACKS } = await import("@/config/statutory");
  return {
    ...actual,
    // A draft pack, lent the NSW accounting basis and late charge, which the
    // drafts do not have yet, to reach the funds createScheme gives.
    rulesForState: (state: string) => {
      const draft = (PENDING_RULE_PACKS as Record<string, { rules: object }>)[state];
      if (!draft || state === "QLD") return actual.rulesForState(state);
      const nsw = actual.rulesForState("NSW").rules;
      return { pack: null, rules: { ...draft.rules, defaultAccountingBasis: nsw.defaultAccountingBasis, LATE_CHARGE: nsw.LATE_CHARGE }, label: `AU-${state} test` };
    },
  };
});

const { PENDING_RULE_PACKS, statutoryRulesFor } = await import("@/config/statutory");
const { sharedFake } = await import("@/test/fake-orm");
const { createScheme } = await import("@/lib/queries/schemes");
const { fundRequirementsView } = await import("./funds");
const { FundsCard } = await import("@/app/(portal)/adviser/schemes/[id]/_sections/funds-card");
const { onboardingWordsFor } = await import("@/lib/onboarding/onboarding-words");

const NSW = statutoryRulesFor("NSW");
const WA = PENDING_RULE_PACKS.WA.rules as unknown as typeof NSW;
const ACT = PENDING_RULE_PACKS.ACT.rules as unknown as typeof NSW;

const create = async (state: string, postcode: string, n: number) => {
  await createScheme(
    { name: "Harbour View", planNumber: "12345", address: "1 Harbour St", suburb: "City", state, postcode, totalLots: n, totalEntitlement: n * 10 },
    "adviser",
    Array.from({ length: n }, (_, i) => ({ lotNumber: String(i + 1), unitNumber: null, entitlement: 10, ownerName: null })),
  );
  return sharedFake.table("Fund").map((f) => f.name);
};

beforeEach(() => sharedFake.reset({ Scheme: [], SchemeMembership: [], Fund: [], Lot: [], LotDetail: [] }));

describe("createScheme with fund conditions", () => {
  it("gives an ACT building of 4 units a sinking fund, and one of 3 units none", async () => {
    expect(await create("ACT", "2600", 4)).toEqual(["Administrative Fund", "Sinking Fund"]);
    sharedFake.reset({ Scheme: [], SchemeMembership: [], Fund: [], Lot: [], LotDetail: [] });
    expect(await create("ACT", "2600", 3)).toEqual(["Administrative Fund"]);
  });

  it("gives a WA building of 12 lots both funds, and never guesses for 2 to 5 lots or below 10 lots", async () => {
    expect(await create("WA", "6000", 12)).toEqual(["Administrative Fund", "Reserve Fund"]);
    sharedFake.reset({ Scheme: [], SchemeMembership: [], Fund: [], Lot: [], LotDetail: [] });
    // 6 lots: the administrative fund is required; the reserve fund needs the scheme type and replacement cost.
    expect(await create("WA", "6000", 6)).toEqual(["Administrative Fund"]);
    sharedFake.reset({ Scheme: [], SchemeMembership: [], Fund: [], Lot: [], LotDetail: [] });
    // 3 lots: no fund can be worked out, so the building is refused (it would have no ledger).
    await expect(create("WA", "6000", 3)).rejects.toThrow("so it would have no ledger.");
    expect(sharedFake.table("Fund")).toEqual([]);
  });

  it("gives a VIC building its administrative fund, and no maintenance fund until its tier can be worked out", async () => {
    expect(await create("VIC", "3000", 60)).toEqual(["Administrative Fund"]);
  });
});

describe("the funds card", () => {
  it("shows which funds the building needs and why, for a pack with conditions", () => {
    const requirements = fundRequirementsView(WA, { scheme: { totalLots: 12 }, lots: Array.from({ length: 12 }, (_, i) => ({ lotNumber: String(i + 1) })), recorded: {} });
    const html = renderToStaticMarkup(<FundsCard id="s1" funds={[]} catalogue={WA.FUND_CATALOGUE} requirements={requirements} />);
    expect(html).toContain("Which funds this building needs");
    expect(html).toContain("Set up the funds this building needs, listed below.");
    expect(html).toContain("Required for a scheme of 6 or more lots.");
    expect(html).toContain("Required for a designated strata company: 10 or more lots, or a replacement cost of more than $5,000,000.");
    expect(html).not.toMatch(/[\u2013\u2014]/);
  });

  it("says what to record where a fund cannot be worked out", () => {
    const requirements = fundRequirementsView(ACT, { scheme: { totalLots: 4 }, lots: [], recorded: {} });
    const html = renderToStaticMarkup(<FundsCard id="s1" funds={[]} catalogue={ACT.FUND_CATALOGUE} requirements={requirements} />);
    expect(html).toContain("Not worked out yet");
    expect(html).toContain("Whether this building must have a sinking fund cannot be worked out because no units are recorded.");
  });

  it("is unchanged for NSW, which has no fund conditions", () => {
    const requirements = fundRequirementsView(NSW, { scheme: { totalLots: 4 }, lots: [], recorded: {} });
    expect(requirements).toBeNull();
    const funds = [{ id: "a", name: "Administrative Fund", fundType: "ADMINISTRATIVE", balance: 1 }];
    expect(renderToStaticMarkup(<FundsCard id="s1" funds={funds} catalogue={NSW.FUND_CATALOGUE} requirements={requirements} />)).toBe(
      renderToStaticMarkup(<FundsCard id="s1" funds={funds} catalogue={NSW.FUND_CATALOGUE} />),
    );
  });
});

describe("the Add Property wizard's words", () => {
  it("carry the fund rules for a pack with conditions only", () => {
    expect(onboardingWordsFor("NSW", NSW)).not.toHaveProperty("fundRules");
    const act = onboardingWordsFor("ACT", ACT as Parameters<typeof onboardingWordsFor>[1]);
    expect(act.fundRules?.FUND_CATALOGUE).toBe(ACT.FUND_CATALOGUE);
    expect(act.fundRules?.BUILDING_SELECTORS).toBe(ACT.BUILDING_SELECTORS);
    // Plain data the page can pass to the browser.
    expect(JSON.parse(JSON.stringify(act.fundRules))).toEqual(act.fundRules);
  });
});
