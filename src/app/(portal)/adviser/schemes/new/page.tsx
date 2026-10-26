import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { platformToday } from "@/lib/jurisdiction/time-zone";
import { AddPropertyWizard } from "../add-property-wizard";

export default async function NewSchemePage() {
  await connection();
  // Buildings are onboarded by StrataVerze administrators only.
  const profile = await getCurrentProfile();
  if (!profile?.isPlatformAdmin) notFound();

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Add Property"
        description="Register a new Owners Corporation."
        backHref="/adviser/schemes"
        backLabel="Schemes"
      />

      <AddPropertyWizard today={platformToday()} />
    </div>
  );
}
