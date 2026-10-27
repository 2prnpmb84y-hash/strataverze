/**
 * Saving a building's late charge setting (QLD stage 2, step 6): the modes,
 * the resolution and the rate come from the pack's LATE_CHARGE, and the
 * action writes interest_mode, late_charge_monthly_rate_percent (only for a
 * resolved rate) and the resolution.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/mfa-enforcement", () => ({
  requireRecentMfa: vi.fn(async () => {}),
  getMfaStatus: vi.fn(async () => null),
  enforceMfa: vi.fn(async () => {}),
  enforceMfaFor: vi.fn(async () => {}),
  StepUpRequiredError: class extends Error {},
}));
const membership = vi.fn();
vi.mock("@/lib/auth/require-membership", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/require-membership")>("@/lib/auth/require-membership");
  return { ...actual, requireSchemeMembership: (...a: unknown[]) => membership(...a) };
});
vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/queries/activity-log", () => ({ logActivity: vi.fn(), getAuditTrailForExport: vi.fn(), formatAuditTrailCsv: vi.fn() }));
// A Queensland-shaped building: the shared rules from the Queensland pack (not yet active).
vi.mock("@/lib/jurisdiction/scheme-rules", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/scheme-rules")>("@/lib/jurisdiction/scheme-rules");
  const { PENDING_RULE_PACKS } = await import("@/config/statutory");
  const q = PENDING_RULE_PACKS.QLD.rules;
  const qld = {
    TERMINOLOGY: q.TERMINOLOGY,
    FUND_CATALOGUE: q.FUND_CATALOGUE,
    ENTITLEMENT_SCHEDULES: q.ENTITLEMENT_SCHEDULES,
    PAYMENT_ALLOCATION_ORDER: q.PAYMENT_ALLOCATION_ORDER,
    FEATURES: q.FEATURES,
    NOTICE_RULES: q.NOTICE_RULES,
    LATE_CHARGE: q.LATE_CHARGE,
  };
  const forState = (state: string | null | undefined) => (state === "QLD-SHAPED" ? { pack: null, rules: qld, label: "AU-QLD test" } : actual.rulesForState(state));
  return {
    ...actual,
    rulesForState: forState,
    rulesForScheme: async (schemeId: string) => {
      const { sharedFake } = await import("@/test/fake-orm");
      return forState(sharedFake.table("Scheme").find((s) => s.id === schemeId)?.state as string);
    },
  };
});

const { sharedFake } = await import("@/test/fake-orm");
const { saveInterestSettingAction } = await import("./actions");

const NSW_ID = "11111111-0000-0000-0000-000000000001";
const QLD_ID = "22222222-0000-0000-0000-000000000002";

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}
const save = (schemeId: string, fields: Record<string, string>) => saveInterestSettingAction(schemeId, {}, form(fields));
const scheme = (id: string) => sharedFake.table("Scheme").find((s) => s.id === id)!;

beforeEach(() => {
  vi.clearAllMocks();
  membership.mockResolvedValue({ profile: { id: "adviser" }, membership: { role: "ADVISER" }, roles: ["ADVISER"] });
  sharedFake.reset({
    Scheme: [
      { id: NSW_ID, state: "NSW", interestMode: "STATUTORY", lateChargeMonthlyRatePercent: null, timeZone: "Australia/Sydney" },
      { id: QLD_ID, state: "QLD-SHAPED", interestMode: "NONE", lateChargeMonthlyRatePercent: null, timeZone: "Australia/Brisbane" },
    ],
    Meeting: [
      { id: "agm-nsw", schemeId: NSW_ID, meetingType: "AGM" },
      { id: "agm-qld", schemeId: QLD_ID, meetingType: "AGM" },
    ],
    AgendaItem: [
      { id: "motion-nsw", meetingId: "agm-nsw", status: "CARRIED", outcome: null },
      { id: "motion-qld", meetingId: "agm-qld", status: "CARRIED", outcome: null },
    ],
  });
});

describe("saveInterestSettingAction for NSW", () => {
  it("records no interest with its resolution, and no rate", async () => {
    expect(await save(NSW_ID, { mode: "NO_INTEREST", meetingId: "agm-nsw", motionId: "motion-nsw" })).toEqual({ success: true });
    expect(scheme(NSW_ID)).toMatchObject({
      interestMode: "NO_INTEREST",
      lateChargeMonthlyRatePercent: null,
      interestResolutionMeetingId: "agm-nsw",
      interestResolutionMotionId: "motion-nsw",
    });
  });

  it("records statutory interest with no resolution, ignoring a rate", async () => {
    expect(await save(NSW_ID, { mode: "STATUTORY", meetingId: "agm-nsw", motionId: "motion-nsw", monthlyRatePercent: "2" })).toEqual({ success: true });
    expect(scheme(NSW_ID)).toMatchObject({ interestMode: "STATUTORY", lateChargeMonthlyRatePercent: null, interestResolutionMeetingId: null, interestResolutionMotionId: null });
  });

  it("refuses a Queensland setting and no interest without its resolution, as before", async () => {
    expect(await save(NSW_ID, { mode: "RESOLVED_RATE", monthlyRatePercent: "2" })).toEqual({ error: "Choose the statutory rate or no interest." });
    expect(await save(NSW_ID, { mode: "NO_INTEREST" })).toEqual({
      error: "Charging no interest needs the general meeting resolution that decided it. Choose the meeting and motion.",
    });
    expect(scheme(NSW_ID).interestMode).toBe("STATUTORY");
  });
});

describe("saveInterestSettingAction for Queensland", () => {
  it("records a penalty at the resolved rate, with its resolution", async () => {
    expect(await save(QLD_ID, { mode: "RESOLVED_RATE", monthlyRatePercent: "2.5", meetingId: "agm-qld", motionId: "motion-qld" })).toEqual({ success: true });
    expect(scheme(QLD_ID)).toMatchObject({
      interestMode: "RESOLVED_RATE",
      lateChargeMonthlyRatePercent: "2.50",
      interestResolutionMeetingId: "agm-qld",
      interestResolutionMotionId: "motion-qld",
    });
  });

  it("records no penalty, clearing the rate and the resolution", async () => {
    await save(QLD_ID, { mode: "RESOLVED_RATE", monthlyRatePercent: "1.25", meetingId: "agm-qld", motionId: "motion-qld" });
    expect(await save(QLD_ID, { mode: "NONE", monthlyRatePercent: "1.25", meetingId: "agm-qld", motionId: "motion-qld" })).toEqual({ success: true });
    expect(scheme(QLD_ID)).toMatchObject({ interestMode: "NONE", lateChargeMonthlyRatePercent: null, interestResolutionMeetingId: null, interestResolutionMotionId: null });
  });

  it("refuses a rate over the pack's maximum, a missing or malformed rate, a missing resolution and an NSW setting", async () => {
    const resolution = { meetingId: "agm-qld", motionId: "motion-qld" };
    expect(await save(QLD_ID, { mode: "RESOLVED_RATE", monthlyRatePercent: "3", ...resolution })).toEqual({ error: "The monthly penalty rate can be at most 2.5%." });
    expect(await save(QLD_ID, { mode: "RESOLVED_RATE", ...resolution })).toEqual({
      error: "Enter the monthly penalty rate the body corporate resolved, as a percentage more than 0.",
    });
    expect((await save(QLD_ID, { mode: "RESOLVED_RATE", monthlyRatePercent: "2%", ...resolution })).error).toMatch(/more than 0/);
    expect((await save(QLD_ID, { mode: "RESOLVED_RATE", monthlyRatePercent: "1.234", ...resolution })).error).toMatch(/2 decimal places/);
    expect((await save(QLD_ID, { mode: "RESOLVED_RATE", monthlyRatePercent: "2" })).error).toMatch(/general meeting resolution/);
    expect((await save(QLD_ID, { mode: "STATUTORY" })).error).toBe("Choose no penalty or a penalty at the rate the body corporate resolved.");
    // A motion of another building's meeting is not this building's resolution.
    expect((await save(QLD_ID, { mode: "RESOLVED_RATE", monthlyRatePercent: "2", meetingId: "agm-nsw", motionId: "motion-nsw" })).error).toBeTruthy();
    expect(scheme(QLD_ID)).toMatchObject({ interestMode: "NONE", lateChargeMonthlyRatePercent: null });
  });
});
