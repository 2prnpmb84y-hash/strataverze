/**
 * Recording a resolved yearly rate and a one-case waiver (VIC, ACT and WA
 * stage 2, PR 5), and the interest run reading them. The packs are pending,
 * so the test gives a building their rules directly ("ACT-SHAPED" and so on).
 * "VIC-FIXTURE" is the Victorian pack with the values the notes leave out
 * filled in (the cap, simple interest, 365 days), as a later pack version
 * would record them, so the run can be seen charging and waiving.
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
const activity = vi.fn();
vi.mock("@/lib/queries/activity-log", () => ({ logActivity: (a: unknown) => activity(a), getAuditTrailForExport: vi.fn(), formatAuditTrailCsv: vi.fn() }));
vi.mock("@/lib/jurisdiction/scheme-rules", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/scheme-rules")>("@/lib/jurisdiction/scheme-rules");
  const { PENDING_RULE_PACKS } = await import("@/config/statutory");
  const P = PENDING_RULE_PACKS;
  const vic = P.VIC.rules;
  const a = vic.LATE_CHARGE.annual!;
  const v = <T>(value: T) => ({ value, status: "STRATAVERZE" as const, source: "fixture" });
  const vicFixture = {
    ...vic,
    LATE_CHARGE: {
      ...vic.LATE_CHARGE,
      annual: { ...a, accrual: { ...a.accrual, simple: v(true as const), daysInYear: v(365) }, resolvedRate: { ...a.resolvedRate!, maxPercent: v(10) } },
    },
  };
  const shaped: Record<string, unknown> = {
    "ACT-SHAPED": P.ACT.rules,
    "WA-SHAPED": P.WA.rules,
    "VIC-SHAPED": vic,
    "VIC-FIXTURE": vicFixture,
  };
  const forState = (state: string | null | undefined) => (state && shaped[state] ? { pack: null, rules: shaped[state], label: `${state} test` } : actual.rulesForState(state));
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
const { saveInterestSettingAction, recordLateChargeWaiverAction } = await import("./actions");
const { statutoryInterestForScheme } = await import("@/lib/finance/interest-setting");
const { getOverdueLevyNoticesWithInterest, chargeInterestBatch } = await import("@/lib/queries/interest");
const { updateScheme } = await import("@/lib/queries/schemes");

const NSW_ID = "11111111-0000-0000-0000-000000000001";
const ACT_ID = "33333333-0000-0000-0000-000000000003";
const WA_ID = "44444444-0000-0000-0000-000000000004";
const VIC_ID = "55555555-0000-0000-0000-000000000005";
const FIX_ID = "66666666-0000-0000-0000-000000000006";
const IDS = { [NSW_ID]: "NSW", [ACT_ID]: "ACT-SHAPED", [WA_ID]: "WA-SHAPED", [VIC_ID]: "VIC-SHAPED", [FIX_ID]: "VIC-FIXTURE" } as Record<string, string>;

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, val] of Object.entries(fields)) fd.set(k, val);
  return fd;
}
const save = (schemeId: string, fields: Record<string, string>) => saveInterestSettingAction(schemeId, {}, form(fields));
const waive = (schemeId: string, fields: Record<string, string>) => recordLateChargeWaiverAction(schemeId, {}, form(fields));
const scheme = (id: string) => sharedFake.table("Scheme").find((s) => s.id === id)!;
const at = (id: string, motion = "special") => ({ meetingId: `${id}-agm`, motionId: `${id}-${motion}` });
const notice = (schemeId: string, n: string, dueDate: string) => ({
  id: `${schemeId}-${n}`,
  schemeId,
  lotId: `${schemeId}-lot`,
  lot: { lotNumber: "1" },
  fund: { fundType: "ADMINISTRATIVE", name: "Administrative Fund" },
  noticeNumber: `F-${n}`,
  dueDate,
  amountDue: "1000.00",
  amountPaid: "0",
  balanceOutstanding: "1000.00",
  interestCharged: "0",
  migratedInterestCharged: "0",
  status: "ISSUED",
  migrationBatchId: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-03-02T01:00:00.000Z"));
  membership.mockResolvedValue({ profile: { id: "adviser" }, membership: { role: "ADVISER" }, roles: ["ADVISER"] });
  sharedFake.reset({
    Scheme: Object.entries(IDS).map(([id, state]) => ({
      id,
      state,
      postcode: "3000",
      interestMode: state === "VIC-SHAPED" || state === "VIC-FIXTURE" ? "NONE" : "STATUTORY",
      lateChargeMonthlyRatePercent: null,
      lateChargeAnnualRatePercent: null,
      timeZone: "Australia/Sydney",
    })),
    Meeting: Object.keys(IDS).map((id) => ({ id: `${id}-agm`, schemeId: id, meetingType: "AGM", scheduledAt: "2026-02-14T23:00:00.000Z", timezone: null })),
    AgendaItem: Object.keys(IDS).flatMap((id) => [
      { id: `${id}-special`, meetingId: `${id}-agm`, status: "CARRIED", outcome: null, resolutionCategory: "SPECIAL" },
      { id: `${id}-ordinary`, meetingId: `${id}-agm`, status: "CARRIED", outcome: null, resolutionCategory: "ORDINARY" },
      { id: `${id}-lost`, meetingId: `${id}-agm`, status: "LOST", outcome: null, resolutionCategory: "SPECIAL" },
    ]),
    LevyNotice: [notice(FIX_ID, "n1", "2026-01-31"), notice(FIX_ID, "n2", "2026-01-31"), notice(ACT_ID, "n1", "2026-01-31"), notice(NSW_ID, "n1", "2026-01-31")],
    LevyPayment: [],
    LateChargeWaiver: [],
    SchemeSelectorValue: [],
    Lot: [],
  });
});

describe("recording a yearly rate", () => {
  it("ACT: a special resolution may set 20% or 0%, and statutory interest clears the rate", async () => {
    expect(await save(ACT_ID, { mode: "RESOLVED_ANNUAL_RATE", annualRatePercent: "20", ...at(ACT_ID) })).toEqual({ success: true });
    expect(scheme(ACT_ID)).toMatchObject({ interestMode: "RESOLVED_ANNUAL_RATE", lateChargeAnnualRatePercent: "20.00", lateChargeMonthlyRatePercent: null, interestResolutionMotionId: `${ACT_ID}-special` });
    expect(activity).toHaveBeenCalledWith(expect.objectContaining({ action: "INTEREST_SETTING_CHANGED", metadata: expect.objectContaining({ annualRatePercent: 20 }) }));
    expect(await save(ACT_ID, { mode: "RESOLVED_ANNUAL_RATE", annualRatePercent: "0", ...at(ACT_ID) })).toEqual({ success: true });
    expect(scheme(ACT_ID).lateChargeAnnualRatePercent).toBe("0.00");
    expect(await save(ACT_ID, { mode: "STATUTORY", annualRatePercent: "5" })).toEqual({ success: true });
    expect(scheme(ACT_ID)).toMatchObject({ interestMode: "STATUTORY", lateChargeAnnualRatePercent: null, interestResolutionMeetingId: null, interestResolutionMotionId: null });
  });

  it("ACT: refuses 21%, a malformed rate, a motion not recorded as a special resolution and a lost motion", async () => {
    expect((await save(ACT_ID, { mode: "RESOLVED_ANNUAL_RATE", annualRatePercent: "21", ...at(ACT_ID) })).error).toBe("The yearly interest rate must be from 0% to 20% a year.");
    expect((await save(ACT_ID, { mode: "RESOLVED_ANNUAL_RATE", annualRatePercent: "5%", ...at(ACT_ID) })).error).toMatch(/as a percentage/);
    expect((await save(ACT_ID, { mode: "RESOLVED_ANNUAL_RATE", annualRatePercent: "12", ...at(ACT_ID, "ordinary") })).error).toBe(
      "That motion is not recorded as a special resolution. Choose a motion carried as a special resolution.",
    );
    expect((await save(ACT_ID, { mode: "RESOLVED_ANNUAL_RATE", annualRatePercent: "12", ...at(ACT_ID, "lost") })).error).toMatch(/not carried/);
    expect((await save(ACT_ID, { mode: "RESOLVED_ANNUAL_RATE", annualRatePercent: "12", ...at(WA_ID) })).error).toBeTruthy();
    expect(scheme(ACT_ID)).toMatchObject({ interestMode: "STATUTORY", lateChargeAnnualRatePercent: null });
  });

  it("WA: a lower rate is refused while who decides is not confirmed; VIC: refused while the cap is not confirmed", async () => {
    expect((await save(WA_ID, { mode: "RESOLVED_ANNUAL_RATE", annualRatePercent: "5", ...at(WA_ID) })).error).toBe(
      "Who may set a different interest rate is not confirmed for this building's rules yet, so no rate can be recorded.",
    );
    expect((await save(VIC_ID, { mode: "RESOLVED_ANNUAL_RATE", annualRatePercent: "8", ...at(VIC_ID) })).error).toBe(
      "The highest interest rate a resolution may set is not confirmed yet, so no rate can be recorded.",
    );
    expect(scheme(WA_ID).interestMode).toBe("STATUTORY");
    expect(scheme(VIC_ID).interestMode).toBe("NONE");
  });

  it("NSW: unchanged, and never given a yearly rate", async () => {
    expect((await save(NSW_ID, { mode: "RESOLVED_ANNUAL_RATE", annualRatePercent: "8", ...at(NSW_ID) })).error).toBe("Choose the statutory rate or no interest.");
    expect(await save(NSW_ID, { mode: "NO_INTEREST", ...at(NSW_ID, "ordinary") })).toEqual({ success: true });
    expect(scheme(NSW_ID)).toMatchObject({ interestMode: "NO_INTEREST", lateChargeAnnualRatePercent: null });
  });

  it("a state change clears a yearly rate and goes back to the new state's default", async () => {
    await save(ACT_ID, { mode: "RESOLVED_ANNUAL_RATE", annualRatePercent: "12.5", ...at(ACT_ID) });
    expect(scheme(ACT_ID).lateChargeAnnualRatePercent).toBe("12.50");
    await updateScheme(ACT_ID, { state: "NSW", postcode: "2000" });
    expect(scheme(ACT_ID)).toMatchObject({ state: "NSW", interestMode: "STATUTORY", lateChargeAnnualRatePercent: null, interestResolutionMeetingId: null, interestResolutionMotionId: null });
  });
});

describe("recording a waiver on one notice", () => {
  const ok = { levyNoticeId: `${FIX_ID}-n1`, kind: "WHOLE", reasons: "Hardship, by agreement", ...at(FIX_ID, "ordinary") };

  it("Victoria: records who decided, when, the resolution and what was waived", async () => {
    expect(await waive(FIX_ID, ok)).toEqual({ success: true });
    expect(await waive(FIX_ID, { ...ok, levyNoticeId: `${FIX_ID}-n2`, kind: "AMOUNT", amount: "2.50" })).toEqual({ success: true });
    expect(await waive(FIX_ID, { ...ok, levyNoticeId: `${FIX_ID}-n2`, kind: "PERIOD", fromDate: "2026-02-01", toDate: "2026-02-10" })).toEqual({ success: true });
    const rows = sharedFake.table("LateChargeWaiver");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      schemeId: FIX_ID,
      levyNoticeId: `${FIX_ID}-n1`,
      kind: "WHOLE",
      amount: null,
      fromDate: null,
      toDate: null,
      decidedBy: "GENERAL_MEETING",
      resolutionMeetingId: `${FIX_ID}-agm`,
      resolutionMotionId: `${FIX_ID}-ordinary`,
      // The meeting was at 10 am on 15 February in Sydney.
      decidedOn: "2026-02-15",
      reasons: "Hardship, by agreement",
      rulePack: "VIC-FIXTURE test",
      recordedBy: "adviser",
    });
    expect(rows[1]).toMatchObject({ kind: "AMOUNT", amount: "2.50" });
    expect(rows[2]).toMatchObject({ kind: "PERIOD", fromDate: "2026-02-01", toDate: "2026-02-10" });
    expect(activity).toHaveBeenCalledWith(expect.objectContaining({ action: "LATE_CHARGE_WAIVER_RECORDED", entityType: "LevyNotice", entityId: `${FIX_ID}-n1` }));
  });

  it("refuses no reasons, another building's notice, a lost motion, a bad amount, and packs with no waiver or no decider", async () => {
    expect((await waive(FIX_ID, { ...ok, reasons: "" })).error).toBe("Enter the reasons for the decision. They are reported to the annual general meeting.");
    expect((await waive(FIX_ID, { ...ok, levyNoticeId: `${ACT_ID}-n1` })).error).toBe("Choose a fee notice of this building.");
    expect((await waive(FIX_ID, { ...ok, ...at(FIX_ID, "lost") })).error).toMatch(/not carried/);
    expect((await waive(FIX_ID, { ...ok, kind: "AMOUNT", amount: "2.505" })).error).toMatch(/more than \$0/);
    expect((await waive(WA_ID, { ...ok, levyNoticeId: `${WA_ID}-n1` })).error).toMatch(/^Who may waive interest is not confirmed/);
    expect((await waive(ACT_ID, { ...ok, levyNoticeId: `${ACT_ID}-n1` })).error).toBe("This building's rules give no waiver of interest in a particular case.");
    expect((await waive(NSW_ID, { ...ok, levyNoticeId: `${NSW_ID}-n1` })).error).toBe("This building's rules give no waiver of interest in a particular case.");
    expect(sharedFake.table("LateChargeWaiver")).toHaveLength(0);
  });
});

describe("the interest run", () => {
  it("charges at the resolved rate and respects a waiver on one notice (fixture)", async () => {
    Object.assign(scheme(FIX_ID), { interestMode: "RESOLVED_ANNUAL_RATE", lateChargeAnnualRatePercent: "10.00", interestResolutionMeetingId: `${FIX_ID}-agm`, interestResolutionMotionId: `${FIX_ID}-ordinary` });
    await waive(FIX_ID, { levyNoticeId: `${FIX_ID}-n1`, kind: "WHOLE", reasons: "Hardship", ...at(FIX_ID, "ordinary") });
    const owed = await statutoryInterestForScheme(FIX_ID, "2026-03-02");
    expect(owed.find((o) => o.noticeId === `${FIX_ID}-n1`)).toMatchObject({ interestCents: 0, reason: "WAIVED", additionalCents: 0 });
    // 30 days on $1,000 at 10%: $8.22.
    expect(owed.find((o) => o.noticeId === `${FIX_ID}-n2`)).toMatchObject({ interestCents: 822, reason: "ACCRUED", additionalCents: 822 });
    const list = await getOverdueLevyNoticesWithInterest(FIX_ID);
    expect(list).toMatchObject({ charging: true, annualRate: 10, monthlyRate: 0, missing: [] });
  });

  it("charges nothing where the pack does not confirm how interest is worked out, and says so", async () => {
    const list = await getOverdueLevyNoticesWithInterest(ACT_ID);
    expect(list).toMatchObject({ charging: false, annualRate: 0, missing: ["accrual.from", "accrual.graceMonths", "accrual.daysInYear"] });
    expect(list!.notices[0]).toMatchObject({ interestReason: "RULE_NOT_CONFIRMED", additionalInterest: 0 });
    await expect(chargeInterestBatch({ schemeId: ACT_ID, actorId: "adviser" })).rejects.toThrow(
      "No interest can be charged yet, because this building's rules do not yet confirm how it is worked out.",
    );
  });

  it("does not read waivers for an NSW building", async () => {
    sharedFake.table("LateChargeWaiver").push({ id: "w", levyNoticeId: `${NSW_ID}-n1`, kind: "WHOLE" });
    // Statutory interest after the month's grace, from the due date: 30 days at 10% on $1,000, the waiver row ignored.
    const owed = await statutoryInterestForScheme(NSW_ID, "2026-03-02");
    expect(owed[0]).toMatchObject({ reason: "ACCRUED", interestCents: 822 });
  });
});
