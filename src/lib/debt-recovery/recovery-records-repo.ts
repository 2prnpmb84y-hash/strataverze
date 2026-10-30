/**
 * Reading and writing debt_recovery_records (VIC, ACT and WA stage 2, PR 9a,
 * migration 20261125; the ACT statutory charge and its revocation, PR 9b). Only called for a pack with the recovery gates
 * (recoveryGatesApply), so an NSW or Queensland case never reads or writes
 * the table.
 */
import type { Numeric } from "@prisma/orm-postgres/target/codec-types";
import { db } from "@/prisma/db";
import { schemeToday } from "@/lib/jurisdiction/scheme-time";
import { noticeCents, OVERDUE_NOTICE_STATUSES, overdueOn } from "@/lib/levies/overdue";
import { balancesCents } from "./case-amount";
import type { RecordedRecoveryFacts, RecoveryRecordToWrite } from "./recovery-gates";

type Orm = typeof db.orm;

const isoDay = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? "")).slice(0, 10);

/** A case's records, oldest first. Throws when they cannot be read, so a failed read is never "nothing recorded". */
export async function readRecoveryRecords(caseId: string, orm: Orm = db.orm) {
  const rows = await orm.public.DebtRecoveryRecord.where((r) => r.caseId.eq(caseId)).orderBy((r) => r.recordedAt.asc()).limit(200).all();
  return rows.map((r) => ({
    id: String(r.id),
    kind: String(r.kind),
    decidedOn: isoDay(r.decidedOn),
    resolutionMeetingId: r.resolutionMeetingId == null ? null : String(r.resolutionMeetingId),
    resolutionItemId: r.resolutionItemId == null ? null : String(r.resolutionItemId),
    resolutionKind: r.resolutionKind == null ? null : String(r.resolutionKind),
    amount: r.amount == null ? null : String(r.amount),
    forum: r.forum == null ? null : String(r.forum),
    // The day lodged: the statutory charge and its revocation only (PR 9b).
    lodgedOn: r.lodgedOn == null ? null : isoDay(r.lodgedOn),
  }));
}

export type RecoveryRecordRow = Awaited<ReturnType<typeof readRecoveryRecords>>[number];

/** What the case records, for the gates. */
export function recordedFacts(rows: readonly Pick<RecoveryRecordRow, "kind" | "forum">[]): RecordedRecoveryFacts {
  return {
    authorityToSue: rows.some((r) => r.kind === "AUTHORITY_TO_SUE"),
    forum: rows.find((r) => r.kind === "PROCEEDINGS_STARTED")?.forum ?? null,
  };
}

/**
 * The lot's amount owing now, as opening a case works it out: the sum, in
 * cents, of the balances of the notices overdue on the building's day
 * `today` (isOverdueOn), to two decimals. A balance already includes the
 * notice's late charge, so it is not added again (C1, "Balance only",
 * 30 Oct 2026). Without `today`, the building's day now. Throws when the
 * notices cannot be read, so a failed read is never "nothing owing", and when
 * a notice's due day, balance or late charge cannot be read
 * (UnreadableNoticeError), so it is never left out of the amount silently.
 */
export async function currentAmountOwing(schemeId: string, lotId: string, orm: Orm = db.orm, today?: string): Promise<string> {
  const day = today ?? (await schemeToday(schemeId, new Date(), orm));
  const notices = await orm.public.LevyNotice
    .where((n) => n.schemeId.eq(schemeId))
    .where((n) => n.lotId.eq(lotId))
    .where((n) => n.status.in([...OVERDUE_NOTICE_STATUSES]))
    .limit(5000)
    .all();
  const overdue = overdueOn(notices, day);
  // The late charge is read as opening a case reads it: one that cannot be read refuses, here as there.
  for (const n of overdue) noticeCents(n, "interestCharged");
  return (balancesCents(overdue) / 100).toFixed(2);
}

/** Write the step's records, in the step's transaction (`orm` is the transaction's). */
export async function createRecoveryRecords(
  orm: Orm,
  base: { caseId: string; schemeId: string; state: string; rulePack: string; recordedBy: string },
  records: readonly RecoveryRecordToWrite[],
): Promise<void> {
  for (const r of records) {
    await orm.public.DebtRecoveryRecord.create({
      caseId: base.caseId,
      schemeId: base.schemeId,
      state: base.state,
      kind: r.kind,
      decidedOn: r.decidedOn,
      resolutionMeetingId: r.resolutionMeetingId,
      resolutionItemId: r.resolutionItemId,
      resolutionKind: r.resolutionKind,
      amount: r.amount == null ? null : (r.amount as unknown as Numeric<12, 2>),
      forum: r.forum,
      lodgedOn: r.lodgedOn ?? null,
      rulePack: base.rulePack,
      recordedBy: base.recordedBy,
      notes: null,
    });
  }
}
