/**
 * Recording an outcome at a general meeting under the draft Victorian, ACT
 * and WA meeting rules (VIC, ACT and WA stage 2, PR 8a-i, 28 Oct 2026). Those
 * states have no buildings yet, so each pack is given here as if it were
 * live. Whatever the count cannot record (a voting period still open, an
 * interim resolution, a quorum not recorded, a band of members missing) is
 * refused with its reason, and nothing is written. The band of members is
 * read only for the ACT. Closing a ballot skips an item the count cannot
 * decide.
 *
 * Since stage 2, PR 8a-ii (29 Oct 2026): the chair's quorum answer (and for
 * the ACT's special resolution the units present) is read where the item's
 * test needs it, refused when unanswered or unreadable, and kept in the
 * event; a Victorian building of tier 5, or whose tier cannot be worked out,
 * is refused before its votes are read; the ACT's debtor rule applies with 3
 * or more members; a Western Australian 2-lot scheme needs both lots counted.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  scheme: null as unknown,
  item: null as unknown,
  meeting: null as unknown,
  items: [] as unknown[],
  ballotVotes: [] as unknown[],
  /** Totals added to the ballot's tally, so only the rule (not a missing total) can stop the count. */
  ballotTotals: null as Record<string, number> | null,
}));
const updateAgendaItem = vi.fn(async () => ({}));
const recordMeetingEvent = vi.fn(async () => ({}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-access", () => ({ requireSchemeAccess: vi.fn(async () => ({ profile: { id: "adviser" } })) }));
vi.mock("@/lib/queries/meetings", () => ({ getMeetingById: vi.fn(async () => state.meeting), updateMeeting: vi.fn() }));
vi.mock("@/lib/queries/schemes", () => ({ getSchemeById: vi.fn(async () => state.scheme) }));
vi.mock("@/lib/queries/agenda", () => ({
  getAgendaItem: vi.fn(async () => state.item),
  getAgendaItemsForMeeting: vi.fn(async () => state.items),
  updateAgendaItem: (...a: unknown[]) => updateAgendaItem(...(a as [])),
}));
vi.mock("@/lib/queries/evoting", () => ({
  createBallot: vi.fn(),
  getBallotForMeeting: vi.fn(async () => ({ id: "b1", meetingId: "m1", status: "OPEN" })),
  closeBallot: vi.fn(),
  getVotesForBallot: vi.fn(async () => state.ballotVotes),
}));
vi.mock("@/lib/meetings/evoting", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/meetings/evoting")>();
  return {
    ...actual,
    tallyElectronicVotes: (votes: Parameters<typeof actual.tallyElectronicVotes>[0]) => ({ ...actual.tallyElectronicVotes(votes), ...(state.ballotTotals ?? {}) }),
  };
});
vi.mock("@/lib/meetings/events", () => ({ recordMeetingEvent: (...a: unknown[]) => recordMeetingEvent(...(a as [])) }));
vi.mock("@/lib/billing/capture", () => ({ captureUsageFee: vi.fn() }));
vi.mock("@/lib/billing/disclosure", () => ({ feeErrorMessage: () => null }));
// The draft packs, given as if live (they have no buildings yet).
vi.mock("@/lib/meetings/rule-set-repo", async () => {
  const { PENDING_RULE_PACKS } = await import("@/config/statutory");
  return { getActiveRuleSet: vi.fn(async (s: "VIC" | "ACT" | "WA") => PENDING_RULE_PACKS[s].rules.MEETING_RULES) };
});
vi.mock("@/lib/jurisdiction/scheme-rules", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/jurisdiction/scheme-rules")>();
  const { PENDING_RULE_PACKS } = await import("@/config/statutory");
  return {
    ...actual,
    rulesForState: (s: string) => {
      const pack = PENDING_RULE_PACKS[s as "VIC" | "ACT" | "WA"];
      return pack ? { pack, rules: pack.rules, label: `${pack.code} ${pack.version}` } : actual.rulesForState(s);
    },
  };
});
vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));

const { sharedFake } = await import("@/test/fake-orm");
const { recordAgendaOutcomeAction } = await import("./conduct-actions");
const { closeBallotAction } = await import("./evoting-actions");

const lots = [
  ...Array.from({ length: 8 }, (_, i) => ({ id: `lot-${i + 1}`, schemeId: "s1", lotNumber: String(i + 1), entitlement: 10, lotEntitlement: 10, lotType: "RESIDENTIAL", occupiable: true })),
  { id: "cp", schemeId: "s1", lotNumber: "CP", entitlement: null, lotEntitlement: null, lotType: "COMMON", occupiable: null },
];
const scheme = (st: string) => ({ id: "s1", state: st, timeZone: "Australia/Melbourne", totalLots: 8, servicesOnly: false, lots });
/** A Victorian building of 8 occupiable lots, the only owners corporation on its plan: tier 4. */
const VIC_TIER_4 = { SchemeSelectorValue: [{ id: "oc", schemeId: "s1", key: "severalOwnersCorporations", value: "NO" }] };
const band = (value: string) => ({ SchemeSelectorValue: [{ id: "x", schemeId: "s1", key: "memberBand", value }] });
const YES = { quorumPresent: true };
const NO = { quorumPresent: false };
// Lot 2 has an issued notice long past its due date and unpaid.
const overdue = { id: "n1", schemeId: "s1", lotId: "lot-2", status: "ISSUED", dueDate: "2020-01-01", balanceOutstanding: "120.00", amountDue: "120.00", amountPaid: "0" };
const AGM = { id: "m1", schemeId: "s1", status: "IN_PROGRESS", meetingType: "AGM", scheduledAt: "2026-11-20T09:00:00.000Z", startTime: null };
const v = (n: number, vote: string) => ({ lotId: `lot-${n}`, vote, byProxy: false });
const record = (outcome: string, votes?: unknown, poll?: unknown, attestation?: unknown) =>
  recordAgendaOutcomeAction("s1", "m1", "i1", outcome, votes, poll, attestation);
const payloadOf = (call = 0) => ((recordMeetingEvent.mock.calls[call] as unknown[])[0] as { actorId: string; payload: Record<string, unknown> });

function at(st: string, category: string | null, seed: Record<string, unknown[]> = {}) {
  state.scheme = scheme(st);
  state.item = { id: "i1", meetingId: "m1", resolutionCategory: category };
  sharedFake.reset({ LevyNotice: [], ElectronicBallot: [], ElectronicVote: [], ...seed });
}

function nothingWritten() {
  expect(updateAgendaItem).not.toHaveBeenCalled();
  expect(recordMeetingEvent).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  state.meeting = AGM;
  state.ballotTotals = null;
});

describe("Western Australia", () => {
  it("refuses a special, without dissent or unanimous resolution as resolved or lost, before reading anything", async () => {
    for (const c of ["SPECIAL", "WITHOUT_DISSENT", "UNANIMOUS"]) {
      for (const outcome of ["RESOLVED", "MOTION_LOST"]) {
        at("WA", c);
        sharedFake.reset({});
        const r = await record(outcome, [v(1, "FOR")]);
        expect(r.error).toMatch(/is decided when its 28-day voting period closes, which StrataVerze does not track yet\. It cannot be recorded as resolved or lost at the meeting\. It can be deferred\.$/);
        expect(sharedFake.tables).toEqual({});
      }
    }
    nothingWritten();
    at("WA", "SPECIAL");
    expect(await record("DEFERRED")).toEqual({ ok: true });
    expect(updateAgendaItem).toHaveBeenCalledWith("m1", "i1", { outcome: "DEFERRED", status: "DEFERRED" });
  });

  it("records an ordinary resolution from the count, the common property row left out", async () => {
    at("WA", "ORDINARY");
    expect(await record("RESOLVED", [v(1, "FOR"), v(2, "FOR"), v(3, "AGAINST")])).toEqual({ ok: true });
    const event = (recordMeetingEvent.mock.calls[0] as unknown[])[0] as { payload: Record<string, unknown> };
    expect(event.payload.tally).toEqual({ forCount: 2, againstCount: 1, abstainCount: 0, totalLots: 8 });
    expect(event.payload.evaluation).toEqual({ passed: true, reason: "Majority of votes cast" });
    expect(event.payload).not.toHaveProperty("attestation");
  });

  it("asks no quorum answer: one sent is ignored, and nothing about it is stored", async () => {
    at("WA", "ORDINARY");
    expect(await record("RESOLVED", [v(1, "FOR"), v(2, "FOR"), v(3, "AGAINST")], undefined, { quorumPresent: "garbled" })).toEqual({ ok: true });
    expect(payloadOf().payload).not.toHaveProperty("attestation");
    expect(payloadOf().payload.tally).not.toHaveProperty("quorumPresent");
  });

  it("refuses a 2-lot scheme's count unless both lots are counted, writing nothing (s 130(2), (4))", async () => {
    state.scheme = { ...scheme("WA"), totalLots: 2, lots: [lots[0], lots[1], lots[8]] };
    state.item = { id: "i1", meetingId: "m1", resolutionCategory: "ORDINARY" };
    sharedFake.reset({ LevyNotice: [], ElectronicBallot: [], ElectronicVote: [] });
    const r = await record("RESOLVED", [v(1, "FOR")]);
    expect(r.error).toMatch(/^In a 2-lot scheme the meeting has a quorum only with both lots present or represented, and there is no fallback/);
    expect(r.error).toMatch(/Nothing was saved\. The item can be deferred\.$/);
    nothingWritten();
    expect(await record("RESOLVED", [v(1, "FOR"), v(2, "ABSTAIN")])).toEqual({ ok: true });
    expect(updateAgendaItem).toHaveBeenCalledWith("m1", "i1", { outcome: "RESOLVED", status: "CARRIED" });
  });
});

describe("Victoria", () => {
  it("refuses an interim special resolution, writing nothing", async () => {
    at("VIC", "SPECIAL", VIC_TIER_4);
    const r = await record("RESOLVED", [v(1, "FOR"), v(2, "FOR"), v(3, "FOR"), v(4, "FOR"), v(5, "AGAINST")], undefined, YES);
    expect(r.error).toMatch(/^The votes recorded make this motion an interim special resolution\./);
    expect(r.error).toMatch(/Nothing was saved\. The item can be deferred\.$/);
    nothingWritten();
  });

  it("refuses an ordinary or special resolution until the quorum is answered, before reading the votes or the debts, writing nothing", async () => {
    for (const c of ["ORDINARY", "SPECIAL"]) {
      for (const answer of [undefined, null, {}, { quorumPresent: null }, { unitsPresent: 3 }]) {
        at("VIC", c, VIC_TIER_4);
        const r = await record("RESOLVED", [v(1, "FOR"), v(2, "FOR"), v(3, "AGAINST")], undefined, answer);
        expect(r.error, `${c} ${JSON.stringify(answer)}`).toBe('Answer "Quorum present for this item" before recording this item\'s outcome. Nothing was saved.');
      }
    }
    nothingWritten();
  });

  it("records an ordinary resolution carried with a quorum, keeping the chair's answer in the event", async () => {
    at("VIC", "ORDINARY", VIC_TIER_4);
    expect(await record("RESOLVED", [v(1, "FOR"), v(2, "FOR"), v(3, "AGAINST")], undefined, YES)).toEqual({ ok: true });
    expect(updateAgendaItem).toHaveBeenCalledWith("m1", "i1", { outcome: "RESOLVED", status: "CARRIED" });
    const event = payloadOf();
    expect(event.actorId).toBe("adviser");
    expect(event.payload.attestation).toEqual({ quorumPresent: true });
    expect(event.payload.tally).toEqual({ forCount: 2, againstCount: 1, abstainCount: 0, totalLots: 8, quorumPresent: true });
    expect(Object.keys(event.payload)).toEqual(["itemId", "outcome", "votes", "notCounted", "tally", "evaluation", "attestation"]);
  });

  it("without a quorum records a lost ordinary resolution, and refuses one that carries as interim", async () => {
    at("VIC", "ORDINARY", VIC_TIER_4);
    expect(await record("MOTION_LOST", [v(1, "FOR"), v(2, "AGAINST"), v(3, "AGAINST")], undefined, NO)).toEqual({ ok: true });
    expect(updateAgendaItem).toHaveBeenCalledWith("m1", "i1", { outcome: "MOTION_LOST", status: "LOST" });
    expect(payloadOf().payload.attestation).toEqual({ quorumPresent: false });
    vi.clearAllMocks();
    at("VIC", "ORDINARY", VIC_TIER_4);
    const r = await record("RESOLVED", [v(1, "FOR"), v(2, "FOR"), v(3, "AGAINST")], undefined, NO);
    expect(r.error).toMatch(/^The votes recorded make this motion an interim resolution\. Majority of votes cast, at a meeting without a quorum/);
    nothingWritten();
  });

  it("refuses a \"no quorum\" answer the votes contradict, writing nothing", async () => {
    at("VIC", "ORDINARY", VIC_TIER_4);
    const r = await record("MOTION_LOST", [v(1, "FOR"), v(2, "AGAINST"), v(3, "AGAINST"), v(4, "ABSTAIN")], undefined, NO);
    expect(r.error).toBe(
      "The answer says the meeting had no quorum for this item, but 4 of the 8 lots have a vote counted on it, which is at least 50% of the lots, so it had one. Check the quorum answer and the votes entered. Nothing was saved.",
    );
    nothingWritten();
  });

  it("refuses an unreadable answer, writing nothing", async () => {
    for (const answer of ["yes", true, [true], { quorumPresent: "true" }, { quorumPresent: true, unitsPresent: -1 }, { quorumPresent: true, unitsPresent: 9 }, { quorumPresent: true, unitsPresent: 1.5 }, { quorumPresent: true, extra: 1 }]) {
      at("VIC", "ORDINARY", VIC_TIER_4);
      const r = await record("RESOLVED", [v(1, "FOR")], undefined, answer);
      expect(r.error, JSON.stringify(answer)).toBe("The quorum answer sent could not be read. Reload the page and record it again.");
    }
    nothingWritten();
  });

  it("records a special resolution carried by 75% of all lots, with the tally", async () => {
    at("VIC", "SPECIAL", VIC_TIER_4);
    expect(await record("RESOLVED", [1, 2, 3, 4, 5, 6].map((n) => v(n, "FOR")), undefined, YES)).toEqual({ ok: true });
    expect(updateAgendaItem).toHaveBeenCalledWith("m1", "i1", { outcome: "RESOLVED", status: "CARRIED" });
    expect(payloadOf().payload.tally).toEqual({ forCount: 6, againstCount: 0, abstainCount: 0, totalLots: 8, quorumPresent: true });
  });

  it("records a unanimous resolution without asking the quorum, and stores no answer", async () => {
    at("VIC", "UNANIMOUS", VIC_TIER_4);
    expect(await record("RESOLVED", [1, 2, 3, 4, 5, 6, 7, 8].map((n) => v(n, "FOR")), undefined, { quorumPresent: "ignored" })).toEqual({ ok: true });
    expect(payloadOf().payload).not.toHaveProperty("attestation");
  });

  it("needs no band of members: a band recorded by mistake changes nothing", async () => {
    at("VIC", "SPECIAL", { SchemeSelectorValue: [...VIC_TIER_4.SchemeSelectorValue, { id: "x", schemeId: "s1", key: "memberBand", value: "THREE" }] });
    expect(await record("RESOLVED", [1, 2, 3, 4, 5, 6].map((n) => v(n, "FOR")), undefined, YES)).toEqual({ ok: true });
    expect(payloadOf().payload.tally).not.toHaveProperty("memberBand");
  });

  it("refuses a tier 5 owners corporation before the votes are read, whatever the item, writing nothing", async () => {
    for (const c of ["ORDINARY", "SPECIAL", "UNANIMOUS", null]) {
      for (const outcome of ["RESOLVED", "MOTION_LOST"]) {
        if (c === null && outcome === "RESOLVED") continue;
        at("VIC", c, VIC_TIER_4);
        state.scheme = { ...scheme("VIC"), servicesOnly: true };
        const r = await record(outcome, "not votes", "not a poll", "not an answer");
        expect(r.error, `${c} ${outcome}`).toMatch(/^This owners corporation is tier 5 \(a 2-lot subdivision or services only\)\..*Nothing was saved\. The item can be deferred\.$/);
      }
    }
    nothingWritten();
    at("VIC", "ORDINARY", VIC_TIER_4);
    state.scheme = { ...scheme("VIC"), servicesOnly: true };
    expect(await record("DEFERRED")).toEqual({ ok: true });
  });

  it("refuses where the tier cannot be worked out, saying what is missing, writing nothing", async () => {
    at("VIC", "SPECIAL");
    const r = await record("RESOLVED", [1, 2, 3, 4, 5, 6].map((n) => v(n, "FOR")), undefined, YES);
    expect(r.error).toMatch(/^StrataVerze cannot tell whether this owners corporation is tier 5 .*, because no answer is recorded for owners corporations on the plan\. Check the building rules\./);
    at("VIC", "ORDINARY", VIC_TIER_4);
    state.scheme = { ...scheme("VIC"), lots: lots.map((l) => (l.id === "lot-3" ? { ...l, occupiable: null } : l)) };
    expect((await record("MOTION_LOST", [v(1, "AGAINST")], undefined, YES)).error).toMatch(/because lot 3 has no answer for /);
    nothingWritten();
  });

  it("bars a lot in arrears on an ordinary resolution in tiers 1 to 4, and tells the chair", async () => {
    at("VIC", "ORDINARY", { ...VIC_TIER_4, LevyNotice: [overdue] });
    const r = await record("RESOLVED", [v(1, "FOR"), v(2, "AGAINST"), v(3, "FOR"), v(4, "AGAINST"), v(5, "AGAINST")], undefined, YES);
    // Lot 2 is not counted: 2 for and 2 against is equal, so it is refused.
    expect(r.error).toMatch(/The votes are equal/);
    nothingWritten();
  });
});

describe("the ACT", () => {
  it("reads the band of members, and refuses every count until the quorum is answered, writing nothing", async () => {
    at("ACT", "SPECIAL", band("FOUR_OR_MORE"));
    const r = await record("RESOLVED", [v(1, "FOR"), v(2, "FOR"), v(3, "FOR"), v(4, "AGAINST")], undefined, { unitsPresent: 4 });
    expect(r.error).toBe('Answer "Standard quorum present for this motion" before recording this item\'s outcome. Nothing was saved.');
    nothingWritten();
  });

  it("refuses a reduced quorum (\"no\"), writing nothing", async () => {
    at("ACT", "ORDINARY", band("FOUR_OR_MORE"));
    const r = await record("RESOLVED", [v(1, "FOR"), v(2, "FOR"), v(3, "AGAINST")], undefined, NO);
    expect(r.error).toMatch(/The meeting had no quorum for this item, so it is decided later, which StrataVerze does not track yet/);
    nothingWritten();
  });

  it("records an ordinary resolution with 3 or 4 or more members and a standard quorum", async () => {
    for (const b of ["THREE", "FOUR_OR_MORE"]) {
      vi.clearAllMocks();
      at("ACT", "ORDINARY", band(b));
      expect(await record("RESOLVED", [v(1, "FOR"), v(2, "FOR"), v(3, "AGAINST")], undefined, YES), b).toEqual({ ok: true });
      expect(payloadOf().payload.tally).toEqual({ forCount: 2, againstCount: 1, abstainCount: 0, totalLots: 8, memberBand: b, quorumPresent: true });
      expect(payloadOf().payload.attestation).toEqual({ quorumPresent: true });
    }
  });

  it("records a special resolution with 4 or more members from the units present, kept with the answer", async () => {
    at("ACT", "SPECIAL", band("FOUR_OR_MORE"));
    expect(await record("RESOLVED", [v(1, "FOR"), v(2, "FOR"), v(3, "FOR"), v(4, "AGAINST"), v(5, "ABSTAIN")], undefined, { quorumPresent: true, unitsPresent: 5 })).toEqual({ ok: true });
    expect(updateAgendaItem).toHaveBeenCalledWith("m1", "i1", { outcome: "RESOLVED", status: "CARRIED" });
    expect(payloadOf().payload.attestation).toEqual({ quorumPresent: true, unitsPresent: 5 });
    expect(payloadOf().payload.tally).toMatchObject({ votesPresentCount: 5, quorumPresent: true, memberBand: "FOUR_OR_MORE" });
  });

  it("refuses a special resolution whose units present are missing or do not match the units entered, writing nothing", async () => {
    at("ACT", "SPECIAL", band("FOUR_OR_MORE"));
    expect((await record("RESOLVED", [v(1, "FOR"), v(2, "FOR")], undefined, YES)).error).toBe(
      "How many units were present or represented for this item is not recorded, so the votes cannot be counted. Record it, then save again.",
    );
    expect((await record("RESOLVED", [v(1, "FOR"), v(2, "FOR")], undefined, { quorumPresent: true, unitsPresent: 3 })).error).toMatch(
      /^3 units were present or represented for this item, but 2 have a vote or an abstention entered\./,
    );
    nothingWritten();
  });

  it("bars a unit owing money on an ordinary resolution with 3 or more members, and tells the chair", async () => {
    at("ACT", "ORDINARY", { ...band("FOUR_OR_MORE"), LevyNotice: [overdue] });
    const r = await record("RESOLVED", [v(1, "FOR"), v(2, "FOR"), v(3, "FOR"), v(4, "AGAINST")], undefined, YES);
    expect(r).toEqual({ ok: true, notice: "Not counted: lot 2 owes the owners corporation an overdue amount, so its vote on this motion cannot count." });
    expect(payloadOf().payload.tally).toMatchObject({ forCount: 2, againstCount: 1 });
    expect((payloadOf().payload.notCounted as { lotId: string }[]).map((x) => x.lotId)).toEqual(["lot-2"]);
  });

  it("records a resolution with 1 or 2 members, with no debtor bar (Matthew Wrigley's decision of 29 Oct 2026)", async () => {
    state.scheme = { ...scheme("ACT"), totalLots: 2, lots: [lots[0], lots[1], lots[8]] };
    state.item = { id: "i1", meetingId: "m1", resolutionCategory: "ORDINARY" };
    sharedFake.reset({ LevyNotice: [overdue], ElectronicBallot: [], ElectronicVote: [], ...band("ONE_OR_TWO") });
    expect(await record("RESOLVED", [v(1, "FOR"), v(2, "FOR")], undefined, YES)).toEqual({ ok: true });
    expect(payloadOf().payload.notCounted).toEqual([]);
    expect(payloadOf().payload.evaluation).toEqual({ passed: true, reason: "No vote against, and at least 1 vote for" });
    vi.clearAllMocks();
    expect(await record("RESOLVED", [v(1, "FOR"), v(2, "AGAINST")], undefined, YES)).toMatchObject({ error: expect.stringMatching(/^The votes recorded show the motion is lost, not resolved\. 1 vote\(s\) against\./) });
    nothingWritten();
  });

  it("refuses for the band first: none recorded, or another building's", async () => {
    at("ACT", "ORDINARY", { SchemeSelectorValue: [{ id: "x", schemeId: "other", key: "memberBand", value: "FOUR_OR_MORE" }] });
    const r = await record("RESOLVED", [v(1, "FOR")], undefined, YES);
    expect(r.error).toBe(
      "The votes recorded cannot decide this motion. The building's number of members is not recorded in its building rules, so this resolution's test cannot be chosen. Nothing was saved. The item can be deferred.",
    );
    at("ACT", "SPECIAL", band("THREE"));
    expect((await record("MOTION_LOST", [v(1, "FOR")], undefined, { quorumPresent: true, unitsPresent: 1 })).error).toMatch(/3 members/);
    nothingWritten();
  });
});

describe("closing a ballot under a draft pack", () => {
  it("skips an item the count cannot decide, and writes no outcome for it", async () => {
    state.scheme = scheme("VIC");
    state.meeting = { ...AGM, status: "NOTICE_ISSUED" };
    state.items = [
      { id: "i1", meetingId: "m1", resolutionCategory: "SPECIAL" },
      { id: "i2", meetingId: "m1", resolutionCategory: "ORDINARY" },
    ];
    state.ballotVotes = [
      { agendaItemId: "i1", lotId: "lot-1", voteValue: "FOR", unitEntitlement: 10, isInformal: false },
      { agendaItemId: "i2", lotId: "lot-1", voteValue: "FOR", unitEntitlement: 10, isInformal: false },
    ];
    sharedFake.reset({});
    expect(await closeBallotAction("s1", "m1")).toEqual({ ok: true });
    expect(updateAgendaItem).not.toHaveBeenCalled();
    expect(recordMeetingEvent).toHaveBeenCalledWith({ meetingId: "m1", actorId: "adviser", eventType: "BALLOT_CLOSED", payload: { results: [] } });
  });
});

describe("closing a ballot under the Western Australian pack, with the totals", () => {
  it("records no special, without dissent or unanimous resolution, though every lot voted for: the voting period decides it", async () => {
    state.scheme = scheme("WA");
    state.meeting = { ...AGM, status: "NOTICE_ISSUED" };
    state.ballotTotals = { totalLots: 8, totalEntitlement: 80 };
    const cats = ["SPECIAL", "WITHOUT_DISSENT", "UNANIMOUS", "ORDINARY"];
    state.items = cats.map((c, i) => ({ id: `i${i + 1}`, meetingId: "m1", resolutionCategory: c }));
    state.ballotVotes = cats.flatMap((_, i) =>
      lots.slice(0, 8).map((l) => ({ agendaItemId: `i${i + 1}`, lotId: l.id, voteValue: "FOR", unitEntitlement: 10, isInformal: false })),
    );
    sharedFake.reset({});
    expect(await closeBallotAction("s1", "m1")).toEqual({ ok: true });
    // Only the ordinary resolution is written: the other three are undetermined, whatever the votes.
    expect(updateAgendaItem).toHaveBeenCalledTimes(1);
    expect(updateAgendaItem).toHaveBeenCalledWith("m1", "i4", { outcome: "RESOLVED", status: "CARRIED" });
    expect(recordMeetingEvent).toHaveBeenCalledWith({
      meetingId: "m1",
      actorId: "adviser",
      eventType: "BALLOT_CLOSED",
      payload: { results: [{ itemId: "i4", outcome: "RESOLVED" }] },
    });
  });
});

describe("an item with no category at a general meeting", () => {
  it("cannot be recorded as resolved under any draft pack, and nothing is written", async () => {
    for (const st of ["VIC", "ACT", "WA"]) {
      for (const category of [null, ""]) {
        at(st, category);
        const r = await record("RESOLVED", [v(1, "FOR"), v(2, "FOR")]);
        expect(r.error, st).toBe(
          "This item has no resolution type, so its votes cannot be counted and it cannot be recorded as resolved at a general meeting. Give the item its resolution type on the agenda first. It can be recorded as lost, or deferred.",
        );
      }
    }
    nothingWritten();
  });

  it("can still be recorded as lost or deferred", async () => {
    for (const st of ["VIC", "ACT", "WA"]) {
      vi.clearAllMocks();
      // A Victorian building's tier must be worked out (tier 4 here) for anything but a deferral (stage 2, PR 8a-ii).
      at(st, null, st === "VIC" ? VIC_TIER_4 : {});
      expect(await record("MOTION_LOST", [v(1, "AGAINST")]), st).toEqual({ ok: true });
      expect(updateAgendaItem).toHaveBeenCalledWith("m1", "i1", { outcome: "MOTION_LOST", status: "LOST" });
      vi.clearAllMocks();
      at(st, null);
      expect(await record("DEFERRED"), st).toEqual({ ok: true });
      expect(updateAgendaItem).toHaveBeenCalledWith("m1", "i1", { outcome: "DEFERRED", status: "DEFERRED" });
    }
  });

  it("is recorded as resolved at a committee meeting, which its members decide", async () => {
    state.meeting = { ...AGM, meetingType: "COMMITTEE" };
    at("VIC", null);
    expect(await record("RESOLVED")).toEqual({ ok: true });
    expect(updateAgendaItem).toHaveBeenCalledWith("m1", "i1", { outcome: "RESOLVED", status: "CARRIED" });
  });
});
