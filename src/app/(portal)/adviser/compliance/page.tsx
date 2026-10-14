import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForAdviser } from "@/lib/queries/schemes";
import { getComplianceForSchemes } from "@/lib/queries/compliance";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { ComplianceList } from "@/components/compliance-list";

export default async function AdviserCompliancePage() {
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

      <ComplianceList items={items} schemeNames={schemeNames} />
    </div>
  );
}
