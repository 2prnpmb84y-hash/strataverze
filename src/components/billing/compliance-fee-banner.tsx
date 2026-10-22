import { getCurrentProfile } from "@/lib/queries/profiles";
import { getContractorBusinessForProfile } from "@/lib/queries/contractor";
import { complianceConfirmationNeeded } from "@/lib/billing/contractor-fees";
import { toFeeView } from "@/lib/billing/disclosure";
import { ComplianceFeeBannerForm } from "./compliance-fee-banner-form";

/**
 * Shown across the supplier portal until the contractor confirms the current
 * annual compliance verification charge. Renders nothing once confirmed.
 */
export async function ComplianceFeeBanner() {
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const business = await getContractorBusinessForProfile(profile.id);
  if (!business) return null;
  const quote = await complianceConfirmationNeeded(business.id);
  if (!quote) return null;

  const fee = {
    ...toFeeView(quote),
    explanation:
      "StrataVerze now checks contractors' licences, insurance and ABN once a year. This annual charge is raised when your application is approved, then each year while you are a member.",
  };
  return (
    <div className="mb-6 rounded-[var(--radius-card)] border border-amber-200 bg-white p-4">
      <p className="font-medium text-ink mb-1">Please confirm a new StrataVerze charge</p>
      <p className="text-sm text-ink-muted mb-3">
        Your membership terms were accepted before this charge was introduced, or its price has changed since.
      </p>
      <ComplianceFeeBannerForm contractorId={business.id} fee={fee} />
    </div>
  );
}
