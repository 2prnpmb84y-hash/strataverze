import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForOwner } from "@/lib/queries/schemes";
import { getLevyNoticesForLots, getLevyItemsForLot } from "@/lib/queries/levies";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
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

  const schemes = await getSchemesForOwner(profile.id);
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
    label: `Lot ${e.lotNumber}${e.unitNumber ? ` (Unit ${e.unitNumber})` : ""} — ${e.schemeName}`,
  }));

  // If only one lot, auto-select it
  const effectiveLotId =
    selectedLotId ?? (lotEntries.length === 1 ? lotEntries[0].lotId : undefined);

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
  const openingBalance = 0;
  let totalCharges = 0;
  let totalPayments = 0;
  let closingBalance = 0;
  let selectedLotLabel = "";

  if (effectiveLotId) {
    const selectedOption = lotOptions.find((l) => l.id === effectiveLotId);
    selectedLotLabel = selectedOption?.label ?? "";

    // Try LevyNotice first
    const notices = await getLevyNoticesForLots([effectiveLotId]);
    const lines: StatementLine[] = [];

    if (notices.length > 0) {
      for (const notice of notices) {
        const dueDate = String(notice.dueDate);

        // Apply date filter
        if (startDate && dueDate < startDate) continue;
        if (endDate && dueDate > endDate) continue;

        const amountDue = Number(notice.amountDue ?? 0);
        const amountPaid = Number(notice.amountPaid ?? 0);
        const interest = Number(notice.interestCharged ?? 0);
        const fundName = notice.fund ? String(notice.fund.name) : "";

        // Charge line
        if (amountDue > 0) {
          lines.push({
            id: `${notice.id}-charge`,
            date: dueDate,
            type: "Levy",
            description: `Levy ${String(notice.noticeNumber)} — ${fundName}`,
            charge: amountDue,
            payment: 0,
            balance: 0,
          });
        }

        // Payment line
        if (amountPaid > 0) {
          const paidDate = notice.paidInFullAt
            ? String(notice.paidInFullAt).split("T")[0]
            : dueDate;
          lines.push({
            id: `${notice.id}-payment`,
            date: paidDate,
            type: "Payment",
            description: `Payment received — ${String(notice.noticeNumber)}`,
            charge: 0,
            payment: amountPaid,
            balance: 0,
          });
        }

        // Interest line
        if (interest > 0) {
          lines.push({
            id: `${notice.id}-interest`,
            date: dueDate,
            type: "Interest",
            description: `Interest charged — ${String(notice.noticeNumber)}`,
            charge: interest,
            payment: 0,
            balance: 0,
          });
        }
      }
    } else {
      // Fallback to LevyItem
      const items = await getLevyItemsForLot(effectiveLotId);
      for (const item of items) {
        const dueDate = String(item.levy.dueDate);
        if (startDate && dueDate < startDate) continue;
        if (endDate && dueDate > endDate) continue;

        const amount = Number(item.amount);
        const paid = Number(item.paidAmount);

        if (amount > 0) {
          lines.push({
            id: `${item.id}-charge`,
            date: dueDate,
            type: "Levy",
            description: `${String(item.levy.title)} — ${String(item.levy.levyType)}`,
            charge: amount,
            payment: 0,
            balance: 0,
          });
        }

        if (paid > 0) {
          const paidDate = item.paidAt
            ? String(item.paidAt).split("T")[0]
            : dueDate;
          lines.push({
            id: `${item.id}-payment`,
            date: paidDate,
            type: "Payment",
            description: `Payment received — ${String(item.levy.title)}`,
            charge: 0,
            payment: paid,
            balance: 0,
          });
        }
      }
    }

    // Sort by date ascending
    lines.sort((a, b) => a.date.localeCompare(b.date));

    // Calculate running balance
    let runningBalance = openingBalance;
    for (const line of lines) {
      runningBalance += line.charge - line.payment;
      line.balance = runningBalance;
    }

    totalCharges = lines.reduce((s, l) => s + l.charge, 0);
    totalPayments = lines.reduce((s, l) => s + l.payment, 0);
    closingBalance = runningBalance;
    statementLines = lines;
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
