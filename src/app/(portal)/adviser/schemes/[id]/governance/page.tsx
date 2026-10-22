import { connection } from "next/server";
import { getBylawsForScheme } from "@/lib/queries/bylaws";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { BylawsCard } from "../_sections/bylaws-card";
import { requireAdviserScheme } from "../_sections/require-adviser-scheme";

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

  return (
    <div>
      <BylawsCard id={id} bylaws={bylaws} />
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
