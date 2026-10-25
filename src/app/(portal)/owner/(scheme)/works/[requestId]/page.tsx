import { connection } from "next/server";
import { notFound } from "next/navigation";
import { db } from "@/prisma/db";
import { requirePageAccess } from "@/lib/auth/require-access";
import { loadRequestView } from "@/lib/works/view";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";
import { DecisionPanel } from "@/components/works/decision-panel";
import { RequestDetails, ruleSentence } from "@/components/works/request-details";
import { WorksRequestForm } from "@/components/works/request-form";
import { UrgentOrderPanel } from "@/components/works/urgent-order-panel";
import { orderingState } from "@/lib/works/urgent-orders";
import { approvedContractors } from "@/lib/works/settings";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One works request (works marketplace stage 1, 25 Oct 2026). Whoever
 * raised it, and the building's committee, can see it. The building comes
 * from the request, so a link in an email works whichever building is
 * selected.
 */
export default async function OwnerWorksRequestPage({ params }: { params: Promise<{ requestId: string }> }) {
  await connection();
  const { requestId } = await params;
  if (!UUID.test(requestId)) notFound();
  const row = await db.orm.public.WorksRequest.where((r) => r.id.eq(requestId)).first();
  if (!row || row.deletedAt) notFound();

  const access = await requirePageAccess(row.schemeId, "works.request");
  if (!access) return null;
  const view = await loadRequestView(row.schemeId, requestId, { profileId: access.profile.id, roles: access.roles });
  if (!view) notFound();
  // Owners see their own requests; the committee sees every request.
  if (!view.can.isRaiser && !view.can.isCommitteeMember) notFound();

  const r = view.request;
  const showDecision = view.can.isCommitteeMember;
  const ordering = r.isEmergency ? await orderingState(row.schemeId, requestId) : null;
  const showOrders = !!ordering && (ordering.orders.length > 0 || ordering.canIssue);
  const contractors = showOrders && ordering!.canIssue && showDecision ? await approvedContractors(r.trade ?? undefined) : [];
  const photosSoFar = view.photos.length;
  // The latest decision made (decisions are newest first). Committee notes stay with the committee, except a reason for declining.
  const decided = view.decisions.find((d) => d.status === "DECIDED");

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title={r.title} description={`Works request ${r.requestNumber}`} backHref="/owner/works" backLabel="Works requests" />
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip status={r.statusLabel} />
        {r.isEmergency && <StatusChip status="Urgent" variant="danger" />}
      </div>

      <Card>
        <RequestDetails view={view} />
      </Card>

      {view.can.canResubmit && (
        <Card>
          <CardHeader title="Add the detail and send it again" description="Change anything the committee asked about. You can add more photos." />
          <WorksRequestForm
            schemeId={row.schemeId}
            requestId={r.id}
            defaults={{ title: r.title, trade: r.trade, location: r.location, description: r.description, isEmergency: r.isEmergency }}
            existingPhotos={photosSoFar}
            doneHref="/owner/works"
          />
        </Card>
      )}

      {showOrders && (
        <Card>
          <CardHeader title="Urgent work order" description="Sent to the contractor straight after the urgent decision." />
          {showDecision ? (
            <UrgentOrderPanel
              schemeId={row.schemeId}
              requestId={r.id}
              orders={ordering!.orders}
              canIssue={ordering!.canIssue}
              mayChoose
              amount={ordering!.amount}
              contractors={contractors.map((c) => ({ id: c.id, name: c.name, suburb: c.suburb, trades: c.trades }))}
              preferredContractorId={ordering!.preferredContractorId}
              trade={r.trade}
            />
          ) : (
            <p className="text-sm text-ink">{ordering!.live ? `${ordering!.live.contractorName}: ${ordering!.live.statusLabel.toLowerCase()}.` : "A contractor is being arranged."}</p>
          )}
        </Card>
      )}

      {showDecision ? (
        <Card>
          <CardHeader title="The committee's decision" description="How this request is handled." />
          <DecisionPanel schemeId={row.schemeId} requestId={r.id} urgentLimit={view.settings.urgentLimit} can={view.can} decisions={view.decisions} openDecisionId={view.openDecisionId} ruleSentence={ruleSentence(view)} />
        </Card>
      ) : (
        decided && (
          <Card>
            <CardHeader title="What the committee decided" />
            <p className="text-sm text-ink">{decided?.outcomeLabel}</p>
            {decided?.outcome === "DECLINE" && decided.note && <p className="text-sm text-ink-muted mt-1 whitespace-pre-wrap">{decided.note}</p>}
          </Card>
        )
      )}
    </div>
  );
}
