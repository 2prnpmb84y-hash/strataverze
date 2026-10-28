import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { requireFinancialReadAccess } from "@/lib/auth/require-accountant-access";
import {
  getAuditTrail,
  getAuditTrailActors,
  type AuditTrailFilters,
} from "@/lib/queries/activity-log";
import { PageHeader } from "@/components/ui/page-header";
import { AuditTrailClient } from "@/app/(portal)/adviser/schemes/[id]/finance/reports/audit-trail/audit-trail-client";
import { connection } from "next/server";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";
import { auditLabelWords } from "@/lib/jurisdiction/screen-words";

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
  await requireFinancialReadAccess(id);
  const sp = await searchParams;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

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
        backHref={`/accountant/schemes/${id}/finance/reports`}
        backLabel="Reports"
      />

      <AuditTrailClient
        schemeId={id}
        rows={result.data}
        page={result.page}
        hasMore={result.hasMore}
        actors={actors}
        filters={filters}
        words={auditLabelWords(rulesForState(scheme.state).rules)}
        basePath={`/accountant/schemes/${id}/finance/reports/audit-trail`}
        readOnly
      />
    </div>
  );
}
