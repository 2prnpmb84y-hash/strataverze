import { getVerifiedSelectedSchemeId } from "@/lib/owner/selected-scheme";
import { scopeToSelectedScheme } from "@/lib/owner/scheme-scope";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForOwner } from "@/lib/queries/schemes";
import { getLevyNoticesForLots } from "@/lib/queries/levies";
import { levyItems } from "@/lib/levies/levy-ledger";
import { LevyNoticesView } from "@/components/levies/levy-notices-view";
import { PageHeader } from "@/components/ui/page-header";
import { formatLotLabel } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { connection } from "next/server";

export default async function OwnerLeviesPage() {
  await connection();
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const schemes = scopeToSelectedScheme(
    await getSchemesForOwner(profile.id),
    await getVerifiedSelectedSchemeId(),
  );
  if (schemes.length === 0) notFound();

  // Get the owner's lot IDs from their memberships
  const lotEntries = schemes.flatMap((s) =>
    s.memberships
      .filter((m) => m.lotId)
      .map((m) => ({
        lotId: m.lotId!,
        schemeId: s.id,
        lotNumber: m.lot ? String(m.lot.lotNumber) : "",
        unitNumber: m.lot?.unitNumber ? String(m.lot.unitNumber) : null,
      })),
  );
  const lotIds = lotEntries.map((e) => e.lotId);
  const lotLabels = new Map(
    lotEntries.map((e) => [
      e.lotId,
      `${formatLotLabel(e.lotNumber)}${e.unitNumber ? ` (Unit ${e.unitNumber})` : ""}`,
    ]),
  );

  const notices = (await getLevyNoticesForLots(lotIds)).filter(
    (n) => String(n.status) !== "DRAFT",
  );
  const today = new Date().toISOString().slice(0, 10);
  const displayItems = levyItems(
    notices,
    today,
    new Map(lotEntries.map((e) => [e.lotId, { label: lotLabels.get(e.lotId) ?? "", schemeId: e.schemeId }])),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Levies"
        description="Levies and contributions due for your lots."
      />

      <LevyNoticesView
        items={displayItems}
        actions={
          <>
            <Button variant="secondary" href="/owner/levies/debt-recovery">
              Debt Recovery
            </Button>
            <Button variant="secondary" href="/owner/levies/statement">
              View Statement
            </Button>
          </>
        }
      />
    </div>
  );
}
