import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { requireFinancialReadAccess } from "@/lib/auth/require-accountant-access";
import { getLotsForScheme } from "@/lib/queries/lots";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { OwnerStatementClient } from "@/app/(portal)/adviser/schemes/[id]/finance/reports/owner-statement/owner-statement-client";
import { db } from "@/prisma/db";
import { connection } from "next/server";

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
  await requireFinancialReadAccess(id);
  const { lot: selectedLotId, startDate, endDate } = await searchParams;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const lots = await getLotsForScheme(id);

  if (lots.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Owner Statement"
          backHref={`/accountant/schemes/${id}/finance/reports`}
          backLabel="Reports"
        />
        <EmptyState
          title="No lots registered"
          description="Add lots to the scheme to generate owner statements."
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
      label: `Lot ${String(lot.lotNumber)}${lot.unitNumber ? ` (Unit ${String(lot.unitNumber)})` : ""}${ownerLabel}`,
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
  const openingBalance = 0;
  let totalCharges = 0;
  let totalPayments = 0;
  let closingBalance = 0;
  let selectedLotLabel = "";
  let selectedOwnerName = "";

  if (selectedLotId) {
    const selectedOption = lotOptions.find((l) => l.id === selectedLotId);
    selectedLotLabel = selectedOption
      ? `Lot ${selectedOption.lotNumber}${selectedOption.unitNumber ? ` (Unit ${selectedOption.unitNumber})` : ""}`
      : "";
    selectedOwnerName = selectedOption?.ownerName ?? "";

    // Fetch levy notices for this lot
    const query = db.orm.public.LevyNotice.where(
      (ln) => ln.lotId.eq(selectedLotId),
    );

    // No date filtering on the query itself since dueDate is a date type
    // We'll filter in JS for simplicity with date range
    const notices = await query
      .include("fund")
      .include("levySchedule")
      .orderBy((ln) => ln.dueDate.asc())
      .all();

    // Also get levy items for this lot (from the simpler Levy/LevyItem model)
    const levyItems = await db.orm.public.LevyItem.where(
      (li) => li.lotId.eq(selectedLotId),
    )
      .include("levy")
      .all();

    // Build statement lines from levy notices
    const lines: StatementLine[] = [];

    for (const notice of notices) {
      const dueDate = String(notice.dueDate);

      // Apply date filter
      if (startDate && dueDate < startDate) continue;
      if (endDate && dueDate > endDate) continue;

      const amountDue = Number(notice.amountDue);
      const amountPaid = Number(notice.amountPaid);
      const fundName = notice.fund ? String(notice.fund.name) : "";

      // Charge line
      if (amountDue > 0) {
        lines.push({
          id: `${notice.id}-charge`,
          date: dueDate,
          type: "Levy",
          description: `Levy notice ${String(notice.noticeNumber)} — ${fundName}`,
          charge: amountDue,
          payment: 0,
          balance: 0,
        });
      }

      // Payment line (if any payment recorded)
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

      // Interest line (if any)
      const interest = Number(notice.interestCharged);
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

    // If no levy notices, fall back to levy items
    if (notices.length === 0 && levyItems.length > 0) {
      for (const item of levyItems) {
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

    // Sort by date
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
        title="Owner Statement"
        description={String(scheme.name)}
        backHref={`/accountant/schemes/${id}/finance/reports`}
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
        basePath={`/accountant/schemes/${id}/finance/reports/owner-statement`}
      />
    </div>
  );
}
