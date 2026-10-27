/**
 * Loading a building's lots for the proceedings deadline check (stage 2,
 * step 8, 27 Oct 2026). Only called for a pack with the rule, so an NSW
 * building runs no query.
 */
import { and } from "@prisma/orm-postgres/orm-client";
import type { Numeric, TimestampString } from "@prisma/orm-postgres/target/codec-types";
import { db } from "@/prisma/db";
import {
  flaggableDueOnOrBefore,
  lotDebtsFrom,
  proceedingsDeadlineFlags,
  type LotDebt,
  type ProceedingsDeadlineFlag,
  type ProceedingsDeadlineRule,
} from "./proceedings-deadline";

const isoDay = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? "")).slice(0, 10);

/**
 * The lots with an unpaid contribution old enough to flag (an issued notice
 * with a balance, due on or before today less the rule's years, oldest
 * first, so the row limit can only drop newer ones) and whether proceedings
 * for it have started (lotDebtsFrom).
 */
export async function lotDebtsFor(schemeId: string, rule: Pick<ProceedingsDeadlineRule, "overdueYears">, today: string): Promise<LotDebt[]> {
  const cutoff = flaggableDueOnOrBefore(rule, today);
  const notices = await db.orm.public.LevyNotice
    .where((n) =>
      and(
        n.schemeId.eq(schemeId),
        n.status.in(["ISSUED", "PARTIALLY_PAID", "OVERDUE"]),
        n.dueDate.lte(cutoff as unknown as TimestampString<3>),
        n.balanceOutstanding.gt("0" as unknown as Numeric<12, 2>),
      ),
    )
    .include("lot")
    .orderBy((n) => n.dueDate.asc())
    .limit(20000)
    .all();
  if (notices.length === 0) return [];
  const lotIds = [...new Set(notices.map((n) => n.lotId))];
  const cases = await db.orm.public.DebtRecoveryCase.where((c) => and(c.schemeId.eq(schemeId), c.lotId.in(lotIds))).limit(5000).all();
  const caseIds = cases.map((c) => c.id);
  const proceedingsSteps = caseIds.length
    ? await db.orm.public.DebtRecoveryStep.where((s) => and(s.caseId.in(caseIds), s.stepType.eq("PROCEEDINGS"), s.status.eq("COMPLETED"))).limit(5000).all()
    : [];
  return lotDebtsFrom(
    notices.map((n) => ({ lotId: n.lotId, lotNumber: String(n.lot?.lotNumber ?? "?"), dueDate: isoDay(n.dueDate), balanceCents: Math.round(Number(n.balanceOutstanding ?? 0) * 100) })),
    cases.map((c) => ({ id: c.id, lotId: c.lotId, status: String(c.status), openedOn: isoDay(c.createdAt), courtFileNumber: c.courtFileNumber == null ? null : String(c.courtFileNumber) })),
    new Set(proceedingsSteps.map((s) => s.caseId)),
  );
}

/** The building's lots that must have proceedings started, or none when its pack has no such rule. */
export async function proceedingsDeadlineFlagsFor(schemeId: string, rule: ProceedingsDeadlineRule | null, today: string): Promise<ProceedingsDeadlineFlag[]> {
  if (!rule) return [];
  return proceedingsDeadlineFlags(rule, await lotDebtsFor(schemeId, rule, today), today);
}
