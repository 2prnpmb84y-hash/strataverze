import { connection } from "next/server";
import { getBylawsForScheme } from "@/lib/queries/bylaws";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { BylawsCard } from "../_sections/bylaws-card";
import { requireAdviserScheme } from "../_sections/require-adviser-scheme";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";
import { accessOffered } from "@/lib/records/offered";

/** Governance pill: the by-laws register and scheme membership. */
export default async function GovernanceSectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const scheme = await requireAdviserScheme(id);
  if (!scheme) return null;

  const bylaws = await getBylawsForScheme(id);
  // Only the workflows the building's rule pack has.
  const { FEATURES: features, TERMINOLOGY: terms, INSPECTIONS: inspections } = rulesForState(scheme.state).rules;

  return (
    <div>
      <BylawsCard id={id} bylaws={bylaws} />
      {features.strataHubAnnualReport && (
        <Card className="mb-6">
          <CardHeader
            title="Strata Hub annual report"
            description="When the annual report is due after each AGM, and what it asks for."
            action={
              <Button href={`/adviser/schemes/${id}/governance/strata-hub`} variant="secondary">
                Annual report
              </Button>
            }
          />
        </Card>
      )}
      {accessOffered(features) && (
        <Card className="mb-6">
          <CardHeader
            title="Records inspections"
            description={
              inspections?.basis === "FEE_UNITS"
                ? `Requests to inspect or copy the ${terms.ownersCorporation}'s records: dates and fees.`
                : `Requests to inspect the ${terms.ownersCorporation}'s records: times, notices and fees.`
            }
            action={
              <Button href={`/adviser/schemes/${id}/governance/inspections`} variant="secondary">
                Inspections
              </Button>
            }
          />
        </Card>
      )}
      {features.committeeTraining && (
        <Card className="mb-6">
          <CardHeader
            title="Committee training"
            description="Each committee member's training: completed, due or overdue."
            action={
              <Button href={`/adviser/schemes/${id}/members/training`} variant="secondary">
                Committee training
              </Button>
            }
          />
        </Card>
      )}
      <Card className="mb-6">
        <CardHeader
          title="Members"
          description="Owners, committee members and advisers with access to this scheme."
          action={
            <Button href={`/adviser/schemes/${id}/members`} variant="secondary">
              Manage Members
            </Button>
          }
        />
      </Card>
    </div>
  );
}
