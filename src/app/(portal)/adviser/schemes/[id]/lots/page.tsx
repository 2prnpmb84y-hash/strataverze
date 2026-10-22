import { connection } from "next/server";
import { getLotsForScheme, getStrataRollData } from "@/lib/queries/lots";
import { Button } from "@/components/ui/button";
import { StrataRollTable } from "../strata-roll-table";
import { requireAdviserScheme } from "../_sections/require-adviser-scheme";

/** Lots / Owners section: the strata roll (moved from the former Lots tab). */
export default async function LotsSectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const scheme = await requireAdviserScheme(id);
  if (!scheme) return null;

  const [lots, strataRollRows] = await Promise.all([
    getLotsForScheme(id),
    getStrataRollData(id),
  ]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-heading font-semibold text-ink">Strata Roll</h2>
          <p className="text-sm text-ink-muted">
            {lots.length} of {scheme.totalLots} lots registered
          </p>
        </div>
        <Button href={`/adviser/schemes/${id}/lots/new`} variant="secondary">
          Add Lot
        </Button>
      </div>
      <StrataRollTable rows={strataRollRows} schemeId={id} />
    </div>
  );
}
