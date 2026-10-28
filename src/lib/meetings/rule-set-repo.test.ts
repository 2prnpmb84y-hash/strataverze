import { beforeEach, describe, expect, it, vi } from "vitest";

const first = vi.fn();
const where = vi.fn();
vi.mock("@/prisma/db", () => {
  const chain: Record<string, unknown> = {};
  chain.where = (fn: unknown) => {
    where(fn);
    return chain;
  };
  chain.orderBy = () => chain;
  chain.first = () => first();
  return { db: { orm: { public: { MeetingRuleSet: chain } } } };
});
vi.mock("@prisma/orm-postgres/orm-client", () => ({ and: (...c: unknown[]) => c }));

import { getActiveRuleSet } from "./rule-set-repo";
import { MEETING_RULES as NSW_RULE_SET } from "@/config/statutory";
import { QLD_RULE_PACK, UnsupportedJurisdictionError } from "@/config/statutory";

describe("choosing a building's meeting rules", () => {
  beforeEach(() => {
    first.mockReset();
    where.mockReset();
  });

  it("refuses a state without a rule pack instead of borrowing the NSW rules", async () => {
    for (const s of ["VIC", "WA", "NZ", ""]) {
      await expect(getActiveRuleSet(s)).rejects.toBeInstanceOf(UnsupportedJurisdictionError);
    }
    expect(first).not.toHaveBeenCalled();
  });

  it("gives a Queensland building the Queensland rules from its live pack when no row is stored (switched on 28 Oct 2026)", async () => {
    first.mockResolvedValue(null);
    const qld = await getActiveRuleSet("QLD");
    expect(qld).toBe(QLD_RULE_PACK.rules.MEETING_RULES);
    expect(qld).not.toBe(NSW_RULE_SET);
  });

  it("treats a lower case state as the same jurisdiction", async () => {
    first.mockResolvedValue(null);
    expect(await getActiveRuleSet("nsw")).toBe(NSW_RULE_SET);
    expect(await getActiveRuleSet(" NSW ")).toBe(NSW_RULE_SET);
  });

  it("looks up stored rows by the pack's state", async () => {
    first.mockResolvedValue(null);
    await getActiveRuleSet("nsw");
    const fn = where.mock.calls[0][0] as (r: unknown) => unknown;
    const seen: string[] = [];
    const r = { state: { eq: (v: string) => seen.push(v) }, isActive: { eq: () => null } };
    fn(r);
    expect(seen).toEqual(["NSW"]);
  });
});
