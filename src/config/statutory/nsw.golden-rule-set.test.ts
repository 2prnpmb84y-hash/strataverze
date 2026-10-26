/**
 * NSW golden tests for how a building's meeting rules are chosen (phase 0,
 * 26 Oct 2026). Live meetings read `getActiveRuleSet(scheme.state)`, which
 * uses an active `meeting_rule_sets` row if there is one and otherwise the
 * NSW rules. Phase 1 must keep both results for an NSW building.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const first = vi.fn();
vi.mock("@/prisma/db", () => {
  const chain = { where: () => chain, orderBy: () => chain, first: () => first() };
  return { db: { orm: { public: { MeetingRuleSet: chain } } } };
});
vi.mock("@prisma/orm-postgres/orm-client", () => ({ and: (...c: unknown[]) => c }));

import { getActiveRuleSet } from "@/lib/meetings/rule-set-repo";
import { MEETING_RULES as NSW_RULE_SET } from "@/config/statutory";

describe("NSW meeting rules for a building", () => {
  beforeEach(() => first.mockReset());

  it("are the NSW rules when no rule set row is stored", async () => {
    first.mockResolvedValue(null);
    expect(await getActiveRuleSet("NSW")).toEqual(NSW_RULE_SET);
  });

  it("come from the stored row when there is one", async () => {
    first.mockResolvedValue({
      state: "NSW",
      version: "NSW-2026.1",
      effectiveFrom: "2026-07-01T00:00:00.000Z",
      noticePeriods: { AGM: 14, EGM: 7, COMMITTEE: 3, FIRST_AGM: 14 },
      minutesDeadlines: { AGM: 7, EGM: 7, COMMITTEE: 7, FIRST_AGM: 7 },
      quorumRules: NSW_RULE_SET.quorumRules,
      resolutionCategories: NSW_RULE_SET.resolutionCategories,
      retention: NSW_RULE_SET.retention,
      preMeetingEvoting: null,
      notes: null,
    });
    expect(await getActiveRuleSet("NSW")).toMatchSnapshot();
  });
});
