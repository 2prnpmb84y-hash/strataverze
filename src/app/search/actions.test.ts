import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * globalSearch scope per role (finding F11). The action is called directly
 * with a client-chosen portal; the where clauses it builds are evaluated
 * against a fake column builder so the test can see exactly what was asked.
 */

const SCHEME_A = "aaaaaaaa-0000-0000-0000-000000000001";
const SCHEME_B = "bbbbbbbb-0000-0000-0000-000000000002";

type Cond = Record<string, unknown>;
const columns = new Proxy(
  {},
  {
    get: (_t, col: string) => ({
      eq: (v: unknown) => ({ col, op: "eq", v }),
      in: (v: unknown) => ({ col, op: "in", v }),
      ilike: (v: unknown) => ({ col, op: "ilike", v }),
    }),
  },
);

const currentProfile = vi.fn();
vi.mock("@/lib/queries/profiles", () => ({ getCurrentProfile: () => currentProfile() }));

const memberships = vi.fn();
const queried: Record<string, Cond[]> = {};
const rows: Record<string, unknown[]> = {};

function model(name: string) {
  const chain = {
    include: () => chain,
    limit: () => chain,
    all: async () => (name === "SchemeMembership" ? memberships() : (rows[name] ?? [])),
  };
  return {
    where: (fn: (c: unknown) => Cond) => {
      (queried[name] ??= []).push(fn(columns));
      return chain;
    },
  };
}

vi.mock("@/prisma/db", () => ({
  db: {
    orm: {
      public: {
        SchemeMembership: model("SchemeMembership"),
        Scheme: model("Scheme"),
        Lot: model("Lot"),
        Document: model("Document"),
        WorkOrder: model("WorkOrder"),
        Contact: model("Contact"),
      },
    },
  },
}));
vi.mock("@prisma/orm-postgres/orm-client", () => ({
  and: (...c: unknown[]) => ({ and: c }),
  or: (...c: unknown[]) => ({ or: c }),
}));

const { globalSearch } = await import("./actions");

function flat(cond: unknown): Cond[] {
  if (!cond || typeof cond !== "object") return [];
  const c = cond as Cond;
  if (Array.isArray(c.and)) return (c.and as unknown[]).flatMap(flat);
  if (Array.isArray(c.or)) return (c.or as unknown[]).flatMap(flat);
  return [c];
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(queried)) delete queried[k];
  for (const k of Object.keys(rows)) delete rows[k];
  currentProfile.mockResolvedValue({ id: "me" });
});

describe("globalSearch", () => {
  it("gives a supplier only work orders awarded to them, whatever portal they claim", async () => {
    memberships.mockResolvedValue([{ schemeId: SCHEME_A, role: "SUPPLIER", isActive: true }]);
    rows.WorkOrder = [{ id: "wo-1", schemeId: SCHEME_A, title: "Fix pump", status: "AWARDED", scheme: { name: "A" } }];

    for (const portal of ["supplier", "owner", "adviser"]) {
      for (const k of Object.keys(queried)) delete queried[k];
      const results = await globalSearch("pump", portal);

      expect(queried.Document).toBeUndefined();
      expect(queried.Contact).toBeUndefined();
      expect(queried.Lot).toBeUndefined();
      expect(queried.Scheme).toBeUndefined();

      if (portal === "supplier") {
        const conds = flat(queried.WorkOrder?.[0]);
        expect(conds).toContainEqual({ col: "supplierId", op: "eq", v: "me" });
        expect(conds).toContainEqual({ col: "schemeId", op: "in", v: [SCHEME_A] });
        expect(conds.some((c) => c.col === "schemeId" && c.op === "in" && (c.v as string[]).length !== 1)).toBe(false);
        expect(results).toEqual([
          expect.objectContaining({ type: "work-order", id: "wo-1", href: "/supplier/work-orders/wo-1" }),
        ]);
      } else {
        // Claiming another portal narrows to nothing; it never widens.
        expect(queried.WorkOrder).toBeUndefined();
        expect(results).toEqual([]);
      }
    }
  });

  it("gives an owner their own work orders and no contacts", async () => {
    memberships.mockResolvedValue([{ schemeId: SCHEME_A, role: "OWNER", isActive: true }]);
    await globalSearch("leak", "owner");
    expect(queried.Contact).toBeUndefined();
    expect(flat(queried.Document?.[0])).toContainEqual({ col: "schemeId", op: "in", v: [SCHEME_A] });
    const wo = flat(queried.WorkOrder?.[0]);
    expect(wo).toContainEqual({ col: "raisedById", op: "eq", v: "me" });
    expect(wo.some((c) => c.col === "supplierId")).toBe(false);
  });

  it("gives the committee the scheme's work orders and contacts, only on their committee scheme", async () => {
    memberships.mockResolvedValue([
      { schemeId: SCHEME_A, role: "COMMITTEE", isActive: true },
      { schemeId: SCHEME_B, role: "OWNER", isActive: true },
    ]);
    await globalSearch("roof", "owner");
    expect(flat(queried.Contact?.[0])).toContainEqual({ col: "schemeId", op: "in", v: [SCHEME_A] });
    const wo = flat(queried.WorkOrder?.[0]);
    expect(wo).toContainEqual({ col: "schemeId", op: "in", v: [SCHEME_A] });
    expect(wo).toContainEqual({ col: "schemeId", op: "in", v: [SCHEME_B] });
    expect(wo).toContainEqual({ col: "raisedById", op: "eq", v: "me" });
  });

  it("keeps the minimum length and escapes wildcards", async () => {
    memberships.mockResolvedValue([{ schemeId: SCHEME_A, role: "ADVISER", isActive: true }]);
    expect(await globalSearch("a", "adviser")).toEqual([]);
    expect(queried.SchemeMembership).toBeUndefined();
    await globalSearch("50%_off", "adviser");
    expect(flat(queried.Document?.[0])).toContainEqual({ col: "title", op: "ilike", v: "%50\\%\\_off%" });
  });

  it("returns nothing when signed out", async () => {
    currentProfile.mockResolvedValue(null);
    expect(await globalSearch("pump", "owner")).toEqual([]);
  });
});
