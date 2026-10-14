import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForOwner } from "@/lib/queries/schemes";
import { getWorkOrdersForSchemes } from "@/lib/queries/work-orders";
import { paginateArray, parsePage } from "@/lib/pagination";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { WorkOrderList } from "@/components/work-order-list";

export default async function OwnerMaintenancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const schemes = await getSchemesForOwner(profile.id);
  if (schemes.length === 0) notFound();

  const schemeIds = schemes.map((s) => s.id);
  const workOrders = await getWorkOrdersForSchemes(schemeIds);

  const schemeNames = Object.fromEntries(
    schemes.map((s) => [s.id, s.name]),
  );

  const sp = await searchParams;
  const { page } = parsePage(sp);
  const { data: paginatedOrders, meta } = paginateArray(workOrders, page);

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Maintenance"
        description="Maintenance requests and work orders for your schemes."
        action={<Button href="/owner/maintenance/new">Report Issue</Button>}
      />

      <WorkOrderList
        workOrders={paginatedOrders}
        schemeNames={schemeNames}
        basePath="/owner/maintenance"
      />

      <Pagination
        currentPage={meta.currentPage}
        totalPages={meta.totalPages}
        basePath="/owner/maintenance"
      />
    </div>
  );
}
