import { beforeEach, describe, expect, it, vi } from "vitest";
import { issueDateFor, issueTiming } from "./issue-timing";

/**
 * Levy notices go out 5 weeks before they fall due, and levies are paid in
 * advance (24 Oct 2026). The generate action plans the year; the daily job
 * issues each notice on its day. Run against the in-memory database.
 */

describe("issue timing", () => {
  it("sends a notice 35 days before it falls due", () => {
    expect(issueDateFor("2026-07-01")).toBe("2026-05-27");
    expect(issueDateFor("2026-10-01")).toBe("2026-08-27");
    expect(issueTiming("2026-10-01", "2026-08-01")).toEqual({ kind: "planned", issueOn: "2026-08-27", dueDate: "2026-10-01" });
    expect(issueTiming("2026-10-01", "2026-08-27").kind).toBe("planned");
  });

  it("sends a late notice today when 30 or more days are left", () => {
    expect(issueTiming("2026-10-01", "2026-08-28")).toEqual({ kind: "late", issueOn: "2026-08-28", dueDate: "2026-10-01", daysNotice: 34 });
    expect(issueTiming("2026-10-01", "2026-09-01")).toMatchObject({ kind: "late", daysNotice: 30 });
  });

  it("moves the due date to 30 days away when fewer are left", () => {
    expect(issueTiming("2026-10-01", "2026-09-02")).toEqual({ kind: "moved", issueOn: "2026-09-02", dueDate: "2026-10-02", originalDueDate: "2026-10-01" });
    expect(issueTiming("2026-07-01", "2026-10-24")).toMatchObject({ kind: "moved", dueDate: "2026-11-23" });
  });
});

// ─── The generate action and the daily job ──────────────────────────────────

const today = vi.hoisted(() => ({ value: "2026-05-01" }));
const content = vi.hoisted(() => ({ missing: [] as { code: string; message: string }[] }));
const sent = vi.hoisted(() => ({ notices: [] as Array<{ noticeNumber: string; dueDate: string }> }));
const journals = vi.hoisted(() => ({ posted: [] as Array<{ date: string; total: number }> }));

vi.mock("@/lib/auth/mfa-enforcement", () => ({
  requireRecentMfa: vi.fn(async () => {}),
  getMfaStatus: vi.fn(async () => null),
  enforceMfa: vi.fn(async () => {}),
  enforceMfaFor: vi.fn(async () => {}),
  StepUpRequiredError: class extends Error {},
}));
vi.mock("@/lib/auth/require-membership", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/require-membership")>("@/lib/auth/require-membership");
  return { ...actual, requireSchemeMembership: vi.fn(async () => ({ profile: { id: "adviser" } })) };
});
vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/queries/activity-log", () => ({ logActivity: vi.fn(), getAuditTrailForExport: vi.fn(), formatAuditTrailCsv: vi.fn() }));
vi.mock("@/lib/finance/interest-setting", async () => {
  const actual = await vi.importActual<typeof import("@/lib/finance/interest-setting")>("@/lib/finance/interest-setting");
  return { ...actual, sydneyToday: () => today.value };
});
vi.mock("@/lib/levies/load-plan-lots", () => ({
  loadPlanLots: async () => [
    { lotId: "l1", lotNumber: "1", entitlement: 60, ownerId: "o1" },
    { lotId: "l2", lotNumber: "2", entitlement: 40, ownerId: "o2" },
  ],
}));
vi.mock("@/lib/levies/notice-content-data", () => ({
  checkPlannedNotices: async () => content.missing,
  sendIssuedNotices: async (i: { notices: Array<{ noticeNumber: string; dueDate: string }> }) => {
    sent.notices.push(...i.notices.map((n) => ({ noticeNumber: n.noticeNumber, dueDate: n.dueDate })));
    return i.notices.length;
  },
}));
vi.mock("@/lib/finance/owner-credits", () => ({ applyOwnerCredit: async () => 0 }));
vi.mock("@/lib/queries/account-codes", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries/account-codes")>("@/lib/queries/account-codes");
  return { ...actual, getSystemAccountBySubType: async (_s: string, sub: string) => ({ id: `acc-${sub}` }) };
});
vi.mock("@/lib/queries/journal-entries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries/journal-entries")>("@/lib/queries/journal-entries");
  return {
    ...actual,
    getNextEntryNumber: async () => "JE-1",
    createJournalEntry: async (e: { transactionDate: string; lines: Array<{ debit?: number }> }) => {
      journals.posted.push({ date: e.transactionDate, total: e.lines.reduce((s, l) => s + (l.debit ?? 0), 0) });
      return { id: "je" };
    },
    postJournalEntry: async () => {},
  };
});
vi.mock("@/lib/queries/schemes", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries/schemes")>("@/lib/queries/schemes");
  return { ...actual, getSchemeById: async () => ({ id: "s1", financialYearEnd: "06-30", autoApplyOwnerCredit: true }) };
});

const { sharedFake } = await import("@/test/fake-orm");
const { issueScheduleNoticesAction } = await import("@/app/(portal)/adviser/schemes/[id]/finance/actions");
const { issueDueNotices } = await import("./issue-notices");

function seed() {
  sharedFake.reset({
    Scheme: [{ id: "s1", financialYearEnd: "06-30", autoApplyOwnerCredit: true }],
    Fund: [{ id: "admin", schemeId: "s1", name: "Administrative Fund", fundType: "ADMINISTRATIVE", isActive: true }],
    Lot: [
      { id: "l1", schemeId: "s1", lotNumber: "1" },
      { id: "l2", schemeId: "s1", lotNumber: "2" },
    ],
    LevySchedule: [
      { id: "ls1", schemeId: "s1", fundId: "admin", financialYear: 2026, budgetAmount: "40000.00", frequency: "QUARTERLY", levyType: "ORDINARY", totalLots: 2, totalEntitlement: "100", status: "APPROVED", approvedBy: "adviser" },
    ],
    Budget: [{ id: "b1", schemeId: "s1", fundId: "admin", financialYear: 2026, version: 1, status: "ADOPTED" }],
    LevyNotice: [],
  });
  content.missing = [];
  sent.notices = [];
  journals.posted = [];
}

const generate = (confirmLate = false) => {
  const fd = new FormData();
  if (confirmLate) fd.set("confirmLate", "on");
  return issueScheduleNoticesAction("s1", "ls1", {}, fd);
};
const notices = () => sharedFake.table("LevyNotice");

beforeEach(seed);

describe("generating a budget levy schedule", () => {
  it("plans the whole year in advance, each due on the first day of its quarter, and sends nothing early", async () => {
    today.value = "2026-05-01";
    const r = await generate();
    expect(r).toMatchObject({ success: true, data: { count: 0, planned: 8, nextIssueOn: "2026-05-27" } });
    expect([...new Set(notices().map((n) => n.dueDate))]).toEqual(["2026-07-01", "2026-10-01", "2027-01-01", "2027-04-01"]);
    expect(notices().every((n) => n.status === "DRAFT")).toBe(true);
    expect(notices().find((n) => n.dueDate === "2026-07-01")?.periodStart).toBe("2026-07-01");
    expect(sent.notices).toEqual([]);
    expect(journals.posted).toEqual([]);
    expect(sharedFake.table("LevySchedule")[0].status).toBe("ACTIVE");
  });

  it("asks for confirmation before sending notices with less than 5 weeks", async () => {
    today.value = "2026-06-10";
    const r = await generate();
    expect(r.error).toContain("cannot be given 5 weeks");
    expect(r.data?.late).toEqual([expect.stringContaining("Instalment 1: due 01/07/2026, fewer than 30 days away")]);
    expect(notices()).toHaveLength(0);
  });

  it("once confirmed, sends the late one today with its due date moved to 30 days, and plans the rest", async () => {
    today.value = "2026-06-10";
    const r = await generate(true);
    expect(r).toMatchObject({ success: true, data: { count: 2, planned: 6, nextIssueOn: "2026-08-27" } });
    const q1 = notices().filter((n) => n.status === "ISSUED");
    expect(q1.map((n) => n.dueDate)).toEqual(["2026-07-10", "2026-07-10"]);
    expect(sent.notices.map((n) => n.dueDate)).toEqual(["2026-07-10", "2026-07-10"]);
    // Only what went out is posted: Q1, $10,000, on the notice date.
    expect(journals.posted).toEqual([{ date: "2026-06-10", total: 10000 }]);
  });

  it("issues nothing when a notice would be missing required content", async () => {
    today.value = "2026-05-01";
    content.missing = [{ code: "PAYMENT_DETAILS", message: "How to pay" }];
    const r = await generate();
    expect(r.error).toContain("cannot be issued yet");
    expect(notices()).toHaveLength(0);
  });
});

describe("the daily job", () => {
  it("sends each quarter's notices 35 days before they fall due, once", async () => {
    today.value = "2026-05-01";
    await generate();
    expect(await issueDueNotices("2026-05-26")).toEqual([]);
    const r = await issueDueNotices("2026-05-27");
    expect(r).toEqual([expect.objectContaining({ scheduleId: "ls1", issued: 2, held: null, moved: 0 })]);
    expect(notices().filter((n) => n.status === "ISSUED").map((n) => n.dueDate)).toEqual(["2026-07-01", "2026-07-01"]);
    expect(journals.posted).toEqual([{ date: "2026-05-27", total: 10000 }]);
    // Run again the same day: nothing more goes out.
    expect(await issueDueNotices("2026-05-27")).toEqual([]);
    await issueDueNotices("2026-08-27");
    expect(notices().filter((n) => n.status === "ISSUED")).toHaveLength(4);
  });

  it("holds notices missing required content, and moves the due date if it then has fewer than 30 days", async () => {
    today.value = "2026-05-01";
    await generate();
    content.missing = [{ code: "PAYMENT_DETAILS", message: "How to pay" }];
    const held = await issueDueNotices("2026-05-27");
    expect(held[0]).toMatchObject({ issued: 0, held: ["How to pay"] });
    expect(notices().every((n) => n.status === "DRAFT")).toBe(true);
    content.missing = [];
    const r = await issueDueNotices("2026-06-05");
    expect(r[0]).toMatchObject({ issued: 2, moved: 2 });
    expect(notices().filter((n) => n.status === "ISSUED").map((n) => n.dueDate)).toEqual(["2026-07-05", "2026-07-05"]);
  });

  it("issues, posts and emails a notice once when two runs overlap", async () => {
    today.value = "2026-05-01";
    await generate();
    const [a, b] = await Promise.all([issueDueNotices("2026-05-27"), issueDueNotices("2026-05-27")]);
    expect(a.reduce((s, r) => s + r.issued, 0) + b.reduce((s, r) => s + r.issued, 0)).toBe(2);
    expect(notices().filter((n) => n.status === "ISSUED")).toHaveLength(2);
    expect(sent.notices).toHaveLength(2);
    expect(new Set(sent.notices.map((n) => n.noticeNumber)).size).toBe(2);
    // However the runs split the notices, the quarter is raised once: $10,000.
    expect(journals.posted.reduce((s, j) => s + j.total, 0)).toBe(10000);
  });

  it("ignores schedules that are not active", async () => {
    today.value = "2026-05-01";
    await generate();
    sharedFake.table("LevySchedule")[0].status = "SUPERSEDED";
    expect(await issueDueNotices("2026-05-27")).toEqual([]);
  });
});
