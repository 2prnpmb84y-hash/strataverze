import { connection } from "next/server";
import { requirePageAccess } from "@/lib/auth/require-access";
import { getSchemeById } from "@/lib/queries/schemes";
import { listSecurityEvents } from "@/lib/queries/security-audit";
import { recordSecurityEventLater } from "@/lib/audit/security-audit";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SecurityEventList } from "@/components/audit/security-event-list";
import { AuditFilters } from "@/components/audit/audit-filters";

export const instant = false;

/**
 * This building's security audit events (security stage S6), for its
 * Adviser. Read-only.
 */
export default async function SchemeSecurityLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const { id } = await params;
  const access = await requirePageAccess(id, "audit.read");
  if (!access) return null;
  const scheme = await getSchemeById(id);
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  const category = one(sp.category);
  const outcome = one(sp.outcome);
  const before = Number(one(sp.before)) || null;

  const { events, nextBeforeSeq } = await listSecurityEvents({ schemeId: id, category, outcome, beforeSeq: before, limit: 100 });
  await recordSecurityEventLater({
    action: "view.audit_log",
    outcome: "allowed",
    actorProfileId: access.profile.id,
    actorRole: "ADVISER",
    schemeId: id,
    metadata: { category: category || "all", outcome: outcome || "all" },
  });

  const base = `/adviser/schemes/${id}/security-log`;
  const nextHref = nextBeforeSeq
    ? `${base}?${new URLSearchParams({ ...(category ? { category } : {}), ...(outcome ? { outcome } : {}), before: String(nextBeforeSeq) })}`
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Security log"
        description={`Who signed in to, viewed, exported and changed ${String(scheme?.name ?? "this building")}'s records. Read-only, kept for 7 years.`}
        backHref={`/adviser/schemes/${id}`}
        backLabel={String(scheme?.name ?? "Building")}
      />
      <Card>
        <CardHeader title="Events" description="Newest first. Times are Sydney time." />
        <div className="mb-4">
          <AuditFilters action={base} category={category} outcome={outcome} />
        </div>
        {events.length === 0 ? (
          <EmptyState title="No events" description="Nothing matches these filters yet." />
        ) : (
          <SecurityEventList events={events} showScheme={false} />
        )}
        {nextHref && (
          <a href={nextHref} className="mt-4 inline-block text-sm font-medium text-turquoise">
            Older events
          </a>
        )}
      </Card>
    </div>
  );
}
