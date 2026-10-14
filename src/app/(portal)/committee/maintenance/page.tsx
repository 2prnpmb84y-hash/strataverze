import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForCommittee } from "@/lib/queries/schemes";
import { getWorkOrdersForSchemes } from "@/lib/queries/work-orders";
import { paginateArray, parsePage } from "@/lib/pagination";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { WorkOrderList } from "@/components/work-order-list";

export default async function CommitteeMaintenancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const schemes = await getSchemesForCommittee(profile.id);
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
        description="Work orders and maintenance requests for your schemes."
        action={<Button href="/committee/maintenance/new">Raise Work Order</Button>}
      />

      <WorkOrderList
        workOrders={paginatedOrders}
        schemeNames={schemeNames}
        basePath="/committee/maintenance"
      />

      <Pagination
        currentPage={meta.currentPage}
        totalPages={meta.totalPages}
        basePath="/committee/maintenance"
      />
    </div>
  );
}
