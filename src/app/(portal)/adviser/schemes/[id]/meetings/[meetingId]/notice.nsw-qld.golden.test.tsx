/**
 * NSW and Queensland meeting notices, golden (VIC, ACT and WA stage 2,
 * PR 8b-iii, 29 Oct 2026). Recorded on origin/main (b0b9965) in a temporary
 * worktree, before notice by motion (the longer notice some resolution
 * categories need, and meeting types whose notice period is not checked)
 * was added. NSW and Queensland must give exactly the same days, results,
 * rows, calls, words and markup after that change. Never regenerate these
 * snapshots to make a change pass: a difference is a change to NSW or
 * Queensland.
 *
 * Covered: validateNoticePeriod over a grid (every meeting type, gaps around
 * each boundary, Sydney and Brisbane, times either side of midnight and
 * across the 4 Oct 2026 daylight saving change); issueNoticeAction for every
 * meeting type and its refusals (what it returns, the notice row created,
 * the recipients, the NOTICE_ISSUED event payload, the calls out and every
 * database read and write, inside its transaction too); validateMeetingSetup
 * warnings and errors and buildSetupPreview; and the NoticeSection markup.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const access = vi.hoisted(() => [] as string[]);
const calls = vi.hoisted(() => [] as Array<[string, unknown]>);
const control = vi.hoisted(() => ({ authFails: false, hasFee: false }));

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
      return { profile: { id: "adviser" } };
    }),
  };
});
vi.mock("@/lib/vault/sources", () => ({
  captureMeetingNotice: vi.fn(async (noticeId: string, actorId: string) => calls.push(["captureMeetingNotice", [noticeId, actorId]])),
}));
vi.mock("@/lib/notifications", () => ({
  notifyMeetingScheduled: vi.fn(async (a: unknown) => calls.push(["notifyMeetingScheduled", a])),
}));
vi.mock("@/lib/billing/capture", () => ({
  hasFeeEvent: vi.fn(async (a: unknown) => (calls.push(["hasFeeEvent", a]), control.hasFee)),
  assertUsageFeeConfirmed: vi.fn(async (a: unknown) => calls.push(["assertUsageFeeConfirmed", a])),
  captureUsageFee: vi.fn(async (_orm: unknown, a: unknown) => calls.push(["captureUsageFee", a])),
}));

const { sharedFake } = await import("@/test/fake-orm");
const { issueNoticeAction } = await import("./notice-actions");
const { NoticeSection } = await import("./notice-section");
const { validateNoticePeriod } = await import("@/lib/meetings/rules");
const { validateMeetingSetup, buildSetupPreview, MEETING_TYPES } = await import("@/lib/meetings/setup");
const { rulePackFor } = await import("@/config/statutory");

const RULES = {
  NSW: rulePackFor("NSW")!.rules.MEETING_RULES,
  QLD: rulePackFor("QLD")!.rules.MEETING_RULES,
};
const ZONES = { NSW: "Australia/Sydney", QLD: "Australia/Brisbane" } as const;
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

describe("validateNoticePeriod (golden)", () => {
  it("gives the same days and result over the grid", () => {
    // Issue instants: either side of midnight in Sydney and Brisbane, before and after the 4 Oct 2026 change in Sydney.
    const issues = [
      "2026-09-20T13:30:00.000Z",
      "2026-09-20T14:30:00.000Z",
      "2026-10-01T13:59:00.000Z",
      "2026-10-01T14:00:00.000Z",
      "2026-10-03T13:59:00.000Z",
      "2026-10-03T15:30:00.000Z",
      "2026-10-04T12:59:00.000Z",
      "2026-10-04T13:00:00.000Z",
      "2026-10-10T02:00:00.000Z",
    ];
    const out: Record<string, string> = {};
    for (const state of ["NSW", "QLD"] as const) {
      const ruleSet = RULES[state];
      const required = [...new Set(Object.values(ruleSet.noticePeriods).filter((d): d is number => d != null))];
      const gaps = [...new Set([-1, 0, 1, ...required.flatMap((r) => [r - 1, r, r + 1])])].sort((a, b) => a - b);
      for (const zone of ["Australia/Sydney", "Australia/Brisbane"]) {
        for (const type of MEETING_TYPES) {
          for (const issue of issues) {
            for (const gap of gaps) {
              for (const hours of [-11, -1, 0, 1]) {
                const meeting = new Date(Date.parse(issue) + gap * DAY + hours * HOUR);
                const v = validateNoticePeriod(ruleSet, type, new Date(issue), meeting, zone);
                out[`${state} ${zone} ${type} ${issue.slice(0, 16)} ${meeting.toISOString().slice(0, 16)}`] = `${v.requiredDays}/${v.actualDays}/${v.compliant}`;
              }
            }
          }
        }
      }
    }
    expect(out).toMatchSnapshot();
  });
});

const NOW = "2026-10-02T23:30:00.000Z";

function buildingRows(state: "NSW" | "QLD") {
  const schemeId = `s-${state}`;
  return {
    Scheme: [
      {
        id: schemeId,
        name: `${state} Towers`,
        planNumber: state === "NSW" ? "SP 12345" : "CTS 4321",
        address: "1 Example Street",
        suburb: state === "NSW" ? "Drummoyne" : "Paddington",
        state,
        postcode: state === "NSW" ? "2047" : "4064",
        timeZone: ZONES[state],
        lots: [],
        funds: [],
        bankAccounts: [],
        images: [],
        memberships: [
          { profileId: "p1", role: "OWNER", isActive: true, profile: { email: "one@example.com", firstName: "Ann", lastName: "One" } },
          { profileId: "p2", role: "COMMITTEE", isActive: true, profile: { email: "two@example.com", firstName: "Ben", lastName: "Two" } },
          { profileId: "p3", role: "OWNER", isActive: true, profile: { email: "", firstName: "No", lastName: "Email" } },
          { profileId: "adviser", role: "ADVISER", isActive: true, profile: { email: "adviser@example.com", firstName: "Ada", lastName: "" } },
        ],
      },
    ],
    SchemeMembership: [
      { schemeId, role: "OWNER", isActive: true, profile: { email: "one@example.com" } },
      { schemeId, role: "COMMITTEE", isActive: true, profile: { email: "two@example.com" } },
      { schemeId, role: "OWNER", isActive: true, profile: { email: "" } },
    ],
  };
}

function meetingRow(state: "NSW" | "QLD", over: Record<string, unknown>) {
  return {
    id: "m1",
    schemeId: `s-${state}`,
    status: "DRAFT",
    title: "Meeting",
    meetingType: "AGM",
    startTime: "2026-11-02T08:00:00.000Z",
    scheduledAt: "2026-11-02T08:00:00.000Z",
    timezone: ZONES[state],
    format: "IN_PERSON",
    location: "Level 3 meeting room",
    joinUrl: null,
    joinDetails: null,
    agenda: null,
    ...over,
  };
}

const CATEGORIES = {
  NSW: ["ORDINARY", "SPECIAL", "UNANIMOUS", "SUSTAINABILITY_INFRASTRUCTURE", null],
  QLD: ["ORDINARY", "SPECIAL", "WITHOUT_DISSENT", "MAJORITY", null],
};

function itemRows(state: "NSW" | "QLD", meetingId = "m1", categories: (string | null)[] = CATEGORIES[state]) {
  return categories.map((c, i) => ({
    id: `${meetingId}-i${i + 1}`,
    meetingId,
    position: i + 1,
    title: `Motion ${i + 1}`,
    resolutionText: c ? `That the ${c.toLowerCase()} motion ${i + 1} be passed.` : null,
    explanatoryNote: i === 0 ? "An explanatory note." : null,
    resolutionCategory: c,
    status: "PENDING",
    outcome: null,
  }));
}

interface Scenario {
  state: "NSW" | "QLD";
  meeting?: Record<string, unknown> | null;
  items?: (string | null)[];
  notices?: Record<string, unknown>[];
  ruleSetRows?: Record<string, unknown>[];
  hasFee?: boolean;
  authFails?: boolean;
  now?: string;
  schemeId?: string;
  fee?: number | null;
}

async function issue(s: Scenario) {
  sharedFake.reset({
    ...buildingRows(s.state),
    Meeting: s.meeting === null ? [] : [meetingRow(s.state, s.meeting ?? {})],
    AgendaItem: itemRows(s.state, "m1", s.items ?? CATEGORIES[s.state]),
    Notice: s.notices ?? [],
    NoticeRecipient: [],
    MeetingEvent: [],
    MeetingRuleSet: s.ruleSetRows ?? [],
  });
  access.length = 0;
  calls.length = 0;
  control.authFails = !!s.authFails;
  control.hasFee = !!s.hasFee;
  vi.setSystemTime(new Date(s.now ?? NOW));
  const result = await issueNoticeAction(s.schemeId ?? `s-${s.state}`, "m1", s.fee ?? null);
  const out = {
    result,
    notices: sharedFake.table("Notice"),
    recipients: sharedFake.table("NoticeRecipient"),
    events: sharedFake.table("MeetingEvent"),
    meeting: sharedFake.table("Meeting")[0]?.status ?? null,
    calls: [...calls],
    access: [...access],
  };
  // The fake's row ids count up across the whole file: shown without the number, so one scenario never moves another.
  return JSON.parse(JSON.stringify(out).replace(/fake-([A-Za-z]+)-\d+/g, "fake-$1-#")) as unknown;
}

describe("issueNoticeAction (golden)", () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
  });
  afterAll(() => {
    vi.useRealTimers();
  });
  beforeEach(() => {
    control.authFails = false;
    control.hasFee = false;
  });

  for (const state of ["NSW", "QLD"] as const) {
    it(`${state}: every meeting type, compliant and short`, async () => {
      const out: Record<string, unknown> = {};
      const starts = {
        far: "2026-11-02T08:00:00.000Z",
        short: "2026-10-05T08:00:00.000Z",
        // Exactly 21, 14, 7 and 3 calendar days on in the building's zone, and the day before each.
        d21: "2026-10-24T08:00:00.000Z",
        d20: "2026-10-23T08:00:00.000Z",
        d14: "2026-10-17T08:00:00.000Z",
        d13: "2026-10-16T08:00:00.000Z",
        d7: "2026-10-10T08:00:00.000Z",
        d6: "2026-10-09T08:00:00.000Z",
        d3: "2026-10-06T08:00:00.000Z",
        d2: "2026-10-05T02:00:00.000Z",
      };
      // For each type: far, short, and its own boundary (the day it is met and the day before).
      const boundary: Record<string, (keyof typeof starts)[]> = {
        AGM: state === "NSW" ? ["d14", "d13"] : ["d21", "d20"],
        EGM: state === "NSW" ? ["d7", "d6"] : ["d21", "d20"],
        COMMITTEE: state === "NSW" ? ["d3", "d2"] : ["d7", "d6"],
        FIRST_AGM: state === "NSW" ? ["d14", "d13"] : ["d21", "d20"],
        SGM: state === "NSW" ? ["d7", "d6"] : ["d21", "d20"],
        OTHER: ["d3"],
      };
      for (const type of ["AGM", "EGM", "COMMITTEE", "FIRST_AGM", "SGM", "OTHER"]) {
        for (const label of ["far", "short", ...boundary[type]] as (keyof typeof starts)[]) {
          const start = starts[label];
          out[`${type} ${label}`] = await issue({ state, meeting: { meetingType: type, startTime: start, scheduledAt: start }, fee: type === "EGM" || type === "SGM" ? 5500 : null });
        }
      }
      expect(out).toMatchSnapshot();
    });

    it(`${state}: zones, revised notices, fees, a stored rule set and the committee agenda`, async () => {
      const out: Record<string, unknown> = {};
      out.noMeetingZone = await issue({ state, meeting: { timezone: null, startTime: "2026-10-16T13:30:00.000Z", scheduledAt: "2026-10-16T13:30:00.000Z" } });
      out.unknownMeetingZone = await issue({ state, meeting: { timezone: "Not/AZone" } });
      out.otherMeetingZone = await issue({ state, meeting: { timezone: "Australia/Perth", startTime: "2026-10-16T15:30:00.000Z", scheduledAt: "2026-10-16T15:30:00.000Z" } });
      out.startTimeMissing = await issue({ state, meeting: { startTime: null, scheduledAt: "2026-10-20T08:00:00.000Z" } });
      out.afterDaylightSaving = await issue({ state, now: "2026-10-04T13:30:00.000Z", meeting: { startTime: "2026-10-18T13:30:00.000Z", scheduledAt: "2026-10-18T13:30:00.000Z" } });
      out.revised = await issue({
        state,
        meeting: { status: "NOTICE_ISSUED" },
        notices: [{ id: "n-old", meetingId: "m1", version: 1, status: "ISSUED", noticePeriodDays: 14, compliant: true }],
      });
      out.adjourned = await issue({
        state,
        meeting: { status: "ADJOURNED", meetingType: "AGM" },
        notices: [{ id: "n-old", meetingId: "m1", version: 2, status: "ISSUED", noticePeriodDays: 21, compliant: false }],
        fee: 5500,
      });
      out.adjournedCommittee = await issue({ state, meeting: { status: "ADJOURNED", meetingType: "COMMITTEE" } });
      out.egmFeeAlreadyCharged = await issue({ state, meeting: { meetingType: "EGM" }, hasFee: true });
      out.legacyScheduled = await issue({ state, meeting: { status: "SCHEDULED" } });
      out.committeeOrdinary = await issue({ state, meeting: { meetingType: "COMMITTEE", startTime: "2026-10-05T08:00:00.000Z", scheduledAt: "2026-10-05T08:00:00.000Z" }, items: ["ORDINARY"] });
      out.storedRuleSet = await issue({
        state,
        meeting: { startTime: "2026-10-20T08:00:00.000Z", scheduledAt: "2026-10-20T08:00:00.000Z" },
        ruleSetRows: [
          {
            id: "rs1",
            state,
            version: `${state}-stored`,
            isActive: true,
            effectiveFrom: "2026-01-01",
            noticePeriods: { AGM: 21, EGM: 10, COMMITTEE: 5 },
            minutesDeadlines: {},
            quorumRules: {},
            resolutionCategories: RULES[state].resolutionCategories,
            retention: null,
            preMeetingEvoting: null,
            notes: null,
          },
        ],
      });
      expect(out).toMatchSnapshot();
    });

    it(`${state}: refusals`, async () => {
      const out: Record<string, unknown> = {};
      out.noItems = await issue({ state, items: [] });
      out.inProgress = await issue({ state, meeting: { status: "IN_PROGRESS" } });
      out.published = await issue({ state, meeting: { status: "PUBLISHED" } });
      out.cancelled = await issue({ state, meeting: { status: "CANCELLED" } });
      out.otherBuilding = await issue({ state, schemeId: "s-other" });
      out.noMeeting = await issue({ state, meeting: null });
      out.deletedMeeting = await issue({ state, meeting: { deletedAt: "2026-10-01T00:00:00.000Z" } });
      out.authFails = await issue({ state, authFails: true });
      expect(out).toMatchSnapshot();
    });
  }
});

describe("validateMeetingSetup and buildSetupPreview (golden)", () => {
  it("gives the same warnings, errors and preview", () => {
    const out: Record<string, unknown> = {};
    const nows = ["2026-10-02T23:30:00.000Z", "2026-10-03T14:30:00.000Z", "2026-10-04T13:30:00.000Z"];
    for (const state of ["NSW", "QLD"] as const) {
      const ruleSet = RULES[state];
      for (const now of nows) {
        out[`${state} preview ${now}`] = buildSetupPreview(ruleSet, new Date(now));
        for (const type of [...MEETING_TYPES, "SGM", "agm", "BOGUS", ""]) {
          for (const days of [-1, 0, 2, 3, 6, 7, 13, 14, 20, 21]) {
            for (const zone of ["Australia/Sydney", "Australia/Brisbane", null, "Not/AZone"]) {
              const start = new Date(Date.parse(now) + days * DAY).toISOString();
              out[`${state} ${now.slice(0, 16)} ${type || "(none)"} +${days} ${zone}`] = JSON.stringify(
                validateMeetingSetup(
                  { schemeId: "s1", title: "Meeting", meetingType: type, startTime: start, timezone: zone, format: "IN_PERSON", location: "Room" },
                  ruleSet,
                  new Date(now),
                ),
              );
            }
          }
        }
      }
      const now = new Date(nows[0]);
      const base = { schemeId: "s1", title: "Meeting", meetingType: "AGM", startTime: "2026-11-02T08:00:00.000Z", timezone: ZONES[state] };
      out[`${state} errors`] = {
        noTitle: validateMeetingSetup({ ...base, title: "  " }, ruleSet, now),
        noType: validateMeetingSetup({ ...base, meetingType: "" }, ruleSet, now),
        noStart: validateMeetingSetup({ ...base, startTime: "" }, ruleSet, now),
        badStart: validateMeetingSetup({ ...base, startTime: "not a date" }, ruleSet, now),
        endBeforeStart: validateMeetingSetup({ ...base, endTime: "2026-11-02T07:00:00.000Z" }, ruleSet, now),
        virtualNoLink: validateMeetingSetup({ ...base, format: "VIRTUAL" }, ruleSet, now),
        hybridNothing: validateMeetingSetup({ ...base, format: "HYBRID" }, ruleSet, now),
        inPersonNoPlace: validateMeetingSetup({ ...base, format: "IN_PERSON", location: " " }, ruleSet, now),
        shortAndErrors: validateMeetingSetup({ ...base, title: "", startTime: "2026-10-04T08:00:00.000Z", format: "VIRTUAL" }, ruleSet, now),
      };
    }
    expect(out).toMatchSnapshot();
  });
});

describe("NoticeSection markup (golden)", () => {
  it("renders every state the same", () => {
    const recipients = [
      { name: "Ann One", email: "one@example.com", deliveryOutcome: "SENT" },
      { name: null, email: "two@example.com", deliveryOutcome: "PENDING" },
      { name: null, email: null, deliveryOutcome: "BOUNCED" },
    ];
    const fee = {
      code: "MEETING_EGM",
      variant: null,
      description: "Extraordinary general meeting",
      explanation: "A flat fee for each extraordinary or adjourned general meeting.",
      exGstCents: 5000,
      gstCents: 500,
      totalCents: 5500,
      payerLabel: "Owners corporation",
      recoverableFromOwner: false,
    };
    const base = {
      schemeId: "s1",
      meetingId: "m1",
      canIssue: true,
      agendaItemCount: 3,
      recipientCount: 2,
      noticePeriod: { requiredDays: 14, actualDays: 20, compliant: true },
      notices: [] as Array<{ id: string; version: number; status: string; issuedAt: string; compliant: boolean; recipients: typeof recipients }>,
      timeZone: "Australia/Sydney",
    };
    const issued = (version: number, compliant: boolean, issuedAt = "2026-10-03T13:30:00.000Z") => ({ id: `n${version}`, version, status: "ISSUED", issuedAt, compliant, recipients });
    const cases: Record<string, Parameters<typeof NoticeSection>[0]> = {
      noItems: { ...base, agendaItemCount: 0 },
      compliant: base,
      short: { ...base, noticePeriod: { requiredDays: 14, actualDays: 5, compliant: false } },
      exactlyMet: { ...base, noticePeriod: { requiredDays: 7, actualDays: 7, compliant: true } },
      noRequiredDays: { ...base, noticePeriod: { requiredDays: null, actualDays: 0, compliant: true } },
      noPeriod: { ...base, noticePeriod: null },
      oneRecipient: { ...base, recipientCount: 1 },
      cannotIssue: { ...base, canIssue: false },
      withFee: { ...base, fee },
      withFeeCannotIssue: { ...base, fee, canIssue: false },
      issuedCompliant: { ...base, notices: [issued(1, true)] },
      issuedShort: { ...base, notices: [issued(1, false)] },
      issuedBrisbane: { ...base, timeZone: "Australia/Brisbane", notices: [issued(1, true)] },
      revisedTwice: { ...base, notices: [issued(3, false, "2026-10-04T13:30:00.000Z"), issued(2, true), issued(1, true)] },
      issuedCannotIssue: { ...base, canIssue: false, notices: [issued(1, true)] },
      issuedWithFee: { ...base, fee, notices: [issued(1, true)] },
      issuedNoRecipients: { ...base, notices: [{ ...issued(1, true), recipients: [] }] },
    };
    const out: Record<string, string> = {};
    for (const [name, props] of Object.entries(cases)) out[name] = renderToStaticMarkup(<NoticeSection {...props} />);
    expect(out).toMatchSnapshot();
  });
});
