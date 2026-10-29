/**
 * The debtor rule under a draft pack applies only to some buildings (VIC, ACT
 * and WA stage 2, PR 8a-ii, 29 Oct 2026): the ACT's with 3 or more members
 * (sch 3 s 3.20(3)), and Victoria's tiers 1 to 4 (a tier 5 owners
 * corporation is exempt from s 89B, s 7A). Where the building's band or tier
 * cannot be worked out, the rule applies (it fails closed). Checked on an
 * owner's own vote online (debtorVoteCheck); the packs are given here as if
 * live, since they have no buildings yet. NSW and Queensland read no
 * building selector.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const reads = vi.hoisted(() => [] as string[]);

vi.mock("@/config/statutory", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/config/statutory")>();
  return {
    ...actual,
    rulePackFor: (state: string) => {
      const key = (state ?? "").trim().toUpperCase();
      if (key === "QLD") return actual.QLD_RULE_PACK;
      if (key === "VIC" || key === "ACT" || key === "WA") return actual.PENDING_RULE_PACKS[key];
      return actual.rulePackFor(state);
    },
  };
});
vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => {
  const { sharedFake } = await import("@/test/fake-orm");
  const { db } = sharedFake;
  const logged = new Proxy(db.orm.public, { get: (t, k) => (reads.push(String(k)), Reflect.get(t, k)) });
  return { db: { ...db, orm: { ...db.orm, public: logged } } };
});

const { sharedFake } = await import("@/test/fake-orm");
const { PENDING_RULE_PACKS } = await import("@/config/statutory");
const { debtorRuleApplies, debtorBarsLot } = await import("./debtor-voting");
const { debtorVoteCheck } = await import("./debtor-voting-repo");

const overdue = (lotId: string) => ({ id: `n-${lotId}`, schemeId: "s1", lotId, status: "ISSUED", dueDate: "2020-01-01", balanceOutstanding: "120.00", amountDue: "120.00", amountPaid: "0" });
const lotRows = (n: number, occupiable: boolean | null = true) =>
  Array.from({ length: n }, (_, i) => ({ id: `lot-${i + 1}`, schemeId: "s1", lotNumber: String(i + 1), lotType: "RESIDENTIAL", occupiable, entitlement: 10 }));

function building(state: string, opts: { lots?: number; occupiable?: boolean | null; servicesOnly?: boolean | null; selectors?: Record<string, string> } = {}) {
  const n = opts.lots ?? 8;
  sharedFake.reset({
    Scheme: [{ id: "s1", state, timeZone: "Australia/Melbourne", totalLots: n, servicesOnly: opts.servicesOnly === undefined ? false : opts.servicesOnly }],
    Lot: lotRows(n, opts.occupiable === undefined ? true : opts.occupiable),
    SchemeSelectorValue: Object.entries(opts.selectors ?? {}).map(([key, value], i) => ({ id: `sv-${i}`, schemeId: "s1", key, value })),
    LevyNotice: [overdue("lot-2")],
  });
  reads.length = 0;
}

const check = (category: string) => debtorVoteCheck({ schemeId: "s1", lotIds: ["lot-1", "lot-2"], category, meetingAt: "2026-11-20T09:00:00.000Z" });

beforeEach(() => {
  reads.length = 0;
});

describe("debtorRuleApplies (pure)", () => {
  it("applies the rule to every building under a pack with no condition, and where the condition holds or cannot be worked out", () => {
    const act = PENDING_RULE_PACKS.ACT.rules.MEETING_RULES;
    expect(debtorRuleApplies({}, false)).toBe(true);
    expect(debtorRuleApplies({}, null)).toBe(true);
    expect(debtorRuleApplies(act, true)).toBe(true);
    expect(debtorRuleApplies(act, null)).toBe(true);
    expect(debtorRuleApplies(act, false)).toBe(false);
  });

  it("never bars a lot where the rule does not apply", () => {
    const act = PENDING_RULE_PACKS.ACT.rules.MEETING_RULES;
    const owing = new Set(["lot-2"]);
    expect(debtorBarsLot(act, "ORDINARY", "lot-2", owing)).toBe(true);
    expect(debtorBarsLot(act, "ORDINARY", "lot-2", owing, true)).toBe(true);
    expect(debtorBarsLot(act, "ORDINARY", "lot-2", owing, false)).toBe(false);
    expect(debtorBarsLot(act, "UNANIMOUS", "lot-2", owing, true)).toBe(false);
  });
});

describe("an ACT owner's own vote on a motion (sch 3 s 3.20(3))", () => {
  it("is barred for the unit owing money with 3 or more members, on an ordinary or special resolution", async () => {
    for (const memberBand of ["THREE", "FOUR_OR_MORE"]) {
      for (const c of ["ORDINARY", "SPECIAL"]) {
        building("ACT", { selectors: { memberBand } });
        const r = await check(c);
        expect(r, `${memberBand} ${c}`).toMatchObject({ checksDebts: true, mayVote: ["lot-1"], refusal: null });
      }
    }
  });

  it("is not barred with 1 or 2 members", async () => {
    building("ACT", { selectors: { memberBand: "ONE_OR_TWO" } });
    expect(await check("ORDINARY")).toEqual({ checksDebts: false, mayVote: ["lot-1", "lot-2"], refusal: null });
    expect(reads).toContain("SchemeSelectorValue");
  });

  it("is barred where no number of members is recorded (it fails closed)", async () => {
    building("ACT");
    expect(await check("SPECIAL")).toMatchObject({ checksDebts: true, mayVote: ["lot-1"] });
  });

  it("reads no building selector on a category a debtor may vote on", async () => {
    building("ACT", { selectors: { memberBand: "FOUR_OR_MORE" } });
    expect(await check("UNANIMOUS")).toEqual({ checksDebts: true, mayVote: ["lot-1", "lot-2"], refusal: null });
    expect(reads).not.toContain("SchemeSelectorValue");
    expect(reads).not.toContain("LevyNotice");
  });
});

describe("a Victorian owner's own vote on a motion (s 89B, s 7A)", () => {
  it("is barred in arrears on an ordinary resolution in tiers 1 to 4", async () => {
    building("VIC", { selectors: { severalOwnersCorporations: "NO" } });
    expect(await check("ORDINARY")).toMatchObject({ checksDebts: true, mayVote: ["lot-1"] });
  });

  it("is not barred in a tier 5 owners corporation: services only, or a 2-lot subdivision", async () => {
    building("VIC", { servicesOnly: true, selectors: { severalOwnersCorporations: "NO" } });
    expect(await check("ORDINARY")).toEqual({ checksDebts: false, mayVote: ["lot-1", "lot-2"], refusal: null });
    building("VIC", { lots: 2, selectors: { severalOwnersCorporations: "NO" } });
    expect(await check("ORDINARY")).toEqual({ checksDebts: false, mayVote: ["lot-1", "lot-2"], refusal: null });
  });

  it("is barred where the tier cannot be worked out (it fails closed)", async () => {
    building("VIC");
    expect(await check("ORDINARY")).toMatchObject({ checksDebts: true, mayVote: ["lot-1"] });
    building("VIC", { occupiable: null, selectors: { severalOwnersCorporations: "NO" } });
    expect(await check("ORDINARY")).toMatchObject({ checksDebts: true, mayVote: ["lot-1"] });
  });

  it("is never barred on a special or unanimous resolution", async () => {
    building("VIC", { selectors: { severalOwnersCorporations: "NO" } });
    for (const c of ["SPECIAL", "UNANIMOUS"]) expect(await check(c)).toEqual({ checksDebts: true, mayVote: ["lot-1", "lot-2"], refusal: null });
  });
});

describe("NSW, Queensland and Western Australia", () => {
  it("read no building selector", async () => {
    for (const state of ["NSW", "QLD", "WA"]) {
      building(state);
      await check("ORDINARY");
      expect(reads, state).not.toContain("SchemeSelectorValue");
      expect(reads, state).not.toContain("Lot");
    }
  });

  it("bar a Queensland or Western Australian debtor on an ordinary resolution as before", async () => {
    for (const state of ["QLD", "WA"]) {
      building(state);
      expect(await check("ORDINARY"), state).toMatchObject({ checksDebts: true, mayVote: ["lot-1"] });
    }
  });
});
