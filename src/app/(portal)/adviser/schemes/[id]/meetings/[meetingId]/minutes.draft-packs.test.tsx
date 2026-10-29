/**
 * Minutes content under the draft packs (VIC, ACT and WA stage 2, PR 8b-iv,
 * 29 Oct 2026). Those states have no buildings yet, so each pack is given
 * here as if it were live.
 * - Victoria: the votes counted for each item from the latest count recorded
 *   (s 81, decision D18) and an interim resolution's later effect.
 * - The ACT: the kind of each special, unopposed and unanimous resolution
 *   (sch 2 s 2.1(1)(c)) and a reduced quorum decision's later effect.
 * - Western Australia: a voting period's later effect.
 * - Only what the pack asks for is read: the events for Victoria only.
 * - The minutes section names INTERIM "Decided later" and OPEN "Voting open",
 *   and shows each line in plain words with no dashes or semicolons.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const access = vi.hoisted(() => [] as string[]);

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => {
  const { sharedFake } = await import("@/test/fake-orm");
  const wrap = (orm: { public: object }) => ({
    public: new Proxy({}, { get: (_t, model: string) => (access.push(model), (orm.public as Record<string, object>)[model]) }),
  });
  return { db: { orm: wrap(sharedFake.db.orm), transaction: sharedFake.db.transaction } };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-access", () => ({ requireSchemeAccess: vi.fn(async () => ({ profile: { id: "adviser" } })) }));
vi.mock("@/lib/vault/sources", () => ({ captureConfirmedMinutes: vi.fn(async () => undefined) }));
vi.mock("@/lib/notifications", () => ({ notifyMeetingScheduled: vi.fn(async () => undefined) }));
// The draft packs, given as if live (they have no buildings yet).
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

const { sharedFake } = await import("@/test/fake-orm");
const { assembleMinutesAction } = await import("./minutes-actions");
const { MinutesSection } = await import("./minutes-section");
const { minutesItemExtras, minutesVoting } = await import("@/lib/meetings/minutes");
const { minutesLaterEffect } = await import("@/lib/meetings/pending");
const { PENDING_RULE_PACKS } = await import("@/config/statutory");

const RULES = {
  VIC: PENDING_RULE_PACKS.VIC.rules.MEETING_RULES,
  ACT: PENDING_RULE_PACKS.ACT.rules.MEETING_RULES,
  WA: PENDING_RULE_PACKS.WA.rules.MEETING_RULES,
};
const ZONES = { VIC: "Australia/Melbourne", ACT: "Australia/Sydney", WA: "Australia/Perth" } as const;
const NO_DASH_OR_SEMICOLON = /[;–—]/;

/** A pending row as the minutes read it. */
function row(state: keyof typeof RULES, kind: "INTERIM_SPECIAL" | "INTERIM_NO_QUORUM" | "REDUCED_QUORUM" | "VOTING_PERIOD", over: Record<string, unknown> = {}) {
  return {
    id: `pr-${kind}`,
    agendaItemId: "i1",
    kind,
    status: "PENDING",
    madeOn: "2026-11-02",
    windowClosesOn: state === "VIC" ? "2026-12-01" : "2026-11-30",
    noticeDueOn: kind === "VOTING_PERIOD" ? null : "2026-11-16",
    noticeGivenOn: null,
    meetingNoticeGivenOn: null,
    meetingNoticeMeetingId: null,
    meetingHeldBy: null,
    rule: RULES[state].pendingResolutions![kind]!,
    petitionReceivedOn: null,
    effectiveOn: null,
    endedBy: null,
    ...over,
  };
}

describe("minutesLaterEffect", () => {
  it("words each kind as it stands, with its dates", () => {
    const out = {
      vicSpecialPending: minutesLaterEffect(row("VIC", "INTERIM_SPECIAL")),
      vicSpecialNoticeGiven: minutesLaterEffect(row("VIC", "INTERIM_SPECIAL", { noticeGivenOn: "2026-11-10" })),
      vicSpecialCarried: minutesLaterEffect(row("VIC", "INTERIM_SPECIAL", { status: "CARRIED", endedBy: "PERIOD_ENDED", effectiveOn: "2026-12-02", noticeGivenOn: "2026-11-10" })),
      vicSpecialPetition: minutesLaterEffect(row("VIC", "INTERIM_SPECIAL", { status: "LOST", endedBy: "PETITION", petitionReceivedOn: "2026-11-20" })),
      vicNoQuorumPending: minutesLaterEffect(row("VIC", "INTERIM_NO_QUORUM")),
      vicNoQuorumCalled: minutesLaterEffect(row("VIC", "INTERIM_NO_QUORUM", { meetingNoticeGivenOn: "2026-11-10", meetingHeldBy: "2026-12-08" })),
      vicNoQuorumNotConfirmed: minutesLaterEffect(row("VIC", "INTERIM_NO_QUORUM", { status: "LOST", endedBy: "NOT_CONFIRMED" })),
      actPending: minutesLaterEffect(row("ACT", "REDUCED_QUORUM", { noticeGivenOn: "2026-11-05" })),
      actConfirmed: minutesLaterEffect(row("ACT", "REDUCED_QUORUM", { status: "CARRIED", endedBy: "CONFIRMED", effectiveOn: "2026-11-25" })),
      waOpen: minutesLaterEffect(row("WA", "VOTING_PERIOD")),
      waCarried: minutesLaterEffect(row("WA", "VOTING_PERIOD", { status: "CARRIED", endedBy: "VOTES_AT_CLOSE", effectiveOn: "2026-12-01" })),
      waLost: minutesLaterEffect(row("WA", "VOTING_PERIOD", { status: "LOST", endedBy: "VOTES_AT_CLOSE" })),
    };
    for (const v of Object.values(out)) expect(v.words).not.toMatch(NO_DASH_OR_SEMICOLON);
    expect(out.vicSpecialPending).toEqual({
      kind: "INTERIM_SPECIAL",
      label: "Interim special resolution",
      status: "PENDING",
      windowClosesOn: "2026-12-01",
      effectiveOn: "2026-12-02",
      words:
        "Interim special resolution, decided later. Its period ends on 1 December 2026. Pending. Unless it is stopped by a petition first, it takes effect as a special resolution on 2 December 2026 at the earliest, once its notice to the owners is recorded as given.",
    });
    expect(out.vicSpecialNoticeGiven.words).toBe(
      "Interim special resolution, decided later. Its period ends on 1 December 2026. Pending. Unless it is stopped by a petition first, it takes effect as a special resolution on 2 December 2026.",
    );
    expect(out.vicSpecialCarried).toMatchObject({ status: "CARRIED", effectiveOn: "2026-12-02" });
    expect(out.vicSpecialCarried.words).toBe("Interim special resolution, decided later. Its period ends on 1 December 2026. Took effect as a special resolution on 2 December 2026.");
    expect(out.vicSpecialPetition).toMatchObject({ status: "LOST", effectiveOn: null });
    expect(out.vicSpecialPetition.words).toMatch(/Stopped by a petition, so it is recorded as lost\.$/);
    expect(out.vicNoQuorumPending.words).toMatch(/^Interim resolution, decided later\. .* Unless it is stopped by notice of a special general meeting first, it takes effect on 2 December 2026 at the earliest/);
    expect(out.vicNoQuorumCalled).toMatchObject({ effectiveOn: null });
    expect(out.vicNoQuorumCalled.words).toMatch(/Pending\. A special general meeting was called for it on 10 November 2026, to be held by 8 December 2026\.$/);
    expect(out.vicNoQuorumNotConfirmed.words).toMatch(/Not confirmed at the special general meeting, so it is recorded as lost\.$/);
    expect(out.actPending.words).toBe(
      "Reduced quorum decision, decided later. Its period ends on 30 November 2026. Pending. Unless it is stopped by a petition or confirmed at a later meeting first, it takes effect on 1 December 2026.",
    );
    expect(out.actConfirmed.words).toMatch(/Took effect on 25 November 2026\.$/);
    expect(out.waOpen).toMatchObject({ label: "Voting period", status: "PENDING", effectiveOn: "2026-12-01" });
    expect(out.waOpen.words).toBe(
      "Voting period. Voting is open until 30 November 2026. It is decided as at 1 December 2026 on the votes at the meeting and the written votes received by then.",
    );
    expect(out.waCarried.words).toBe("Voting period. Voting closed on 30 November 2026. Carried on the votes at the close, as at 1 December 2026.");
    expect(out.waLost.words).toBe("Voting period. Voting closed on 30 November 2026. Lost on the votes at the close.");
  });
});

describe("minutesVoting and minutesItemExtras", () => {
  it("reads the votes of a recorded count, and nothing where the event holds none", () => {
    expect(minutesVoting({ tally: { forCount: 12, againstCount: 3, abstainCount: 1 }, notCounted: [{ lotId: "x" }] })).toEqual({ for: 12, against: 3, abstain: 1, poll: false, notCounted: 1 });
    expect(minutesVoting({ tally: { forCount: 2, againstCount: 1, poll: true, forUE: 120, againstUE: 30 } })).toEqual({ for: 2, against: 1, abstain: 0, poll: true, forEntitlement: 120, againstEntitlement: 30, notCounted: 0 });
    expect(minutesVoting({ itemId: "i1", outcome: "RESOLVED" })).toBeNull();
    expect(minutesVoting(null)).toBeNull();
  });

  it("gives only what the pack asks for, from the latest count for each item", () => {
    const items = [
      { id: "i1", resolutionCategory: "SPECIAL" },
      { id: "i2", resolutionCategory: "ORDINARY" },
      { id: "i3", resolutionCategory: "UNANIMOUS" },
    ];
    const events = [
      { eventType: "AGENDA_OUTCOME_RECORDED", payload: { itemId: "i2", tally: { forCount: 1, againstCount: 5 } } },
      { eventType: "AGENDA_OUTCOME_RECORDED", payload: { itemId: "i2", tally: { forCount: 6, againstCount: 1 } } },
      { eventType: "NOTICE_ISSUED", payload: { itemId: "i3", tally: { forCount: 9, againstCount: 0 } } },
    ];
    const pending = [row("ACT", "REDUCED_QUORUM")];
    const act = minutesItemExtras(RULES.ACT.minutesContents!, RULES.ACT.resolutionLabels, items, events, pending);
    expect(act.get("i1")).toEqual({ kind: "Special Resolution", laterEffect: minutesLaterEffect(pending[0]) });
    expect(act.get("i2")).toEqual({});
    expect(act.get("i3")).toEqual({ kind: "Unanimous Resolution" });
    const vic = minutesItemExtras(RULES.VIC.minutesContents!, RULES.VIC.resolutionLabels, items, events, []);
    expect(vic.get("i2")).toEqual({ voting: { for: 6, against: 1, abstain: 0, poll: false, notCounted: 0 } });
    expect(vic.get("i1")).toEqual({});
    expect(vic.get("i3")).toEqual({});
  });
});

function seed(state: keyof typeof RULES, items: Record<string, unknown>[], events: Record<string, unknown>[], pending: Record<string, unknown>[]) {
  sharedFake.reset({
    Scheme: [{ id: "s1", name: "Draft Towers", planNumber: "PS 1", state, timeZone: ZONES[state], totalLots: 10, lots: [], memberships: [], funds: [], bankAccounts: [], images: [] }],
    Meeting: [
      {
        id: "m1",
        schemeId: "s1",
        title: "Annual general meeting 2026",
        meetingType: "AGM",
        status: "MINUTES_DRAFT",
        scheduledAt: "2026-11-02T08:00:00.000Z",
        startTime: "2026-11-02T08:00:00.000Z",
        openedAt: "2026-11-02T08:05:00.000Z",
        closedAt: "2026-11-02T09:30:00.000Z",
        deletedAt: null,
        motions: [],
      },
    ],
    AgendaItem: items.map((i) => ({ meetingId: "m1", resolutionText: null, explanatoryNote: null, ...i })),
    Minutes: [],
    MeetingEvent: events.map((e, n) => ({ id: `e${n + 1}`, meetingId: "m1", createdAt: `2026-11-02T08:${10 + n}:00.000Z`, ...e })),
    PendingResolution: pending.map((p) => ({ meetingId: "m1", schemeId: "s1", ...p, rule: { pending: (p as { rule: unknown }).rule, resolution: null } })),
  });
  access.length = 0;
}

const stored = () => (sharedFake.table("Minutes")[0] as { content: { items: Record<string, unknown>[] } }).content.items;

describe("assembleMinutesAction under the draft packs", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-03T01:00:00.000Z"));
  });

  it("Victoria: the votes per item and an interim resolution's later effect, reading the events and the pending rows", async () => {
    const r = row("VIC", "INTERIM_SPECIAL");
    seed(
      "VIC",
      [
        { id: "i1", position: 1, title: "Replace the roof", resolutionCategory: "SPECIAL", outcome: "INTERIM", status: "INTERIM" },
        { id: "i2", position: 2, title: "Paint the fence", resolutionCategory: "ORDINARY", outcome: "RESOLVED", status: "CARRIED" },
        { id: "i3", position: 3, title: "Elect the committee", resolutionCategory: null, outcome: "DEFERRED", status: "DEFERRED" },
      ],
      [
        { eventType: "AGENDA_OUTCOME_RECORDED", payload: { itemId: "i1", outcome: "INTERIM", tally: { forCount: 6, againstCount: 1, abstainCount: 1 }, notCounted: [] } },
        { eventType: "AGENDA_OUTCOME_RECORDED", payload: { itemId: "i2", outcome: "RESOLVED", tally: { forCount: 7, againstCount: 2, poll: true, forUE: 700, againstUE: 200 }, notCounted: [{ lotId: "x" }, { lotId: "y" }] } },
        { eventType: "AGENDA_OUTCOME_RECORDED", payload: { itemId: "i3", outcome: "DEFERRED" } },
      ],
      [r],
    );
    expect(await assembleMinutesAction("s1", "m1")).toEqual({ ok: true });
    expect(access).toEqual(["Meeting", "Scheme", "AgendaItem", "Minutes", "MeetingEvent", "PendingResolution", "Minutes", "MeetingEvent"]);
    const [i1, i2, i3] = stored();
    expect(i1).toMatchObject({ outcome: "INTERIM", voting: { for: 6, against: 1, abstain: 1, poll: false, notCounted: 0 }, laterEffect: { kind: "INTERIM_SPECIAL", status: "PENDING", windowClosesOn: "2026-12-01", effectiveOn: "2026-12-02" } });
    expect(i1).not.toHaveProperty("kind");
    expect(i2).toEqual({
      position: 2,
      title: "Paint the fence",
      resolutionText: null,
      explanatoryNote: null,
      outcome: "RESOLVED",
      voting: { for: 7, against: 2, abstain: 0, poll: true, forEntitlement: 700, againstEntitlement: 200, notCounted: 2 },
    });
    expect(i3).toEqual({ position: 3, title: "Elect the committee", resolutionText: null, explanatoryNote: null, outcome: "DEFERRED" });
  });

  it("the ACT: the kind of special, unopposed and unanimous resolutions and the later effect, with no events read", async () => {
    seed(
      "ACT",
      [
        { id: "i1", position: 1, title: "Adopt a rule", resolutionCategory: "SPECIAL", outcome: "INTERIM", status: "INTERIM" },
        { id: "i2", position: 2, title: "Paint the fence", resolutionCategory: "ORDINARY", outcome: "RESOLVED", status: "CARRIED" },
        { id: "i3", position: 3, title: "Rename the building", resolutionCategory: "UNANIMOUS", outcome: "MOTION_LOST", status: "LOST" },
      ],
      [{ eventType: "AGENDA_OUTCOME_RECORDED", payload: { itemId: "i2", tally: { forCount: 3, againstCount: 1 } } }],
      [row("ACT", "REDUCED_QUORUM")],
    );
    expect(await assembleMinutesAction("s1", "m1")).toEqual({ ok: true });
    // The events are not read (only the MINUTES_DRAFTED event is written).
    expect(access).toEqual(["Meeting", "Scheme", "AgendaItem", "Minutes", "PendingResolution", "Minutes", "MeetingEvent"]);
    const [i1, i2, i3] = stored();
    expect(i1).toMatchObject({ kind: "Special Resolution", laterEffect: { kind: "REDUCED_QUORUM", label: "Reduced quorum decision" } });
    expect(i1).not.toHaveProperty("voting");
    expect(i2).not.toHaveProperty("kind");
    expect(i2).not.toHaveProperty("voting");
    expect(i3).toMatchObject({ kind: "Unanimous Resolution" });
  });

  it("Western Australia: an open voting period's later effect only", async () => {
    seed("WA", [{ id: "i1", position: 1, title: "Adopt a by-law", resolutionCategory: "SPECIAL", outcome: "OPEN", status: "OPEN" }], [], [row("WA", "VOTING_PERIOD")]);
    expect(await assembleMinutesAction("s1", "m1")).toEqual({ ok: true });
    expect(access).toEqual(["Meeting", "Scheme", "AgendaItem", "Minutes", "PendingResolution", "Minutes", "MeetingEvent"]);
    const [i1] = stored();
    expect(Object.keys(i1)).toEqual(["position", "title", "resolutionText", "explanatoryNote", "outcome", "laterEffect"]);
    expect(i1.laterEffect).toMatchObject({ kind: "VOTING_PERIOD", status: "PENDING", effectiveOn: "2026-12-01" });
  });
});

describe("MinutesSection under the draft packs", () => {
  it("names INTERIM and OPEN in plain words and shows the kind, the votes and the later effect", () => {
    const html = renderToStaticMarkup(
      <MinutesSection
        schemeId="s1"
        meetingId="m1"
        canAssemble={false}
        deadline={null}
        timeZone="Australia/Melbourne"
        minutes={{
          state: "DRAFT",
          version: 1,
          confirmedAt: null,
          distributedAt: null,
          retentionUntil: null,
          content: {
            heading: "MINUTES",
            items: [
              {
                position: 1,
                title: "Replace the roof",
                resolutionText: "That the roof be replaced.",
                outcome: "INTERIM",
                kind: "Special Resolution",
                voting: { for: 6, against: 1, abstain: 1, poll: false, notCounted: 1 },
                laterEffect: minutesLaterEffect(row("VIC", "INTERIM_SPECIAL")),
              },
              {
                position: 2,
                title: "Adopt a by-law",
                resolutionText: null,
                outcome: "OPEN",
                voting: { for: 7, against: 2, abstain: 0, poll: true, forEntitlement: 700, againstEntitlement: 200, notCounted: 0 },
                laterEffect: minutesLaterEffect(row("WA", "VOTING_PERIOD")),
              },
              { position: 3, title: "Paint", resolutionText: null, outcome: "RESOLVED", voting: { for: 1, against: 0, abstain: 0, poll: false, notCounted: 2 } },
            ],
          },
        }}
      />,
    );
    expect(html).toContain("— Decided later");
    expect(html).toContain("— Voting open");
    expect(html).not.toMatch(/— (INTERIM|OPEN)</);
    expect(html).toContain('<p class="mt-1 text-xs text-ink-muted">Special Resolution</p>');
    expect(html).toContain("Votes counted: 6 for, 1 against, 1 abstaining. 1 vote not counted for money owed.");
    expect(html).toContain("Votes counted: 7 for, 2 against. On a poll, lot entitlement 700 for and 200 against.");
    expect(html).toContain("Votes counted: 1 for, 0 against. 2 votes not counted for money owed.");
    expect(html).toContain("Interim special resolution, decided later. Its period ends on 1 December 2026.");
    expect(html).toContain("Voting period. Voting is open until 30 November 2026.");
    const text = html.replace(/<[^>]+>/g, " ").replace(/ — (Decided later|Voting open|Resolved)/g, "");
    expect(text).not.toMatch(NO_DASH_OR_SEMICOLON);
  });
});
