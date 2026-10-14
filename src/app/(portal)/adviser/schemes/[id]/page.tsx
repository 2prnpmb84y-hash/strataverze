import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { SchemeForm } from "../scheme-form";
import { DeleteSchemeButton } from "./delete-button";

export default async function SchemeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  // Check the current user is an adviser on this scheme
  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  const ownerCount = scheme.memberships.filter(
    (m) => m.role === "OWNER",
  ).length;

  const committeeCount = scheme.memberships.filter(
    (m) => m.role === "COMMITTEE",
  ).length;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={scheme.name}
        description={`${scheme.planNumber} · ${scheme.suburb}, ${scheme.state} ${scheme.postcode}`}
        backHref="/adviser/schemes"
        backLabel="Schemes"
      />

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <StatCard
          label="Lots"
          value={scheme.totalLots}
          accent="bg-adviser"
        />
        <StatCard
          label="Entitlement"
          value={scheme.totalEntitlement}
          accent="bg-adviser"
        />
        <StatCard
          label="Owners"
          value={ownerCount}
          accent="bg-owner"
        />
        <StatCard
          label="Committee"
          value={committeeCount}
          accent="bg-committee"
        />
      </div>

      {/* Funds summary */}
      {scheme.funds.length > 0 && (
        <Card className="mb-6">
          <CardHeader title="Funds" />
          <div className="flex flex-col gap-2">
            {scheme.funds.map((fund) => (
              <div
                key={fund.id}
                className="flex items-center justify-between rounded-lg bg-muted px-4 py-3"
              >
                <span className="text-sm font-medium text-foreground">
                  {fund.name}
                </span>
                <span className="text-xs text-muted-foreground uppercase tracking-wide">
                  {fund.fundType === "ADMIN"
                    ? "Administrative"
                    : fund.fundType === "SINKING"
                      ? "Capital Works"
                      : fund.fundType}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Edit form */}
      <div className="mb-6">
        <h2 className="font-heading font-semibold text-foreground mb-4">
          Edit Scheme Details
        </h2>
        <SchemeForm
          mode="edit"
          schemeId={scheme.id}
          defaults={{
            name: scheme.name,
            planNumber: scheme.planNumber,
            address: scheme.address,
            suburb: scheme.suburb,
            state: scheme.state,
            postcode: scheme.postcode,
            totalLots: scheme.totalLots,
            totalEntitlement: scheme.totalEntitlement,
            financialYearEnd: scheme.financialYearEnd,
            abnNumber: scheme.abnNumber,
          }}
        />
      </div>

      {/* Danger zone */}
      <Card className="border-red-200">
        <CardHeader
          title="Danger Zone"
          description="Irreversible actions for this scheme."
        />
        <DeleteSchemeButton schemeId={scheme.id} schemeName={scheme.name} />
      </Card>
    </div>
  );
}
