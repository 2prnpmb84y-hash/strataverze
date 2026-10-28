/**
 * NSW and Queensland lots saved and read on the fake database, unchanged by
 * Victoria's second schedule (VIC, ACT and WA stage 2, PR 4). The snapshots
 * were recorded on feat/fund-conditions (2b04048), before the change, and
 * must match byte for byte: creating and editing a lot, the CSV lot import's
 * checks and writes, createScheme's lots and its own data check, a state
 * change, and a Queensland contribution's insurance split.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/mfa-enforcement", () => ({
  requireRecentMfa: vi.fn(async () => {}),
  getMfaStatus: vi.fn(async () => null),
  enforceMfa: vi.fn(async () => {}),
  enforceMfaFor: vi.fn(async () => {}),
  StepUpRequiredError: class extends Error {},
}));
const caller = vi.hoisted(() => ({ id: "caller", isPlatformAdmin: true, roles: ["ADVISER"] as string[] }));
vi.mock("@/lib/auth/require-membership", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/require-membership")>("@/lib/auth/require-membership");
  return {
    ...actual,
    requireAuth: vi.fn(async () => caller),
    requirePlatformAdmin: vi.fn(async () => {
      if (!caller.isPlatformAdmin) throw new actual.AuthorisationError("Only StrataVerze staff can do this.");
      return caller;
    }),
    requireSchemeMembership: vi.fn(async (_schemeId: string, allowed: string[]) => {
      const role = caller.roles.find((r) => allowed.includes(r));
      if (!role) throw new actual.AuthorisationError("You do not have permission to perform this action.");
      return { profile: caller, membership: { role, profileId: caller.id }, roles: caller.roles };
    }),
  };
});
vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${url}` });
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("@/lib/queries/activity-log", () => ({ logActivity: vi.fn(async () => {}), logActivityTx: vi.fn() }));
vi.mock("@/lib/audit/security-audit", () => ({ recordSecurityEvent: vi.fn(async () => {}) }));
vi.mock("@/lib/auth/session-register", () => ({ revokeAllSessions: vi.fn(async () => {}) }));
vi.mock("@/lib/queries/seed-chart-of-accounts", () => ({ seedDefaultChartOfAccounts: vi.fn(async () => {}) }));
// A Queensland building has the pending Queensland pack, lent the NSW accounting basis to reach the rest of createScheme.
vi.mock("@/lib/jurisdiction/scheme-rules", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/scheme-rules")>("@/lib/jurisdiction/scheme-rules");
  const { QLD_RULE_PACK } = await import("@/config/statutory");
  const forState = (state: string | null | undefined) => {
    if (state === "QLD") {
      const nsw = actual.rulesForState("NSW").rules;
      return { pack: null, rules: { ...QLD_RULE_PACK.rules, defaultAccountingBasis: nsw.defaultAccountingBasis }, label: "AU-QLD test" };
    }
    return actual.rulesForState(state);
  };
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
const { createLotAction, updateLotAction } = await import("./[id]/lots/actions");
const { validateLots, importLots } = await import("@/lib/queries/data-migration");
const { createScheme, newSchemeDataProblem, updateScheme } = await import("@/lib/queries/schemes");
const { contributionInsurance } = await import("@/lib/levies/contribution-insurance");
const { QLD_RULE_PACK, statutoryRulesFor } = await import("@/config/statutory");
type Rules = import("@/config/statutory").StatutoryRules;

const NSW_RULES = statutoryRulesFor("NSW");
const QLD_RULES = QLD_RULE_PACK.rules as unknown as Rules;

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}
async function settle<T>(p: Promise<T>): Promise<T | string> {
  try {
    return await p;
  } catch (err) {
    const digest = (err as { digest?: string }).digest;
    return digest?.startsWith("NEXT_REDIRECT") ? "redirected" : `threw ${(err as Error).name}: ${(err as Error).message}`;
  }
}
const lots = () => sharedFake.table("Lot").map((l) => ({ ...l }));

function seedLots() {
  sharedFake.reset({
    Scheme: [
      { id: "nsw", state: "NSW", regulationModule: null, planFormat: null },
      { id: "qld", state: "QLD", regulationModule: "STANDARD", planFormat: "BUILDING" },
    ],
    Lot: [
      { id: "lot-nsw", schemeId: "nsw", lotNumber: "1", entitlement: 10, interestScheduleEntitlement: null, lotType: "RESIDENTIAL" },
      { id: "lot-qld", schemeId: "qld", lotNumber: "1", entitlement: 10, interestScheduleEntitlement: null, lotType: "RESIDENTIAL" },
    ],
  });
}

beforeEach(() => {
  Object.assign(caller, { isPlatformAdmin: true, roles: ["ADVISER"] });
  seedLots();
});

describe.each(["nsw", "qld"])("%s lot form actions", (id) => {
  const base = { lotNumber: "2", entitlement: "20", lotType: "RESIDENTIAL" };
  const edit = { lotNumber: "1", entitlement: "10", lotType: "RESIDENTIAL" };
  const creates: Record<string, string>[] = [
    base,
    { ...base, interestScheduleEntitlement: "" },
    { ...base, interestScheduleEntitlement: "0" },
    { ...base, interestScheduleEntitlement: "18" },
    { ...base, entitlement: "12.5", interestScheduleEntitlement: "10" },
    { ...base, lotNumber: "", entitlement: "0" },
  ];
  it.each(creates.map((c, i) => [i, c] as const))("create %i", async (_i, fields) => {
    const result = await settle(createLotAction(id, {}, form(fields)));
    expect({ result, lots: lots() }).toMatchSnapshot();
  });
  const updates: [boolean, Record<string, string>][] = [
    [false, { ...edit, unitNumber: "4" }],
    [false, { ...edit, unitNumber: "4", interestScheduleEntitlement: "" }],
    [false, { ...edit, interestScheduleEntitlement: "12" }],
    [true, { ...edit, interestScheduleEntitlement: "12" }],
    [true, { ...edit, interestScheduleEntitlement: "1.5" }],
    [true, { ...edit, entitlement: "12.5" }],
    [true, { ...edit, entitlement: "0" }],
  ];
  it.each(updates.map(([admin, f], i) => [i, admin, f] as const))("update %i (StrataVerze %s)", async (_i, admin, fields) => {
    caller.isPlatformAdmin = admin;
    const result = await settle(updateLotAction(id, `lot-${id}`, {}, form(fields)));
    expect({ result, lots: lots() }).toMatchSnapshot();
  });
});

describe.each(["nsw", "qld"])("%s CSV lot import", (id) => {
  const row = (rowNumber: number, data: Record<string, string>) => ({ rowNumber, data, errors: [] as string[], warnings: [] as string[] });
  const rows = [
    row(2, { lotNumber: "2", entitlement: "10", interestScheduleEntitlement: "12" }),
    row(3, { lotNumber: "3", entitlement: "10" }),
    row(4, { lotNumber: "4", entitlement: "10", interestScheduleEntitlement: "0" }),
    row(5, { lotNumber: "5", entitlement: "10", interestScheduleEntitlement: "2.5" }),
    row(6, { lotNumber: "1", entitlement: "-1" }),
  ];
  it("checks and writes", async () => {
    const checked = await validateLots(id, rows);
    const imported = await settle(importLots(id, [rows[0]], "adviser"));
    expect({ checked, imported, lots: lots() }).toMatchSnapshot();
  });
});

describe("createScheme lots", () => {
  const building = { name: "Harbour View", planNumber: "12345", address: "1 Harbour St", suburb: "Sydney", state: "NSW", postcode: "2000", totalLots: 2, totalEntitlement: 100 };
  const qld = { ...building, state: "QLD", postcode: "4000", planNumber: "777", regulationModule: "STANDARD", planFormat: "BUILDING" };
  const two = (a?: number | null, b?: number | null) => [
    { lotNumber: "1", unitNumber: null, entitlement: 40, ownerName: "A", ...(a !== undefined ? { interestScheduleEntitlement: a } : {}) },
    { lotNumber: "2", unitNumber: null, entitlement: 60, ownerName: "B", ...(b !== undefined ? { interestScheduleEntitlement: b } : {}) },
  ];
  it.each([
    ["NSW", building, two()],
    ["NSW with a second value", building, two(45, 55)],
    ["QLD", qld, two(45, 55)],
    ["QLD one missing", qld, two(45, null)],
    ["QLD out of range", qld, two(0, 2_000_000)],
  ] as const)("%s", async (_name, data, rows) => {
    sharedFake.reset({ Scheme: [], SchemeMembership: [], Fund: [], Lot: [], LotDetail: [] });
    const created = await settle(createScheme(data, "adviser", rows));
    expect({ created: typeof created === "string" ? created : "created", lots: lots().map(({ id: _id, schemeId: _s, ...l }) => l) }).toMatchSnapshot();
  });
  it("newSchemeDataProblem", () => {
    const rows = [two(), two(45, 55), two(45, null), two(0, 55), two(1.5, 55)];
    expect({
      nsw: rows.map((r) => newSchemeDataProblem(NSW_RULES, {}, r)),
      qld: rows.map((r) => newSchemeDataProblem(QLD_RULES, { regulationModule: "STANDARD", planFormat: "BUILDING" }, r)),
    }).toMatchSnapshot();
  });
});

describe("a state change keeps each lot's values as before", () => {
  it.each([
    ["QLD to NSW", { id: "s", state: "QLD", postcode: "4000", timeZone: "Australia/Brisbane", regulationModule: "STANDARD", planFormat: "BUILDING" }, { state: "NSW", postcode: "2000" }],
    ["NSW to QLD", { id: "s", state: "NSW", postcode: "2000", timeZone: "Australia/Sydney" }, { state: "QLD", postcode: "4000" }],
  ])("%s", async (_name, row, data) => {
    sharedFake.reset({ Scheme: [row], Lot: [{ id: "l", schemeId: "s", lotNumber: "1", entitlement: 10, interestScheduleEntitlement: 4, occupiable: null }], SchemeSelectorValue: [] });
    await updateScheme("s", data);
    expect({ scheme: sharedFake.table("Scheme"), lots: lots() }).toMatchSnapshot();
  });
});

describe("a Queensland contribution's insurance split, from the building's data", () => {
  function seed(opts: { state?: string; planFormat?: string | null; interest?: ReadonlyArray<number | null>; insurance?: string | null; fundId?: string }) {
    const interest = opts.interest ?? [30, 30, 40];
    sharedFake.reset({
      Scheme: [{ id: "s1", state: opts.state ?? "QLD", planFormat: opts.planFormat === undefined ? "BUILDING" : opts.planFormat }],
      Fund: [
        { id: "admin", schemeId: "s1", name: "Administrative Fund", fundType: "ADMINISTRATIVE", isActive: true },
        { id: "sink", schemeId: "s1", name: "Sinking Fund", fundType: "CAPITAL_WORKS", isActive: true },
      ],
      Lot: [10, 20, 30].map((entitlement, i) => ({ id: `l${i + 1}`, schemeId: "s1", lotNumber: String(i + 1), entitlement, interestScheduleEntitlement: interest[i] })),
      AccountCode: [
        { id: "acc-ins", schemeId: "s1", code: "5-1100", name: "Insurance", accountType: "EXPENSE", accountSubType: "INSURANCE_EXPENSE", fundId: "admin" },
        { id: "acc-mnt", schemeId: "s1", code: "5-1200", name: "Maintenance and Repairs", accountType: "EXPENSE", accountSubType: "MAINTENANCE_EXPENSE", fundId: "admin" },
      ],
      Budget: [
        { id: "b-admin", schemeId: "s1", fundId: "admin", financialYear: 2026, version: 2, status: "ADOPTED" },
        { id: "b-sink", schemeId: "s1", fundId: "sink", financialYear: 2026, version: 1, status: "ADOPTED" },
      ],
      BudgetLine: [
        ...(opts.insurance === null ? [] : [{ id: "bl1", fundId: "admin", accountCodeId: "acc-ins", financialYear: 2026, budgetId: "b-admin", budgetAmount: opts.insurance ?? "400.01" }]),
        { id: "bl2", fundId: "admin", accountCodeId: "acc-mnt", financialYear: 2026, budgetId: "b-admin", budgetAmount: "599.99" },
        { id: "bl4", fundId: "sink", accountCodeId: "acc-mnt", financialYear: 2026, budgetId: "b-sink", budgetAmount: "1200.00" },
      ],
    });
  }
  const planLots = [10, 20, 30].map((entitlement, i) => ({ lotId: `l${i + 1}`, lotNumber: String(i + 1), entitlement, ownerId: `o${i + 1}` }));
  const schedule = (over: Record<string, unknown> = {}) => ({ fundId: "admin", financialYear: 2026, levyType: "ORDINARY", budgetAmount: "1000.00", ...over });
  it.each([
    ["building", {}, {}],
    ["standard", { planFormat: "STANDARD" }, {}],
    ["no plan format", { planFormat: null }, {}],
    ["missing interest", { interest: [30, null, 0] }, {}],
    ["no insurance line", { insurance: null }, {}],
    ["sinking fund", {}, { fundId: "sink", budgetAmount: "1200.00" }],
    ["special", {}, { levyType: "SPECIAL" }],
    ["NSW", { state: "NSW" }, {}],
  ] as const)("%s", async (_name, opts, over) => {
    seed(opts);
    expect(await contributionInsurance("s1", schedule(over), planLots)).toMatchSnapshot();
  });
});
