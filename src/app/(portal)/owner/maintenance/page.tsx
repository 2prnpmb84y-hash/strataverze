import { notFound } from "next/navigation";
import { getCurrentProfile, hasCommitteeRole } from "@/lib/queries/profiles";
import { getSchemesForOwner, getSchemesForCommittee } from "@/lib/queries/schemes";
import { getWorkOrdersForSchemes } from "@/lib/queries/work-orders";
import { paginateArray, parsePage } from "@/lib/pagination";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { WorkOrderList } from "@/components/work-order-list";
import { connection } from "next/server";

export default async function OwnerMaintenancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const [ownerSchemes, isCommittee] = await Promise.all([
    getSchemesForOwner(profile.id),
    hasCommitteeRole(profile.id),
  ]);

  // Build a deduplicated map of scheme id -> name from both sources
  const schemeMap = new Map(ownerSchemes.map((s) => [s.id, s.name]));
  if (isCommittee) {
    const committeeSchemes = await getSchemesForCommittee(profile.id);
    for (const cs of committeeSchemes) {
      if (!schemeMap.has(cs.id)) schemeMap.set(cs.id, cs.name);
    }
  }

  if (schemeMap.size === 0) notFound();

  const schemeIds = [...schemeMap.keys()];
  const workOrders = await getWorkOrdersForSchemes(schemeIds);

  const schemeNames = Object.fromEntries(schemeMap);

  const sp = await searchParams;
  const { page } = parsePage(sp);
  const { data: paginatedOrders, meta } = paginateArray(workOrders, page);

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Maintenance"
        description="Maintenance requests and work orders for your schemes."
        action={
          <Button href="/owner/maintenance/new">
            {isCommittee ? "Raise Work Order" : "Report Issue"}
          </Button>
        }
      />

      <WorkOrderList
        workOrders={paginatedOrders}
        schemeNames={schemeNames}
        basePath="/owner/maintenance"
      />

      <Pagination
        page={meta.page}
        hasMore={meta.hasMore}
      />
    </div>
  );
}
