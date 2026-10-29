/**
 * NSW and Queensland carried resolutions in finance, golden (VIC, ACT and WA
 * stage 2, PR 8b-i, 29 Oct 2026). Recorded on origin/main (b01f8e4) in a
 * temporary worktree, before pending resolutions (VIC s 97, VIC s 78 and ACT
 * sch 3 ss 3.10-3.11) were added. NSW and Queensland must give exactly the
 * same pickers, checks, words, days and database reads after that change.
 * Never regenerate these snapshots to make a change pass: a difference is a
 * change to NSW or Queensland.
 *
 * Covered: resolutionMeetings (every meeting type, the AGM narrowing, the
 * meeting's own zone, the building's, and an unknown zone), every branch of
 * generalMeetingResolutionProblem, resolutionOfKindProblem for each kind,
 * meetingDay, and agenda items with every status and outcome pair, including
 * INTERIM and OPEN, to pin that only CARRIED or RESOLVED counts as carried.
 * Every database read is logged (model, call chain and terminal).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const access = vi.hoisted(() => [] as string[]);

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
  const db = {
    orm: {
      public: new Proxy({}, { get: (_t, model: string) => chain((sharedFake.db.orm.public as Record<string, object>)[model], model) }),
    },
    transaction: (...a: unknown[]) => {
      access.push("transaction");
      return (sharedFake.db.transaction as (...x: unknown[]) => unknown)(...a);
    },
  };
  return { db };
});

const { sharedFake } = await import("@/test/fake-orm");
const R = await import("./resolutions");

const STATUSES = ["PENDING", "CARRIED", "LOST", "DEFERRED", "INTERIM", "OPEN"];
const OUTCOMES = [null, "RESOLVED", "MOTION_LOST", "DEFERRED", "INTERIM", "OPEN"];
const CATEGORIES = [null, "ORDINARY", "SPECIAL", "UNANIMOUS"];

/** One building's meetings and items: every type, three zone cases, and every status, outcome and category on the AGM. */
function seedFor(schemeId: string) {
  const meetings = [
    { id: `${schemeId}-agm`, schemeId, title: "Annual general meeting", meetingType: "AGM", scheduledAt: "2026-11-20T08:00:00.000Z", timezone: null },
    { id: `${schemeId}-egm`, schemeId, title: "Extraordinary meeting", meetingType: "EGM", scheduledAt: "2026-10-03T14:30:00.000Z", timezone: "Australia/Perth" },
    { id: `${schemeId}-sgm`, schemeId, title: "Special meeting", meetingType: "SGM", scheduledAt: "2026-04-04T13:30:00.000Z", timezone: "Not/AZone" },
    { id: `${schemeId}-first`, schemeId, title: "First AGM", meetingType: "FIRST_AGM", scheduledAt: "2026-01-31T13:15:00.000Z", timezone: "Australia/Brisbane" },
    { id: `${schemeId}-committee`, schemeId, title: "Committee meeting", meetingType: "COMMITTEE", scheduledAt: "2026-06-30T23:00:00.000Z", timezone: null },
    { id: `${schemeId}-empty`, schemeId, title: "Nothing carried", meetingType: "EGM", scheduledAt: "2026-07-01T00:00:00.000Z", timezone: null },
  ];
  const items: Record<string, unknown>[] = [];
  let position = 1;
  for (const status of STATUSES) {
    for (const outcome of OUTCOMES) {
      const category = CATEGORIES[position % CATEGORIES.length];
      items.push({
        id: `${schemeId}-agm-${status}-${outcome ?? "none"}`,
        meetingId: `${schemeId}-agm`,
        position: position++,
        title: `${status} with ${outcome ?? "no outcome"}`,
        status,
        outcome,
        resolutionCategory: category,
      });
    }
  }
  for (const m of meetings.slice(1, 5)) {
    items.push({ id: `${m.id}-carried`, meetingId: m.id, position: 1, title: "Carried item", status: "CARRIED", outcome: "RESOLVED", resolutionCategory: "SPECIAL" });
    items.push({ id: `${m.id}-lost`, meetingId: m.id, position: 2, title: "Lost item", status: "LOST", outcome: "MOTION_LOST", resolutionCategory: "ORDINARY" });
  }
  items.push({ id: `${schemeId}-empty-lost`, meetingId: `${schemeId}-empty`, position: 1, title: "Lost", status: "LOST", outcome: "MOTION_LOST", resolutionCategory: null });
  return { meetings, items };
}

const nsw = seedFor("nsw");
const qld = seedFor("qld");

beforeEach(() => {
  sharedFake.reset({
    Scheme: [
      { id: "nsw", state: "NSW", timeZone: "Australia/Sydney" },
      { id: "qld", state: "QLD", timeZone: "Australia/Brisbane" },
      { id: "other", state: "NSW", timeZone: "Australia/Sydney" },
    ],
    Meeting: [
      ...nsw.meetings,
      ...qld.meetings,
      { id: "other-agm", schemeId: "other", title: "Other AGM", meetingType: "AGM", scheduledAt: "2026-11-20T08:00:00.000Z", timezone: null },
    ],
    AgendaItem: [
      ...nsw.items,
      ...qld.items,
      { id: "other-agm-carried", meetingId: "other-agm", position: 1, title: "Other", status: "CARRIED", outcome: "RESOLVED", resolutionCategory: "SPECIAL" },
    ],
  });
  access.length = 0;
});

async function logged<T>(fn: () => Promise<T>) {
  access.length = 0;
  const result = await fn();
  return { result, access: [...access] };
}

describe.each(["nsw", "qld"])("%s finance resolutions (golden)", (s) => {
  it("lists the general meetings and their carried motions", async () => {
    expect({
      general: await logged(() => R.resolutionMeetings(s)),
      agm: await logged(() => R.resolutionMeetings(s, ["AGM", "FIRST_AGM"])),
      committee: await logged(() => R.resolutionMeetings(s, ["COMMITTEE"])),
      none: await logged(() => R.resolutionMeetings(s, ["NONE"])),
      noBuilding: await logged(() => R.resolutionMeetings("missing")),
    }).toMatchSnapshot();
  });

  it("checks a meeting and motion, every branch, for every status and outcome", async () => {
    const out: Record<string, unknown> = {};
    out.noMeeting = await logged(() => R.generalMeetingResolutionProblem(s, null, `${s}-agm-CARRIED-none`));
    out.noMotion = await logged(() => R.generalMeetingResolutionProblem(s, `${s}-agm`, null));
    out.missingMeeting = await logged(() => R.generalMeetingResolutionProblem(s, "missing", `${s}-agm-CARRIED-none`));
    out.otherBuilding = await logged(() => R.generalMeetingResolutionProblem(s, "other-agm", "other-agm-carried"));
    out.committee = await logged(() => R.generalMeetingResolutionProblem(s, `${s}-committee`, `${s}-committee-carried`));
    out.notAgm = await logged(() => R.generalMeetingResolutionProblem(s, `${s}-egm`, `${s}-egm-carried`, ["AGM", "FIRST_AGM"]));
    out.notAgmThree = await logged(() => R.generalMeetingResolutionProblem(s, `${s}-egm`, `${s}-egm-carried`, ["AGM", "FIRST_AGM", "SGM"]));
    out.missingMotion = await logged(() => R.generalMeetingResolutionProblem(s, `${s}-agm`, "missing"));
    out.motionOtherMeeting = await logged(() => R.generalMeetingResolutionProblem(s, `${s}-agm`, `${s}-egm-carried`));
    for (const item of (s === "nsw" ? nsw : qld).items) {
      const id = String(item.id);
      out[id] = await logged(() => R.generalMeetingResolutionProblem(s, String(item.meetingId), id));
    }
    expect(out).toMatchSnapshot();
  });

  it("checks the kind of resolution", async () => {
    const out: Record<string, unknown> = {};
    const kinds = [
      { kind: "GENERAL_MEETING", words: "resolution at a general meeting" },
      { kind: "ORDINARY", words: "ordinary resolution" },
      { kind: "SPECIAL", words: "special resolution" },
    ] as const;
    for (const kind of kinds) {
      out[`${kind.kind}/noMeeting`] = await logged(() => R.resolutionOfKindProblem(s, null, null, kind));
      out[`${kind.kind}/otherBuilding`] = await logged(() => R.resolutionOfKindProblem(s, "other-agm", "other-agm-carried", kind));
      for (const item of (s === "nsw" ? nsw : qld).items) {
        const id = String(item.id);
        out[`${kind.kind}/${id}`] = await logged(() => R.resolutionOfKindProblem(s, String(item.meetingId), id, kind));
      }
    }
    expect(out).toMatchSnapshot();
  });

  it("gives the day a meeting was held", async () => {
    const out: Record<string, unknown> = {};
    for (const m of (s === "nsw" ? nsw : qld).meetings) out[m.id] = await logged(() => R.meetingDay(s, m.id));
    out.otherBuilding = await logged(() => R.meetingDay(s, "other-agm"));
    out.missing = await logged(() => R.meetingDay(s, "missing"));
    expect(out).toMatchSnapshot();
  });
});

describe("the carried test (golden)", () => {
  it("only CARRIED or RESOLVED counts, never INTERIM or OPEN", async () => {
    const carried: string[] = [];
    for (const item of nsw.items.filter((i) => i.meetingId === "nsw-agm")) {
      if ((await R.generalMeetingResolutionProblem("nsw", "nsw-agm", String(item.id))) === null) carried.push(`${item.status}/${item.outcome}`);
    }
    expect(carried).toMatchSnapshot();
  });

  it("exports the same general meeting types", () => {
    expect(R.GENERAL_MEETING_TYPES).toMatchSnapshot();
  });
});
