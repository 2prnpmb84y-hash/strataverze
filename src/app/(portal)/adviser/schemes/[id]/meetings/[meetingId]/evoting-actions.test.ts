import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Opening a pre-meeting ballot is refused, before anything is written, where
 * the building's rule set has no pre-meeting e-voting (Queensland, stage 2,
 * step 7). NSW opens as before. Closing a ballot never writes an item decided
 * later (stored INTERIM or OPEN; VIC, ACT and WA stage 2, PR 8b-i review).
 */
const ruleSet = vi.hoisted(() => ({ current: null as unknown }));
const createBallot = vi.fn(async () => ({ id: "b1" }));
const transaction = vi.fn(async (fn: (tx: { orm: unknown }) => unknown) => fn({ orm: {} }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-access", () => ({ requireSchemeAccess: vi.fn(async () => ({ profile: { id: "adviser" } })) }));
vi.mock("@/lib/queries/meetings", () => ({
  getMeetingById: vi.fn(async () => ({ id: "m1", schemeId: "s1", status: "NOTICE_ISSUED", meetingType: "AGM", startTime: "2026-12-01T07:00:00.000Z" })),
}));
vi.mock("@/lib/queries/schemes", () => ({ getSchemeById: vi.fn(async () => ({ id: "s1", state: "NSW", preMeetingEvotingAdopted: true })) }));
const agenda = vi.hoisted(() => ({ items: [] as unknown[], votes: [] as unknown[], ballot: null as unknown }));
const updateAgendaItem = vi.fn();
const closeBallot = vi.fn();
vi.mock("@/lib/queries/agenda", () => ({
  getAgendaItemsForMeeting: vi.fn(async () => agenda.items),
  updateAgendaItem: (...a: unknown[]) => updateAgendaItem(...a),
}));
vi.mock("@/lib/queries/evoting", () => ({
  createBallot: (...a: unknown[]) => createBallot(...(a as [])),
  getBallotForMeeting: vi.fn(async () => agenda.ballot),
  closeBallot: (...a: unknown[]) => closeBallot(...a),
  getVotesForBallot: vi.fn(async () => agenda.votes),
}));
vi.mock("@/lib/meetings/rule-set-repo", () => ({ getActiveRuleSet: vi.fn(async () => ruleSet.current) }));
vi.mock("@/lib/meetings/events", () => ({ recordMeetingEvent: vi.fn() }));
vi.mock("@/lib/billing/capture", () => ({ captureUsageFee: vi.fn() }));
vi.mock("@/lib/billing/disclosure", () => ({ feeErrorMessage: () => null }));
vi.mock("@/prisma/db", () => ({ db: { transaction: (fn: (tx: { orm: unknown }) => unknown) => transaction(fn) } }));

const { MEETING_RULES: NSW_RULE_SET, QLD_RULE_PACK } = await import("@/config/statutory");
const { closeBallotAction, openBallotAction } = await import("./evoting-actions");

beforeEach(() => {
  vi.clearAllMocks();
  agenda.items = [];
  agenda.votes = [];
  agenda.ballot = null;
});

describe("openBallotAction", () => {
  it("opens a ballot under the NSW rules", async () => {
    ruleSet.current = NSW_RULE_SET;
    expect(await openBallotAction("s1", "m1")).toEqual({ ok: true });
    expect(createBallot).toHaveBeenCalled();
  });

  it("refuses with a plain message, and writes nothing, where the rule set has no pre-meeting e-voting", async () => {
    ruleSet.current = QLD_RULE_PACK.rules.MEETING_RULES;
    const r = await openBallotAction("s1", "m1");
    expect(r.error).toMatch(/^Pre-meeting electronic voting is not offered for buildings in /);
    expect(transaction).not.toHaveBeenCalled();
    expect(createBallot).not.toHaveBeenCalled();
  });
});

describe("closeBallotAction", () => {
  it("never writes an item decided later (stored INTERIM or OPEN), and writes the others as before", async () => {
    ruleSet.current = NSW_RULE_SET;
    agenda.ballot = { id: "b1", status: "OPEN" };
    agenda.items = [
      { id: "i1", resolutionCategory: "ORDINARY", status: "INTERIM" },
      { id: "i2", resolutionCategory: "ORDINARY", status: "OPEN" },
      { id: "i3", resolutionCategory: "ORDINARY", status: "PENDING" },
    ];
    agenda.votes = ["i1", "i2", "i3"].map((agendaItemId) => ({ agendaItemId, voteValue: "FOR", unitEntitlement: 10, isInformal: false }));
    expect(await closeBallotAction("s1", "m1")).toEqual({ ok: true });
    expect(updateAgendaItem).toHaveBeenCalledTimes(1);
    expect(updateAgendaItem).toHaveBeenCalledWith("m1", "i3", { outcome: "RESOLVED", status: "CARRIED" });
    expect(closeBallot).toHaveBeenCalledWith("b1");
  });
});
