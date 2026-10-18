import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForOwner } from "@/lib/queries/schemes";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SchemeDetailHeader } from "@/components/scheme-detail-header";
import { connection } from "next/server";

export default async function OwnerSchemePage() {
  await connection();
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
    <div className="max-w-5xl">
      {schemes.map((scheme) => {
        const myMembership = scheme.memberships[0];
        const myLot = myMembership?.lot;

        const schemeImages = (scheme.images ?? []).map((img) => ({
          id: img.id,
          url: img.url,
          caption: img.caption ?? null,
        }));

        const addressLine = `${scheme.address}, ${scheme.suburb}, ${scheme.postcode}`;
        const fullAddress = `${scheme.address}, ${scheme.suburb}, ${scheme.state} ${scheme.postcode}`;

        const navButtons = [
          { label: "Lots / Owners", href: "/owner/scheme/lots" },
          { label: "Financials", href: "/owner/scheme/financials" },
          { label: "Compliance", href: "/owner/scheme/compliance" },
          { label: "Insurance", href: "/owner/scheme/insurance" },
          { label: "Conversations", href: "/owner/scheme/conversations" },
          { label: "Document", href: "/owner/scheme/documents" },
          { label: "Work Order", href: "/owner/scheme/work-orders" },
          { label: "Meetings", href: "/owner/scheme/meetings" },
          { label: "Budget", href: "/owner/scheme/budget" },
          { label: "Notes", href: "/owner/scheme/notes" },
          { label: "Invoices", href: "/owner/scheme/invoices" },
        ];

        return (
          <div key={scheme.id} className="mb-8">
            <SchemeDetailHeader
              backHref="/owner"
              backLabel="Dashboard"
              planNumber={scheme.planNumber}
              addressLine={addressLine}
              fullAddress={fullAddress}
              details={[
                { label: "State", value: scheme.state },
                { label: "Total Lots", value: scheme.totalLots },
                { label: "Building class", value: scheme.buildingClass },
                { label: "Total UOE", value: scheme.totalEntitlement },
                { label: "Building type", value: scheme.buildingType },
              ]}
              images={schemeImages}
              navButtons={navButtons}
            />

            {/* My lot details */}
            {myLot && (
              <Card className="mt-4">
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
