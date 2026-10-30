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
import { schemeToday } from "@/lib/jurisdiction/scheme-time";
import { toIsoDay } from "@/lib/levies/notice-plan";
import { noticeCents, OVERDUE_NOTICE_STATUSES, overdueOn } from "@/lib/levies/overdue";
import { balancesCents } from "./case-amount";
import type { ClaimNotice, RecordedRecoveryFacts, RecoveryRecordToWrite, TimingNotice } from "./recovery-gates";

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
 * recorded as given, and for a pack with an amount threshold how the
 * resolution last recorded with the decision to start proceedings is stored
 * (since Matthew Wrigley's decision of 30 Oct 2026; the amount recorded with
 * it is no longer compared). Each only where the pack has the rule, so the
 * facts for any other pack are recordedFacts's.
 */
export function recordedFactsFor(
  rules: Pick<StatutoryRules, "DEBT_RECOVERY">,
  rows: readonly Pick<RecoveryRecordRow, "kind" | "forum" | "decidedOn" | "resolutionKind">[],
): RecordedRecoveryFacts {
  const r = rules.DEBT_RECOVERY;
  const last = (kind: string) => [...rows].reverse().find((x) => x.kind === kind);
  return {
    ...recordedFacts(rows),
    ...(r?.finalNotice ? { finalNoticeGivenOn: last("FINAL_NOTICE_GIVEN")?.decidedOn ?? null } : {}),
    ...(r?.authorityToSue?.amountThreshold ? { authorisedResolutionKind: last("AUTHORITY_TO_SUE")?.resolutionKind ?? null } : {}),
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

/**
 * The lot's notices overdue on the building's day `today` (YYYY-MM-DD), by the
 * one definition debt recovery reads (isOverdueOn, overdue notices fix of
 * 30 Oct 2026: ISSUED, PARTIALLY_PAID or OVERDUE, past the due day, with a
 * balance; a notice stored as OVERDUE is asked the same). The same notices as
 * currentAmountOwing and opening a case read. Throws when they cannot be read,
 * and UnreadableNoticeError when a notice's due day or balance cannot be read,
 * so a failed read is never "none overdue".
 */
async function overdueLevyNotices(schemeId: string, lotId: string, today: string, orm: Orm) {
  const notices = await orm.public.LevyNotice
    .where((n) => n.schemeId.eq(schemeId))
    .where((n) => n.lotId.eq(lotId))
    .where((n) => n.status.in([...OVERDUE_NOTICE_STATUSES]))
    .limit(5000)
    .all();
  return overdueOn(notices, today);
}

/**
 * The lot's notices overdue on the building's day `today`, as a step counted
 * from their issue days reads them (PR 9c): the number, the day issued in the
 * building's zone `tz`, the pack it was issued under and whether it was
 * brought across at takeover. The same notices as overdueNoticesForClaim
 * (overdueLevyNotices, one definition of overdue). Throws when they cannot be
 * read, and UnreadableNoticeError when a notice's due day or balance cannot
 * be read (its late charge is not read here), so a failed read is never "none
 * overdue".
 */
export async function overdueNoticesForTiming(schemeId: string, lotId: string, tz: string, today: string, orm: Orm = db.orm): Promise<TimingNotice[]> {
  const { storedDayIn } = await import("@/lib/jurisdiction/time-zone");
  return (await overdueLevyNotices(schemeId, lotId, today, orm)).map((n) => ({
    number: String(n.noticeNumber ?? n.id),
    issuedOn: n.issuedAt ? storedDayIn(tz, n.issuedAt) || null : null,
    rulePack: n.rulePack == null ? null : String(n.rulePack),
    takeover: n.migrationBatchId != null,
  }));
}

/**
 * The lot's notices overdue on the building's day `today`, as the step that
 * starts proceedings, the final notice step and the amount owing read them
 * for a pack with a final notice or an amount threshold (PR 9c, Matthew
 * Wrigley's decision of 30 Oct 2026): the one definition of overdue
 * (overdueLevyNotices, isOverdueOn), so a notice stored as OVERDUE counts only
 * when it is past its due day with a balance, as any other. Each with its
 * number, the day issued in the building's zone `tz`, the day it fell due,
 * the pack it was issued under, whether it was brought across at takeover and
 * what it owes: its balance in cents, which already includes its late charge
 * (C1, "Balance only", 30 Oct 2026; the case amount's total for the same
 * notices). Fail closed as currentAmountOwing: throws when the notices cannot
 * be read, and UnreadableNoticeError when a notice's due day, balance or late
 * charge cannot be read, so a notice is never counted, or left out, without
 * anyone knowing.
 */
export async function overdueNoticesForClaim(schemeId: string, lotId: string, tz: string, today: string, orm: Orm = db.orm): Promise<ClaimNotice[]> {
  const { storedDayIn } = await import("@/lib/jurisdiction/time-zone");
  return (await overdueLevyNotices(schemeId, lotId, today, orm)).map((n) => {
    // The late charge is read as opening a case and currentAmountOwing read it: one that cannot be read refuses.
    noticeCents(n, "interestCharged");
    return {
      number: String(n.noticeNumber ?? n.id),
      issuedOn: n.issuedAt ? storedDayIn(tz, n.issuedAt) || null : null,
      dueOn: toIsoDay(n.dueDate) || null,
      rulePack: n.rulePack == null ? null : String(n.rulePack),
      takeover: n.migrationBatchId != null,
      owingCents: balancesCents([n]),
    };
  });
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
