"use client";

import { useRouter } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import { SelectField, FormField } from "@/components/ui/form-field";
import { EmptyState } from "@/components/ui/empty-state";
import { StatementView } from "@/components/levies/statement-view";

interface StatementLine {
  id: string;
  date: string;
  kind: string;
  type: string;
  description: string;
  charge: number;
  payment: number;
  balance: number;
}

export function OwnerStatementTable({
  lotOptions,
  selectedSchemeId,
  selectedLotId,
  selectedLotLabel,
  startDate,
  endDate,
  openingBalance,
  totalCharges,
  totalPayments,
  closingBalance,
  statementLines,
}: {
  lotOptions: { id: string; label: string }[];
  /** The scheme of the selected lot, for the PDF link. */
  selectedSchemeId: string;
  selectedLotId: string;
  selectedLotLabel: string;
  startDate: string;
  endDate: string;
  openingBalance: number;
  totalCharges: number;
  totalPayments: number;
  closingBalance: number;
  statementLines: StatementLine[];
}) {
  const router = useRouter();

  function applyFilters(updates: Record<string, string>) {
    const params = new URLSearchParams();
    const current = { lot: selectedLotId, startDate, endDate, ...updates };
    if (current.lot) params.set("lot", current.lot);
    if (current.startDate) params.set("startDate", current.startDate);
    if (current.endDate) params.set("endDate", current.endDate);
    const qs = params.toString();
    router.push(`/owner/levies/statement${qs ? `?${qs}` : ""}`);
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      {lotOptions.length > 1 && (
        <Card>
          <CardHeader title="Select Lot" />
          <div className="px-6 pb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SelectField
              label="Lot"
              name="lot"
              required
              value={selectedLotId}
              onChange={(e) => applyFilters({ lot: e.target.value })}
              options={[
                { value: "", label: "Select a lot..." },
                ...lotOptions.map((l) => ({ value: l.id, label: l.label })),
              ]}
            />
            <FormField
              label="Start Date"
              name="startDate"
              type="date"
              value={startDate}
              onChange={(e) => applyFilters({ startDate: e.target.value })}
            />
            <FormField
              label="End Date"
              name="endDate"
              type="date"
              value={endDate}
              onChange={(e) => applyFilters({ endDate: e.target.value })}
            />
          </div>
        </Card>
      )}

      {/* Date filters for single lot */}
      {lotOptions.length === 1 && (
        <Card>
          <CardHeader title="Filter by Date" />
          <div className="px-6 pb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              label="Start Date"
              name="startDate"
              type="date"
              value={startDate}
              onChange={(e) => applyFilters({ startDate: e.target.value })}
            />
            <FormField
              label="End Date"
              name="endDate"
              type="date"
              value={endDate}
              onChange={(e) => applyFilters({ endDate: e.target.value })}
            />
          </div>
        </Card>
      )}

      {selectedLotId && (
        <StatementView
          lotLabel={selectedLotLabel}
          pdfHref={`/api/finance/pdf/owner-statement?schemeId=${selectedSchemeId}&lotId=${selectedLotId}${startDate ? `&startDate=${startDate}` : ""}${endDate ? `&endDate=${endDate}` : ""}`}
          periodLabel={startDate || endDate ? `Period: ${startDate || "Start"} to ${endDate || "Present"}` : "All periods"}
          openingBalance={openingBalance}
          totalCharges={totalCharges}
          totalPayments={totalPayments}
          closingBalance={closingBalance}
          lines={statementLines}
        />
      )}

      {!selectedLotId && lotOptions.length > 1 && (
        <EmptyState
          title="Select a lot"
          description="Choose a lot above to view your levy statement."
        />
      )}
    </div>
  );
}
