import { notFound } from "next/navigation";
import { schemeToday, timeZoneOf } from "@/lib/jurisdiction/scheme-time";
import { formatDateIn } from "@/lib/jurisdiction/time-zone";
import { connection } from "next/server";
import { getSelectedOwnerScheme } from "@/lib/owner/selected-scheme";
import { getLotInScheme, getStrataRollData } from "@/lib/queries/lots";
import { getLotDetailExtended } from "@/lib/queries/lot-workflows";
import { getSchemeById } from "@/lib/queries/schemes";
import { recordSecurityEventLater } from "@/lib/audit/security-audit";
import { formatLotLabel } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { FinancialStatusChip } from "@/components/lots/financial-status";
import { ChangeOwnerButton } from "@/components/lots/change-owner-button";
import { PendingOwnerChange } from "@/components/lots/pending-owner-change";
import { pendingOwnerChangeView } from "@/lib/owner/owner-change-requests";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";
import { lotWordsFor } from "@/lib/jurisdiction/screen-words";
import { separateEntitlement } from "@/lib/jurisdiction/building-data";

/**
 * A lot on the strata roll, for the committee (25 Oct 2026): its owner as
 * recorded, whether it is financial, and Change owner. 404 for anyone who
 * is not on the committee of the selected building.
 */
export default async function CommitteeLotPage({ params }: { params: Promise<{ lotId: string }> }) {
  await connection();
  const { lotId } = await params;
  const committee = await getSelectedOwnerScheme(["COMMITTEE"]);
  if (!committee) notFound();
  const schemeId = committee.schemeId;
  const lot = await getLotInScheme(schemeId, lotId);
  if (!lot) notFound();

  const [scheme, detail, roll, pendingChange] = await Promise.all([
    getSchemeById(schemeId),
    getLotDetailExtended(lotId),
    getStrataRollData(schemeId),
    // A change of owner the committee recorded, waiting for the Adviser (H-1).
    pendingOwnerChangeView(schemeId, lotId),
  ]);
  // The lot was found in the building, so the building is there.
  if (!scheme) notFound();
  const row = roll.find((r) => r.id === lotId);
  await recordSecurityEventLater({ action: "view.owner_details", outcome: "allowed", actorRole: "COMMITTEE", schemeId, resourceType: "Lot", resourceId: lotId });

  const lotLabel = `${formatLotLabel(lot.lotNumber)}${lot.unitNumber ? ` (Unit ${lot.unitNumber})` : ""}`;
  const settled = detail?.lastSettled ? formatDateIn(timeZoneOf(scheme), String(detail.lastSettled), { day: "2-digit", month: "2-digit" }) : "—";
  // The entitlement's name, and any second one, from the building's rule pack.
  const packRules = rulesForState(scheme.state).rules;
  const second = separateEntitlement(packRules);
  const rows: Array<[string, string]> = [
    ["Owner (strata roll)", detail?.rollOwnerName || row?.ownerNames || "—"],
    ["Email", detail?.ownerEmail || "—"],
    ["Mobile", detail?.ownerMobile || "—"],
    ["Phone", detail?.ownerPhone || "—"],
    ["Postal address", detail?.ownerAddress || "—"],
    ["Last settled", settled],
    [lotWordsFor(packRules).entitlementLabel, String(lot.entitlement)],
    ...(second?.field ? ([[second.label.charAt(0) + second.label.slice(1).toLowerCase(), lot[second.field] != null ? String(lot[second.field]) : "Not recorded"]] as Array<[string, string]>) : []),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${formatLotLabel(lot.lotNumber)}${lot.unitNumber ? ` / Unit ${lot.unitNumber}` : ""}`}
        description={`${scheme?.name ?? ""} · ${scheme?.planNumber ?? ""}`}
        backHref="/owner/scheme"
        backLabel="Strata Roll"
      />
      <div className="flex flex-wrap items-center gap-3">
        {!pendingChange && (
          <ChangeOwnerButton
            schemeId={schemeId}
            lotId={lotId}
            lotLabel={lotLabel}
            currentOwner={detail?.rollOwnerName ?? null}
            today={await schemeToday(schemeId)}
            heldForReview={!committee.roles.includes("ADVISER")}
          />
        )}
        {row && <FinancialStatusChip financial={row.financial} overdueCents={row.overdueCents} oldestOverdue={row.oldestOverdue} />}
      </div>
      {pendingChange && <PendingOwnerChange schemeId={schemeId} lotLabel={lotLabel} change={pendingChange} canDecide={false} />}
      <Card>
        <CardHeader title="Owner" description="As recorded on the strata roll." />
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-xs text-ink-muted">{k}</dt>
              <dd className="break-words text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}
