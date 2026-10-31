import { db } from "@/prisma/db";

/**
 * Switched off schemes and the scheduled jobs (31 Oct 2026).
 *
 * A scheme with schemes.is_active = false is frozen: every scheduled job
 * (the levy notices, works and compliance run at /api/cron/levy-notices,
 * /api/cron/pending-resolutions and /api/cron/platform-invoices) leaves it
 * exactly as it is. Nothing is issued, posted, emailed, reminded, decided,
 * invoiced or cleaned up for it, and each route lists it under
 * `skippedSchemes`. Deciding one meeting's pending resolutions from the
 * meeting page or an adviser action skips it too. Work the jobs skipped is
 * not caught up specially when the scheme is switched back on; it is picked
 * up only where the job's own selection still finds it. In particular, a
 * levy notice email that failed before the scheme was switched off is retried
 * only within the retry window (3 days, plus a day of margin, after it was
 * issued: retryNoticeEmails), so if the scheme stays switched off longer than
 * that, the email is not retried and must be sent again by hand.
 */

/** The ids of the switched off schemes. Read once per run. */
export async function inactiveSchemeIds(): Promise<string[]> {
  const rows = await db.orm.public.Scheme.where((s) => s.isActive.eq(false)).select("id").limit(10000).all();
  return rows.map((s) => s.id);
}

/**
 * The condition that leaves out switched off schemes, to spread into a job's
 * `and(...)`: `schemeId NOT IN (...)`, or nothing at all when no scheme is
 * switched off (so the query never depends on how an empty NOT IN renders).
 */
export function activeSchemesOnly<C>(schemeId: { notIn(ids: string[]): C }, inactive: readonly string[]): C[] {
  return inactive.length ? [schemeId.notIn([...inactive])] : [];
}
