import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import {
  getAuditTrail,
  getAuditTrailActors,
  type AuditTrailFilters,
} from "@/lib/queries/activity-log";
import { PageHeader } from "@/components/ui/page-header";
import { AuditTrailClient } from "./audit-trail-client";
import { connection } from "next/server";

export default async function AuditTrailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    page?: string;
    startDate?: string;
    endDate?: string;
    entityType?: string;
    action?: string;
    actorId?: string;
  }>;
}) {
  await connection();
  const { id } = await params;
  const sp = await searchParams;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const filters: AuditTrailFilters = {};
  if (sp.startDate) filters.startDate = sp.startDate;
  if (sp.endDate) filters.endDate = sp.endDate;
  if (sp.entityType) filters.entityType = sp.entityType;
  if (sp.action) filters.action = sp.action;
  if (sp.actorId) filters.actorId = sp.actorId;

  const [result, actors] = await Promise.all([
    getAuditTrail(id, filters, { page, pageSize: 50 }),
    getAuditTrailActors(id),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Trail"
        description={String(scheme.name)}
        backHref={`/adviser/schemes/${id}/finance/reports`}
        backLabel="Reports"
      />

      <AuditTrailClient
        schemeId={id}
        rows={result.data}
        page={result.page}
        hasMore={result.hasMore}
        actors={actors}
        filters={filters}
      />
    </div>
  );
}
