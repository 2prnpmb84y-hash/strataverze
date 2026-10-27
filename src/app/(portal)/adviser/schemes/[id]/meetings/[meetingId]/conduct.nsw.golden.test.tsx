/**
 * NSW conduct is unchanged (golden; QLD stage 2, resolution tallies,
 * 27 Oct 2026). Recorded against origin/main before the Queensland tally was
 * added: what recordAgendaOutcomeAction returns, writes and logs for an NSW
 * building, and the conduct section's markup. NSW records no vote counting at
 * conduct, so the chair's outcome is stored as before and nothing else is read.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const state = vi.hoisted(() => ({
  meeting: null as unknown,
  item: null as unknown,
  scheme: null as unknown,
  authFails: false,
  log: [] as unknown[],
}));

vi.mock("next/cache", () => ({ revalidatePath: (p: string) => state.log.push({ revalidate: p }) }));
vi.mock("@/lib/auth/require-access", async () => {
  const { AuthorisationError } = await import("@/lib/auth/require-membership");
  return {
    requireSchemeAccess: vi.fn(async (schemeId: string, capability: string) => {
      state.log.push({ access: [schemeId, capability] });
      if (state.authFails) throw new AuthorisationError("You do not have permission to do this.");
      return { profile: { id: "adviser" } };
    }),
  };
});
vi.mock("@/lib/queries/meetings", () => ({
  getMeetingById: vi.fn(async () => state.meeting),
  updateMeeting: vi.fn(async (...a: unknown[]) => state.log.push({ updateMeeting: a })),
}));
vi.mock("@/lib/queries/schemes", () => ({ getSchemeById: vi.fn(async () => state.scheme) }));
vi.mock("@/lib/queries/agenda", () => ({
  getAgendaItem: vi.fn(async () => state.item),
  updateAgendaItem: vi.fn(async (...a: unknown[]) => state.log.push({ updateAgendaItem: a })),
}));
vi.mock("@/lib/meetings/rule-set-repo", async () => {
  const { MEETING_RULES } = await import("@/config/statutory");
  return { getActiveRuleSet: vi.fn(async (s: string) => (state.log.push({ ruleSet: s }), MEETING_RULES)) };
});
vi.mock("@/lib/meetings/events", () => ({
  recordMeetingEvent: vi.fn(async (e: unknown) => state.log.push({ event: e })),
}));
// Any read of the database itself is logged: NSW conduct makes none.
vi.mock("@/prisma/db", () => ({
  db: new Proxy({}, { get: (_t, k) => (state.log.push({ db: String(k) }), undefined) }),
}));

const { recordAgendaOutcomeAction } = await import("./conduct-actions");
const { ConductSection } = await import("./conduct-section");

const MEETING = { id: "m1", schemeId: "s1", status: "IN_PROGRESS", meetingType: "AGM" };
const SCHEME = { id: "s1", state: "NSW", timeZone: "Australia/Sydney" };

beforeEach(() => {
  state.meeting = MEETING;
  state.scheme = SCHEME;
  state.item = null;
  state.authFails = false;
  state.log = [];
});

async function run(category: string | null, outcome: string) {
  state.log = [];
  state.item = { id: "i1", meetingId: "m1", resolutionCategory: category };
  const result = await recordAgendaOutcomeAction("s1", "m1", "i1", outcome);
  return { result, log: state.log };
}

describe("NSW recordAgendaOutcomeAction (golden)", () => {
  it("stores the chair's outcome for every category and outcome", async () => {
    const out: Record<string, unknown> = {};
    for (const category of ["ORDINARY", "SPECIAL", "UNANIMOUS", "SUSTAINABILITY_INFRASTRUCTURE", "WITHOUT_DISSENT", "MAJORITY", "BOGUS", null]) {
      for (const outcome of ["RESOLVED", "MOTION_LOST", "DEFERRED", "CARRIED"]) {
        out[`${category}/${outcome}`] = await run(category, outcome);
      }
    }
    expect(out).toMatchSnapshot();
  });

  it("refuses as before", async () => {
    const out: Record<string, unknown> = {};
    state.meeting = { ...MEETING, status: "NOTICE_ISSUED" };
    out.notRunning = await run("ORDINARY", "RESOLVED");
    state.meeting = { ...MEETING, schemeId: "other" };
    out.otherBuilding = await run("ORDINARY", "RESOLVED");
    state.meeting = MEETING;
    state.log = [];
    state.item = null;
    out.noItem = { result: await recordAgendaOutcomeAction("s1", "m1", "i1", "RESOLVED"), log: state.log };
    state.scheme = null;
    out.noScheme = await run("ORDINARY", "RESOLVED");
    state.scheme = SCHEME;
    state.authFails = true;
    out.noPermission = await run("ORDINARY", "RESOLVED");
    expect(out).toMatchSnapshot();
  });
});

describe("NSW conduct section (golden)", () => {
  const items = [
    { id: "i1", position: 1, title: "Confirm the minutes", outcome: "RESOLVED" },
    { id: "i2", position: 2, title: "Adopt the budget", outcome: null },
    { id: "i3", position: 3, title: "Repaint the foyer", outcome: "DEFERRED" },
  ];
  it("renders as before", () => {
    const html: Record<string, string> = {};
    for (const status of ["DRAFT", "NOTICE_ISSUED", "IN_PROGRESS", "MINUTES_DRAFT", "PUBLISHED"]) {
      html[status] = renderToStaticMarkup(
        <ConductSection
          schemeId="s1"
          meetingId="m1"
          status={status}
          openedAt={status === "NOTICE_ISSUED" || status === "DRAFT" ? null : "2026-11-20T08:00:00.000Z"}
          closedAt={status === "MINUTES_DRAFT" || status === "PUBLISHED" ? "2026-11-20T09:30:00.000Z" : null}
          items={items}
          timeZone="Australia/Sydney"
        />,
      );
    }
    expect(html).toMatchSnapshot();
  });
});
