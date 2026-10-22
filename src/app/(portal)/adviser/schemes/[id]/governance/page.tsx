import { connection } from "next/server";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { requireAdviserScheme } from "../_sections/require-adviser-scheme";

/**
 * Governance section. Placeholder until the governance workflows are built.
 * Scheme membership (owners, committee, advisers) is already managed under
 * Members, so that stays reachable from here.
 */
export default async function GovernanceSectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const scheme = await requireAdviserScheme(id);
  if (!scheme) return null;

  return (
    <div>
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
      <Card className="mb-6">
        <CardHeader
          title="Governance"
          description="This section is not built yet. Further governance tools will appear here."
        />
      </Card>
    </div>
  );
}
