/**
 * Notice by motion under the draft packs (VIC, ACT and WA stage 2, PR 8b-iii,
 * 29 Oct 2026). Those states have no buildings yet, so each pack is given
 * here as if it were live.
 * - Issuing: a Victorian committee or Western Australian council meeting's
 *   notice is stored as not compliant with no period, and its event says why
 *   (decision D12); an ACT general meeting with a unanimous resolution on
 *   its agenda needs 21 days, and its event names the categories short of it.
 * - The notice section shows "Notice period not checked", and names the
 *   resolutions needing the longer notice.
 * - The agenda: an ACT unanimous resolution cannot be added once the notice
 *   is issued, by hand, from the library or from a template (decision D13).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const calls = vi.hoisted(() => [] as Array<[string, unknown]>);
const library = vi.hoisted(() => ({ motions: [] as unknown[], template: [] as unknown[] }));

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-access", () => ({ requireSchemeAccess: vi.fn(async () => ({ profile: { id: "adviser" } })) }));
vi.mock("@/lib/vault/sources", () => ({ captureMeetingNotice: vi.fn(async () => undefined) }));
vi.mock("@/lib/notifications", () => ({ notifyMeetingScheduled: vi.fn(async (a: unknown) => calls.push(["notify", a])) }));
vi.mock("@/lib/billing/capture", () => ({ hasFeeEvent: vi.fn(async () => true), assertUsageFeeConfirmed: vi.fn(), captureUsageFee: vi.fn() }));
// The draft packs, given as if live (they have no buildings yet).
vi.mock("@/lib/meetings/rule-set-repo", async () => {
  const { PENDING_RULE_PACKS } = await import("@/config/statutory");
  const { sharedFake } = await import("@/test/fake-orm");
  const of = (s: string) => PENDING_RULE_PACKS[s as "VIC" | "ACT" | "WA"].rules.MEETING_RULES;
  return {
    getActiveRuleSet: vi.fn(async (s: string) => of(s)),
    getActiveRuleSetForScheme: vi.fn(async (id: string) => of(String(sharedFake.table("Scheme").find((r) => r.id === id)?.state))),
  };
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
// The draft packs have no templates or library yet: each test gives its own.
vi.mock("@/lib/meetings/templates", () => ({
  getMotionLibrary: () => library.motions,
  resolveMotion: (e: { title: string; resolutionText: string; defaultResolutionCategory: string | null }) => ({
    title: e.title,
    resolutionText: e.resolutionText,
    explanatoryNote: null,
    resolutionCategory: e.defaultResolutionCategory,
  }),
  resolveAgendaTemplate: () => library.template,
}));

const { sharedFake } = await import("@/test/fake-orm");
const { issueNoticeAction } = await import("./notice-actions");
const { addAgendaItemAction, addMotionFromLibraryAction, loadAgendaTemplateAction } = await import("./agenda-actions");
const { NoticeSection } = await import("./notice-section");
const { PENDING_RULE_PACKS } = await import("@/config/statutory");

const ZONES = { VIC: "Australia/Melbourne", ACT: "Australia/Sydney", WA: "Australia/Perth" } as const;
const NOW = "2026-10-05T23:00:00.000Z";

function seed(state: "VIC" | "ACT" | "WA", meeting: Record<string, unknown>, categories: (string | null)[]) {
  sharedFake.reset({
    Scheme: [
      {
        id: "s1",
        name: "Draft Towers",
        planNumber: "PS 1",
        address: "1 Example Street",
        suburb: "Somewhere",
        state,
        postcode: "3000",
        timeZone: ZONES[state],
        lots: [],
        memberships: [{ profileId: "p1", role: "OWNER", isActive: true, profile: { email: "one@example.com", firstName: "Ann", lastName: "One" } }],
      },
    ],
    SchemeMembership: [{ schemeId: "s1", role: "OWNER", isActive: true, profile: { email: "one@example.com" } }],
    Meeting: [
      {
        id: "m1",
        schemeId: "s1",
        status: "DRAFT",
        title: "Meeting",
        meetingType: "AGM",
        startTime: "2026-11-02T08:00:00.000Z",
        scheduledAt: "2026-11-02T08:00:00.000Z",
        timezone: ZONES[state],
        format: "IN_PERSON",
        location: "Room",
        joinUrl: null,
        joinDetails: null,
        ...meeting,
      },
    ],
    AgendaItem: categories.map((c, i) => ({ id: `i${i + 1}`, meetingId: "m1", position: i + 1, title: `Motion ${i + 1}`, resolutionText: "That it be done.", explanatoryNote: null, resolutionCategory: c })),
    Notice: [],
    NoticeRecipient: [],
    MeetingEvent: [],
  });
}

const notices = () => sharedFake.table("Notice");
const issuedEvent = () => sharedFake.table("MeetingEvent").find((e) => e.eventType === "NOTICE_ISSUED")?.payload as Record<string, unknown> | undefined;
const startIn = (days: number) => new Date(Date.parse(NOW) + days * 24 * 60 * 60 * 1000).toISOString();

describe("issuing a notice under the draft packs", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(NOW));
    calls.length = 0;
  });

  it("stores a Victorian committee or Western Australian council meeting's notice as not compliant with no period, and says why (D12)", async () => {
    for (const state of ["VIC", "WA"] as const) {
      for (const days of [1, 30]) {
        seed(state, { meetingType: "COMMITTEE", startTime: startIn(days), scheduledAt: startIn(days) }, ["ORDINARY"]);
        expect(await issueNoticeAction("s1", "m1"), `${state} ${days}`).toEqual({ ok: true });
        expect(notices()).toHaveLength(1);
        expect(notices()[0]).toMatchObject({ status: "ISSUED", version: 1, compliant: false, noticePeriodDays: null });
        expect(issuedEvent()).toEqual({
          version: 1,
          compliant: false,
          recipientCount: 1,
          notChecked: PENDING_RULE_PACKS[state].rules.MEETING_RULES.noticeNotCheckedFor?.COMMITTEE,
        });
      }
    }
  });

  it("checks their general meetings as before, with nothing added to the event", async () => {
    for (const state of ["VIC", "WA"] as const) {
      seed(state, { startTime: startIn(13), scheduledAt: startIn(13) }, ["SPECIAL", "UNANIMOUS"]);
      expect(await issueNoticeAction("s1", "m1")).toEqual({ ok: true });
      expect(notices()[0]).toMatchObject({ compliant: false, noticePeriodDays: 14 });
      expect(issuedEvent()).toEqual({ version: 1, compliant: false, recipientCount: 1 });
    }
  });

  it("needs 21 days for an ACT general meeting with a unanimous resolution on the agenda, and names it when short (D13)", async () => {
    seed("ACT", { startTime: startIn(20), scheduledAt: startIn(20) }, ["ORDINARY", "UNANIMOUS"]);
    expect(await issueNoticeAction("s1", "m1")).toEqual({ ok: true });
    expect(notices()[0]).toMatchObject({ compliant: false, noticePeriodDays: 21 });
    expect(issuedEvent()).toEqual({ version: 1, compliant: false, recipientCount: 1, shortFor: ["UNANIMOUS"] });

    seed("ACT", { startTime: startIn(21), scheduledAt: startIn(21) }, ["ORDINARY", "UNANIMOUS"]);
    expect(await issueNoticeAction("s1", "m1")).toEqual({ ok: true });
    expect(notices()[0]).toMatchObject({ compliant: true, noticePeriodDays: 21 });
    expect(issuedEvent()).toEqual({ version: 1, compliant: true, recipientCount: 1 });

    // Without one, 14 days as before.
    seed("ACT", { startTime: startIn(14), scheduledAt: startIn(14) }, ["ORDINARY", "SPECIAL"]);
    expect(await issueNoticeAction("s1", "m1")).toEqual({ ok: true });
    expect(notices()[0]).toMatchObject({ compliant: true, noticePeriodDays: 14 });
    expect(issuedEvent()).toEqual({ version: 1, compliant: true, recipientCount: 1 });
  });
});

describe("the notice section under the draft packs", () => {
  const base = {
    schemeId: "s1",
    meetingId: "m1",
    canIssue: true,
    agendaItemCount: 2,
    recipientCount: 1,
    notices: [],
    timeZone: "Australia/Melbourne",
  };
  const reason = PENDING_RULE_PACKS.VIC.rules.MEETING_RULES.noticeNotCheckedFor!.COMMITTEE!;
  /** The markup with its apostrophes as typed. */
  const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el).replace(/&#x27;/g, "'");

  it("shows a notice period not checked before and after issuing, never as met", () => {
    const before = render(<NoticeSection {...base} noticePeriod={{ requiredDays: null, actualDays: 3, compliant: false, notChecked: reason }} />);
    expect(before).toContain(`Notice period not checked. ${reason}. Check the notice period yourself before you issue the notice.`);
    expect(before).not.toMatch(/meets the|short of the/);
    const after = render(
      <NoticeSection
        {...base}
        noticePeriod={{ requiredDays: null, actualDays: 3, compliant: false, notChecked: reason }}
        notices={[{ id: "n1", version: 1, status: "ISSUED", issuedAt: NOW, compliant: false, periodNotChecked: true, recipients: [] }]}
      />,
    );
    expect(after).toContain(">Notice period not checked<");
    expect(after).toContain(`${reason}.`);
    expect(after).not.toMatch(/Notice period met|Short notice/);
    // A short notice (with a period) still says so.
    const short = renderToStaticMarkup(<NoticeSection {...base} noticePeriod={null} notices={[{ id: "n1", version: 1, status: "ISSUED", issuedAt: NOW, compliant: false, recipients: [] }]} />);
    expect(short).toContain(">Short notice<");
  });

  it("names the resolutions needing the longer notice when it is short", () => {
    const html = renderToStaticMarkup(<NoticeSection {...base} noticePeriod={{ requiredDays: 21, actualDays: 15, compliant: false, shortFor: ["Unanimous Resolution", "Unopposed Resolution"] }} />);
    expect(html).toContain("The meeting is only 15 days away, short of the 21-day notice period.");
    expect(html).toContain("The longer period is needed for the Unanimous Resolution and Unopposed Resolution on the agenda, which cannot be recorded as resolved at the meeting unless the notice gives it.");
    expect(html).not.toMatch(/[;–—]/);
    const met = renderToStaticMarkup(<NoticeSection {...base} noticePeriod={{ requiredDays: 21, actualDays: 21, compliant: true }} />);
    expect(met).toContain("which meets the 21-day notice period.");
    expect(met).not.toContain("The longer period");
  });
});

describe("the agenda under the draft packs (D13)", () => {
  const form = (category: string) => {
    const f = new FormData();
    f.set("title", "Insurance exemption");
    f.set("resolutionText", "That the building insurance exemption be agreed.");
    f.set("resolutionCategory", category);
    return f;
  };
  const added = () => sharedFake.table("AgendaItem").filter((a) => a.title === "Insurance exemption");
  const lateWords = /^A unanimous resolution needs at least 21 days' notice, given with the notice of the meeting, so it cannot be added once the notice is issued\. Nothing was saved\.$/;

  beforeEach(() => {
    library.motions = [{ key: "insurance", title: "Insurance exemption", resolutionText: "That it be agreed.", defaultResolutionCategory: "UNANIMOUS" }];
    library.template = [];
  });

  it("adds an ACT unanimous resolution before the notice is issued", async () => {
    for (const status of ["DRAFT", "SCHEDULED"]) {
      seed("ACT", { status }, ["ORDINARY"]);
      expect(await addAgendaItemAction("s1", "m1", {}, form("UNANIMOUS"))).toEqual({});
      expect(added()).toHaveLength(1);
      expect(await addMotionFromLibraryAction("s1", "m1", "insurance")).toEqual({});
      expect(added()).toHaveLength(2);
    }
  });

  it("refuses one once the notice is issued, by hand or from the library, writing nothing", async () => {
    for (const status of ["NOTICE_ISSUED", "ADJOURNED", "IN_PROGRESS"]) {
      seed("ACT", { status }, ["ORDINARY"]);
      expect(await addAgendaItemAction("s1", "m1", {}, form("UNANIMOUS"))).toEqual({ fieldErrors: { resolutionCategory: expect.stringMatching(lateWords) } });
      expect(await addMotionFromLibraryAction("s1", "m1", "insurance")).toEqual({ error: expect.stringMatching(lateWords) });
      expect(added()).toHaveLength(0);
      expect(sharedFake.table("MeetingEvent")).toHaveLength(0);
      // Other categories are added as before (the server has no status guard for them).
      expect(await addAgendaItemAction("s1", "m1", {}, form("SPECIAL"))).toEqual({});
    }
  });

  it("refuses a template with one once the notice is issued (all its items deleted after), writing nothing", async () => {
    library.template = [
      { position: 1, title: "Budget", resolutionText: "That the budget be adopted.", explanatoryNote: null, resolutionCategory: "ORDINARY" },
      { position: 2, title: "Insurance exemption", resolutionText: "That it be agreed.", explanatoryNote: null, resolutionCategory: "UNANIMOUS" },
    ];
    seed("ACT", { status: "NOTICE_ISSUED" }, []);
    expect(await loadAgendaTemplateAction("s1", "m1")).toEqual({ error: expect.stringMatching(lateWords) });
    expect(sharedFake.table("AgendaItem")).toHaveLength(0);
    seed("ACT", { status: "DRAFT" }, []);
    expect(await loadAgendaTemplateAction("s1", "m1")).toEqual({});
    expect(sharedFake.table("AgendaItem")).toHaveLength(2);
  });

  it("still refuses an unopposed resolution on any agenda, and a unanimous one on an executive committee's", async () => {
    seed("ACT", { status: "DRAFT" }, []);
    expect((await addAgendaItemAction("s1", "m1", {}, form("UNOPPOSED"))).fieldErrors?.resolutionCategory).toBe("Select a valid resolution category.");
    seed("ACT", { status: "DRAFT", meetingType: "COMMITTEE" }, []);
    expect((await addAgendaItemAction("s1", "m1", {}, form("UNANIMOUS"))).fieldErrors?.resolutionCategory).toMatch(/^Only an ordinary resolution/);
    expect(added()).toHaveLength(0);
  });
});
