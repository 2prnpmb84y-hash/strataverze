/**
 * NSW and Queensland proxies, golden (VIC, ACT and WA stage 2, PR 8b-iv,
 * 29 Oct 2026). Recorded on origin/main (d32c6bb) in a temporary worktree,
 * before the proxy caps (warn only) were added for the draft packs. NSW and
 * Queensland must give exactly the same results, rows, calls and database
 * reads and writes after that change. Never regenerate these snapshots to
 * make a change pass: a difference is a change to NSW or Queensland.
 *
 * Covered: createProxyAction and revokeProxyAction for an NSW and a
 * Queensland lot (what each returns, the createProxy row written, the
 * revalidated path, the security events and every database read and write),
 * with every field given, only the name, no name, a meeting date, a lot of
 * another building, no permission and a failing write.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const access = vi.hoisted(() => [] as string[]);
const calls = vi.hoisted(() => [] as Array<[string, unknown]>);
const control = vi.hoisted(() => ({ authFails: false, writeFails: false }));

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => {
  const { sharedFake } = await import("@/test/fake-orm");
  /** Log each call on a collection; a call that returns a promise is a terminal read or write. */
  const chain = (target: object, label: string): unknown =>
    new Proxy(target, {
      get(t, k) {
        const v = (t as Record<string | symbol, unknown>)[k];
        if (typeof v !== "function") return v;
        return (...args: unknown[]) => {
          const shown = args.map((a) => (typeof a === "function" ? "fn" : JSON.stringify(a))).join(",");
          const name = `${label}.${String(k)}(${shown})`;
          if (control.writeFails && (k === "create" || k === "update")) {
            access.push(`${name} FAILED`);
            return Promise.reject(new Error("write failed"));
          }
          const r = (v as (...a: unknown[]) => unknown).apply(t, args);
          if (r && typeof (r as Promise<unknown>).then === "function") {
            access.push(name);
            return r;
          }
          return r && typeof r === "object" ? chain(r, name) : r;
        };
      },
    });
  const wrap = (orm: { public: object }, prefix: string) => ({
    public: new Proxy({}, { get: (_t, model: string) => chain((orm.public as Record<string, object>)[model], `${prefix}${model}`) }),
  });
  const db = {
    orm: wrap(sharedFake.db.orm, ""),
    transaction: (fn: (tx: { orm: unknown }) => Promise<unknown>) => {
      access.push("transaction");
      return sharedFake.db.transaction((tx) => fn({ ...tx, orm: wrap(tx.orm, "tx.") }));
    },
  };
  return { db };
});
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => calls.push(["revalidatePath", p]) }));
vi.mock("@/lib/auth/require-access", async () => {
  const { AuthorisationError } = await import("@/lib/auth/require-membership");
  return {
    requireSchemeAccess: vi.fn(async (schemeId: string, capability: string) => {
      calls.push(["requireSchemeAccess", [schemeId, capability]]);
      if (control.authFails) throw new AuthorisationError("You do not have permission to do this.");
      return { profile: { id: "adviser" }, membership: { role: "ADVISER" }, roles: ["ADVISER"] };
    }),
  };
});
vi.mock("@/lib/audit/security-audit", () => ({
  recordSecurityEventLater: vi.fn(async (e: unknown) => calls.push(["recordSecurityEventLater", e])),
  recordActionInvocation: vi.fn(async (e: unknown) => calls.push(["recordActionInvocation", e])),
}));

const { sharedFake } = await import("@/test/fake-orm");
const { createProxyAction, revokeProxyAction } = await import("./lot-workflow-actions");

const ZONES = { NSW: "Australia/Sydney", QLD: "Australia/Brisbane" } as const;

function seed(state: "NSW" | "QLD") {
  sharedFake.reset({
    Scheme: [
      { id: "s1", name: "Golden Towers", planNumber: "SP 1", state, timeZone: ZONES[state], totalLots: 3 },
      { id: "s2", name: "Other Towers", planNumber: "SP 2", state, timeZone: ZONES[state], totalLots: 1 },
    ],
    Lot: [
      { id: "l1", schemeId: "s1", lotNumber: "1", lotType: "RESIDENTIAL", entitlement: 10 },
      { id: "l2", schemeId: "s1", lotNumber: "2", lotType: "RESIDENTIAL", entitlement: 10 },
      { id: "l3", schemeId: "s1", lotNumber: "CP", lotType: "COMMON", entitlement: 0 },
      { id: "x1", schemeId: "s2", lotNumber: "1", lotType: "RESIDENTIAL", entitlement: 10 },
    ],
    SchemeMembership: [
      { id: "m1", schemeId: "s1", lotId: "l1", profileId: "p1", role: "OWNER", isActive: true, profile: { email: "holder@example.com" } },
      { id: "m2", schemeId: "s1", lotId: "l2", profileId: "p2", role: "OWNER", isActive: true, profile: { email: "two@example.com" } },
    ],
    LevyNotice: [
      { id: "n1", schemeId: "s1", lotId: "l1", status: "ISSUED", dueDate: "2026-09-01", totalAmount: "100.00", amountPaid: "0.00" },
    ],
    LotProxy: [
      { id: "px1", lotId: "l2", proxyName: "Pat Holder", proxyEmail: "holder@example.com", meetingDate: "2026-11-20", isActive: true },
      { id: "px2", lotId: "x1", proxyName: "Pat Holder", proxyEmail: "holder@example.com", meetingDate: "2026-11-20", isActive: true },
    ],
  });
}

function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

/** Fake ids are numbered across the whole run: shown in the order they appear. */
function normalise(value: unknown): unknown {
  const seen = new Map<string, string>();
  return JSON.parse(
    JSON.stringify(value ?? null).replace(/fake-[A-Za-z]+-\d+/g, (id) => {
      if (!seen.has(id)) seen.set(id, `<id ${seen.size + 1}>`);
      return seen.get(id)!;
    }),
  );
}

async function run(state: "NSW" | "QLD", fn: () => Promise<unknown>) {
  seed(state);
  access.length = 0;
  calls.length = 0;
  const result = await fn();
  return normalise({
    result,
    proxies: sharedFake.table("LotProxy"),
    calls: [...calls],
    access: [...access],
  });
}

const FULL = {
  proxyName: "Pat Holder",
  proxyEmail: "holder@example.com",
  proxyPhone: "0400 000 000",
  meetingDate: "2026-11-20",
  meetingTitle: "Annual general meeting",
  notes: "For the AGM only",
};

beforeEach(() => {
  control.authFails = false;
  control.writeFails = false;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-02T01:00:00.000Z"));
});

describe("createProxyAction (golden)", () => {
  for (const state of ["NSW", "QLD"] as const) {
    it(`${state}: returns, writes and reads as before`, async () => {
      const out: Record<string, unknown> = {};
      out.full = await run(state, () => createProxyAction("s1", "l1", form(FULL)));
      out.nameOnly = await run(state, () => createProxyAction("s1", "l1", form({ proxyName: "Sam Other" })));
      out.noName = await run(state, () => createProxyAction("s1", "l1", form({})));
      out.meetingDateOnly = await run(state, () =>
        createProxyAction("s1", "l1", form({ proxyName: "Pat Holder", meetingDate: "2026-11-20" })),
      );
      out.emailMixedCase = await run(state, () =>
        createProxyAction("s1", "l1", form({ proxyName: "Pat Holder", proxyEmail: " Holder@Example.com ", meetingDate: "2026-11-20" })),
      );
      out.ownerInArrearsAsHolder = await run(state, () =>
        createProxyAction("s1", "l2", form({ proxyName: "Lot 1 Owner", proxyEmail: "holder@example.com", meetingDate: "2026-11-20" })),
      );
      out.commonProperty = await run(state, () => createProxyAction("s1", "l3", form(FULL)));
      out.otherBuildingsLot = await run(state, () => createProxyAction("s1", "x1", form(FULL)));
      out.noLot = await run(state, () => createProxyAction("s1", "nope", form(FULL)));
      control.authFails = true;
      out.noPermission = await run(state, () => createProxyAction("s1", "l1", form(FULL)));
      control.authFails = false;
      control.writeFails = true;
      out.writeFails = await run(state, () => createProxyAction("s1", "l1", form(FULL)));
      expect(out).toMatchSnapshot();
    });
  }
});

describe("revokeProxyAction (golden)", () => {
  for (const state of ["NSW", "QLD"] as const) {
    it(`${state}: returns, writes and reads as before`, async () => {
      const out: Record<string, unknown> = {};
      out.revoked = await run(state, () => revokeProxyAction("s1", "l2", "px1"));
      out.anotherLotsProxy = await run(state, () => revokeProxyAction("s1", "l1", "px1"));
      out.otherBuildingsLot = await run(state, () => revokeProxyAction("s1", "x1", "px2"));
      out.noProxy = await run(state, () => revokeProxyAction("s1", "l2", "nope"));
      control.authFails = true;
      out.noPermission = await run(state, () => revokeProxyAction("s1", "l2", "px1"));
      control.authFails = false;
      control.writeFails = true;
      out.writeFails = await run(state, () => revokeProxyAction("s1", "l2", "px1"));
      expect(out).toMatchSnapshot();
    });
  }
});
