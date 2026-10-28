import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { platformToday } from "@/lib/jurisdiction/time-zone";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";
import { onboardingWordsByState } from "@/lib/onboarding/onboarding-words";
import { DEFAULT_SCHEME_STATE, SCHEME_STATE_OPTIONS } from "@/config/jurisdictions";
import { AddPropertyWizard } from "../../adviser/schemes/add-property-wizard";

export default async function OwnerAddPropertyPage() {
  await connection();
  // Owners join a building by invitation. Only StrataVerze administrators
  // onboard buildings.
  const profile = await getCurrentProfile();
  if (!profile?.isPlatformAdmin) notFound();

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Add Property"
        description="Register a new property to your account."
        backHref="/owner"
        backLabel="Properties"
      />

      <AddPropertyWizard
        simplified
        today={platformToday()}
        wordsByState={onboardingWordsByState(
          SCHEME_STATE_OPTIONS.map((o) => o.value),
          (s) => rulesForState(s).rules,
        )}
        defaultState={DEFAULT_SCHEME_STATE}
      />
    </div>
  );
}
