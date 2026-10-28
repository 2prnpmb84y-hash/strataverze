/**
 * Reading what a notice states about the whole building (the ACT, stage 2
 * PR 6b; see ./every-lot.ts), server side. Only a pack that requires these
 * contents calls it, so NSW and Queensland notices read nothing more.
 */
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type { TimestampString } from "@prisma/orm-postgres/target/codec-types";
import type { StatutoryRules } from "@/config/statutory";
import { onLotSchedule } from "@/lib/jurisdiction/building-data";
import { addMonths, financialYearStart, INSTALMENTS_PER_YEAR, toCents, toIsoDay, type LevyFrequency } from "./notice-plan";
import { buildPeriodEveryLot, everyLotFor, type EveryLotBuild, type EveryLotPeriod } from "./every-lot";

/** The most rows read at once; a building with more is refused rather than shown in part. */
export const EVERY_LOT_READ_LIMIT = 20_000;
const ts = (v: string) => v as unknown as TimestampString<3>;

/**
 * Each notice's content: each unit's contribution for the notice's schedule
 * and period, the fund and its totals, and the unit's proportion. Read from
 * the stored notices of the schedule for the periods asked for (their amounts
 * are fixed when they are created); `amountCents` on a notice not stored yet
 * (one being planned) is taken as its amount. Worked out once for each
 * period. A notice whose content cannot be stated gets the reason.
 */
export async function loadEveryLot(input: {
  schemeId: string;
  rules: Pick<StatutoryRules, "TERMINOLOGY" | "ENTITLEMENT_SCHEDULES"> & Partial<Pick<StatutoryRules, "CONTRIBUTION_INSURANCE">>;
  fund: { id: string; name: string | null } | null;
  levyScheduleId: string | null | undefined;
  notices: readonly { lotId: string; periodStart?: string | null; amountCents?: number }[];
  /** The most rows read at once (tests only). */
  readLimit?: number;
}): Promise<EveryLotBuild[]> {
  const levy = input.rules.TERMINOLOGY.levy;
  const all = (reason: string): EveryLotBuild[] => input.notices.map(() => ({ content: null, reason }));
  if (!input.levyScheduleId) return all(`the notice's ${levy} schedule is not known`);
  if (!input.fund) return all("the notice's fund is not known");
  const scheduleId = input.levyScheduleId;
  const fundId = input.fund.id;
  const schedule = await db.orm.public.LevySchedule.where((x) => and(x.id.eq(scheduleId), x.schemeId.eq(input.schemeId))).first();
  if (!schedule || schedule.fundId !== fundId) return all(`the ${levy} schedule is not this building's schedule for the fund`);
  const levyType = String(schedule.levyType);
  // A schedule of notices brought across at takeover holds balances owed, not contributions: never listed.
  if (levyType !== "ORDINARY" && levyType !== "SPECIAL") return all(`notices brought across at takeover do not list each unit's ${levy}`);
  const periods = [...new Set(input.notices.map((n) => toIsoDay(n.periodStart)).filter(Boolean))];
  if (!periods.length) return all("the notice's period is not known");
  const limit = input.readLimit ?? EVERY_LOT_READ_LIMIT;
  const [scheme, lots, stored, sameYear] = await Promise.all([
    db.orm.public.Scheme.where((s) => s.id.eq(input.schemeId)).first(),
    db.orm.public.Lot.where((l) => l.schemeId.eq(input.schemeId)).limit(limit + 1).all(),
    db.orm.public.LevyNotice.where((n) => and(n.schemeId.eq(input.schemeId), n.levyScheduleId.eq(scheduleId), n.periodStart.in(periods.map(ts)))).limit(limit + 1).all(),
    levyType === "ORDINARY"
      ? db.orm.public.LevySchedule.where((x) => and(x.schemeId.eq(input.schemeId), x.fundId.eq(fundId), x.financialYear.eq(Number(schedule.financialYear)), x.levyType.eq("ORDINARY"))).limit(50).all()
      : Promise.resolve([]),
  ]);
  if (lots.length > limit || stored.length > limit) return all(`the building has more ${input.rules.TERMINOLOGY.lots ?? "lots"} or notices than can be read at once`);

  const t = input.rules.TERMINOLOGY;
  let entitlement: string | null = null;
  try {
    entitlement = onLotSchedule(input.rules).name;
  } catch {
    entitlement = null;
  }
  const words = { lot: t.lot ?? "lot", lots: t.lots ?? "lots", levy: t.levy, entitlement };
  const lotRows = lots.map((l) => ({
    id: l.id,
    lotNumber: String(l.lotNumber),
    entitlement: Number(l.entitlement),
    lotType: l.lotType ?? null,
    deleted: "deletedAt" in l && (l as { deletedAt?: unknown }).deletedAt != null,
  }));
  // The schedule was revised: it, or another budget schedule for the fund and year, was superseded.
  const revised = levyType === "ORDINARY" && (schedule.status === "SUPERSEDED" || sameYear.some((x) => x.id !== schedule.id && ["ACTIVE", "SUPERSEDED"].includes(String(x.status))));
  const frequency = (levyType === "SPECIAL" ? "ONE_OFF" : String(schedule.frequency)) as LevyFrequency;
  const instalments = INSTALMENTS_PER_YEAR[frequency] ?? null;
  const fyStart = levyType === "ORDINARY" && scheme ? financialYearStart(Number(schedule.financialYear), String(scheme.financialYearEnd ?? "")) : null;
  const instalmentIndex = (period: string): number | null => {
    if (!instalments) return null;
    if (levyType === "SPECIAL") return 0;
    if (!fyStart) return null;
    for (let k = 0; k < instalments; k++) if (addMonths(fyStart, (k * 12) / instalments) === period) return k;
    return null;
  };

  // Each period's notices: the stored ones, then any being planned for it (not stored yet).
  type PeriodNotice = { lotId: string; cents: number; insuranceSplit: boolean };
  const byPeriod = new Map<string, PeriodNotice[]>(periods.map((p) => [p, []]));
  const storedKeys = new Set<string>();
  for (const s of stored) {
    const period = toIsoDay(s.periodStart);
    storedKeys.add(`${period}|${s.lotId}`);
    byPeriod.get(period)?.push({ lotId: s.lotId, cents: toCents(String(s.amountDue)), insuranceSplit: s.insuranceAmount != null });
  }
  for (const p of input.notices) {
    const period = toIsoDay(p.periodStart);
    if (p.amountCents === undefined || !period || storedKeys.has(`${period}|${p.lotId}`)) continue;
    byPeriod.get(period)?.push({ lotId: p.lotId, cents: p.amountCents, insuranceSplit: false });
  }
  const built = new Map<string, EveryLotPeriod>();
  for (const [period, periodNotices] of byPeriod) {
    built.set(
      period,
      buildPeriodEveryLot({
        lots: lotRows,
        periodNotices,
        schedule: {
          budgetCents: toCents(String(schedule.budgetAmount)),
          levyType,
          totalEntitlement: Number(schedule.totalEntitlement),
          instalments: instalments ?? 0,
          instalmentIndex: instalmentIndex(period),
          revised,
        },
        fundName: input.fund.name,
        words,
        sharedByEntitlement: !input.rules.CONTRIBUTION_INSURANCE,
      }),
    );
  }
  return input.notices.map((n) => {
    const period = built.get(toIsoDay(n.periodStart));
    return period ? everyLotFor(period, n.lotId) : { content: null, reason: "the notice's period is not known" };
  });
}
