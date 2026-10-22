import { connection } from "next/server";
import { getCurrentProfile } from "@/lib/queries/profiles";
import {
  getContractorBusinessForProfile,
  getContractorOnboarding,
  getContractorLicences,
  getContractorInsurances,
  getContractorBankDetails,
  getContractorMembership,
  getContractorDeclarations,
  getAbnLookupHistory,
} from "@/lib/queries/contractor";
import { WizardShell } from "./components/wizard-shell";
import { contractorPlanPrice, quoteComplianceFee } from "@/lib/billing/contractor-fees";
import { toFeeView } from "@/lib/billing/disclosure";

export default async function OnboardingPage() {
  await connection();
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const business = await getContractorBusinessForProfile(profile.id);
  const [plan, complianceQuote] = await Promise.all([contractorPlanPrice(), quoteComplianceFee()]);
  const pricing = {
    planCents: plan?.cents ?? null,
    planGstInclusive: plan?.gstInclusive ?? true,
    complianceFee: complianceQuote ? toFeeView(complianceQuote) : null,
  };

  if (!business) {
    // No business yet: show step 1 with registration form
    return (
      <WizardShell
        initialStep={1}
        onboarding={null}
        business={null}
        licences={[]}
        insurances={[]}
        bankDetails={[]}
        membership={null}
        declarations={[]}
        abnLookups={[]}
        profile={profile}
        pricing={pricing}
      />
    );
  }

  // Business exists: load all onboarding data in parallel
  const [
    onboarding,
    licences,
    insurances,
    bankDetails,
    membership,
    declarations,
    abnLookups,
  ] = await Promise.all([
    getContractorOnboarding(business.id),
    getContractorLicences(business.id),
    getContractorInsurances(business.id),
    getContractorBankDetails(business.id),
    getContractorMembership(business.id),
    getContractorDeclarations(business.id),
    getAbnLookupHistory(business.id),
  ]);

  // Determine initial step from onboarding progress
  const currentStep = onboarding?.currentStep ?? 1;

  return (
    <WizardShell
      initialStep={currentStep}
      onboarding={onboarding}
      business={business}
      licences={licences}
      insurances={insurances}
      bankDetails={bankDetails}
      membership={membership}
      declarations={declarations}
      abnLookups={abnLookups}
      profile={profile}
      pricing={pricing}
    />
  );
}
