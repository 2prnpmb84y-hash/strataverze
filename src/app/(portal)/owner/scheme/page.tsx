import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForOwner } from "@/lib/queries/schemes";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";

export default async function OwnerSchemePage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const schemes = await getSchemesForOwner(profile.id);

  if (schemes.length === 0) {
    return (
      <div className="max-w-4xl">
        <PageHeader
          title="My Scheme"
          description="View details of your Owners Corporation."
        />
        <EmptyState
          icon={
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          }
          title="No scheme linked"
          description="Your strata manager or committee will add you to a scheme. Once linked, you will see your scheme details here."
        />
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="My Scheme"
        description="Details of the Owners Corporation you belong to."
      />

      {schemes.map((scheme) => {
        const myMembership = scheme.memberships[0];
        const myLot = myMembership?.lot;

        return (
          <div key={scheme.id} className="mb-8">
            {/* Scheme overview */}
            <Card className="mb-4">
              <CardHeader
                title={scheme.name}
                description={`${scheme.planNumber} · ${scheme.address}, ${scheme.suburb}, ${scheme.state} ${scheme.postcode}`}
              />

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
                <StatCard
                  label="Total Lots"
                  value={scheme.totalLots}
                  accent="bg-owner"
                />
                <StatCard
                  label="Entitlement"
                  value={scheme.totalEntitlement}
                  accent="bg-owner"
                />
                <StatCard
                  label="FY Ends"
                  value={scheme.financialYearEnd}
                  accent="bg-owner"
                />
              </div>
            </Card>

            {/* My lot details */}
            {myLot && (
              <Card>
                <CardHeader
                  title="My Lot"
                  description="Your lot details within this scheme."
                />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
                      Lot Number
                    </p>
                    <p className="text-sm font-medium text-foreground">
                      {myLot.unitNumber}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
                      Entitlement
                    </p>
                    <p className="text-sm font-medium text-foreground">
                      {myLot.entitlement}
                    </p>
                  </div>
                  {myLot.floorArea && (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
                        Floor Area
                      </p>
                      <p className="text-sm font-medium text-foreground">
                        {myLot.floorArea} m²
                      </p>
                    </div>
                  )}
                </div>
              </Card>
            )}
          </div>
        );
      })}
    </div>
  );
}
