/**
 * The daily statutory reminders leave a switched off scheme alone
 * (schemes.is_active = false, 31 Oct 2026): no payment plan or committee
 * training reminder is claimed or sent for it, and the other buildings'
 * reminders go out as before. Run against the in-memory database. (The
 * annual report and proceedings deadline reminders already read only active
 * schemes, and are covered by their own tests.)
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("@/lib/log", () => ({ logError: vi.fn() }));

const sent = vi.hoisted(() => ({ paymentPlan: [] as string[], training: [] as string[], trainingRead: [] as string[] }));
vi.mock("@/lib/debt-recovery/payment-plan-notify", () => ({
  notifyPaymentPlanReplyDue: async (i: { schemeId: string }) => void sent.paymentPlan.push(i.schemeId),
}));
vi.mock("@/lib/governance/committee-training-store", () => ({
  // Every building has one member whose training is due in 7 days.
  committeeTrainingRows: async (schemeId: string) => {
    sent.trainingRead.push(schemeId);
    return { scheme: { name: schemeId }, today: "2026-11-02", rules: { course: "c", consequence: "x", helpUrl: "u" }, rows: [{ profileId: `m-${schemeId}`, status: "DUE", daysLeft: 7 }] };
  },
  claimTrainingReminder: async () => true,
}));
vi.mock("@/lib/governance/training-notify", () => ({
  notifyTrainingDue: async (i: { schemeName: string }) => void sent.training.push(i.schemeName),
  notifyTrainingOverdue: async (i: { schemeId: string }) => void sent.training.push(i.schemeId),
}));
vi.mock("./annual-report-store", () => ({ annualReportOverview: async () => null, claimReportReminder: async () => false }));
vi.mock("./report-notify", () => ({ notifyAnnualReportDue: vi.fn() }));
vi.mock("@/lib/debt-recovery/proceedings-reminder-run", () => ({ runProceedingsDeadlineReminders: async () => 0 }));

const { sharedFake } = await import("@/test/fake-orm");
const { runComplianceDay } = await import("./daily");

/** Midday 2 Nov 2026 in Sydney. */
const NOW = new Date("2026-11-02T01:00:00.000Z");

beforeEach(() => {
  sent.paymentPlan = [];
  sent.training = [];
  sent.trainingRead = [];
  sharedFake.reset({
    Scheme: [
      { id: "on", state: "NSW", timeZone: "Australia/Sydney" },
      { id: "off", state: "NSW", timeZone: "Australia/Sydney", isActive: false },
    ],
    // A reply due in 7 days in each building.
    PaymentPlanRequest: ["on", "off"].map((schemeId) => ({ id: `ppr-${schemeId}`, schemeId, lotId: "l1", status: "RECEIVED", repliedOn: null, replyDueOn: "2026-11-09", lastReminderOn: null, createdAt: "2026-10-20T00:00:00.000Z" })),
    SchemeMembership: ["on", "off"].map((schemeId) => ({ id: `cm-${schemeId}`, schemeId, profileId: `m-${schemeId}`, role: "COMMITTEE", isActive: true })),
    Meeting: [],
    AnnualReport: [],
  });
});

const request = (schemeId: string) => sharedFake.table("PaymentPlanRequest").find((r) => r.schemeId === schemeId)!;

describe("the daily reminders for a switched off scheme", () => {
  it("send no payment plan reply reminder for it, and the other building's as before", async () => {
    const r = await runComplianceDay(NOW);
    expect(r.paymentPlanReminders).toBe(1);
    expect(sent.paymentPlan).toEqual(["on"]);
    expect(request("on").lastReminderOn).toBe("2026-11-02");
    expect(request("off").lastReminderOn).toBeNull();
  });

  it("send no committee training reminder for it, and the other building's as before", async () => {
    const r = await runComplianceDay(NOW);
    expect(r.trainingReminders).toBe(1);
    expect(sent.trainingRead).toEqual(["on"]);
    expect(sent.training).toEqual(["on"]);
  });

  it("send both buildings' reminders while both are active", async () => {
    sharedFake.table("Scheme").find((s) => s.id === "off")!.isActive = true;
    const r = await runComplianceDay(NOW);
    expect(r).toMatchObject({ paymentPlanReminders: 2, trainingReminders: 2 });
    expect(sent.paymentPlan.sort()).toEqual(["off", "on"]);
    expect(sent.training.sort()).toEqual(["off", "on"]);
  });
});
