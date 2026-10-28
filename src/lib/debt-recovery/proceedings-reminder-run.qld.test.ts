/**
 * The 2 year rule's daily reminder, run against the in-memory ORM (QLD
 * go-live gap, 27 Oct 2026). The Queensland pack is live (the switch-on,
 * 28 Oct 2026), so a "QLD" building has its real pack. The tests that show
 * what happens while no live pack has the rule leave Queensland out of the
 * live packs through the scheme-rules mock. NSW keeps its real pack.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const switches = vi.hoisted(() => ({ qldLive: false, failSends: false, tablesRead: [] as string[], emails: [] as Array<{ to: string; subject: string; html: string }> }));

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => {
  const { sharedFake } = await import("@/test/fake-orm");
  // Every table the code reads or writes is recorded, to show what NSW never touches.
  const publicTables = new Proxy({} as Record<string, unknown>, {
    get: (_t, name: string) => {
      switches.tablesRead.push(name);
      return (sharedFake.db.orm.public as Record<string, unknown>)[name];
    },
  });
  return { db: { ...sharedFake.db, orm: { public: publicTables } } };
});
vi.mock("@/lib/email", () => ({
  // As the real sendEmail: false when the provider refuses it (nothing sent).
  sendEmail: vi.fn(async (e: { to: string; subject: string; html: string }) => {
    if (switches.failSends) return false;
    switches.emails.push(e);
    return true;
  }),
}));
vi.mock("@/lib/log", () => ({ logError: vi.fn() }));
vi.mock("@/lib/jurisdiction/scheme-rules", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/jurisdiction/scheme-rules")>();
  return {
    ...actual,
    // Queensland is live; qldLive false leaves it out, as before the switch-on.
    liveSchemeRules: vi.fn(() => (switches.qldLive ? actual.liveSchemeRules() : actual.liveSchemeRules().filter((r) => r.pack.state !== "QLD"))),
    rulesForState: vi.fn((state: string) => actual.rulesForState(state)),
  };
});

const { sharedFake } = await import("@/test/fake-orm");
const { rulesForState } = await import("@/lib/jurisdiction/scheme-rules");
const { logError } = await import("@/lib/log");
const { runProceedingsDeadlineReminders, statesWithProceedingsRule } = await import("./proceedings-reminder-run");
const { runComplianceDay } = await import("@/lib/compliance/daily");

/** Noon in Brisbane (UTC+10, no daylight saving) on a day. */
const brisbaneNoon = (day: string) => new Date(`${day}T02:00:00Z`);

function seed() {
  sharedFake.reset({
    Scheme: [
      { id: "qld-1", name: "Riverside", state: "QLD", isActive: true, timeZone: "Australia/Brisbane" },
      { id: "nsw-1", name: "Harbour View", state: "NSW", isActive: true, timeZone: "Australia/Sydney" },
    ],
    LevyNotice: [
      // Lot 4 owes a contribution due 27 Oct 2024: flagged from 27 Oct 2026, deadline 27 Dec 2026.
      { id: "n-4a", schemeId: "qld-1", lotId: "lot-4", status: "OVERDUE", dueDate: "2024-10-27", balanceOutstanding: "500.00", lot: { lotNumber: "4" } },
      { id: "n-4b", schemeId: "qld-1", lotId: "lot-4", status: "OVERDUE", dueDate: "2025-01-27", balanceOutstanding: "500.00", lot: { lotNumber: "4" } },
      // An NSW levy unpaid for years: NSW has no 2 year rule, so it is never flagged or read.
      { id: "n-nsw", schemeId: "nsw-1", lotId: "nsw-lot-1", status: "OVERDUE", dueDate: "2020-01-01", balanceOutstanding: "900.00", lot: { lotNumber: "1" } },
    ],
    DebtRecoveryCase: [],
    DebtRecoveryStep: [],
    ProceedingsDeadlineReminder: [],
    SchemeMembership: [
      { id: "m1", schemeId: "qld-1", profileId: "adviser", role: "ADVISER", isActive: true, lotId: null },
      { id: "m2", schemeId: "qld-1", profileId: "chair", role: "COMMITTEE", isActive: true, lotId: null },
      // A committee member who owns lot 4 is never sent it.
      { id: "m3", schemeId: "qld-1", profileId: "debtor", role: "COMMITTEE", isActive: true, lotId: null },
      { id: "m4", schemeId: "qld-1", profileId: "debtor", role: "OWNER", isActive: true, lotId: "lot-4" },
      // Owners are never sent it.
      { id: "m5", schemeId: "qld-1", profileId: "owner", role: "OWNER", isActive: true, lotId: "lot-5" },
      { id: "m6", schemeId: "nsw-1", profileId: "nsw-adviser", role: "ADVISER", isActive: true, lotId: null },
      { id: "m7", schemeId: "nsw-1", profileId: "nsw-chair", role: "COMMITTEE", isActive: true, lotId: null },
    ],
    Profile: ["adviser", "chair", "debtor", "owner", "nsw-adviser", "nsw-chair"].map((id) => ({ id, email: `${id}@example.com`, firstName: id, lastName: null })),
  });
  sharedFake.setUniqueKeys({ ProceedingsDeadlineReminder: [["lotId", "oldestDueOn"]] });
}

const recipients = () => switches.emails.map((e) => e.to).sort();

beforeEach(() => {
  switches.qldLive = true;
  switches.failSends = false;
  switches.tablesRead.length = 0;
  switches.emails.length = 0;
  vi.mocked(rulesForState).mockClear();
  vi.mocked(logError).mockClear();
  seed();
});

describe("the 2 year reminder for a Queensland building", () => {
  it("sends when first flagged, at 30, 14 and 7 days before the deadline, and once after it, to the advisers and committee only", async () => {
    const sentOn: Record<string, number> = {};
    for (const day of ["2026-10-26", "2026-10-27", "2026-10-28", "2026-11-26", "2026-11-27", "2026-11-28", "2026-12-13", "2026-12-14", "2026-12-20", "2026-12-27", "2026-12-28", "2026-12-29", "2027-01-28"]) {
      sentOn[day] = await runProceedingsDeadlineReminders(brisbaneNoon(day));
    }
    expect(Object.entries(sentOn).filter(([, n]) => n > 0)).toEqual([
      ["2026-10-27", 1],
      ["2026-11-27", 1],
      ["2026-12-13", 1],
      ["2026-12-20", 1],
      ["2026-12-28", 1],
    ]);
    // Five reminders, each to the adviser and the chair: never the committee member who owns the lot, nor an owner.
    expect(switches.emails).toHaveLength(10);
    expect([...new Set(recipients())]).toEqual(["adviser@example.com", "chair@example.com"]);
    const row = sharedFake.table("ProceedingsDeadlineReminder");
    expect(row).toHaveLength(1);
    expect(row[0]).toMatchObject({ schemeId: "qld-1", lotId: "lot-4", oldestDueOn: "2024-10-27", deadlineOn: "2026-12-27", lastStage: "PASSED", lastSentOn: "2026-12-28" });
    expect(logError).not.toHaveBeenCalled();
  });

  it("sends once when the run is retried on the same day", async () => {
    expect(await runProceedingsDeadlineReminders(brisbaneNoon("2026-10-27"))).toBe(1);
    expect(await runProceedingsDeadlineReminders(new Date("2026-10-27T05:00:00Z"))).toBe(0);
    expect(await runProceedingsDeadlineReminders(brisbaneNoon("2026-11-27"))).toBe(1);
    expect(await runProceedingsDeadlineReminders(brisbaneNoon("2026-11-27"))).toBe(0);
    expect(switches.emails).toHaveLength(4);
  });

  it("sends once when two runs claim the same stage at the same moment", async () => {
    const both = await Promise.all([runProceedingsDeadlineReminders(brisbaneNoon("2026-10-27")), runProceedingsDeadlineReminders(brisbaneNoon("2026-10-27"))]);
    expect(both.sort()).toEqual([0, 1]);
    expect(switches.emails).toHaveLength(2);
    // The second claim met the unique key and stood down, without an error.
    expect(logError).not.toHaveBeenCalled();
  });

  it("catches up a missed stretch with one email for the latest stage", async () => {
    // First run 6 days before the deadline: one DAYS_7 reminder, not four.
    expect(await runProceedingsDeadlineReminders(brisbaneNoon("2026-12-21"))).toBe(1);
    expect(sharedFake.table("ProceedingsDeadlineReminder")[0].lastStage).toBe("DAYS_7");
    expect(await runProceedingsDeadlineReminders(brisbaneNoon("2026-12-22"))).toBe(0);
  });

  it("sends nothing once proceedings are recorded", async () => {
    expect(await runProceedingsDeadlineReminders(brisbaneNoon("2026-10-27"))).toBe(1);
    // An open case opened after the oldest due date, with the proceedings step completed.
    sharedFake.table("DebtRecoveryCase").push({ id: "case-1", schemeId: "qld-1", lotId: "lot-4", status: "REFERRED_LEGAL", createdAt: "2025-03-01T00:00:00Z", courtFileNumber: null });
    sharedFake.table("DebtRecoveryStep").push({ id: "s-1", caseId: "case-1", stepType: "PROCEEDINGS", status: "COMPLETED" });
    for (const day of ["2026-11-27", "2026-12-13", "2026-12-20", "2026-12-28"]) expect(await runProceedingsDeadlineReminders(brisbaneNoon(day))).toBe(0);
    expect(switches.emails).toHaveLength(2);
  });

  it("sends nothing to a lot whose case has a court file number", async () => {
    sharedFake.table("DebtRecoveryCase").push({ id: "case-2", schemeId: "qld-1", lotId: "lot-4", status: "IN_PROGRESS", createdAt: "2025-03-01T00:00:00Z", courtFileNumber: "M123/26" });
    expect(await runProceedingsDeadlineReminders(brisbaneNoon("2026-10-27"))).toBe(0);
    expect(sharedFake.table("ProceedingsDeadlineReminder")).toEqual([]);
  });

  it("counts the building's day, not the server's", async () => {
    // 23:59 on 26 Oct in Brisbane (13:59 UTC): not yet 2 years.
    expect(await runProceedingsDeadlineReminders(new Date("2026-10-26T13:59:00Z"))).toBe(0);
    // 00:30 on 27 Oct in Brisbane, still 26 Oct in UTC: flagged.
    expect(await runProceedingsDeadlineReminders(new Date("2026-10-26T14:30:00Z"))).toBe(1);
    expect(sharedFake.table("ProceedingsDeadlineReminder")[0].lastSentOn).toBe("2026-10-27");
  });

  it("sends the pack's wording and citation, with links by role", async () => {
    await runProceedingsDeadlineReminders(brisbaneNoon("2026-10-27"));
    const toAdviser = switches.emails.find((e) => e.to === "adviser@example.com")!;
    const toChair = switches.emails.find((e) => e.to === "chair@example.com")!;
    expect(toAdviser.subject).toBe("StrataVerze date to start proceedings for lot 4: 27/12/2026, Riverside");
    expect(toAdviser.html).toContain("Standard Module s 166(2)");
    expect(toAdviser.html).toContain("The body corporate must start proceedings by 27/12/2026.");
    expect(toAdviser.html).toContain("/adviser/schemes/qld-1/finance/debt-recovery");
    expect(toChair.html).not.toContain("/adviser/");
    expect(toChair.html).not.toContain("court file number");
  });

  it("never emails the lot's owner, however many memberships the building has", async () => {
    // The debtor's committee row first, then 600 owners of other lots, then the debtor's ownership of lot 4,
    // so a single capped read of every membership would miss the ownership and email the debtor.
    const others = Array.from({ length: 600 }, (_, i) => ({ id: `o-${i}`, schemeId: "qld-1", profileId: `owner-${i}`, role: "OWNER", isActive: true, lotId: `lot-x${i}` }));
    const rows = sharedFake.table("SchemeMembership");
    const isDebtorOwnership = (m: Record<string, unknown>) => m.profileId === "debtor" && m.role === "OWNER";
    sharedFake.table("SchemeMembership").splice(0, rows.length, ...rows.filter((m) => !isDebtorOwnership(m)), ...others, ...rows.filter(isDebtorOwnership));
    // A committee member whose ownership of lot 4 ended 10 days ago still counts as its owner.
    sharedFake.table("SchemeMembership").push(
      { id: "m8", schemeId: "qld-1", profileId: "seller", role: "COMMITTEE", isActive: true, lotId: null },
      { id: "m9", schemeId: "qld-1", profileId: "seller", role: "OWNER", isActive: false, lotId: "lot-4", endDate: "2026-10-17T00:00:00Z" },
    );
    sharedFake.table("Profile").push({ id: "seller", email: "seller@example.com" });
    expect(sharedFake.table("SchemeMembership").length).toBeGreaterThan(500);
    expect(await runProceedingsDeadlineReminders(brisbaneNoon("2026-10-27"))).toBe(1);
    expect(recipients()).toEqual(["adviser@example.com", "chair@example.com"]);
  });

  it("gives the stage back when every send fails, so the next run tries again", async () => {
    switches.failSends = true;
    expect(await runProceedingsDeadlineReminders(brisbaneNoon("2026-10-27"))).toBe(0);
    expect(sharedFake.table("ProceedingsDeadlineReminder")).toEqual([]);
    switches.failSends = false;
    expect(await runProceedingsDeadlineReminders(brisbaneNoon("2026-10-28"))).toBe(1);
    // A later stage that fails goes back to the stage before it, with its day.
    switches.failSends = true;
    expect(await runProceedingsDeadlineReminders(brisbaneNoon("2026-11-27"))).toBe(0);
    expect(sharedFake.table("ProceedingsDeadlineReminder")[0]).toMatchObject({ lastStage: "FLAGGED", lastSentOn: "2026-10-28" });
    switches.failSends = false;
    expect(await runProceedingsDeadlineReminders(brisbaneNoon("2026-11-28"))).toBe(1);
    expect(sharedFake.table("ProceedingsDeadlineReminder")[0]).toMatchObject({ lastStage: "DAYS_30", lastSentOn: "2026-11-28" });
    expect(switches.emails).toHaveLength(4);
  });

  it("gives the stage back when there is no one to send to", async () => {
    sharedFake.table("SchemeMembership").splice(0);
    expect(await runProceedingsDeadlineReminders(brisbaneNoon("2026-10-27"))).toBe(0);
    expect(sharedFake.table("ProceedingsDeadlineReminder")).toEqual([]);
  });

  it("matches the building's state in any letter case and spacing", async () => {
    sharedFake.table("Scheme").find((s) => s.id === "qld-1")!.state = " Qld ";
    expect(await runProceedingsDeadlineReminders(brisbaneNoon("2026-10-27"))).toBe(1);
    expect(vi.mocked(rulesForState).mock.calls.map(([st]) => st)).toEqual(["QLD"]);
  });

  it("sends nothing for a deadline that passed more than 30 days before the building's first run", async () => {
    expect(await runProceedingsDeadlineReminders(brisbaneNoon("2027-01-27"))).toBe(0);
    expect(sharedFake.table("ProceedingsDeadlineReminder")).toEqual([]);
    // Within 30 days it still goes, once.
    expect(await runProceedingsDeadlineReminders(brisbaneNoon("2027-01-26"))).toBe(1);
  });

  it("starts a new series when the oldest unpaid due date changes", async () => {
    await runProceedingsDeadlineReminders(brisbaneNoon("2026-10-27"));
    // The 2024 contribution is paid; the next one (due 27 Jan 2025) is flagged from 27 Jan 2027.
    sharedFake.table("LevyNotice").find((n) => n.id === "n-4a")!.balanceOutstanding = "0.00";
    sharedFake.table("LevyNotice").find((n) => n.id === "n-4a")!.status = "PAID";
    expect(await runProceedingsDeadlineReminders(brisbaneNoon("2026-12-28"))).toBe(0);
    expect(await runProceedingsDeadlineReminders(brisbaneNoon("2027-01-27"))).toBe(1);
    expect(sharedFake.table("ProceedingsDeadlineReminder").map((r) => r.oldestDueOn).sort()).toEqual(["2024-10-27", "2025-01-27"]);
  });
});

describe("NSW is unaffected", () => {
  it("while no live pack has the rule (Queensland left out), the run reads nothing and sends nothing", async () => {
    switches.qldLive = false;
    expect(statesWithProceedingsRule()).toEqual([]);
    expect(await runProceedingsDeadlineReminders(brisbaneNoon("2026-10-27"))).toBe(0);
    expect(switches.tablesRead).toEqual([]);
    expect(switches.emails).toEqual([]);
  });

  it("with Queensland live, as it is from the switch-on, no NSW building is read or emailed", async () => {
    expect(statesWithProceedingsRule()).toEqual(["QLD"]);
    for (const day of ["2026-10-27", "2026-11-27", "2026-12-28"]) await runProceedingsDeadlineReminders(brisbaneNoon(day));
    expect(vi.mocked(rulesForState).mock.calls.map(([s]) => s)).not.toContain("NSW");
    expect(switches.emails.map((e) => e.to).filter((to) => to.startsWith("nsw"))).toEqual([]);
    expect(sharedFake.table("ProceedingsDeadlineReminder").map((r) => r.schemeId)).toEqual(["qld-1"]);
  });

  it("the daily compliance run reports no proceedings reminders while no live pack has the rule", async () => {
    switches.qldLive = false;
    const result = await runComplianceDay(brisbaneNoon("2026-10-27"));
    expect(result.proceedingsReminders).toBe(0);
    expect(switches.tablesRead).not.toContain("ProceedingsDeadlineReminder");
    expect(switches.emails.filter((e) => /proceedings/i.test(e.subject))).toEqual([]);
  });
});
