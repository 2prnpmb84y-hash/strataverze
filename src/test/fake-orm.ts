/**
 * A small in-memory stand-in for the Prisma 8 ORM, for authorisation tests.
 *
 * It evaluates where clauses written in the app's style
 * (`.where((x) => and(x.id.eq(id), x.schemeId.eq(schemeId)))` and
 * `.where({ id })`), so a test can check that a query helper or an action
 * really scopes its reads and writes to a scheme: a record of another scheme
 * must not be found, changed or deleted. Ordering and includes are ignored.
 *
 * Use with:
 *   vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
 *   vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
 * and seed the tables with sharedFake.reset({ Model: [rows] }) in beforeEach.
 */

export type Row = Record<string, unknown>;
type Predicate = (row: Row) => boolean;

const value = (row: Row, field: string) => (row[field] === undefined ? null : row[field]);

const fieldProxy = new Proxy(
  {},
  {
    get: (_target, field: string) => ({
      eq: (v: unknown) => (row: Row) => value(row, field) === (v === undefined ? null : v),
      ne: (v: unknown) => (row: Row) => value(row, field) !== v,
      in: (vs: unknown[]) => (row: Row) => vs.includes(value(row, field)),
      notIn: (vs: unknown[]) => (row: Row) => !vs.includes(value(row, field)),
      isNull: () => (row: Row) => value(row, field) === null,
      isNotNull: () => (row: Row) => value(row, field) !== null,
      gte: (v: unknown) => (row: Row) => String(value(row, field)) >= String(v),
      lte: (v: unknown) => (row: Row) => String(value(row, field)) <= String(v),
      gt: (v: unknown) => (row: Row) => String(value(row, field)) > String(v),
      lt: (v: unknown) => (row: Row) => String(value(row, field)) < String(v),
      asc: () => null,
      desc: () => null,
    }),
  },
);

function toPredicate(filter: unknown): Predicate {
  if (typeof filter === "function") {
    // A where callback: it returns the predicate built from the field proxy.
    const built = (filter as (fields: unknown) => unknown)(fieldProxy);
    if (typeof built === "function") return built as Predicate;
    if (built && typeof built === "object") return toPredicate(built);
    throw new Error("fake-orm: unsupported filter");
  }
  if (filter && typeof filter === "object") {
    const entries = Object.entries(filter as Row);
    return (row) => entries.every(([k, v]) => value(row, k) === v);
  }
  if (filter === undefined) return () => true;
  throw new Error("fake-orm: unsupported filter");
}

/** Replacement for "@prisma/orm-postgres/orm-client". */
export const fakeOrmClient = {
  and:
    (...preds: Predicate[]) =>
    (row: Row) =>
      preds.every((p) => p(row)),
  or:
    (...preds: Predicate[]) =>
    (row: Row) =>
      preds.some((p) => p(row)),
  not: (pred: Predicate) => (row: Row) => !pred(row),
};

let nextId = 1;

export function createFakeDb(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = {};
  /** Replace every table with copies of the seed rows. */
  const reset = (rows: Record<string, Row[]> = {}) => {
    for (const name of Object.keys(tables)) delete tables[name];
    for (const [name, list] of Object.entries(rows)) tables[name] = list.map((r) => ({ ...r }));
  };
  reset(seed);
  const table = (name: string) => (tables[name] ??= []);

  function collection(name: string, preds: Predicate[] = [], limit?: number, offset = 0) {
    const matching = () => {
      const rows = table(name).filter((r) => preds.every((p) => p(r))).slice(offset);
      return limit === undefined ? rows : rows.slice(0, limit);
    };
    const self = {
      where: (filter: unknown) => collection(name, [...preds, toPredicate(filter)], limit, offset),
      include: () => self,
      orderBy: () => self,
      select: () => self,
      limit: (n: number) => collection(name, preds, n, offset),
      offset: (n: number) => collection(name, preds, limit, n),
      first: async (filter?: unknown) => {
        const rows = filter === undefined ? matching() : matching().filter(toPredicate(filter));
        return rows[0] ? { ...rows[0] } : null;
      },
      all: async () => matching().map((r) => ({ ...r })),
      // No count() here: Prisma 8 has no count() terminal on a collection
      // (it throws ORM.INCLUDE_INVALID), so a test must not accept one.
      aggregate: async (spec: (a: { count: () => "count" }) => Record<string, "count">) =>
        Object.fromEntries(Object.keys(spec({ count: () => "count" })).map((k) => [k, matching().length])),
      update: async (data: Row) => {
        const row = matching()[0];
        if (!row) return null;
        Object.assign(row, data);
        return { ...row };
      },
      delete: async () => {
        const row = matching()[0];
        if (!row) return null;
        tables[name] = table(name).filter((r) => r !== row);
        return { ...row };
      },
      // As in Prisma 8: update() and delete() change the first matching row,
      // the AndCount forms change every matching row.
      updateAndCount: async (data: Row) => {
        const rows = matching();
        for (const row of rows) Object.assign(row, data);
        return rows.length;
      },
      deleteAndCount: async () => {
        const rows = new Set(matching());
        tables[name] = table(name).filter((r) => !rows.has(r));
        return rows.size;
      },
      create: async (data: Row) => {
        const row = { id: `fake-${name}-${nextId++}`, ...data };
        table(name).push(row);
        return { ...row };
      },
    };
    return self;
  }

  const publicModels = new Proxy({} as Record<string, ReturnType<typeof collection>>, {
    get: (_t, name: string) => collection(name),
  });
  const orm = { public: publicModels };
  const db = {
    orm,
    transaction: async <T>(fn: (tx: { orm: typeof orm }) => Promise<T>) => fn({ orm }),
  };
  return { db, tables, table, reset };
}

/**
 * One fake shared by a test file and its "@/prisma/db" mock:
 *   vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
 */
export const sharedFake = createFakeDb();
