import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Issuing a notice while the meeting changes: the notice is issued only if
 * the meeting still has the status and details it was drafted from.
 */
const MEETING = {
  id: "m1",
  schemeId: "s1",
  status: "DRAFT",
  title: "AGM 2026",
  meetingType: "AGM",
  startTime: "2026-12-01T07:00:00.000Z",
  scheduledAt: "2026-12-01T07:00:00.000Z",
  timezone: "Australia/Sydney",
  format: "IN_PERSON",
  location: "Level 3",
  joinUrl: null,
  joinDetails: null,
};
let current: Record<string, unknown> = { ...MEETING };
const updates = vi.fn(async () => 1);
const noticeUpdate = vi.fn(async () => 1);
const notify = vi.fn(async () => undefined);

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-access", () => ({ requireSchemeAccess: vi.fn(async () => ({ profile: { id: "adviser" } })) }));
vi.mock("@/lib/jurisdiction/scheme-time", () => ({ schemeTimeZone: vi.fn(async () => "Australia/Sydney") }));
vi.mock("@/lib/vault/sources", () => ({ captureMeetingNotice: vi.fn(async () => undefined) }));
vi.mock("@/lib/queries/meetings", () => ({
  getMeetingById: vi.fn(async () => ({ ...MEETING })),
  updateMeetingWhileStatus: (...a: unknown[]) => updates(...(a as [])),
}));
vi.mock("@/lib/queries/schemes", () => ({
  getSchemeById: vi.fn(async () => ({ id: "s1", name: "Scheme", planNumber: "SP1", state: "NSW", memberships: [] })),
  getSchemeNameById: vi.fn(async () => "Scheme"),
  getMemberEmailsForScheme: vi.fn(async () => []),
}));
vi.mock("@/lib/queries/agenda", () => ({ getAgendaItemsForMeeting: vi.fn(async () => [{ position: 1, title: "Item" }]) }));
vi.mock("@/lib/queries/notice", () => ({
  createNotice: vi.fn(async () => ({ id: "n1" })),
  getLatestNoticeVersion: vi.fn(async () => 0),
  supersedeNotices: vi.fn(),
  createNoticeRecipient: vi.fn(),
}));
vi.mock("@/lib/meetings/rule-set-repo", () => ({ getActiveRuleSet: vi.fn(async () => ({})) }));
vi.mock("@/lib/meetings/rules", () => ({ noticeCheck: () => ({ requiredDays: 21, actualDays: 30, compliant: true }) }));
vi.mock("@/lib/meetings/notice", () => ({ assembleNoticeContent: () => ({}) }));
vi.mock("@/lib/meetings/events", () => ({ recordMeetingEvent: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ notifyMeetingScheduled: (...a: unknown[]) => notify(...(a as [])) }));
vi.mock("@/lib/billing/capture", () => ({ assertUsageFeeConfirmed: vi.fn(), captureUsageFee: vi.fn(), hasFeeEvent: vi.fn(async () => false) }));
vi.mock("@/lib/billing/disclosure", () => ({ feeErrorMessage: () => null }));
vi.mock("@/lib/billing/hook-codes", () => ({ isChargeableMeetingType: () => false }));
vi.mock("@/prisma/db", () => {
  const orm = {
    public: {
      Meeting: { where: () => ({ first: async () => ({ ...current }) }) },
      Notice: { where: () => ({ updateAndCount: (...a: unknown[]) => noticeUpdate(...(a as [])) }) },
    },
  };
  return { db: { orm, transaction: async (fn: (tx: { orm: typeof orm }) => unknown) => fn({ orm }) } };
});

const { issueNoticeAction } = await import("./notice-actions");

beforeEach(() => {
  vi.clearAllMocks();
  current = { ...MEETING };
  updates.mockResolvedValue(1);
});

describe("issueNoticeAction while the meeting changes", () => {
  it("issues the notice when nothing changed", async () => {
    expect(await issueNoticeAction("s1", "m1")).toEqual({ ok: true });
    expect(updates).toHaveBeenCalledWith("s1", "m1", ["DRAFT"], { status: "NOTICE_ISSUED" }, expect.anything());
    expect(noticeUpdate).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalled();
  });

  it("does not issue it if the meeting was cancelled meanwhile", async () => {
    updates.mockResolvedValue(0);
    const r = await issueNoticeAction("s1", "m1");
    expect(r.error).toMatch(/changed while the notice was being issued/);
    expect(noticeUpdate).toHaveBeenCalledWith({ status: "SUPERSEDED" });
    expect(notify).not.toHaveBeenCalled();
  });

  it("does not issue it if the time was edited meanwhile", async () => {
    current = { ...MEETING, startTime: "2026-12-08T07:00:00.000Z" };
    const r = await issueNoticeAction("s1", "m1");
    expect(r.error).toMatch(/changed while the notice was being issued/);
    expect(notify).not.toHaveBeenCalled();
  });
});
