/**
 * Reading and writing debt_recovery_records (VIC, ACT and WA stage 2, PR 9a,
 * migration 20261125; the ACT statutory charge and its revocation, PR 9b; the
 * Victorian final notice given, PR 9c). Only called for a pack with the recovery gates
 * (recoveryGatesApply), so an NSW or Queensland case never reads or writes
 * the table.
 */
import type { Numeric } from "@prisma/orm-postgres/target/codec-types";
import type { StatutoryRules } from "@/config/statutory";
import { db } from "@/prisma/db";
import type { RecordedRecoveryFacts, RecoveryRecordToWrite, TimingNotice } from "./recovery-gates";

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
 * What the case records, for the gates under the building's pack (PR 9c):
 * recordedFacts, and for a pack with a final notice the day it was last
 * recorded as given, and for a pack with an amount threshold the amount owing
 * last recorded with the decision to start proceedings. Each only where the
 * pack has the rule, so the facts for any other pack are recordedFacts's.
 */
export function recordedFactsFor(
  rules: Pick<StatutoryRules, "DEBT_RECOVERY">,
  rows: readonly Pick<RecoveryRecordRow, "kind" | "forum" | "decidedOn" | "amount">[],
): RecordedRecoveryFacts {
  const r = rules.DEBT_RECOVERY;
  const last = (kind: string) => [...rows].reverse().find((x) => x.kind === kind);
  return {
    ...recordedFacts(rows),
    ...(r?.finalNotice ? { finalNoticeGivenOn: last("FINAL_NOTICE_GIVEN")?.decidedOn ?? null } : {}),
    ...(r?.authorityToSue?.amountThreshold ? { authorisedAmount: last("AUTHORITY_TO_SUE")?.amount ?? null } : {}),
  };
}

/**
 * The lot's amount owing now, as opening a case works it out (the overdue
 * notices' balances plus their late charge), to two decimals. Throws when
 * the notices cannot be read, so a failed read is never "nothing owing".
 */
export async function currentAmountOwing(schemeId: string, lotId: string, orm: Orm = db.orm): Promise<string> {
  const notices = await orm.public.LevyNotice
    .where((n) => n.schemeId.eq(schemeId))
    .where((n) => n.lotId.eq(lotId))
    .where((n) => n.status.eq("OVERDUE"))
    .limit(5000)
    .all();
  const total = notices.reduce((sum, n) => sum + Number(n.balanceOutstanding) + Number(n.interestCharged || 0), 0);
  return total.toFixed(2);
}

/**
 * The lot's overdue notices as a step counted from their issue days reads
 * them (PR 9c): the number, the day issued in the building's zone `tz`, the
 * pack it was issued under and whether it was brought across at takeover.
 * Throws when they cannot be read, so a failed read is never "none overdue".
 */
export async function overdueNoticesForTiming(schemeId: string, lotId: string, tz: string, orm: Orm = db.orm): Promise<TimingNotice[]> {
  const { storedDayIn } = await import("@/lib/jurisdiction/time-zone");
  const notices = await orm.public.LevyNotice
    .where((n) => n.schemeId.eq(schemeId))
    .where((n) => n.lotId.eq(lotId))
    .where((n) => n.status.eq("OVERDUE"))
    .limit(5000)
    .all();
  return notices.map((n) => ({
    number: String(n.noticeNumber ?? n.id),
    issuedOn: n.issuedAt ? storedDayIn(tz, n.issuedAt) || null : null,
    rulePack: n.rulePack == null ? null : String(n.rulePack),
    takeover: n.migrationBatchId != null,
  }));
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
