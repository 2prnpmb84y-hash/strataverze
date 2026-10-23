import { getVerifiedSelectedSchemeId } from "@/lib/owner/selected-scheme";
import { scopeToSelectedScheme } from "@/lib/owner/scheme-scope";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForOwner } from "@/lib/queries/schemes";
import { getLevyNoticesForLots } from "@/lib/queries/levies";
import { getLevyPaymentsForNotices } from "@/lib/queries/levy-schedules";
import { buildStatement } from "@/lib/levies/levy-ledger";
import { getCreditMovements } from "@/lib/finance/owner-credits";
import { PageHeader } from "@/components/ui/page-header";
import { formatLotLabel } from "@/lib/format";
import { OwnerStatementTable } from "./statement-table";
import { connection } from "next/server";

export default async function OwnerStatementPage({
  searchParams,
}: {
  searchParams: Promise<{
    lot?: string;
    startDate?: string;
    endDate?: string;
  }>;
}) {
  await connection();
  const { lot: selectedLotId, startDate, endDate } = await searchParams;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const schemes = scopeToSelectedScheme(
    await getSchemesForOwner(profile.id),
    await getVerifiedSelectedSchemeId(),
  );
  if (schemes.length === 0) notFound();

  // Build lot options from owner's memberships
  const lotEntries = schemes.flatMap((s) =>
    s.memberships
      .filter((m) => m.lotId)
      .map((m) => ({
        lotId: m.lotId!,
        schemeId: s.id,
        schemeName: String(s.name),
        lotNumber: m.lot ? String(m.lot.lotNumber) : "",
        unitNumber: m.lot?.unitNumber ? String(m.lot.unitNumber) : null,
      })),
  );

  const lotOptions = lotEntries.map((e) => ({
    id: e.lotId,
    label: `${formatLotLabel(e.lotNumber)}${e.unitNumber ? ` (Unit ${e.unitNumber})` : ""} — ${e.schemeName}`,
  }));

  // Only the owner's own lots can be shown. If only one lot, auto-select it.
  const ownLotIds = new Set(lotEntries.map((e) => e.lotId));
  const effectiveLotId =
    selectedLotId && ownLotIds.has(selectedLotId)
      ? selectedLotId
      : lotEntries.length === 1
        ? lotEntries[0].lotId
        : undefined;

  interface StatementLine {
    id: string;
    date: string;
    type: string;
    description: string;
    charge: number;
    payment: number;
    balance: number;
  }

  let statementLines: StatementLine[] = [];
  let openingBalance = 0;
  let totalCharges = 0;
  let totalPayments = 0;
  let closingBalance = 0;
  let selectedLotLabel = "";

  if (effectiveLotId) {
    selectedLotLabel = lotOptions.find((l) => l.id === effectiveLotId)?.label ?? "";
    const notices = await getLevyNoticesForLots([effectiveLotId]);
    const payments = await getLevyPaymentsForNotices(notices.map((n) => n.id));
    const entry = lotEntries.find((e) => e.lotId === effectiveLotId)!;
    const credits = await getCreditMovements(entry.schemeId, effectiveLotId);
    const statement = buildStatement(notices, payments, { startDate, endDate }, credits);
    statementLines = statement.lines;
    openingBalance = statement.openingBalance;
    totalCharges = statement.totalCharges;
    totalPayments = statement.totalPayments;
    closingBalance = statement.closingBalance;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Statement"
        description="Your levy charges, payments and running balance."
        backHref="/owner/levies"
        backLabel="Levies"
      />

      <OwnerStatementTable
        lotOptions={lotOptions}
        selectedSchemeId={lotEntries.find((e) => e.lotId === effectiveLotId)?.schemeId ?? ""}
        selectedLotId={effectiveLotId ?? ""}
        selectedLotLabel={selectedLotLabel}
        startDate={startDate ?? ""}
        endDate={endDate ?? ""}
        openingBalance={openingBalance}
        totalCharges={totalCharges}
        totalPayments={totalPayments}
        closingBalance={closingBalance}
        statementLines={statementLines}
      />
    </div>
  );
}
