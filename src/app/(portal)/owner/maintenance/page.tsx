import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForOwner } from "@/lib/queries/schemes";
import { getWorkOrdersForSchemes } from "@/lib/queries/work-orders";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { WorkOrderList } from "@/components/work-order-list";

export default async function OwnerMaintenancePage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const schemes = await getSchemesForOwner(profile.id);
  if (schemes.length === 0) notFound();

  const schemeIds = schemes.map((s) => s.id);
  const workOrders = await getWorkOrdersForSchemes(schemeIds);

  const schemeNames = Object.fromEntries(
    schemes.map((s) => [s.id, s.name]),
  );

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Maintenance"
        description="Maintenance requests and work orders for your schemes."
        action={<Button href="/owner/maintenance/new">Report Issue</Button>}
      />

      <WorkOrderList
        workOrders={workOrders}
        schemeNames={schemeNames}
        basePath="/owner/maintenance"
      />
    </div>
  );
}
