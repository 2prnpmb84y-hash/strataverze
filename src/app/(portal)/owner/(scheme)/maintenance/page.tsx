import { getVerifiedSelectedSchemeId } from "@/lib/owner/selected-scheme";
import { scopeSchemeIds } from "@/lib/owner/scheme-scope";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
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

  const [ownerSchemes, committeeSchemes, selectedSchemeId] = await Promise.all([
    getSchemesForOwner(profile.id),
    getSchemesForCommittee(profile.id),
    getVerifiedSelectedSchemeId(),
  ]);

  // Build a deduplicated map of scheme id -> name from both sources
  const schemeMap = new Map(ownerSchemes.map((s) => [s.id, s.name]));
  for (const cs of committeeSchemes) {
    if (!schemeMap.has(cs.id)) schemeMap.set(cs.id, cs.name);
  }

  if (schemeMap.size === 0) notFound();

  const schemeIds = scopeSchemeIds([...schemeMap.keys()], selectedSchemeId);
  const workOrders = await getWorkOrdersForSchemes(schemeIds);

  const schemeNames = Object.fromEntries(schemeMap);

  const sp = await searchParams;
  const { page } = parsePage(sp);
  const { data: paginatedOrders, meta } = paginateArray(workOrders, page);

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Maintenance"
        description="Earlier maintenance work orders. New requests are raised under Works requests."
        action={
          <Button href="/owner/works/new">Report something</Button>
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
