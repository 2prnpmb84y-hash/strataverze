import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForAdviser } from "@/lib/queries/schemes";
import { getComplianceForSchemes } from "@/lib/queries/compliance";
import { paginateArray, parsePage } from "@/lib/pagination";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Pagination } from "@/components/ui/pagination";
import { ComplianceList } from "@/components/compliance-list";

export default async function AdviserCompliancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const schemes = await getSchemesForAdviser(profile.id);
  const schemeIds = schemes.map((s) => s.id);
  const items =
    schemeIds.length > 0 ? await getComplianceForSchemes(schemeIds) : [];

  const schemeNames = Object.fromEntries(
    schemes.map((s) => [s.id, s.name]),
  );

  const compliant = items.filter((i) => i.status === "COMPLIANT").length;
  const nonCompliant = items.filter((i) => i.status === "NON_COMPLIANT").length;
  const expired = items.filter((i) => i.status === "EXPIRED").length;
  const pending = items.filter(
    (i) => i.status === "PENDING_REVIEW" || i.status === "PENDING",
  ).length;

  const sp = await searchParams;
  const { page } = parsePage(sp);
  const { data: paginatedItems, meta } = paginateArray(items, page);

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Compliance"
        description="Compliance tracking across all your managed schemes."
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <StatCard label="Compliant" value={compliant} accent="bg-green-500" />
        <StatCard
          label="Non-Compliant"
          value={nonCompliant}
          accent="bg-red-500"
        />
        <StatCard label="Expired" value={expired} accent="bg-gray-400" />
        <StatCard label="Pending" value={pending} accent="bg-yellow-500" />
      </div>

      <ComplianceList items={paginatedItems} schemeNames={schemeNames} />

      <Pagination
        page={meta.page}
        hasMore={meta.hasMore}
      />
    </div>
  );
}
