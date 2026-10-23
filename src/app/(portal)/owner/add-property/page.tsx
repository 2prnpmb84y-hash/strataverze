import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { AddPropertyWizard } from "../../adviser/schemes/add-property-wizard";

export default async function OwnerAddPropertyPage() {
  await connection();
  // Owners join a building by invitation. Only StrataVerze administrators
  // onboard buildings.
  const profile = await getCurrentProfile();
  if (!profile?.isPlatformAdmin) notFound();

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Add Property"
        description="Register a new property to your account."
        backHref="/owner"
        backLabel="Properties"
      />

      <AddPropertyWizard simplified />
    </div>
  );
}
