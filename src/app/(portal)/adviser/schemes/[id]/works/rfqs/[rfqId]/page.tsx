import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemeById } from "@/lib/queries/schemes";
import { getWorksRfqById } from "@/lib/queries/works";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";
import { Button } from "@/components/ui/button";
import Link from "next/link";

function formatCurrency(value: number | string | null): string {
  const num = Number(value ?? 0);
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(num);
}

function formatDate(date: Date | string | null): string {
  if (!date) return "—";
  return new Date(String(date)).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(date: Date | string | null): string {
  if (!date) return "—";
  return new Date(String(date)).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const statusLabel: Record<string, string> = {
  DRAFT: "Draft",
  ISSUED: "Issued",
  OPEN: "Open",
  CLOSED: "Closed",
  EVALUATION: "Under Evaluation",
  AWARDED: "Awarded",
  CANCELLED: "Cancelled",
};

const invitationStatusLabel: Record<string, string> = {
  PENDING: "Pending",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  NO_RESPONSE: "No Response",
};

export default async function RfqDetailPage({
  params,
}: {
  params: Promise<{ id: string; rfqId: string }>;
}) {
  await connection();
  const { id, rfqId } = await params;

  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const rfq = await getWorksRfqById(rfqId);
  if (!rfq) notFound();

  const now = new Date();
  const closingTime = new Date(rfq.closingDate).getTime();
  const isClosingSoon =
    rfq.status === "OPEN" &&
    closingTime > now.getTime() &&
    closingTime - now.getTime() < 3 * 24 * 60 * 60 * 1000;

  const isClosed = closingTime < now.getTime();

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title={rfq.title}
        description={`RFQ ${rfq.rfqNumber}`}
        backHref={`/adviser/schemes/${id}/works/rfqs`}
        backLabel="RFQs"
        action={
          <div className="flex items-center gap-2">
            {rfq.status === "DRAFT" && (
              <Button
                href={`/adviser/schemes/${id}/works/rfqs/${rfqId}/issue`}
              >
                Issue RFQ
              </Button>
            )}
            <Button
              href={`/adviser/schemes/${id}/works/rfqs/${rfqId}/edit`}
              variant="secondary"
            >
              Edit
            </Button>
          </div>
        }
      />

      <div className="flex items-center gap-3">
        <StatusChip status={statusLabel[rfq.status] ?? rfq.status} />
        {isClosingSoon && (
          <span className="inline-flex items-center rounded-full h-[22px] px-2.5 text-[11px] font-medium bg-amber-100 text-amber-700">
            Closing Soon
          </span>
        )}
        {rfq.status === "OPEN" && isClosed && (
          <span className="inline-flex items-center rounded-full h-[22px] px-2.5 text-[11px] font-medium bg-red-100 text-red-700">
            Past Closing Date
          </span>
        )}
      </div>

      {/* RFQ details */}
      <Card>
        <CardHeader title="RFQ Details" />
        <div className="px-5 pb-5">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
            <div>
              <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                Closing Date
              </dt>
              <dd
                className={`text-sm ${
                  isClosingSoon
                    ? "text-amber-600 font-medium"
                    : isClosed
                      ? "text-red-600 font-medium"
                      : "text-ink"
                }`}
              >
                {formatDateTime(rfq.closingDate)}
              </dd>
            </div>
            {rfq.closedAt && (
              <div>
                <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                  Closed At
                </dt>
                <dd className="text-sm text-ink">
                  {formatDateTime(rfq.closedAt)}
                </dd>
              </div>
            )}
            {rfq.issuedBy && (
              <div>
                <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                  Issued By
                </dt>
                <dd className="text-sm text-ink">
                  {rfq.issuedBy.firstName} {rfq.issuedBy.lastName}
                  {rfq.issuedAt && (
                    <span className="text-xs text-ink-muted ml-2">
                      {formatDateTime(rfq.issuedAt)}
                    </span>
                  )}
                </dd>
              </div>
            )}
            {rfq.scopeVersionUsed && (
              <div>
                <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                  Scope Version
                </dt>
                <dd className="text-sm text-ink">
                  v{Number(rfq.scopeVersionUsed)}
                </dd>
              </div>
            )}
            {rfq.description && (
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                  Description
                </dt>
                <dd className="text-sm text-ink whitespace-pre-wrap">
                  {rfq.description}
                </dd>
              </div>
            )}
            {rfq.cancelledReason && (
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                  Cancellation Reason
                </dt>
                <dd className="text-sm text-red-600 whitespace-pre-wrap">
                  {rfq.cancelledReason}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </Card>

      {/* Linked scope */}
      {rfq.scope && (
        <Card>
          <CardHeader title="Scope of Works" />
          <div className="px-5 pb-5">
            <div className="rounded-[var(--radius-card)] bg-muted p-4">
              <p className="text-sm font-medium text-ink">{rfq.scope.title}</p>
              <p className="text-xs text-ink-muted mt-1">
                Status: {rfq.scope.status} · Version {Number(rfq.scope.currentVersion)}
              </p>
              {rfq.scope.description && (
                <p className="text-xs text-ink-muted mt-2 whitespace-pre-wrap">
                  {rfq.scope.description}
                </p>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Invitations */}
      {rfq.invitations.length > 0 && (
        <Card>
          <CardHeader
            title="Invited Contractors"
            description={`${rfq.invitations.length} invitation${rfq.invitations.length === 1 ? "" : "s"}`}
          />
          <div className="flex flex-col gap-2 px-5 pb-5">
            {rfq.invitations.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted p-4"
              >
                <div>
                  <Link
                    href={`/adviser/schemes/${id}/works/contractors/${inv.contractorBusiness.id}`}
                    className="text-sm font-medium text-turquoise hover:underline"
                  >
                    {inv.contractorBusiness.companyName}
                  </Link>
                  <p className="text-xs text-ink-muted">
                    Invited: {formatDateTime(inv.invitedAt)}
                    {inv.invitedBy &&
                      ` by ${inv.invitedBy.firstName} ${inv.invitedBy.lastName}`}
                  </p>
                  {inv.respondedAt && (
                    <p className="text-xs text-ink-muted">
                      Responded: {formatDateTime(inv.respondedAt)}
                    </p>
                  )}
                  {inv.declineReason && (
                    <p className="text-xs text-red-600 mt-1">
                      Decline reason: {inv.declineReason}
                    </p>
                  )}
                </div>
                <StatusChip
                  status={invitationStatusLabel[inv.status] ?? inv.status}
                />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Addenda */}
      {rfq.addenda.length > 0 && (
        <Card>
          <CardHeader
            title="Addenda"
            description={`${rfq.addenda.length} addend${rfq.addenda.length === 1 ? "um" : "a"}`}
          />
          <div className="flex flex-col gap-2 px-5 pb-5">
            {rfq.addenda.map((ad) => (
              <div
                key={ad.id}
                className="rounded-[var(--radius-card)] bg-muted p-4"
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-ink">
                    #{Number(ad.addendumNumber)}: {ad.title}
                  </p>
                  <span className="text-xs text-ink-muted">
                    {formatDateTime(ad.issuedAt)}
                  </span>
                </div>
                <p className="text-xs text-ink-muted whitespace-pre-wrap">
                  {ad.description}
                </p>
                {ad.issuedBy && (
                  <p className="text-xs text-ink-muted mt-1">
                    Issued by: {ad.issuedBy.firstName} {ad.issuedBy.lastName}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Clarifications */}
      {rfq.clarifications.length > 0 && (
        <Card>
          <CardHeader
            title="Clarifications"
            description={`${rfq.clarifications.length} question${rfq.clarifications.length === 1 ? "" : "s"}`}
          />
          <div className="flex flex-col gap-2 px-5 pb-5">
            {rfq.clarifications.map((cl) => (
              <div
                key={cl.id}
                className="rounded-[var(--radius-card)] bg-muted p-4"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium text-ink uppercase">
                    Q
                  </span>
                  <span className="text-xs text-ink-muted">
                    {cl.askedBy.firstName} {cl.askedBy.lastName} ·{" "}
                    {formatDateTime(cl.askedAt)}
                  </span>
                  {cl.isPublic && (
                    <span className="inline-flex items-center rounded-full h-[18px] px-2 text-[10px] font-medium bg-blue-100 text-blue-700">
                      Public
                    </span>
                  )}
                </div>
                <p className="text-sm text-ink whitespace-pre-wrap mb-2">
                  {cl.question}
                </p>
                {cl.answer ? (
                  <>
                    <div className="flex items-center gap-2 mb-1 border-t border-line pt-2">
                      <span className="text-xs font-medium text-turquoise uppercase">
                        A
                      </span>
                      <span className="text-xs text-ink-muted">
                        {cl.answeredBy &&
                          `${cl.answeredBy.firstName} ${cl.answeredBy.lastName} · `}
                        {formatDateTime(cl.answeredAt)}
                      </span>
                    </div>
                    <p className="text-sm text-ink whitespace-pre-wrap">
                      {cl.answer}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-amber-600 italic">
                    Awaiting answer
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Quotations */}
      {rfq.quotations.length > 0 && (
        <Card>
          <CardHeader
            title="Quotations"
            description={`${rfq.quotations.length} quotation${rfq.quotations.length === 1 ? "" : "s"} received`}
          />
          <div className="flex flex-col gap-2 px-5 pb-5">
            {rfq.quotations.map((q) => (
              <div
                key={q.id}
                className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted p-4"
              >
                <div>
                  <p className="text-sm font-medium text-ink">
                    {q.contractorBusiness.companyName}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {q.quotationNumber}
                    {q.submittedAt && ` · Submitted: ${formatDateTime(q.submittedAt)}`}
                  </p>
                  {q.validUntil && (
                    <p className="text-xs text-ink-muted">
                      Valid until: {formatDate(q.validUntil)}
                    </p>
                  )}
                  {q.estimatedDuration && (
                    <p className="text-xs text-ink-muted">
                      Est. duration: {Number(q.estimatedDuration)} days
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-ink">
                    {formatCurrency(q.totalAmount)}
                  </p>
                  <p className="text-xs text-ink-muted">
                    excl. GST: {formatCurrency(q.subtotal)}
                  </p>
                  <StatusChip status={q.status} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Evaluations */}
      {rfq.evaluations.length > 0 && (
        <Card>
          <CardHeader
            title="Evaluations"
            description={`${rfq.evaluations.length} evaluation${rfq.evaluations.length === 1 ? "" : "s"}`}
          />
          <div className="flex flex-col gap-2 px-5 pb-5">
            {rfq.evaluations.map((ev) => (
              <div
                key={ev.id}
                className="rounded-[var(--radius-card)] bg-muted p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {ev.evaluator.firstName} {ev.evaluator.lastName}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {formatDateTime(ev.evaluatedAt)}
                    </p>
                  </div>
                  {ev.overallScore && (
                    <span className="text-lg font-semibold text-ink">
                      {Number(ev.overallScore)}
                    </span>
                  )}
                </div>
                {ev.comments && (
                  <p className="text-xs text-ink-muted whitespace-pre-wrap mb-2">
                    {ev.comments}
                  </p>
                )}
                {ev.criteria.length > 0 && (
                  <div className="border-t border-line pt-2">
                    <p className="text-xs font-medium text-ink mb-1">
                      Criteria Scores
                    </p>
                    {ev.criteria.map((cr) => (
                      <div
                        key={cr.id}
                        className="flex items-center justify-between text-xs py-0.5"
                      >
                        <span className="text-ink-muted">
                          {cr.criterionName}
                        </span>
                        <span className="text-ink font-medium">
                          {Number(cr.score)}
                          <span className="text-ink-muted ml-1">
                            (w: {Number(cr.weight)} · ws: {Number(cr.weightedScore)})
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
