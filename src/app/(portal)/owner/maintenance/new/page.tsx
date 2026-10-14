import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForOwner } from "@/lib/queries/schemes";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { OwnerMaintenanceForm } from "./form";

export default async function NewOwnerMaintenancePage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const schemes = await getSchemesForOwner(profile.id);
  if (schemes.length === 0) notFound();

  const schemeOptions = schemes.map((s) => ({
    value: s.id,
    label: s.name,
  }));

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Report an Issue"
        description="Submit a maintenance request for your scheme."
        backHref="/owner/maintenance"
        backLabel="Maintenance"
      />
      <Card>
        <OwnerMaintenanceForm schemes={schemeOptions} />
      </Card>
    </div>
  );
}
