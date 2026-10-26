import { beforeEach, describe, expect, it, vi } from "vitest";

/** The status-guarded meeting update, against the in-memory ORM. */
vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));

const { sharedFake } = await import("@/test/fake-orm");
const { updateMeetingWhileStatus, getUpcomingMeetingsForOwner } = await import("./meetings");

const meeting = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  schemeId: "s1",
  status: "DRAFT",
  title: "AGM",
  location: "Level 3",
  deletedAt: null,
  scheduledAt: "2026-12-01T07:00:00.000Z",
  ...over,
});
const row = (id: string) => sharedFake.table("Meeting").find((m) => m.id === id)!;

beforeEach(() =>
  sharedFake.reset({
    Meeting: [
      meeting("draft"),
      meeting("noticed", { status: "NOTICE_ISSUED" }),
      meeting("deleted", { deletedAt: "2026-10-01T00:00:00.000Z" }),
      meeting("other", { schemeId: "s2" }),
    ],
    Motion: [],
  }),
);

describe("updateMeetingWhileStatus", () => {
  it("changes a meeting still in one of the given statuses, including clearing a field", async () => {
    expect(await updateMeetingWhileStatus("s1", "draft", ["DRAFT", "SCHEDULED"], { title: "AGM 2026", location: null })).toBe(1);
    expect(row("draft")).toMatchObject({ title: "AGM 2026", location: null });
  });

  it("changes nothing once the status has moved on, or for a deleted meeting or another building's", async () => {
    expect(await updateMeetingWhileStatus("s1", "noticed", ["DRAFT", "SCHEDULED"], { title: "X" })).toBe(0);
    expect(await updateMeetingWhileStatus("s1", "deleted", ["DRAFT"], { title: "X" })).toBe(0);
    expect(await updateMeetingWhileStatus("s1", "other", ["DRAFT"], { title: "X" })).toBe(0);
    expect(row("noticed").title).toBe("AGM");
    expect(row("other").title).toBe("AGM");
  });
});

describe("getUpcomingMeetingsForOwner", () => {
  it("returns the latest meetings earliest first", async () => {
    // The in-memory ORM ignores orderBy, so the rows are seeded in the order
    // the database returns them (latest first); the function puts them back.
    sharedFake.reset({
      Meeting: [
        meeting("later", { scheduledAt: "2027-03-01T00:00:00.000Z" }),
        meeting("next", { scheduledAt: "2026-12-01T00:00:00.000Z" }),
        meeting("old2", { scheduledAt: "2021-01-01T00:00:00.000Z" }),
        meeting("old1", { scheduledAt: "2020-01-01T00:00:00.000Z" }),
      ],
      Motion: [],
    });
    const rows = await getUpcomingMeetingsForOwner(["s1"], 3);
    expect(rows.map((m) => m.id)).toEqual(["old2", "next", "later"]);
  });
});
