import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForOwner } from "@/lib/queries/schemes";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { getVerifiedSelectedSchemeId } from "@/lib/owner/selected-scheme";
import { scopeToSelectedScheme } from "@/lib/owner/scheme-scope";
import { connection } from "next/server";
import { getSelectedOwnerScheme } from "@/lib/owner/selected-scheme";
import { getStrataRollData } from "@/lib/queries/lots";
import { StrataRollTable } from "@/app/(portal)/adviser/schemes/[id]/strata-roll-table";
import { rulesForScheme } from "@/lib/jurisdiction/scheme-rules";
import { lotWordsFor, packWordsFor } from "@/lib/jurisdiction/screen-words";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";
import { DEFAULT_SCHEME_STATE } from "@/config/jurisdictions";

export default async function OwnerSchemePage() {
  await connection();
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const schemes = scopeToSelectedScheme(
    await getSchemesForOwner(profile.id),
    await getVerifiedSelectedSchemeId(),
  );

  // Committee members keep the strata roll up to date (roll.manage, 24 Oct),
  // so they see the roll and each lot (25 Oct 2026).
  const committee = await getSelectedOwnerScheme(["COMMITTEE"]);
  const rollRows = committee ? await getStrataRollData(committee.schemeId) : null;
  // The roll's words, from the selected building's rule pack.
  const rollWords = committee && rollRows ? lotWordsFor((await rulesForScheme(committee.schemeId)).rules) : null;

  if (schemes.length === 0 && !committee) {
    return (
      <div className="max-w-4xl">
        <PageHeader
          title="My Scheme"
          description={`View details of your ${packWordsFor(rulesForState(DEFAULT_SCHEME_STATE).rules).OwnersCorporationTitle}.`}
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

  // The scheme header and pills come from the shared owner scheme layout.
  return (
    <>
    {committee && rollRows && rollWords && (
      <Card className="mb-6">
        <CardHeader title="Strata roll" description="Every lot and its owner, and whether the lot is financial. Open a lot to update its owner." />
        <StrataRollTable rows={rollRows} schemeId={committee.schemeId} lotHrefBase="/owner/scheme/lots/" showMoney={false} words={rollWords} />
      </Card>
    )}
    <div>
      {schemes.map((scheme) => {
        const myMembership = scheme.memberships[0];
        const myLot = myMembership?.lot;

        return (
          <div key={scheme.id} className="mb-6">
            {schemes.length > 1 && (
              <h2 className="font-heading font-semibold text-ink mb-3">
                {scheme.planNumber} · {scheme.name}
              </h2>
            )}
            {/* My lot details */}
            {myLot && (
              <Card className="mb-6">
                <CardHeader
                  title="My Lot"
                  description="Your lot details within this scheme."
                />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-ink-muted uppercase tracking-wide mb-0.5">
                      Lot Number
                    </p>
                    <p className="text-sm font-medium text-ink">
                      {myLot.lotNumber}
                    </p>
                  </div>
                  {myLot.unitNumber && (
                    <div>
                      <p className="text-xs text-ink-muted uppercase tracking-wide mb-0.5">
                        Unit Number
                      </p>
                      <p className="text-sm font-medium text-ink">
                        {myLot.unitNumber}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-ink-muted uppercase tracking-wide mb-0.5">
                      Entitlement
                    </p>
                    <p className="text-sm font-medium text-ink">
                      {myLot.entitlement}
                    </p>
                  </div>
                  {myLot.floorArea && (
                    <div>
                      <p className="text-xs text-ink-muted uppercase tracking-wide mb-0.5">
                        Floor Area
                      </p>
                      <p className="text-sm font-medium text-ink">
                        {myLot.floorArea} m²
                      </p>
                    </div>
                  )}
                </div>
              </Card>
            )}

            <Card>
              <CardHeader
                title="Contacts"
                description="Building managers, contractors and service providers for this scheme."
                action={
                  <Button href="/owner/contacts" variant="secondary">
                    View Contacts
                  </Button>
                }
              />
            </Card>
          </div>
        );
      })}
    </div>
  </>
  );
}
