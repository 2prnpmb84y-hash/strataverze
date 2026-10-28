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
 *
 * Row locks: `forNoKeyUpdate()` / `forUpdate()` before `first()` or `all()`
 * inside `db.transaction` hold each matching row until that transaction ends,
 * and another transaction locking the same row waits, as in Postgres. The read
 * returns the rows as they are once the lock is held. A plain update or delete
 * of a row another transaction holds waits too. Every lock taken is recorded
 * in `locks` (locking again rows the transaction already holds is not a new
 * lock). A wait longer than 2 seconds throws (a deadlock in the code).
 *
 * A transaction that throws is rolled back: its creates, updates and deletes
 * are undone. Writes are visible to other callers before commit (no
 * isolation). Unique keys are checked only where a test sets them
 * (`setUniqueKeys`), and a duplicate throws with code 23505. Includes are
 * ignored, except a has-many relation a test sets (`setRelations`), which
 * `include(name)` fills from the child table.
 *
 * A transaction's `raw` and `execute` record each raw statement in
 * `statements`; `SET LOCAL lock_timeout` makes that transaction's lock waits
 * fail after that long with SQLSTATE 55P03, as in Postgres
 * (`setLockTimeoutMs` shortens it for a test).
 *
 * A call through the global `db.orm` from inside a transaction that holds a
 * row lock is recorded in `globalCallsUnderLock` (the table it touched). In
 * Postgres that call needs a second pool connection while the lock is held,
 * so enough such writers at once can wait on each other for ever.
 */

import { AsyncLocalStorage } from "node:async_hooks";

export type Row = Record<string, unknown>;
type Predicate = (row: Row) => boolean;

const value = (row: Row, field: string) => (row[field] === undefined ? null : row[field]);

const fieldProxy = new Proxy(
  {},
  {
    get: (_target, field: string) => ({
      eq: (v: unknown) => (row: Row) => value(row, field) === (v === undefined ? null : v),
      ne: (v: unknown) => (row: Row) => value(row, field) !== v,
      neq: (v: unknown) => (row: Row) => value(row, field) !== v,
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

/** One fake transaction: the rows it holds locked, how to let them go, and how to undo its writes. */
interface TxState {
  owned: Set<Row>;
  releases: Array<() => void>;
  undo: Array<() => void>;
  /** Set by `SET LOCAL lock_timeout`: how long a lock wait may take before it fails with 55P03. */
  lockTimeoutMs?: number;
}

/**
 * Wait for a promise, but throw if it takes more than 2 seconds (a deadlock),
 * or more than the transaction's lock_timeout, as Postgres does (55P03).
 */
async function waitFor(p: Promise<void>, what: string, lockTimeoutMs?: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer =
      lockTimeoutMs !== undefined
        ? setTimeout(() => reject(Object.assign(new Error("canceling statement due to lock timeout"), { sqlState: "55P03" })), lockTimeoutMs)
        : setTimeout(() => reject(new Error(`fake-orm: waited 2 seconds for a row lock on ${what} (a deadlock?)`)), 2000);
  });
  try {
    await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function createFakeDb(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = {};
  /** The transaction the current code runs in, if any. */
  const currentTx = new AsyncLocalStorage<TxState>();
  /** Tables touched through the global db.orm by code inside a transaction holding a row lock. */
  const globalCallsUnderLock: string[] = [];
  /** Every row lock taken: the table, the locked row ids and whether it was inside a transaction. */
  const locks: Array<{ table: string; ids: unknown[]; inTransaction: boolean }> = [];
  /** Raw statements run in transactions (`tx.execute(tx.raw.sql\`...\`...build())`), in order. */
  const statements: string[] = [];
  /** A test's lock_timeout in milliseconds, used in place of what `SET LOCAL lock_timeout` asks for. */
  let lockTimeoutOverrideMs: number | undefined;
  const setLockTimeoutMs = (ms: number | undefined) => {
    lockTimeoutOverrideMs = ms;
  };
  /** Rows held by a transaction, with the promise that settles when it ends. */
  const held = new Map<Row, Promise<void>>();
  /** Unique keys a test has set, by table: each a list of fields. */
  const uniqueKeys: Record<string, string[][]> = {};
  const setUniqueKeys = (keys: Record<string, string[][]>) => Object.assign(uniqueKeys, keys);
  /** Has-many relations a test has set, by table: relation name to the child table and its key. */
  const relations: Record<string, Record<string, { table: string; foreignKey: string }>> = {};
  const setRelations = (rels: Record<string, Record<string, { table: string; foreignKey: string }>>) => Object.assign(relations, rels);
  /** Replace every table with copies of the seed rows. */
  const reset = (rows: Record<string, Row[]> = {}) => {
    for (const name of Object.keys(tables)) delete tables[name];
    for (const [name, list] of Object.entries(rows)) tables[name] = list.map((r) => ({ ...r }));
    locks.length = 0;
    statements.length = 0;
    lockTimeoutOverrideMs = undefined;
    globalCallsUnderLock.length = 0;
    held.clear();
    for (const k of Object.keys(uniqueKeys)) delete uniqueKeys[k];
    for (const k of Object.keys(relations)) delete relations[k];
  };
  const checkUnique = (name: string, row: Row) => {
    for (const fields of uniqueKeys[name] ?? []) {
      const clash = table(name).some((r) => r !== row && fields.every((f) => value(r, f) === value(row, f)));
      if (clash) throw Object.assign(new Error(`fake-orm: duplicate key on ${name} (${fields.join(", ")})`), { code: "23505" });
    }
  };
  reset(seed);
  const table = (name: string) => (tables[name] ??= []);

  function collection(name: string, preds: Predicate[] = [], limit?: number, offset = 0, tx?: TxState, lock = false, includes: string[] = []) {
    /** A copy of a row, with any set relation it includes. */
    const out = (row: Row): Row => {
      const copy = { ...row };
      for (const rel of includes) {
        const r = relations[name]?.[rel];
        if (r && copy[rel] === undefined) copy[rel] = table(r.table).filter((c) => c[r.foreignKey] === row.id).map((c) => ({ ...c }));
      }
      return copy;
    };
    const matching = () => {
      const rows = table(name).filter((r) => preds.every((p) => p(r))).slice(offset);
      return limit === undefined ? rows : rows.slice(0, limit);
    };
    /** Wait for and take the locks on the matching rows (a locking read only). */
    const acquire = async () => {
      if (!lock) return;
      const rows = matching();
      // Locking again rows the transaction already holds takes no new lock (as in Postgres), so it is not recorded.
      if (tx && rows.length > 0 && rows.every((row) => tx.owned.has(row))) return;
      for (const row of rows) {
        while (held.has(row) && !tx?.owned.has(row)) await waitFor(held.get(row)!, name, tx?.lockTimeoutMs);
        if (tx && !tx.owned.has(row)) {
          let release!: () => void;
          held.set(row, new Promise<void>((resolve) => (release = resolve)));
          tx.owned.add(row);
          tx.releases.push(() => {
            held.delete(row);
            release();
          });
        }
      }
      locks.push({ table: name, ids: rows.map((r) => r.id), inTransaction: !!tx });
    };
    /** A plain write waits for rows another transaction holds. */
    const waitForRows = async (rows: Row[]) => {
      for (const row of rows) while (held.has(row) && !tx?.owned.has(row)) await waitFor(held.get(row)!, name, tx?.lockTimeoutMs);
    };
    /** Remember a row's values before a write, to undo it on rollback. */
    const remember = (row: Row) => {
      const before = { ...row };
      tx?.undo.push(() => {
        for (const k of Object.keys(row)) delete row[k];
        Object.assign(row, before);
      });
    };
    const self = {
      where: (filter: unknown) => collection(name, [...preds, toPredicate(filter)], limit, offset, tx, lock, includes),
      include: (rel?: unknown) => (typeof rel === "string" && relations[name]?.[rel] ? collection(name, preds, limit, offset, tx, lock, [...includes, rel]) : self),
      orderBy: () => self,
      select: () => self,
      limit: (n: number) => collection(name, preds, n, offset, tx, lock, includes),
      offset: (n: number) => collection(name, preds, limit, n, tx, lock, includes),
      forUpdate: () => collection(name, preds, limit, offset, tx, true, includes),
      forNoKeyUpdate: () => collection(name, preds, limit, offset, tx, true, includes),
      first: async (filter?: unknown) => {
        await acquire();
        const rows = filter === undefined ? matching() : matching().filter(toPredicate(filter));
        return rows[0] ? out(rows[0]) : null;
      },
      all: async () => {
        await acquire();
        return matching().map(out);
      },
      // No count() here: Prisma 8 has no count() terminal on a collection
      // (it throws ORM.INCLUDE_INVALID), so a test must not accept one.
      aggregate: async (spec: (a: { count: () => "count" }) => Record<string, "count">) =>
        Object.fromEntries(Object.keys(spec({ count: () => "count" })).map((k) => [k, matching().length])),
      update: async (data: Row) => {
        await waitForRows(matching().slice(0, 1));
        const row = matching()[0];
        if (!row) return null;
        remember(row);
        Object.assign(row, data);
        checkUnique(name, row);
        return { ...row };
      },
      delete: async () => {
        await waitForRows(matching().slice(0, 1));
        const row = matching()[0];
        if (!row) return null;
        tables[name] = table(name).filter((r) => r !== row);
        tx?.undo.push(() => table(name).push(row));
        return { ...row };
      },
      // As in Prisma 8: update() and delete() change the first matching row,
      // the AndCount forms change every matching row.
      updateAndCount: async (data: Row) => {
        await waitForRows(matching());
        const rows = matching();
        for (const row of rows) {
          remember(row);
          Object.assign(row, data);
          checkUnique(name, row);
        }
        return rows.length;
      },
      deleteAndCount: async () => {
        await waitForRows(matching());
        const rows = new Set(matching());
        tables[name] = table(name).filter((r) => !rows.has(r));
        tx?.undo.push(() => table(name).push(...rows));
        return rows.size;
      },
      create: async (data: Row) => {
        const row = { id: `fake-${name}-${nextId++}`, ...data };
        checkUnique(name, row);
        table(name).push(row);
        tx?.undo.push(() => {
          tables[name] = table(name).filter((r) => r !== row);
        });
        return { ...row };
      },
      /** Several rows at once, each as `create` makes it. */
      createAll: async (rows: Row[]) => Promise.all(rows.map((data) => self.create(data))),
    };
    return self;
  }

  const ormFor = (tx?: TxState) => ({
    public: new Proxy({} as Record<string, ReturnType<typeof collection>>, {
      get: (_t, name: string) => {
        const inside = currentTx.getStore();
        if (!tx && inside && inside.owned.size > 0) globalCallsUnderLock.push(name);
        return collection(name, [], undefined, 0, tx);
      },
    }),
  });
  const orm = ormFor();
  /** The raw lane inside a transaction: the statement is recorded, and SET LOCAL lock_timeout applied to it. */
  const rawFor = (state: TxState) => ({
    raw: {
      sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
        affectedCount: () => ({ build: () => ({ lane: "raw", sql: String.raw({ raw: strings }, ...values) }) }),
      }),
    },
    execute: async (plan: { sql?: string }) => {
      const sql = String(plan.sql ?? "");
      statements.push(sql);
      const timeout = sql.match(/SET LOCAL lock_timeout = '(\d+)(ms|s)'/);
      if (timeout) state.lockTimeoutMs = lockTimeoutOverrideMs ?? Number(timeout[1]) * (timeout[2] === "s" ? 1000 : 1);
      return { affectedRows: 0 };
    },
  });
  const db = {
    orm,
    transaction: async <T>(fn: (tx: { orm: typeof orm } & Partial<ReturnType<typeof rawFor>>) => Promise<T>) => {
      const state: TxState = { owned: new Set(), releases: [], undo: [] };
      try {
        return await currentTx.run(state, () => fn({ orm: ormFor(state), ...rawFor(state) }));
      } catch (err) {
        // Roll back: undo the transaction's writes, newest first.
        for (const undo of state.undo.reverse()) undo();
        throw err;
      } finally {
        for (const release of state.releases) release();
      }
    },
  };
  return { db, tables, table, reset, locks, setUniqueKeys, setRelations, globalCallsUnderLock, statements, setLockTimeoutMs };
}

/**
 * One fake shared by a test file and its "@/prisma/db" mock:
 *   vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
 */
export const sharedFake = createFakeDb();
