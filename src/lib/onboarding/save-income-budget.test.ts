import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Saving onboarding's income, expenditure, budget and levies (24 Oct),
 * against a small in-memory database shaped like SP 99999.
 */

type Row = Record<string, unknown> & { id: string };
type Pred = (r: Row) => boolean;

const tables: Record<string, Row[]> = {};
let seq = 0;

function fieldProxy(): Record<string, { eq: (v: unknown) => Pred; neq: (v: unknown) => Pred; in: (v: unknown[]) => Pred; lt: (v: unknown) => Pred; lte: (v: unknown) => Pred }> {
  return new Proxy({}, {
    get: (_t, field: string) => ({
      eq: (v: unknown) => (r: Row) => r[field] === v,
      neq: (v: unknown) => (r: Row) => r[field] !== v,
      in: (v: unknown[]) => (r: Row) => v.includes(r[field]),
      lt: (v: unknown) => (r: Row) => (r[field] as number) < (v as number),
      lte: (v: unknown) => (r: Row) => String(r[field]) <= String(v),
    }),
  }) as never;
}

function model(name: string) {
  tables[name] ??= [];
  const query = (pred: Pred) => {
    const q = {
      where: (fn: (f: ReturnType<typeof fieldProxy>) => Pred) => query((r) => pred(r) && fn(fieldProxy())(r)),
      limit: () => q,
      orderBy: () => q,
      include: () => q,
      all: async () => tables[name].filter(pred).map((r) => ({ ...r })),
      first: async () => {
        const r = tables[name].find(pred);
        return r ? { ...r } : null;
      },
      update: async (patch: Record<string, unknown>) => {
        for (const r of tables[name].filter(pred)) Object.assign(r, patch);
        return null;
      },
      updateAndCount: async (patch: Record<string, unknown>) => {
        const rows = tables[name].filter(pred);
        for (const r of rows) Object.assign(r, patch);
        return rows.length;
      },
      deleteAndCount: async () => {
        const before = tables[name].length;
        tables[name] = tables[name].filter((r) => !pred(r));
        return before - tables[name].length;
      },
    };
    return q;
  };
  const all = query(() => true);
  return {
    ...all,
    create: async (data: Record<string, unknown>) => {
      const r = { id: `${name}-${++seq}`, ...data } as Row;
      tables[name].push(r);
      return { ...r };
    },
    createAll: async (rows: Record<string, unknown>[]) => rows.map((d) => {
      const r = { id: `${name}-${++seq}`, ...d } as Row;
      tables[name].push(r);
      return { ...r };
    }),
  };
}

const MODELS = ["Scheme", "Fund", "AccountCode", "PriorYearActual", "Budget", "BudgetLine", "LevySchedule", "LevyNotice", "Lot"];
interface FakeDb {
  orm: { public: Record<string, ReturnType<typeof model>> };
  transaction: <T>(fn: (tx: FakeDb) => Promise<T>) => Promise<T>;
}
const fakeDb: FakeDb = {
  orm: { public: {} },
  transaction: async (fn) => fn(fakeDb),
};
function resetDb() {
  for (const m of MODELS) tables[m] = [];
  for (const m of MODELS) fakeDb.orm.public[m] = model(m);
}

vi.mock("@/prisma/db", () => ({ db: fakeDb }));
vi.mock("@prisma/orm-postgres/orm-client", () => ({ and: (...ps: Pred[]) => (r: Row) => ps.every((p) => p(r)) }));

const cutover = vi.hoisted(() => ({ present: true }));
vi.mock("@/lib/finance/migration-batches", () => ({
  ONBOARDING_SOURCE: { value: "onboarding", label: "StrataVerze onboarding" },
  sourceSystemLabel: () => "StrataVerze onboarding",
  listCutovers: async () => (cutover.present ? [{ id: "batch-1", sourceSystem: "onboarding", status: "DRAFT", cutoverDate: "2026-06-30", files: { opening_balances: {} } }] : []),
  getCutoverView: async () => ({
    cutoverDate: "2026-06-30",
    evaluation: {
      rows: {
        opening_balances: [
          { value: { fundId: "admin", accountType: "ASSET", debitCents: 1003662, creditCents: 0 } },
          { value: { fundId: "admin", accountType: "EQUITY", debitCents: 0, creditCents: 1003662 } },
          { value: { fundId: "cw", accountType: "ASSET", debitCents: 8442600, creditCents: 0 } },
          { value: { fundId: "cw", accountType: "EQUITY", debitCents: 0, creditCents: 8442600 } },
        ],
      },
    },
  }),
}));
const logActivity = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/queries/activity-log", () => ({ logActivity }));

const { loadIncomeBudget, saveIncomeBudget, IncomeBudgetError } = await import("./save-income-budget");
type Input = Parameters<typeof saveIncomeBudget>[2];

function seed() {
  resetDb();
  tables.Scheme.push({ id: "s1", financialYearEnd: "06-30" });
  tables.Fund.push({ id: "admin", schemeId: "s1", name: "Administrative Fund", fundType: "ADMINISTRATIVE", isActive: true });
  tables.Fund.push({ id: "cw", schemeId: "s1", name: "Capital Works Fund", fundType: "CAPITAL_WORKS", isActive: true });
  const acc = (id: string, code: string, name: string, accountType: string, fundId: string, accountSubType: string | null = null) =>
    tables.AccountCode.push({ id, schemeId: "s1", code, name, accountType, accountSubType, fundId, isActive: true });
  acc("a-levy", "4-1000", "Levy Income — Admin", "INCOME", "admin", "LEVY_INCOME");
  acc("a-ins", "5-1100", "Insurance", "EXPENSE", "admin");
  acc("a-sundry", "5-1500", "Sundry Expenses", "EXPENSE", "admin");
  acc("c-levy", "4-2000", "Levy Income — Capital Works", "INCOME", "cw", "LEVY_INCOME");
  acc("c-exp", "5-2000", "Capital Works Expenditure", "EXPENSE", "cw");
  tables.Lot.push({ id: "l1", schemeId: "s1", entitlement: "30000" }, { id: "l2", schemeId: "s1", entitlement: "21800" });
}

const r = (accountId: string, actual: string, budget: string, newAccountName = "", accountType: "INCOME" | "EXPENSE" = "EXPENSE") => ({ accountId, newAccountName, accountType, actual, budget });

function input(over: Partial<Input> = {}): Input {
  return {
    funds: [
      {
        fundId: "admin",
        openingBalance: "868.45",
        rows: [
          r("a-levy", "32,388.96", "34,000.00"),
          r("", "46.38", "", "Mutual Revenue - penalty interest", "INCOME"),
          r("a-ins", "8,192.00", "9,000.00"),
          r("", "15,075.17", "20,000.00", "Cleaning and other services"),
        ],
      },
      { fundId: "cw", openingBalance: "85,457.96", rows: [r("c-levy", "5,555.68", "8,000.00"), r("", "6.86", "", "Mutual Revenue - penalty interest", "INCOME"), r("", "6,594.50", "5,000.00", "Windows")] },
    ],
    adoption: { kind: "before_takeover", meetingDate: "2026-05-20" },
    levies: { frequency: "QUARTERLY", firstDueDate: "2026-07-01" },
    ...over,
  };
}

beforeEach(() => {
  seed();
  cutover.present = true;
  logActivity.mockClear();
});

describe("saveIncomeBudget", () => {
  it("saves last year as comparatives, the adopted budget, approved levy schedules and new accounts", async () => {
    const res = await saveIncomeBudget("s1", "me", input());
    expect(res.saved).toBe(true);

    const added = tables.AccountCode.filter((a) => !String(a.id).startsWith("a-") && !String(a.id).startsWith("c-"));
    expect(added.map((a) => [a.code, a.name, a.fundId, a.accountType])).toEqual([
      ["4-1010", "Mutual Revenue - penalty interest", "admin", "INCOME"],
      ["5-1510", "Cleaning and other services", "admin", "EXPENSE"],
      ["4-2010", "Mutual Revenue - penalty interest", "cw", "INCOME"],
      ["5-2010", "Windows", "cw", "EXPENSE"],
    ]);

    expect(tables.PriorYearActual).toHaveLength(7);
    expect(tables.PriorYearActual.every((p) => p.financialYear === 2025 && p.source === "onboarding")).toBe(true);
    expect(tables.PriorYearActual.find((p) => p.accountCodeId === "a-ins")?.amount).toBe("8192.00");

    expect(tables.Budget.map((b) => [b.fundId, b.financialYear, b.status, b.adoptedBeforeTakeoverOn, b.adoptedMeetingId])).toEqual([
      ["admin", 2026, "ADOPTED", "2026-05-20", null],
      ["cw", 2026, "ADOPTED", "2026-05-20", null],
    ]);
    expect(tables.BudgetLine.filter((l) => l.fundId === "admin").map((l) => l.budgetAmount)).toEqual(["34000.00", "9000.00", "20000.00"]);

    expect(tables.LevySchedule.map((s) => [s.fundId, s.budgetAmount, s.frequency, s.status, s.firstDueDate, s.totalLots, s.totalEntitlement])).toEqual([
      ["admin", "34000.00", "QUARTERLY", "APPROVED", "2026-07-01", 2, "51800"],
      ["cw", "8000.00", "QUARTERLY", "APPROVED", "2026-07-01", 2, "51800"],
    ]);
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "ONBOARDING_INCOME_BUDGET_SAVED" }));
  });

  it("fills the form again from what was saved, and saving it again changes nothing twice", async () => {
    await saveIncomeBudget("s1", "me", input());
    const data = await loadIncomeBudget("s1");
    if ("problem" in data) throw new Error(data.problem);
    expect(data.saved.funds[0].openingBalance).toBe("868.45");
    expect(data.saved.funds[1].openingBalance).toBe("85457.96");
    expect(data.saved.funds[0].rows).toHaveLength(4);
    expect(data.saved.adoption).toEqual({ kind: "before_takeover", meetingDate: "2026-05-20" });
    expect(data.saved.levies).toEqual({ frequency: "QUARTERLY", firstDueDate: "2026-07-01" });

    const res = await saveIncomeBudget("s1", "me", { ...data.saved, adoption: { kind: "draft", meetingDate: "" } });
    expect(res.saved).toBe(true);
    expect(tables.AccountCode).toHaveLength(9);
    expect(tables.PriorYearActual).toHaveLength(7);
    expect(tables.Budget).toHaveLength(2);
    expect(tables.Budget.every((b) => b.status === "DRAFT" && b.adoptedBeforeTakeoverOn === null && b.adoptedAt === null)).toBe(true);
    expect(tables.BudgetLine).toHaveLength(5);
    expect(tables.LevySchedule).toHaveLength(2);
    expect(tables.LevySchedule.every((s) => s.status === "DRAFT" && s.approvedAt === null)).toBe(true);
  });

  it("saves nothing when a fund does not reconcile", async () => {
    const bad = input();
    bad.funds[0].openingBalance = "868.00";
    const res = await saveIncomeBudget("s1", "me", bad);
    expect(res.saved).toBe(false);
    expect(res.check.fundProblems.admin.join(" ")).toContain("does not reconcile");
    expect(tables.PriorYearActual).toHaveLength(0);
    expect(tables.Budget).toHaveLength(0);
    expect(tables.AccountCode).toHaveLength(5);
  });

  it("will not change a budget adopted at a meeting held in StrataVerze", async () => {
    tables.Budget.push({ id: "b1", schemeId: "s1", fundId: "admin", financialYear: 2026, version: 1, status: "ADOPTED", adoptedMeetingId: "m1", adoptedBeforeTakeoverOn: null });
    const res = await saveIncomeBudget("s1", "me", input());
    expect(res.saved).toBe(false);
    expect(res.check.fundProblems.admin.join(" ")).toContain("adopted at a general meeting held in StrataVerze");
    expect(tables.PriorYearActual).toHaveLength(0);
  });

  it("will not change levies once notices have been raised", async () => {
    await saveIncomeBudget("s1", "me", input());
    tables.LevyNotice.push({ id: "n1", levyScheduleId: tables.LevySchedule[0].id });
    const res = await saveIncomeBudget("s1", "me", input());
    expect(res.saved).toBe(false);
    expect(res.check.fundProblems.admin.join(" ")).toContain("Levy notices have been raised");
  });

  it("needs the opening balances first", async () => {
    cutover.present = false;
    await expect(saveIncomeBudget("s1", "me", input())).rejects.toBeInstanceOf(IncomeBudgetError);
  });
});
