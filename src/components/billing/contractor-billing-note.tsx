import { contractorPlanPrice, quoteComplianceFee } from "@/lib/billing/contractor-fees";
import { formatAud } from "@/lib/billing/money";

/**
 * Shown on contractor records so schemes can see how StrataVerze earns from
 * contractors: a flat subscription and an annual compliance check, paid by the
 * contractor. No commission, listing fee or success fee.
 */
export async function ContractorBillingNote({ promotionEnd }: { promotionEnd?: string | null }) {
  const [plan, compliance] = await Promise.all([contractorPlanPrice(), quoteComplianceFee()]);
  const planText = plan
    ? `${formatAud(plan.cents)} a month ${plan.gstInclusive ? "including" : "plus"} GST`
    : "a flat monthly subscription";
  const end = promotionEnd
    ? new Date(promotionEnd).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })
    : null;
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-[var(--color-pill-mint-soft)] px-4 py-3 text-sm text-ink mb-6">
      <p className="font-medium">How this contractor pays StrataVerze</p>
      <p className="text-ink-muted mt-1">
        Contractors pay StrataVerze a subscription of {planText}
        {end ? ` (free during the promotion to ${end})` : ""}
        {compliance ? ` and an annual compliance verification charge of ${formatAud(compliance.totalCents)} including GST` : ""}.
        StrataVerze takes no commission, listing fee or success fee from contractors.
      </p>
    </div>
  );
}
