import { connection } from "next/server";
import { getLotsForScheme, getStrataRollData } from "@/lib/queries/lots";
import { getContactsForScheme } from "@/lib/queries/contacts";
import { StrataRollTable } from "../strata-roll-table";
import { ContactsCard } from "../_sections/contacts-card";
import { requireAdviserScheme } from "../_sections/require-adviser-scheme";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";
import { lotWordsFor } from "@/lib/jurisdiction/screen-words";

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

  // Lots are created when the building is onboarded, so there is no Add Lot here.
  const [lots, strataRollRows, contacts] = await Promise.all([
    getLotsForScheme(id),
    getStrataRollData(id),
    getContactsForScheme(id),
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
      </div>
      <StrataRollTable rows={strataRollRows} schemeId={id} words={lotWordsFor(rulesForState(scheme.state).rules)} />
      <div className="mt-6">
        <ContactsCard id={id} contacts={contacts} />
      </div>
    </div>
  );
}
