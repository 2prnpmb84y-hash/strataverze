import { connection } from "next/server";
import { PLATFORM_TIME_ZONE } from "@/lib/jurisdiction/time-zone";
import { requirePlatformAdminPage } from "@/lib/auth/require-access";
import { latestAuditCheck, listSecurityEvents } from "@/lib/queries/security-audit";
import { recordSecurityEventLater } from "@/lib/audit/security-audit";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SecurityEventList } from "@/components/audit/security-event-list";
import { AuditFilters } from "@/components/audit/audit-filters";

export const instant = false;

/**
 * The security audit log for the whole platform (security stage S6).
 * StrataVerze staff only, read-only. Events cannot be changed or deleted,
 * and a daily check confirms the hash chain is unbroken.
 */
export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const me = await requirePlatformAdminPage();
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  const category = one(sp.category);
  const outcome = one(sp.outcome);
  const before = Number(one(sp.before)) || null;

  const [{ events, nextBeforeSeq }, check] = await Promise.all([
    listSecurityEvents({ scope: { kind: "platform" }, category, outcome, beforeSeq: before, limit: 100 }),
    latestAuditCheck(),
  ]);
  // Reading the audit log is itself recorded.
  await recordSecurityEventLater({
    action: "view.audit_log",
    outcome: "allowed",
    actorProfileId: me.id,
    actorRole: "platform_admin",
    metadata: { category: category || "all", outcome: outcome || "all" },
  });

  const nextHref = nextBeforeSeq
    ? `/admin/audit?${new URLSearchParams({ ...(category ? { category } : {}), ...(outcome ? { outcome } : {}), before: String(nextBeforeSeq) })}`
    : null;

  return (
    <>
      <PageHeader title="Audit log" description="Security events across StrataVerze. Read-only: events cannot be changed or deleted." />
      <div className="space-y-6">
        <Card>
          <CardHeader
            title="Integrity check"
            description="Each event carries a hash of the one before it. The chain is checked every hour, and in full every Sunday."
          />
          {check ? (
            <div className="space-y-1">
              <p className={`text-sm ${check.ok ? "text-ink" : "text-red-700 font-medium"}`}>
                {check.ok
                  ? `Unbroken at the last check (${new Date(check.checkedAt).toLocaleString("en-AU", { timeZone: PLATFORM_TIME_ZONE })}, ${check.rowsChecked.toLocaleString("en-AU")} events checked${check.fullCheck ? ", full check" : ""}).`
                  : `BROKEN at event #${check.firstBadSeq}: ${check.problem ?? "the chain does not match"} (checked ${new Date(check.checkedAt).toLocaleString("en-AU", { timeZone: PLATFORM_TIME_ZONE })}). Follow the incident steps in the security runbook.`}
              </p>
              {check.stale && (
                <p className="text-sm text-amber-800 font-medium">
                  The last check is more than 3 hours old. The hourly check may have stopped: see the security runbook.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-ink-muted">The first check has not run yet.</p>
          )}
        </Card>
        <Card>
          <CardHeader title="Events" description="Newest first. Times are Sydney time. Kept for 7 years." />
          <div className="mb-4">
            <AuditFilters action="/admin/audit" category={category} outcome={outcome} />
          </div>
          {events.length === 0 ? (
            <EmptyState title="No events" description="Nothing matches these filters yet." />
          ) : (
            <SecurityEventList events={events} showScheme />
          )}
          {nextHref && (
            <a href={nextHref} className="mt-4 inline-block text-sm font-medium text-turquoise">
              Older events
            </a>
          )}
        </Card>
      </div>
    </>
  );
}
