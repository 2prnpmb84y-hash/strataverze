import { getOwnerCredits } from "@/lib/finance/owner-credits";
import { formatAud } from "@/lib/billing/money";
import { Card, CardHeader } from "@/components/ui/card";

/** Owner credits held for the scheme's lots, for the levy register. Renders nothing when no lot has credit. */
export async function OwnerCreditsCard({ schemeId }: { schemeId: string }) {
  const credits = await getOwnerCredits(schemeId);
  if (credits.length === 0) return null;
  const total = credits.reduce((s, c) => s + c.balanceCents, 0);
  return (
    <Card>
      <CardHeader
        title="Owner credits"
        description="Payments above what a notice owed, held for the lot. They reduce what the lot owes on its next notice or are refunded."
      />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-ink-muted">
              <th scope="col" className="py-2 pr-4 font-medium">Lot</th>
              <th scope="col" className="py-2 pr-4 font-medium">Fund</th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">Credit</th>
              <th scope="col" className="py-2 text-right font-medium">Set aside for refund</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {credits.map((c) => (
              <tr key={`${c.lotId}:${c.fundId}`}>
                <td className="py-2 pr-4 text-ink">Lot {c.lotNumber}</td>
                <td className="py-2 pr-4 text-ink-muted">{c.fundName}</td>
                <td className="py-2 pr-4 text-right tabular-nums text-ink">{formatAud(c.balanceCents)}</td>
                <td className="py-2 text-right tabular-nums text-ink-muted">{c.pendingRefundsCents > 0 ? formatAud(c.pendingRefundsCents) : "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-line font-semibold">
              <td className="py-2 pr-4" colSpan={2}>Total</td>
              <td className="py-2 pr-4 text-right tabular-nums">{formatAud(total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}
