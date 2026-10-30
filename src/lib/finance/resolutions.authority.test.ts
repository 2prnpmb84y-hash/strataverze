/**
 * The resolution a debt recovery decision relies on (VIC, ACT and WA stage 2,
 * PR 9a): authorityResolution and authorityResolutionProblem, against the
 * in-memory database. Western Australia accepts a motion carried at a council
 * meeting or a general meeting (decision D9); the strata manager alone is
 * refused. Fixtures cover a committee kind (the ACT) and a special resolution
 * at a general meeting (Victoria).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));

const { sharedFake } = await import("@/test/fake-orm");
const { authorityResolution, authorityResolutionProblem } = await import("./resolutions");

type Kind = Parameters<typeof authorityResolution>[3][number];
const COUNCIL: Kind = { meeting: "COMMITTEE", kind: "ANY", words: "a motion carried at a council meeting" };
const GENERAL: Kind = { meeting: "GENERAL", kind: "ANY", words: "a motion carried at a general meeting" };
const WA = [COUNCIL, GENERAL];

beforeEach(() => {
  sharedFake.reset({
    Scheme: [
      { id: "s1", state: "WA", timeZone: "Australia/Perth" },
      { id: "s2", state: "WA", timeZone: "Australia/Perth" },
    ],
    Meeting: [
      { id: "council", schemeId: "s1", meetingType: "COMMITTEE", status: "MINUTES_DRAFT", title: "Council meeting", scheduledAt: "2026-10-20T02:00:00.000Z", timezone: null },
      { id: "agm", schemeId: "s1", meetingType: "AGM", status: "PUBLISHED", title: "AGM", scheduledAt: "2026-10-10T02:00:00.000Z", timezone: null },
      { id: "other", schemeId: "s2", meetingType: "COMMITTEE", status: "PUBLISHED", title: "Other council", scheduledAt: "2026-10-20T02:00:00.000Z", timezone: null },
      { id: "odd", schemeId: "s1", meetingType: "WORKSHOP", status: "PUBLISHED", title: "Workshop", scheduledAt: "2026-10-20T02:00:00.000Z", timezone: null },
      { id: "cancelled", schemeId: "s1", meetingType: "COMMITTEE", status: "CANCELLED", title: "Cancelled council", scheduledAt: "2026-10-21T02:00:00.000Z", timezone: null },
      { id: "deleted", schemeId: "s1", meetingType: "COMMITTEE", status: "PUBLISHED", deletedAt: "2026-10-25T00:00:00.000Z", title: "Deleted council", scheduledAt: "2026-10-21T02:00:00.000Z", timezone: null },
      { id: "adjourned", schemeId: "s1", meetingType: "AGM", status: "ADJOURNED", title: "Adjourned AGM", scheduledAt: "2026-10-21T02:00:00.000Z", timezone: null },
      { id: "draft", schemeId: "s1", meetingType: "COMMITTEE", status: "NOTICE_ISSUED", title: "Next council", scheduledAt: "2026-10-21T02:00:00.000Z", timezone: null },
    ],
    AgendaItem: [
      { id: "c-carried", meetingId: "council", position: 1, title: "Start proceedings", status: "CARRIED", outcome: "RESOLVED", resolutionCategory: "ORDINARY" },
      { id: "c-lost", meetingId: "council", position: 2, title: "Start proceedings", status: "LOST", outcome: "MOTION_LOST", resolutionCategory: "ORDINARY" },
      { id: "g-carried", meetingId: "agm", position: 1, title: "Start proceedings", status: "CARRIED", outcome: "RESOLVED", resolutionCategory: "ORDINARY" },
      { id: "g-special", meetingId: "agm", position: 2, title: "Special", status: "CARRIED", outcome: "RESOLVED", resolutionCategory: "SPECIAL" },
      { id: "g-open", meetingId: "agm", position: 3, title: "Voting period", status: "OPEN", outcome: "OPEN", resolutionCategory: "SPECIAL" },
      { id: "g-period", meetingId: "agm", position: 4, title: "Voting period, carried", status: "CARRIED", outcome: "RESOLVED", resolutionCategory: "SPECIAL" },
      { id: "o-carried", meetingId: "other", position: 1, title: "Start proceedings", status: "CARRIED", outcome: "RESOLVED", resolutionCategory: "ORDINARY" },
      { id: "w-carried", meetingId: "odd", position: 1, title: "x", status: "CARRIED", outcome: "RESOLVED", resolutionCategory: null },
      ...["cancelled", "deleted", "adjourned", "draft"].map((m) => ({ id: `${m}-carried`, meetingId: m, position: 1, title: "Start proceedings", status: "CARRIED", outcome: "RESOLVED", resolutionCategory: "ORDINARY" })),
    ],
    PendingResolution: [
      { id: "p-open", schemeId: "s1", meetingId: "agm", agendaItemId: "g-open", status: "PENDING", effectiveOn: null },
      { id: "p-period", schemeId: "s1", meetingId: "agm", agendaItemId: "g-period", status: "CARRIED", effectiveOn: "2026-11-08" },
    ],
  });
});

describe("Western Australia: a council or general meeting motion, never the strata manager alone", () => {
  it("refuses the adviser alone: no meeting or motion chosen", async () => {
    for (const [m, i] of [[null, null], ["council", null], [null, "c-carried"]] as const) {
      expect(await authorityResolutionProblem("s1", m, i, WA)).toBe(
        "Choose the meeting and the motion carried at it: a motion carried at a council meeting or a motion carried at a general meeting.",
      );
    }
  });

  it("accepts a motion carried at a council meeting, as of the meeting's day in the building's zone", async () => {
    expect(await authorityResolution("s1", "council", "c-carried", WA)).toEqual({ problem: null, resolution: COUNCIL, decidedOn: "2026-10-20", meetingId: "council", itemId: "c-carried" });
  });

  it("accepts a motion carried at a general meeting", async () => {
    expect(await authorityResolution("s1", "agm", "g-carried", WA)).toEqual({ problem: null, resolution: GENERAL, decidedOn: "2026-10-10", meetingId: "agm", itemId: "g-carried" });
  });

  it("a resolution in its voting period is refused until carried, then dated the day it took effect", async () => {
    expect(await authorityResolutionProblem("s1", "agm", "g-open", WA)).toBe("That motion was not carried, so it cannot be relied on.");
    expect(await authorityResolution("s1", "agm", "g-period", WA)).toMatchObject({ problem: null, decidedOn: "2026-11-08" });
  });

  it("refuses a motion not carried, from another meeting, or a meeting of another scheme or of another type", async () => {
    expect(await authorityResolutionProblem("s1", "council", "c-lost", WA)).toBe("That motion was not carried, so it cannot be relied on.");
    expect(await authorityResolutionProblem("s1", "council", "g-carried", WA)).toBe("Choose a motion from that meeting.");
    expect(await authorityResolutionProblem("s1", "council", "nothing", WA)).toBe("Choose a motion from that meeting.");
    expect(await authorityResolutionProblem("s1", "other", "o-carried", WA)).toBe("Choose a meeting of this scheme.");
    expect(await authorityResolutionProblem("s1", "missing", "c-carried", WA)).toBe("Choose a meeting of this scheme.");
    expect(await authorityResolutionProblem("s1", "odd", "w-carried", WA)).toBe("Choose a motion carried at a council meeting or a motion carried at a general meeting.");
  });

  it("refuses a motion of a cancelled, deleted, adjourned or not yet held meeting (review M1)", async () => {
    expect(await authorityResolutionProblem("s1", "deleted", "deleted-carried", WA)).toBe("Choose a meeting of this scheme.");
    for (const m of ["cancelled", "adjourned", "draft"]) {
      expect(await authorityResolutionProblem("s1", m, `${m}-carried`, WA), m).toBe("That meeting has not been held, or was cancelled or adjourned, so its motions cannot be relied on.");
    }
  });

  it("refuses everything when no resolution is accepted", async () => {
    expect(await authorityResolutionProblem("s1", "council", "c-carried", [])).toBe("No resolution can decide this for this building.");
  });
});

describe("fixtures for the other draft packs", () => {
  it("a pack accepting only a special resolution at a general meeting refuses a council motion and an ordinary one", async () => {
    const special: Kind = { meeting: "GENERAL", kind: "SPECIAL", words: "a special resolution" };
    expect(await authorityResolutionProblem("s1", "council", "c-carried", [special])).toBe("Choose a special resolution.");
    expect(await authorityResolutionProblem("s1", "agm", "g-carried", [special])).toBe("That motion is not recorded as a special resolution. Choose a motion carried as a special resolution.");
    expect(await authorityResolution("s1", "agm", "g-special", [special])).toMatchObject({ problem: null, resolution: special, decidedOn: "2026-10-10" });
  });

  it("a committee resolution of a particular kind cannot be checked yet", async () => {
    const committeeOrdinary: Kind = { meeting: "COMMITTEE", kind: "ORDINARY", words: "an ordinary resolution of the committee" };
    expect(await authorityResolutionProblem("s1", "council", "c-carried", [committeeOrdinary])).toBe(
      "A committee resolution of a particular kind cannot be checked yet, so it cannot be relied on.",
    );
  });

  it("with several kinds accepted, the first that fits is the one recorded", async () => {
    const ordinary: Kind = { meeting: "GENERAL", kind: "ORDINARY", words: "an ordinary resolution" };
    const special: Kind = { meeting: "GENERAL", kind: "SPECIAL", words: "a special resolution" };
    expect(await authorityResolution("s1", "agm", "g-special", [ordinary, special])).toMatchObject({ problem: null, resolution: special });
    // Where none fits, the first refusal is given.
    expect(await authorityResolutionProblem("s1", "agm", "g-open", [ordinary, special])).toBe("That motion was not carried, so it cannot be relied on.");
  });
});

describe("ACT-style fixtures (stage 2, PR 9b): the decision to start proceedings and the charge's declaration", () => {
  const EXECUTIVE: Kind = { meeting: "COMMITTEE", kind: "ANY", words: "a motion carried at an executive committee meeting" };
  const ORDINARY: Kind = { meeting: "GENERAL", kind: "ORDINARY", words: "an ordinary resolution at a general meeting" };
  const GENERAL_ANY: Kind = { meeting: "GENERAL", kind: "ANY", words: "a motion carried at a general meeting" };
  const AUTHORITY = [EXECUTIVE, ORDINARY];
  const DECLARATION = [EXECUTIVE, GENERAL_ANY];

  it("the decision: a committee meeting motion, or a general meeting motion recorded as an ordinary resolution", async () => {
    expect(await authorityResolution("s1", "council", "c-carried", AUTHORITY)).toEqual({ problem: null, resolution: EXECUTIVE, decidedOn: "2026-10-20", meetingId: "council", itemId: "c-carried" });
    expect(await authorityResolution("s1", "agm", "g-carried", AUTHORITY)).toEqual({ problem: null, resolution: ORDINARY, decidedOn: "2026-10-10", meetingId: "agm", itemId: "g-carried" });
    // A general meeting motion recorded as a special resolution is not an ordinary one ("an", not "a").
    expect(await authorityResolutionProblem("s1", "agm", "g-special", AUTHORITY)).toBe(
      "That motion is not recorded as an ordinary resolution at a general meeting. Choose a motion carried as an ordinary resolution at a general meeting.",
    );
    expect(await authorityResolutionProblem("s1", "council", "c-lost", AUTHORITY)).toBe("That motion was not carried, so it cannot be relied on.");
    expect(await authorityResolutionProblem("s1", null, null, AUTHORITY)).toBe(
      "Choose the meeting and the motion carried at it: a motion carried at an executive committee meeting or an ordinary resolution at a general meeting.",
    );
  });

  it("the declaration: a committee meeting motion or a general meeting motion of any kind", async () => {
    expect(await authorityResolution("s1", "council", "c-carried", DECLARATION)).toMatchObject({ problem: null, resolution: EXECUTIVE, decidedOn: "2026-10-20" });
    expect(await authorityResolution("s1", "agm", "g-carried", DECLARATION)).toMatchObject({ problem: null, resolution: GENERAL_ANY, decidedOn: "2026-10-10" });
    expect(await authorityResolution("s1", "agm", "g-special", DECLARATION)).toMatchObject({ problem: null, resolution: GENERAL_ANY });
    // Still a held meeting of this scheme, and a decision taken later only once carried.
    expect(await authorityResolutionProblem("s1", "cancelled", "cancelled-carried", DECLARATION)).toBe("That meeting has not been held, or was cancelled or adjourned, so its motions cannot be relied on.");
    expect(await authorityResolutionProblem("s1", "other", "o-carried", DECLARATION)).toBe("Choose a meeting of this scheme.");
    expect(await authorityResolutionProblem("s1", "agm", "g-open", DECLARATION)).toBe("That motion was not carried, so it cannot be relied on.");
  });
});
