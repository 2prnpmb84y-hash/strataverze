import { beforeEach, describe, expect, it, vi } from "vitest";
import { issueDateFor as issueDateWith, issueTiming as issueTimingWith } from "./issue-timing";
import { statutoryRulesFor, type NswRules } from "@/config/statutory";

/** Midday in Sydney on a day (the daily job works out each building's day from the moment it runs). */
const midday = (day: string) => new Date(`${day}T02:00:00Z`);

const LEVY = (statutoryRulesFor("NSW") as NswRules).LEVY_NOTICE_RULES;
const issueDateFor = (due: string) => issueDateWith(due, LEVY);
const issueTiming = (due: string, today: string) => issueTimingWith(due, today, LEVY);

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
const journals = vi.hoisted(() => ({ posted: [] as Array<{ date: string; total: number }>, descriptions: [] as string[], fail: false }));

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
// The actions take today in the building's time zone from schemeToday.
vi.mock("@/lib/jurisdiction/scheme-time", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/scheme-time")>("@/lib/jurisdiction/scheme-time");
  return { ...actual, schemeToday: async () => today.value };
});
const owners = vi.hoisted(() => ({ l1: "o1" as string | null }));
vi.mock("@/lib/levies/load-plan-lots", () => ({
  loadPlanLots: async () => [
    { lotId: "l1", lotNumber: "1", entitlement: 60, ownerId: owners.l1 },
    { lotId: "l2", lotNumber: "2", entitlement: 40, ownerId: "o2" },
  ],
}));
vi.mock("@/lib/levies/notice-content-data", () => ({
  checkPlannedNotices: async () => content.missing,
  sendIssuedNotices: async (i: { notices: Array<{ noticeId?: string; noticeNumber: string; dueDate: string }>; onSent?: (id: string) => Promise<void> }) => {
    sent.notices.push(...i.notices.map((n) => ({ noticeNumber: n.noticeNumber, dueDate: n.dueDate })));
    for (const n of i.notices) if (n.noticeId) await i.onSent?.(n.noticeId);
    return i.notices.length;
  },
}));
vi.mock("@/lib/finance/owner-credits", () => ({ applyOwnerCredit: async () => 0, recordCreditMovement: async () => ({ id: "credit-1" }) }));
vi.mock("@/lib/queries/account-codes", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries/account-codes")>("@/lib/queries/account-codes");
  return { ...actual, getSystemAccountBySubType: async (_s: string, sub: string) => ({ id: `acc-${sub}` }) };
});
vi.mock("@/lib/queries/journal-entries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries/journal-entries")>("@/lib/queries/journal-entries");
  return {
    ...actual,
    getNextEntryNumber: async () => "JE-1",
    createJournalEntry: async (e: { transactionDate: string; description: string; lines: Array<{ debit?: number }> }) => {
      if (journals.fail) throw new Error("duplicate entry number");
      journals.posted.push({ date: e.transactionDate, total: e.lines.reduce((s, l) => s + (l.debit ?? 0), 0) });
      journals.descriptions.push(e.description);
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
const { stopPlannedNoticesAction, issueOverdueNoticesAction } = await import("@/app/(portal)/adviser/schemes/[id]/finance/actions");
const { issueDueNotices, runLevyNoticeDay, postPendingLevies } = await import("./issue-notices");
const { recordLevyPayment } = await import("@/lib/queries/levy-schedules");

function seed() {
  sharedFake.reset({
    Scheme: [{ id: "s1", state: "NSW", timeZone: "Australia/Sydney", financialYearEnd: "06-30", autoApplyOwnerCredit: true }],
    Fund: [{ id: "admin", schemeId: "s1", name: "Administrative Fund", fundType: "ADMINISTRATIVE", isActive: true }],
    Lot: [
      { id: "l1", schemeId: "s1", lotNumber: "1" },
      { id: "l2", schemeId: "s1", lotNumber: "2" },
    ],
    LevySchedule: [
      { id: "ls1", schemeId: "s1", fundId: "admin", financialYear: 2026, budgetAmount: "40000.00", frequency: "QUARTERLY", levyType: "ORDINARY", totalLots: 2, totalEntitlement: "100", status: "APPROVED", approvedBy: "adviser" },
    ],
    Budget: [{ id: "b1", schemeId: "s1", fundId: "admin", financialYear: 2026, version: 1, status: "ADOPTED" }],
    SchemeMembership: [{ id: "m-adv", schemeId: "s1", profileId: "adviser", role: "ADVISER", isActive: true }],
    LevyNotice: [],
  });
  owners.l1 = "o1";
  content.missing = [];
  sent.notices = [];
  journals.posted = [];
  journals.descriptions = [];
  journals.fail = false;
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
    // Only what went out is posted, dated its due date (not the notice date).
    expect(journals.posted).toEqual([{ date: "2026-07-10", total: 10000 }]);
    // The fund named from the building's pack, as NSW journals have always read.
    expect(journals.descriptions).toEqual(["Levies raised — 2 notice(s) due 10/07/2026, Administrative fund"]);
  });

  it("does not plan instalments the previous manager raised before the takeover", async () => {
    today.value = "2026-05-01";
    sharedFake.table("LevySchedule")[0].raisedBeforeTakeover = "1,2";
    const r = await generate();
    expect(r).toMatchObject({ success: true, data: { planned: 4 } });
    expect([...new Set(notices().map((n) => n.dueDate))]).toEqual(["2027-01-01", "2027-04-01"]);
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
  it("works out each building's day in its own time zone", async () => {
    today.value = "2026-05-01";
    await generate();
    // 14:15 UTC on 26 May 2026 is 00:15 on 27 May in Sydney but 23:45 on 26 May in Broken Hill.
    const moment = new Date("2026-05-26T14:15:00Z");
    sharedFake.table("Scheme")[0].timeZone = "Australia/Broken_Hill";
    expect(await issueDueNotices(moment)).toEqual([]);
    sharedFake.table("Scheme")[0].timeZone = "Australia/Sydney";
    expect(await issueDueNotices(moment)).toEqual([expect.objectContaining({ scheduleId: "ls1", issued: 2 })]);
  });

  it("sends each quarter's notices 35 days before they fall due, once, posting the levy dated its due date", async () => {
    today.value = "2026-05-01";
    await generate();
    expect(await issueDueNotices(midday("2026-05-26"))).toEqual([]);
    const r = await issueDueNotices(midday("2026-05-27"));
    expect(r).toEqual([expect.objectContaining({ scheduleId: "ls1", issued: 2, held: null, awaitingConfirmation: 0 })]);
    expect(notices().filter((n) => n.status === "ISSUED").map((n) => n.dueDate)).toEqual(["2026-07-01", "2026-07-01"]);
    // Issued on 27 May, levied on 1 July: the income is in the new financial year.
    expect(journals.posted).toEqual([{ date: "2026-07-01", total: 10000 }]);
    // Run again the same day: nothing more goes out.
    expect(await issueDueNotices(midday("2026-05-27"))).toEqual([]);
    expect(sent.notices).toHaveLength(2);
    expect(notices().filter((n) => n.emailedAt)).toHaveLength(2);
    expect((await runLevyNoticeDay(midday("2026-05-28"))).resent).toBe(0);
    await issueDueNotices(midday("2026-08-27"));
    expect(notices().filter((n) => n.status === "ISSUED")).toHaveLength(4);
    expect(journals.posted).toEqual([{ date: "2026-07-01", total: 10000 }, { date: "2026-10-01", total: 10000 }]);
  });

  it("addresses each notice to the lot's owner when it goes out, not when it was planned", async () => {
    today.value = "2026-05-01";
    await generate();
    owners.l1 = "o9";
    await issueDueNotices(midday("2026-05-27"));
    expect(notices().filter((n) => n.status === "ISSUED" && n.lotId === "l1").map((n) => n.ownerId)).toEqual(["o9"]);
  });

  it("holds notices missing required content; once past the 5-week mark they wait for the Adviser", async () => {
    today.value = "2026-05-01";
    await generate();
    content.missing = [{ code: "PAYMENT_DETAILS", message: "How to pay" }];
    const held = await issueDueNotices(midday("2026-05-27"));
    expect(held[0]).toMatchObject({ issued: 0, held: ["How to pay"] });
    expect(notices().every((n) => n.status === "DRAFT")).toBe(true);
    content.missing = [];
    // Fixed, but now late: the job does not send them on its own.
    const r = await issueDueNotices(midday("2026-06-05"));
    expect(r[0]).toMatchObject({ issued: 0, awaitingConfirmation: 2 });
    expect(notices().every((n) => n.status === "DRAFT")).toBe(true);
    // The Adviser confirms: they go out, due 30 days from today.
    today.value = "2026-06-05";
    const unconfirmed = await issueOverdueNoticesAction("s1", "ls1", {}, new FormData());
    expect(unconfirmed.data?.late).toEqual([expect.stringContaining("fewer than 30 days away")]);
    const fd = new FormData();
    fd.set("confirmLate", "on");
    expect(await issueOverdueNoticesAction("s1", "ls1", {}, fd)).toMatchObject({ success: true, data: { count: 2 } });
    expect(notices().filter((n) => n.status === "ISSUED").map((n) => n.dueDate)).toEqual(["2026-07-05", "2026-07-05"]);
  });

  it("issues, posts and emails a notice once when two runs overlap", async () => {
    today.value = "2026-05-01";
    await generate();
    const [a, b] = await Promise.all([issueDueNotices(midday("2026-05-27")), issueDueNotices(midday("2026-05-27"))]);
    expect(a.reduce((s, r) => s + r.issued, 0) + b.reduce((s, r) => s + r.issued, 0)).toBe(2);
    expect(notices().filter((n) => n.status === "ISSUED")).toHaveLength(2);
    expect(sent.notices).toHaveLength(2);
    expect(new Set(sent.notices.map((n) => n.noticeNumber)).size).toBe(2);
    // However the runs split the notices, the quarter is levied once: $10,000.
    expect(journals.posted.reduce((s, j) => s + j.total, 0)).toBe(10000);
  });

  it("puts the notices back to planned when the levy cannot be posted, and sends nothing", async () => {
    today.value = "2026-05-01";
    await generate();
    journals.fail = true;
    const r = await issueDueNotices(midday("2026-05-27"));
    expect(r[0]).toMatchObject({ issued: 0 });
    expect(notices().every((n) => n.status === "DRAFT")).toBe(true);
    expect(sent.notices).toEqual([]);
    journals.fail = false;
    expect((await issueDueNotices(midday("2026-05-27")))[0]).toMatchObject({ issued: 2 });
    expect(journals.posted).toEqual([{ date: "2026-07-01", total: 10000 }]);
  });

  it("takes a payment received before the due date against the notice as usual", async () => {
    today.value = "2026-05-01";
    await generate();
    await issueDueNotices(midday("2026-05-27"));
    const n = notices().find((x) => x.status === "ISSUED" && x.lotId === "l1")!;
    const r = await recordLevyPayment(String(n.id), 6000, { paymentDate: "2026-06-15", captureFee: false });
    expect(r).toMatchObject({ appliedCents: 600000, excessCents: 0 });
    expect(notices().find((x) => x.id === n.id)).toMatchObject({ status: "PAID" });
  });

  it("ignores schedules that are not active", async () => {
    today.value = "2026-05-01";
    await generate();
    sharedFake.table("LevySchedule")[0].status = "SUPERSEDED";
    expect(await issueDueNotices(midday("2026-05-27"))).toEqual([]);
  });

  it("stops the planned notices, keeping those already sent", async () => {
    today.value = "2026-05-01";
    await generate();
    await issueDueNotices(midday("2026-05-27"));
    const unconfirmed = await stopPlannedNoticesAction("s1", "ls1", {}, new FormData());
    expect(unconfirmed.error).toContain("Confirm");
    const fd = new FormData();
    fd.set("confirmStop", "on");
    expect(await stopPlannedNoticesAction("s1", "ls1", {}, fd)).toMatchObject({ success: true, data: { removed: 6 } });
    expect(notices().map((n) => n.status)).toEqual(["ISSUED", "ISSUED"]);
    expect(sharedFake.table("LevySchedule")[0].status).toBe("SUPERSEDED");
    expect(journals.posted).toEqual([{ date: "2026-07-01", total: 10000 }]);
  });

  it("posts the levy for notices an interrupted run issued but did not post, once", async () => {
    today.value = "2026-05-01";
    await generate();
    // As if a run stopped after claiming: issued, levy still pending, nothing posted.
    const two = notices().filter((n) => n.dueDate === "2026-07-01");
    for (const n of two) Object.assign(n, { status: "ISSUED", levyPostPending: true, issuedAt: "2026-05-27T20:00:00.000Z" });
    expect(await postPendingLevies(new Date("2026-05-27T20:10:00.000Z"))).toBe(0); // still within the grace
    expect(await postPendingLevies(new Date("2026-05-28T20:00:00.000Z"))).toBe(2);
    expect(journals.posted).toEqual([{ date: "2026-07-01", total: 10000 }]);
    expect(notices().filter((n) => n.levyPostPending)).toHaveLength(0);
    expect(await postPendingLevies(new Date("2026-05-29T20:00:00.000Z"))).toBe(0);
    expect(journals.posted).toHaveLength(1);
  });

  it("refuses a second active schedule, and a replacement that overlaps differently", async () => {
    today.value = "2026-05-01";
    await generate();
    sharedFake.table("LevySchedule").push({ ...sharedFake.table("LevySchedule")[0], id: "ls3", status: "APPROVED" });
    expect((await issueScheduleNoticesAction("s1", "ls3", {}, new FormData())).error).toContain("already has an active levy schedule");
    await issueDueNotices(midday("2026-05-27"));
    const fd = new FormData();
    fd.set("confirmStop", "on");
    await stopPlannedNoticesAction("s1", "ls1", {}, fd);
    sharedFake.table("LevySchedule").find((x) => x.id === "ls3")!.frequency = "MONTHLY";
    expect((await issueScheduleNoticesAction("s1", "ls3", {}, new FormData())).error).toContain("overlap these instalments differently");
  });

  it("a later schedule for the same fund and year does not levy the periods already sent again", async () => {
    today.value = "2026-05-01";
    await generate();
    await issueDueNotices(midday("2026-05-27"));
    const fd = new FormData();
    fd.set("confirmStop", "on");
    await stopPlannedNoticesAction("s1", "ls1", {}, fd);
    sharedFake.table("LevySchedule").push({ ...sharedFake.table("LevySchedule")[0], id: "ls2", status: "APPROVED", budgetAmount: "48000.00" });
    const r = await issueScheduleNoticesAction("s1", "ls2", {}, new FormData());
    expect(r.error).toBeUndefined();
    expect(r).toMatchObject({ success: true, data: { planned: 6 } });
    const ls2 = notices().filter((n) => n.levyScheduleId === "ls2");
    expect([...new Set(ls2.map((n) => n.dueDate))]).toEqual(["2026-10-01", "2027-01-01", "2027-04-01"]);
  });
});
