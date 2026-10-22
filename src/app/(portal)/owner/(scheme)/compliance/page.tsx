import { getSelectedSchemeId } from "@/lib/actions/scheme-selection";
import { scopeToSelectedScheme, scopeSchemeIds } from "@/lib/owner/scheme-scope";
import { requireCommitteeAccess } from "@/lib/queries/committee-access";
import { getComplianceForSchemes } from "@/lib/queries/compliance";
import { paginateArray, parsePage } from "@/lib/pagination";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Pagination } from "@/components/ui/pagination";
import { ComplianceList } from "@/components/compliance-list";
import { connection } from "next/server";

export default async function OwnerCompliancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const access = await requireCommitteeAccess();
  if (!access) {
    return (
      <div className="max-w-3xl">
        <PageHeader title="Compliance" description="You do not have committee access to view this page." />
      </div>
    );
  }

  const selectedSchemeId = await getSelectedSchemeId();
  const schemes = scopeToSelectedScheme(access.schemes, selectedSchemeId);
  const schemeIds = scopeSchemeIds(access.schemeIds, selectedSchemeId);
  const items =
    schemeIds.length > 0 ? await getComplianceForSchemes(schemeIds) : [];

  const schemeNames = Object.fromEntries(
    schemes.map((s) => [s.id, s.name]),
  );

  const compliant = items.filter((i) => i.status === "COMPLIANT").length;
  const nonCompliant = items.filter((i) => i.status === "NON_COMPLIANT").length;
  const expired = items.filter((i) => i.status === "EXPIRED").length;
  const pendingReview = items.filter(
    (i) => i.status === "PENDING_REVIEW",
  ).length;

  const sp = await searchParams;
  const { page } = parsePage(sp);
  const { data: paginatedItems, meta } = paginateArray(items, page);

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Compliance"
        description="Compliance obligations for your schemes."
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <StatCard label="Compliant" value={compliant} accent="bg-green-500" />
        <StatCard
          label="Non-Compliant"
          value={nonCompliant}
          accent="bg-red-500"
        />
        <StatCard label="Expired" value={expired} accent="bg-gray-400" />
        <StatCard
          label="Pending Review"
          value={pendingReview}
          accent="bg-yellow-500"
        />
      </div>

      <ComplianceList items={paginatedItems} schemeNames={schemeNames} />

      <Pagination
        page={meta.page}
        hasMore={meta.hasMore}
      />
    </div>
  );
}
