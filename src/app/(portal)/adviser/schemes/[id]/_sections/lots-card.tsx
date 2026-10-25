import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FinancialStatusChip } from "@/components/lots/financial-status";
import type { getStrataRollData } from "@/lib/queries/lots";

const SHOWN = 30;

/**
 * The lots on the scheme's main page: the strata roll's lot, unit,
 * entitlement and owner, and whether each lot is financial (25 Oct 2026).
 */
export function LotsCard({
  id,
  rows,
  totalLots,
}: {
  id: string;
  rows: Awaited<ReturnType<typeof getStrataRollData>>;
  totalLots: number;
}) {
  const sorted = [...rows].sort((a, b) => a.lotNumber.localeCompare(b.lotNumber, "en-AU", { numeric: true }));
  const unfinancial = sorted.filter((r) => !r.financial).length;
  return (
    <Card className="mb-6">
      <CardHeader
        title="Lots"
        description={`${rows.length} of ${totalLots} lots registered. ${unfinancial === 0 ? "All financial." : `${unfinancial} unfinancial (overdue and unpaid).`}`}
        action={<Button variant="secondary" href={`/adviser/schemes/${id}/lots`}>Strata roll</Button>}
      />
      {sorted.length > 0 ? (
        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-left">
                <th scope="col" className="px-3 py-2.5 font-medium text-ink-muted whitespace-nowrap">Lot</th>
                <th scope="col" className="px-3 py-2.5 font-medium text-ink-muted whitespace-nowrap">Unit No.</th>
                <th scope="col" className="px-3 py-2.5 font-medium text-ink-muted whitespace-nowrap text-right">Unit Entitlement</th>
                <th scope="col" className="px-3 py-2.5 font-medium text-ink-muted whitespace-nowrap">Owner</th>
                <th scope="col" className="px-3 py-2.5 font-medium text-ink-muted whitespace-nowrap">Status</th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, SHOWN).map((row) => (
                <tr key={row.id} className="border-t border-line">
                  <td className="px-3 py-2.5">
                    <Link href={`/adviser/schemes/${id}/lots/${row.id}`} className="font-medium text-turquoise underline-offset-2 hover:underline">
                      {row.lotNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-ink-muted">{row.unitNumber ?? "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{row.entitlement}</td>
                  <td className="px-3 py-2.5 text-ink-muted max-w-[220px] truncate" title={row.ownerNames || undefined}>{row.ownerNames || "—"}</td>
                  <td className="px-3 py-2.5">
                    <FinancialStatusChip financial={row.financial} overdueCents={row.overdueCents} oldestOverdue={row.oldestOverdue} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-ink-muted">No lots registered yet.</p>
      )}
      {sorted.length > SHOWN && (
        <p className="mt-3 text-sm text-ink-muted">
          Showing {SHOWN} of {sorted.length}. <Link href={`/adviser/schemes/${id}/lots`} className="text-turquoise">Open the strata roll</Link> for the rest.
        </p>
      )}
    </Card>
  );
}
