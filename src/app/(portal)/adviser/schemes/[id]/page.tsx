import Link from "next/link";
import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getLotsForScheme } from "@/lib/queries/lots";
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

  const lots = await getLotsForScheme(id);

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

      {/* Lots */}
      <Card className="mb-6">
        <CardHeader
          title="Lots"
          description={`${lots.length} of ${scheme.totalLots} lots registered.`}
          action={
            <Button href={`/adviser/schemes/${id}/lots/new`} variant="secondary">
              Add Lot
            </Button>
          }
        />
        {lots.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 font-medium text-muted-foreground">Lot</th>
                  <th className="pb-2 font-medium text-muted-foreground">Unit</th>
                  <th className="pb-2 font-medium text-muted-foreground">Type</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Entitlement</th>
                  <th className="pb-2 font-medium text-muted-foreground">Owner</th>
                </tr>
              </thead>
              <tbody>
                {lots.map((lot) => {
                  const owner = lot.memberships.find(
                    (m) => m.role === "OWNER",
                  );
                  return (
                    <tr key={lot.id} className="border-b border-border last:border-0">
                      <td className="py-3">
                        <Link
                          href={`/adviser/schemes/${id}/lots/${lot.id}`}
                          className="font-medium text-foreground hover:text-primary-500 transition-colors"
                        >
                          {lot.lotNumber}
                        </Link>
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {lot.unitNumber ?? "—"}
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {lot.lotType.charAt(0) + lot.lotType.slice(1).toLowerCase()}
                      </td>
                      <td className="py-3 text-right font-variant-numeric tabular-nums">
                        {lot.entitlement}
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {owner
                          ? `${owner.profile.firstName} ${owner.profile.lastName}`.trim() || owner.profile.email
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No lots registered yet. Add lots to start assigning owners.
          </p>
        )}
      </Card>

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
