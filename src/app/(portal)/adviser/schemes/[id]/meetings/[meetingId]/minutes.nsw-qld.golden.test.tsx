/**
 * NSW and Queensland minutes, golden (VIC, ACT and WA stage 2, PR 8b-iv,
 * 29 Oct 2026). Recorded on origin/main (d32c6bb) in a temporary worktree,
 * before the minutes content of the draft packs (the kind of resolution, the
 * votes per item and the later effect of a resolution decided later) was
 * added. NSW and Queensland must give exactly the same content, rows, calls,
 * database reads and writes and markup after that change. Never regenerate
 * these snapshots to make a change pass: a difference is a change to NSW or
 * Queensland.
 *
 * Covered: assembleMinutesContent for every meeting type (and one not
 * known), with the clock fixed; assembleMinutesAction for an NSW and a
 * Queensland building (what it returns, the minutes row created, the
 * MINUTES_DRAFTED event, the calls out and every database read and write),
 * with items of every outcome NSW and Queensland store, a second version, and
 * its refusals; and the MinutesSection markup for each state of the minutes
 * with every outcome.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const access = vi.hoisted(() => [] as string[]);
const calls = vi.hoisted(() => [] as Array<[string, unknown]>);
const control = vi.hoisted(() => ({ authFails: false }));

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
  captureConfirmedMinutes: vi.fn(async (...a: unknown[]) => calls.push(["captureConfirmedMinutes", a])),
}));
vi.mock("@/lib/notifications", () => ({
  notifyMeetingScheduled: vi.fn(async (a: unknown) => calls.push(["notifyMeetingScheduled", a])),
}));

const { sharedFake } = await import("@/test/fake-orm");
const { assembleMinutesAction } = await import("./minutes-actions");
const { MinutesSection } = await import("./minutes-section");
const { assembleMinutesContent } = await import("@/lib/meetings/minutes");
const { rulePackFor } = await import("@/config/statutory");

const STATES = ["NSW", "QLD"] as const;
const ZONES = { NSW: "Australia/Sydney", QLD: "Australia/Brisbane" } as const;
const NOW = "2026-11-21T02:00:00.000Z";
const MEETING_TYPES = ["AGM", "FIRST_AGM", "EGM", "SGM", "COMMITTEE", "SOMETHING_ELSE"];
/** Every outcome NSW and Queensland store on an agenda item, and none. */
const OUTCOMES = ["RESOLVED", "MOTION_LOST", "DEFERRED", null] as const;

beforeEach(() => {
  control.authFails = false;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
});

describe("assembleMinutesContent (golden)", () => {
  it("gives the same content for every meeting type", () => {
    const out: Record<string, unknown> = {};
    for (const state of STATES) {
      const terms = rulePackFor(state)!.rules.TERMINOLOGY;
      for (const type of MEETING_TYPES) {
        out[`${state}/${type}`] = assembleMinutesContent(
          {
            scheme: { name: "Golden Towers", planNumber: "SP 12345" },
            meeting: {
              title: `${type} 2026`,
              meetingType: type,
              startTime: "2026-11-20T08:00:00.000Z",
              openedAt: type === "COMMITTEE" ? null : "2026-11-20T08:05:00.000Z",
              closedAt: type === "COMMITTEE" ? null : "2026-11-20T09:30:00.000Z",
            },
            items: OUTCOMES.map((outcome, i) => ({
              position: i + 1,
              title: `Item ${i + 1}`,
              resolutionText: i % 2 ? null : `That the owners resolve item ${i + 1}.`,
              explanatoryNote: i === 0 ? "A note." : null,
              outcome,
            })),
          },
          terms,
        );
      }
    }
    expect(out).toMatchSnapshot();
  });
});

const ITEMS = [
  { id: "i1", meetingId: "m1", position: 1, title: "Confirm the minutes", resolutionText: "That the minutes be confirmed.", explanatoryNote: null, resolutionCategory: "ORDINARY", outcome: "RESOLVED", status: "CARRIED" },
  { id: "i2", meetingId: "m1", position: 2, title: "Adopt the budget", resolutionText: "That the budget be adopted.", explanatoryNote: "See the budget.", resolutionCategory: "ORDINARY", outcome: "MOTION_LOST", status: "LOST" },
  { id: "i3", meetingId: "m1", position: 3, title: "Repaint the foyer", resolutionText: null, explanatoryNote: null, resolutionCategory: "SPECIAL", outcome: "DEFERRED", status: "DEFERRED" },
  { id: "i4", meetingId: "m1", position: 4, title: "General business", resolutionText: null, explanatoryNote: null, resolutionCategory: null, outcome: null, status: "PENDING" },
];

function seed(state: "NSW" | "QLD", opts: { meeting?: Record<string, unknown> | null; minutes?: Record<string, unknown>[]; scheme?: boolean } = {}) {
  sharedFake.reset({
    Scheme:
      opts.scheme === false
        ? []
        : [{ id: "s1", name: "Golden Towers", planNumber: "SP 12345", state, timeZone: ZONES[state], totalLots: 2, lots: [], memberships: [], funds: [], bankAccounts: [], images: [] }],
    Meeting:
      opts.meeting === null
        ? []
        : [
            {
              id: "m1",
              schemeId: "s1",
              title: "Annual general meeting 2026",
              meetingType: "AGM",
              status: "MINUTES_DRAFT",
              scheduledAt: "2026-11-20T08:00:00.000Z",
              startTime: "2026-11-20T08:00:00.000Z",
              openedAt: "2026-11-20T08:05:00.000Z",
              closedAt: "2026-11-20T09:30:00.000Z",
              deletedAt: null,
              motions: [],
              ...(opts.meeting ?? {}),
            },
          ],
    AgendaItem: ITEMS.map((i) => ({ ...i })),
    Minutes: opts.minutes ?? [],
    MeetingEvent: [
      { id: "e1", meetingId: "m1", eventType: "AGENDA_OUTCOME_RECORDED", payload: { itemId: "i1", outcome: "RESOLVED" }, createdAt: "2026-11-20T08:30:00.000Z" },
    ],
  });
}

async function run(state: "NSW" | "QLD", opts: Parameters<typeof seed>[1] = {}) {
  seed(state, opts);
  access.length = 0;
  calls.length = 0;
  const result = await assembleMinutesAction("s1", "m1");
  const created = JSON.stringify({ minutes: sharedFake.table("Minutes"), events: sharedFake.table("MeetingEvent") });
  // Fake ids are numbered across the whole run: shown in the order they appear.
  const seen = new Map<string, string>();
  const normalise = (s: string) =>
    s.replace(/fake-[A-Za-z]+-\d+/g, (id) => {
      if (!seen.has(id)) seen.set(id, `<id ${seen.size + 1}>`);
      return seen.get(id)!;
    });
  return { result, written: JSON.parse(normalise(created)), calls: [...calls], access: access.map(normalise) };
}

describe("assembleMinutesAction (golden)", () => {
  for (const state of STATES) {
    it(`${state}: returns, writes and reads as before`, async () => {
      const out: Record<string, unknown> = {};
      out.first = await run(state);
      out.secondVersion = await run(state, { minutes: [{ id: "mn1", meetingId: "m1", version: 1, state: "DRAFT", content: {} }] });
      out.committee = await run(state, { meeting: { meetingType: "COMMITTEE", startTime: null, openedAt: null, closedAt: null } });
      out.confirmed = await run(state, { minutes: [{ id: "mn1", meetingId: "m1", version: 1, state: "CONFIRMED", content: {} }] });
      out.noMeeting = await run(state, { meeting: null });
      out.otherBuildingsMeeting = await run(state, { meeting: { schemeId: "s2" } });
      out.noScheme = await run(state, { scheme: false });
      control.authFails = true;
      out.noPermission = await run(state);
      expect(out).toMatchSnapshot();
    });
  }
});

describe("MinutesSection (golden)", () => {
  it("renders each state with every outcome as before", () => {
    const content = (state: "NSW" | "QLD") =>
      assembleMinutesContent(
        {
          scheme: { name: "Golden Towers", planNumber: "SP 12345" },
          meeting: {
            title: "Annual general meeting 2026",
            meetingType: "AGM",
            startTime: "2026-11-20T08:00:00.000Z",
            openedAt: "2026-11-20T08:05:00.000Z",
            closedAt: "2026-11-20T09:30:00.000Z",
          },
          items: ITEMS.map((i) => ({ position: i.position, title: i.title, resolutionText: i.resolutionText, explanatoryNote: i.explanatoryNote, outcome: i.outcome })),
        },
        rulePackFor(state)!.rules.TERMINOLOGY,
      ) as unknown as Record<string, unknown>;
    const views = (state: "NSW" | "QLD") => ({
      none: null,
      draft: { state: "DRAFT", version: 1, confirmedAt: null, distributedAt: null, retentionUntil: null, content: content(state) },
      confirmed: { state: "CONFIRMED", version: 2, confirmedAt: "2026-11-25T01:00:00.000Z", distributedAt: null, retentionUntil: null, content: content(state) },
      published: {
        state: "CONFIRMED",
        version: 2,
        confirmedAt: "2026-11-25T01:00:00.000Z",
        distributedAt: "2026-11-26T01:00:00.000Z",
        retentionUntil: "2033-11-20",
        content: content(state),
      },
      openedOnly: {
        state: "DRAFT",
        version: 1,
        confirmedAt: null,
        distributedAt: null,
        retentionUntil: null,
        content: { ...content(state), meeting: { title: "x", openedAt: "2026-11-20T08:05:00.000Z", closedAt: null } },
      },
      emptyContent: { state: "DRAFT", version: 1, confirmedAt: null, distributedAt: null, retentionUntil: null, content: {} },
      otherState: { state: "ARCHIVED", version: 3, confirmedAt: null, distributedAt: null, retentionUntil: null, content: content(state) },
    });
    const deadlines = {
      none: null,
      due: { dueDate: "2026-12-04T08:00:00.000Z", overdue: false },
      overdue: { dueDate: "2026-11-21T00:00:00.000Z", overdue: true },
    };
    const html: Record<string, string> = {};
    for (const state of STATES) {
      for (const [viewName, minutes] of Object.entries(views(state))) {
        for (const canAssemble of [true, false]) {
          for (const [deadlineName, deadline] of Object.entries(deadlines)) {
            html[`${state}/${viewName}/${canAssemble ? "canAssemble" : "cannotAssemble"}/${deadlineName}`] = renderToStaticMarkup(
              <MinutesSection
                schemeId="s1"
                meetingId="m1"
                canAssemble={canAssemble}
                minutes={minutes}
                deadline={deadline}
                timeZone={ZONES[state]}
              />,
            );
          }
        }
      }
    }
    expect(html).toMatchSnapshot();
  });
});
