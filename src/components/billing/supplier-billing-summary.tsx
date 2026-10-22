import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { contractorPlanPrice, getContractorFeeEvents, quoteComplianceFee } from "@/lib/billing/contractor-fees";
import { formatAud, toCents } from "@/lib/billing/money";
import { getContractorMembership } from "@/lib/queries/contractor";

const dateFmt = (v: unknown) =>
  v ? new Date(v instanceof Date ? v : String(v)).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }) : "";

const STATUS_LABELS: Record<string, string> = {
  ACCRUED: "Not yet billed",
  INVOICED: "Billed",
  EXTRACTED: "Paid",
  WAIVED: "Waived",
  REVERSED: "Reversal",
};

/** A contractor's StrataVerze billing: plan, compliance verification and charges so far. */
export async function SupplierBillingSummary({ contractorBusinessId }: { contractorBusinessId: string }) {
  const [plan, compliance, membership, events] = await Promise.all([
    contractorPlanPrice(),
    quoteComplianceFee(),
    getContractorMembership(contractorBusinessId),
    getContractorFeeEvents(contractorBusinessId),
  ]);
  const storedPlanCents = membership ? toCents(String(membership.planMonthlyPrice)) : plan?.cents ?? null;
  const gstInclusive = membership ? membership.planGstInclusive : plan?.gstInclusive ?? true;
  const promoEnd = membership?.promotionEnd ? dateFmt(membership.promotionEnd) : null;
  const promotional = String(membership?.subscriptionStatus ?? "").startsWith("PROMOTIONAL");

  return (
    <Card className="mb-6">
      <div id="strataverze-billing" className="scroll-mt-24" />
      <CardHeader
        title="StrataVerze billing"
        description="What StrataVerze charges your business. Every charge is a flat amount; there is no commission or success fee."
        action={
          <Link href="/supplier/membership" className="text-xs font-medium text-supplier hover:underline">
            Membership
          </Link>
        }
      />
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm mb-4">
        <div>
          <dt className="text-ink-muted">Contractor plan</dt>
          <dd className="text-ink font-medium mt-0.5">
            {storedPlanCents == null ? "To be confirmed" : `${formatAud(storedPlanCents)} a month ${gstInclusive ? "including" : "plus"} GST`}
          </dd>
          {promotional && promoEnd && <dd className="text-xs text-ink-muted mt-0.5">Free during the promotion to {promoEnd}</dd>}
        </div>
        <div>
          <dt className="text-ink-muted">Compliance verification</dt>
          <dd className="text-ink font-medium mt-0.5">
            {compliance
              ? `${formatAud(compliance.totalCents)} a year including GST (${formatAud(compliance.exGstCents)} plus ${formatAud(compliance.gstCents)} GST)`
              : "Not charged"}
          </dd>
          <dd className="text-xs text-ink-muted mt-0.5">Raised when your application is approved, then each year.</dd>
        </div>
      </dl>

      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-2">Charges</h3>
      {events.length === 0 ? (
        <p className="text-sm text-ink-muted">No charges have been recorded.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-muted border-b border-line">
                <th className="py-2 pr-4 font-medium">Date</th>
                <th className="py-2 pr-4 font-medium">Charge</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="py-2 pr-4 whitespace-nowrap">{dateFmt(e.occurredAt)}</td>
                  <td className="py-2 pr-4">{e.description}</td>
                  <td className="py-2 pr-4 text-ink-muted">{STATUS_LABELS[e.status] ?? e.status}</td>
                  <td className="py-2 text-right tabular-nums">
                    {formatAud(toCents(String(e.amountExGst)) + toCents(String(e.gstAmount)))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
