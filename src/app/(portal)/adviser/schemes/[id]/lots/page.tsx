import { connection } from "next/server";
import { getLotsForScheme, getStrataRollData } from "@/lib/queries/lots";
import { getContactsForScheme } from "@/lib/queries/contacts";
import { Button } from "@/components/ui/button";
import { StrataRollTable } from "../strata-roll-table";
import { ContactsCard } from "../_sections/contacts-card";
import { requireAdviserScheme } from "../_sections/require-adviser-scheme";
import { getCurrentProfile } from "@/lib/queries/profiles";

/** Lots / Owners pill: the strata roll, with scheme contacts nested here. */
export default async function LotsSectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const scheme = await requireAdviserScheme(id);
  if (!scheme) return null;

  const [lots, strataRollRows, contacts, profile] = await Promise.all([
    getLotsForScheme(id),
    getStrataRollData(id),
    getContactsForScheme(id),
    getCurrentProfile(),
  ]);
  // Adding lots changes the locked building record: StrataVerze only.
  const isPlatformAdmin = !!profile?.isPlatformAdmin;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-heading font-semibold text-ink">Strata Roll</h2>
          <p className="text-sm text-ink-muted">
            {lots.length} of {scheme.totalLots} lots registered
          </p>
        </div>
        {isPlatformAdmin && (
          <Button href={`/adviser/schemes/${id}/lots/new`} variant="secondary">
            Add Lot
          </Button>
        )}
      </div>
      <StrataRollTable rows={strataRollRows} schemeId={id} />
      <div className="mt-6">
        <ContactsCard id={id} contacts={contacts} />
      </div>
    </div>
  );
}
