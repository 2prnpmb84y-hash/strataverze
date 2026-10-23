import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getLotsForScheme } from "@/lib/queries/lots";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { OwnerStatementClient } from "./owner-statement-client";
import { getIssuedLevyNoticesForLot, getLevyPaymentsForNotices } from "@/lib/queries/levy-schedules";
import { buildStatement } from "@/lib/levies/levy-ledger";
import { getCreditMovements } from "@/lib/finance/owner-credits";
import { connection } from "next/server";
import { formatLotLabel } from "@/lib/format";

export default async function OwnerStatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    lot?: string;
    startDate?: string;
    endDate?: string;
  }>;
}) {
  await connection();
  const { id } = await params;
  const { lot: selectedLotId, startDate, endDate } = await searchParams;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  const lots = await getLotsForScheme(id);

  if (lots.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Owner Statement"
          backHref={`/adviser/schemes/${id}/finance/reports`}
          backLabel="Reports"
        />
        <EmptyState
          title="No lots registered"
          description="Add lots to the scheme to generate owner statements."
          actionLabel="Manage Lots"
          actionHref={`/adviser/schemes/${id}/lots`}
        />
      </div>
    );
  }

  // Build lot options with owner names
  const lotOptions = lots.map((lot) => {
    const owners = lot.memberships
      .filter((m) => String(m.role) === "OWNER")
      .map((m) => {
        const first = String(m.profile?.firstName ?? "");
        const last = String(m.profile?.lastName ?? "");
        return [first, last].filter(Boolean).join(" ");
      })
      .filter(Boolean);

    const ownerLabel = owners.length > 0 ? ` — ${owners.join(", ")}` : "";
    return {
      id: lot.id,
      lotNumber: String(lot.lotNumber),
      unitNumber: lot.unitNumber ? String(lot.unitNumber) : null,
      label: `${formatLotLabel(lot.lotNumber)}${lot.unitNumber ? ` (Unit ${String(lot.unitNumber)})` : ""}${ownerLabel}`,
      ownerName: owners.join(", ") || "No owner assigned",
    };
  });

  // Load levy notices for the selected lot
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
  let selectedOwnerName = "";

  // Only lots in this scheme can be shown.
  const selectedOption = selectedLotId
    ? lotOptions.find((l) => l.id === selectedLotId)
    : undefined;

  if (selectedOption) {
    selectedLotLabel = `${formatLotLabel(selectedOption.lotNumber)}${selectedOption.unitNumber ? ` (Unit ${selectedOption.unitNumber})` : ""}`;
    selectedOwnerName = selectedOption.ownerName ?? "";

    const notices = await getIssuedLevyNoticesForLot(id, selectedOption.id);
    const payments = await getLevyPaymentsForNotices(notices.map((n) => n.id));
    const credits = await getCreditMovements(id, selectedOption.id);
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
        title="Owner Statement"
        description={String(scheme.name)}
        backHref={`/adviser/schemes/${id}/finance/reports`}
        backLabel="Reports"
      />

      <OwnerStatementClient
        schemeId={id}
        lotOptions={lotOptions.map((l) => ({ id: l.id, label: l.label }))}
        selectedLotId={selectedLotId ?? ""}
        selectedLotLabel={selectedLotLabel}
        selectedOwnerName={selectedOwnerName}
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
