import { connection } from "next/server";
import { notFound } from "next/navigation";
import { requirePageAccess } from "@/lib/auth/require-access";
import { getSchemeById } from "@/lib/queries/schemes";
import { timeZoneOf } from "@/lib/jurisdiction/scheme-time";
import { formatDateTimeIn } from "@/lib/jurisdiction/time-zone";
import { getVariationById } from "@/lib/queries/works";
import {
  submitWorksVariation,
  approveWorksVariation,
  rejectWorksVariation,
} from "@/lib/actions/works";
import { PageHeader } from "@/components/ui/page-header";
import { StatusChip } from "@/components/ui/status-chip";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { FeeActionButton } from "@/components/billing/fee-action-button";
import { previewUsageFee } from "@/lib/billing/capture";
import { feeWordingFor } from "@/lib/billing/disclosure";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";

function formatCurrency(value: number | string | null): string {
  const num = Number(value ?? 0);
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(num);
}

/** An instant's date and time in the building's time zone (`tz`). */
function formatDateTime(date: Date | string | null, tz: string): string {
  if (!date) return "—";
  return formatDateTimeIn(tz, String(date), { hour: "2-digit" });
}

export default async function VariationDetailPage({
  params,
}: {
  params: Promise<{ id: string; contractId: string; variationId: string }>;
}) {
  await connection();
  const { id, contractId, variationId } = await params;

  // Role check on this scheme (SEC-004 / H5): a page is a privileged read.
  const access = await requirePageAccess(id, "works.read");
  if (!access) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();
  const tz = timeZoneOf(scheme);

  const variation = await getVariationById(variationId);
  // The variation must be on this contract, and the contract on this scheme.
  if (!variation || variation.contractId !== contractId || variation.contract?.schemeId !== id) notFound();

  const costNum = Number(variation.costImpact);
  const costColour =
    costNum > 0 ? "text-red-600" : costNum < 0 ? "text-green-600" : "text-ink";

  async function submitAction() {
    "use server";
    await submitWorksVariation(variationId, id);
  }

  async function approveAction(feeConfirmedCents: number | null) {
    "use server";
    return approveWorksVariation(variationId, id, feeConfirmedCents);
  }
  const approvalFee =
    variation.status === "SUBMITTED" ? await previewUsageFee({ code: "WORKS_VARIATION" }, feeWordingFor(rulesForState(scheme.state).rules)) : null;

  async function rejectAction() {
    "use server";
    await rejectWorksVariation(variationId, id);
  }

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title={`Variation #${variation.variationNumber}`}
        description={variation.title}
        backHref={`/adviser/schemes/${id}/works/contracts/${contractId}/variations`}
        backLabel="Variations"
      />

      <div className="flex items-center gap-3">
        <StatusChip status={variation.status} />
      </div>

      {/* Action buttons */}
      {variation.status === "DRAFT" && (
        <form action={submitAction}>
          <Button type="submit">Submit for Review</Button>
        </form>
      )}

      {variation.status === "SUBMITTED" && (
        <div className="flex items-start gap-3 flex-wrap">
          <FeeActionButton
            fee={approvalFee}
            scheduleHref={`/adviser/schemes/${id}/finance/platform-fees#fee-schedule`}
            label="Approve"
            pendingLabel="Approving..."
            action={approveAction}
            idSuffix={`-${variationId}`}
          />
          <form action={rejectAction}>
            <Button type="submit" variant="danger">
              Reject
            </Button>
          </form>
        </div>
      )}

      {/* Variation details */}
      <Card>
        <CardHeader title="Variation Details" />
        <div className="px-5 pb-5">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
            <div>
              <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                Cost Impact
              </dt>
              <dd className={`text-sm font-semibold ${costColour}`}>
                {costNum > 0 ? "+" : ""}
                {formatCurrency(costNum)}
              </dd>
            </div>
            {variation.timeImpact !== null && (
              <div>
                <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                  Time Impact
                </dt>
                <dd className="text-sm text-ink">
                  {variation.timeImpact > 0 ? "+" : ""}
                  {variation.timeImpact} day
                  {Math.abs(variation.timeImpact) === 1 ? "" : "s"}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                Requested By
              </dt>
              <dd className="text-sm text-ink">
                {variation.requestedBy.firstName}{" "}
                {variation.requestedBy.lastName}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                Created
              </dt>
              <dd className="text-sm text-ink">
                {formatDateTime(variation.createdAt, tz)}
              </dd>
            </div>
            {variation.approvedBy && (
              <div>
                <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                  Approved By
                </dt>
                <dd className="text-sm text-ink">
                  {variation.approvedBy.firstName}{" "}
                  {variation.approvedBy.lastName}
                </dd>
              </div>
            )}
            {variation.approvedAt && (
              <div>
                <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                  Approved At
                </dt>
                <dd className="text-sm text-ink">
                  {formatDateTime(variation.approvedAt, tz)}
                </dd>
              </div>
            )}
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                Description
              </dt>
              <dd className="text-sm text-ink whitespace-pre-wrap">
                {variation.description ?? "—"}
              </dd>
            </div>
            {variation.reason && (
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                  Reason
                </dt>
                <dd className="text-sm text-ink whitespace-pre-wrap">
                  {variation.reason}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </Card>

      {/* Contract reference */}
      {variation.contract && (
        <Card>
          <CardHeader title="Contract" />
          <div className="px-5 pb-5">
            <p className="text-sm text-ink">
              {variation.contract.contractNumber} — {variation.contract.title}
            </p>
            <p className="text-xs text-ink-muted mt-1">
              Contract Value: {formatCurrency(variation.contract.contractValue)}
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
