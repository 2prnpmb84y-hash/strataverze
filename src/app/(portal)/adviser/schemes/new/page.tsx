import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { platformToday } from "@/lib/jurisdiction/time-zone";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";
import { onboardingWordsByState } from "@/lib/onboarding/onboarding-words";
import { DEFAULT_SCHEME_STATE, SCHEME_STATE_OPTIONS } from "@/config/jurisdictions";
import { AddPropertyWizard } from "../add-property-wizard";

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

export default async function NewSchemePage() {
  await connection();
  // Buildings are onboarded by StrataVerze administrators only.
  const profile = await getCurrentProfile();
  if (!profile?.isPlatformAdmin) notFound();

  // The wizard's words for each state a building can be set up in, from that
  // state's rule pack: the wizard uses the set for the state chosen.
  const wordsByState = onboardingWordsByState(
    SCHEME_STATE_OPTIONS.map((o) => o.value),
    (s) => rulesForState(s).rules,
  );
  const entities = [...new Set(Object.values(wordsByState).map((w) => w.ownersCorporation))];

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Add Property"
        description={entities.length === 1 ? `Register a new ${titleCase(entities[0])}.` : "Register a new building."}
        backHref="/adviser/schemes"
        backLabel="Schemes"
      />

      <AddPropertyWizard today={platformToday()} wordsByState={wordsByState} defaultState={DEFAULT_SCHEME_STATE} />
    </div>
  );
}
