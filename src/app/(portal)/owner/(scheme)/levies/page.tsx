import { getVerifiedSelectedSchemeId } from "@/lib/owner/selected-scheme";
import { todayIn } from "@/lib/jurisdiction/time-zone";
import { timeZoneOf } from "@/lib/jurisdiction/scheme-time";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";
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
import { sharedLevyWords } from "@/lib/jurisdiction/screen-words";
import { DEFAULT_SCHEME_STATE } from "@/config/jurisdictions";

/** "Levies", "Contributions", "Levies and Contributions". */
const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/ And /g, " and ");
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
  // Today in each building's own time zone.
  const todayBy = new Map(schemes.map((s) => [s.id, todayIn(timeZoneOf(s))]));
  // Each building's words, from its rule pack, and the words the page uses for them all.
  const rulesBy = new Map(schemes.map((s) => [s.id, rulesForState(s.state).rules]));
  const words = sharedLevyWords([...rulesBy.values()], rulesForState(DEFAULT_SCHEME_STATE).rules);
  const displayItems = levyItems(
    notices,
    (schemeId) => todayBy.get(schemeId) ?? todayIn(timeZoneOf(schemes[0])),
    new Map(lotEntries.map((e) => [e.lotId, { label: lotLabels.get(e.lotId) ?? "", schemeId: e.schemeId }])),
    (schemeId) => rulesBy.get(schemeId)?.TERMINOLOGY ?? words,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={`My ${titleCase(words.levies)}`}
        description="Levies and contributions due for your lots."
      />

      <LevyNoticesView
        items={displayItems}
        words={words}
        lateChargeByScheme={Object.fromEntries([...rulesBy].map(([schemeId, rules]) => [schemeId, rules.TERMINOLOGY.lateCharge]))}
        actions={
          <>
            {schemes.some((s) => rulesForState(s.state).rules.FEATURES.statutoryPaymentPlans) && (
              <Button variant="secondary" href="/owner/levies/payment-plan">
                Payment Plan
              </Button>
            )}
            {schemes.some((s) => rulesForState(s.state).rules.FEATURES.debtRecoverySteps) && (
              <Button variant="secondary" href="/owner/levies/debt-recovery">
                Debt Recovery
              </Button>
            )}
            <Button variant="secondary" href="/owner/levies/statement">
              View Statement
            </Button>
          </>
        }
      />
    </div>
  );
}
