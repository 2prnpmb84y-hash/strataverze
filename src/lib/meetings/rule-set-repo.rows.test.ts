/**
 * Stored rule set rows are read tolerantly (stage 2, step 7): a row written
 * before the labels, category lists and committee refusal existed takes them
 * from the pack, and a pack without pre-meeting e-voting never gains it from
 * a row. Nothing is written.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const first = vi.fn();
vi.mock("@/prisma/db", () => {
  const chain = { where: () => chain, orderBy: () => chain, first: () => first() };
  return { db: { orm: { public: { MeetingRuleSet: chain } } } };
});
vi.mock("@prisma/orm-postgres/orm-client", () => ({ and: (...c: unknown[]) => c }));
vi.mock("@/config/statutory", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/config/statutory")>();
  return {
    ...actual,
    rulePackFor: (state: string) =>
      (state ?? "").trim().toUpperCase() === "QLD" ? actual.PENDING_RULE_PACKS.QLD : actual.rulePackFor(state),
  };
});

import { getActiveRuleSet } from "./rule-set-repo";
import { MEETING_RULES as NSW_RULE_SET, PENDING_RULE_PACKS } from "@/config/statutory";

const QLD = PENDING_RULE_PACKS.QLD.rules.MEETING_RULES;

/** A row as stored before stage 2, step 7. */
const olderRow = (state: string, seed: typeof NSW_RULE_SET) => ({
  state,
  version: `${state}-2026.1`,
  effectiveFrom: "2026-07-01T00:00:00.000Z",
  noticePeriods: seed.noticePeriods,
  minutesDeadlines: seed.minutesDeadlines,
  quorumRules: seed.quorumRules,
  resolutionCategories: seed.resolutionCategories,
  retention: seed.retention,
  preMeetingEvoting: { ballotOpenDaysBefore: 7, ballotCloseHoursBefore: { AGM: 24 } },
  notes: null,
});

describe("stored rule set rows", () => {
  beforeEach(() => first.mockReset());

  it("give an older NSW row the pack's labels and lists, and keep its own values", async () => {
    first.mockResolvedValue({ ...olderRow("NSW", NSW_RULE_SET), preMeetingEvoting: null });
    const rs = await getActiveRuleSet("NSW");
    expect(rs.resolutionLabels).toBe(NSW_RULE_SET.resolutionLabels);
    expect(rs.generalMeetingCategories).toBe(NSW_RULE_SET.generalMeetingCategories);
    expect(rs.committeeCategories).toEqual(["ORDINARY"]);
    expect(rs.motionCategories).toBe(NSW_RULE_SET.motionCategories);
    expect(rs.committeeCategoryRefusal).toBe(NSW_RULE_SET.committeeCategoryRefusal);
    expect(rs.preMeetingEvoting).toEqual(NSW_RULE_SET.preMeetingEvoting);
    expect(rs.version).toBe("NSW-2026.1");
    expect("debtorsMayVoteOn" in rs).toBe(false);
    expect("pollCategories" in rs).toBe(false);
    expect("proxiesBarredOn" in rs).toBe(false);
  });

  it("never offer pre-meeting e-voting for a pack without it, and keep the pack's debtor rule", async () => {
    first.mockResolvedValue(olderRow("QLD", QLD));
    const rs = await getActiveRuleSet("QLD");
    expect(rs.preMeetingEvoting).toBeNull();
    expect(rs.retention).toEqual({ generalYears: null, secretBallotMonths: null });
    expect(rs.debtorsMayVoteOn).toEqual(["WITHOUT_DISSENT"]);
    // The poll and proxy categories at conduct come from the pack too (resolution tallies).
    expect(rs.pollCategories).toEqual(["ORDINARY"]);
    expect(rs.proxiesBarredOn).toEqual(["MAJORITY"]);
    expect(rs.generalMeetingCategories).toEqual(QLD.generalMeetingCategories);
  });

  it("fall back to the pack's retention when a row has none", async () => {
    first.mockResolvedValue({ ...olderRow("NSW", NSW_RULE_SET), retention: null });
    expect((await getActiveRuleSet("NSW")).retention).toEqual(NSW_RULE_SET.retention);
  });

  it("use the pack's rule set when no row is stored", async () => {
    first.mockResolvedValue(null);
    expect(await getActiveRuleSet("QLD")).toBe(QLD);
  });
});
