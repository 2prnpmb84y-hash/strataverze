import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import type { getLotsForScheme } from "@/lib/queries/lots";

/** Moved unchanged from the scheme main page so it can also back its section page. */
export function LotsCard({
  id, lots, totalLots,
}: {
  id: string;
  lots: Awaited<ReturnType<typeof getLotsForScheme>>;
  totalLots: number;
}) {
  return (
    <Card className="mb-6">
      <CardHeader
        title="Lots"
        description={`${lots.length} of ${totalLots} lots registered.`}
      />
      {lots.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th scope="col" className="pb-2 font-medium text-ink-muted">Lot</th>
                <th scope="col" className="pb-2 font-medium text-ink-muted">Unit No.</th>
                <th scope="col" className="pb-2 font-medium text-ink-muted">Type</th>
                <th scope="col" className="pb-2 font-medium text-ink-muted text-right">Unit Entitlement</th>
                <th scope="col" className="pb-2 font-medium text-ink-muted">Owner</th>
              </tr>
            </thead>
            <tbody>
              {lots.map((lot) => {
                const owner = lot.memberships.find(
                  (m) => m.role === "OWNER",
                );
                return (
                  <tr key={lot.id} className="border-b border-line last:border-0">
                    <td className="py-3">
                      <Link
                        href={`/adviser/schemes/${id}/lots/${lot.id}`}
                        className="font-medium text-ink hover:text-turquoise transition-colors"
                      >
                        {lot.lotNumber}
                      </Link>
                    </td>
                    <td className="py-3 text-ink-muted">
                      {lot.unitNumber ?? "—"}
                    </td>
                    <td className="py-3 text-ink-muted">
                      {lot.lotType.charAt(0) + lot.lotType.slice(1).toLowerCase()}
                    </td>
                    <td className="py-3 text-right font-variant-numeric tabular-nums">
                      {lot.entitlement}
                    </td>
                    <td className="py-3 text-ink-muted">
                      {owner
                        ? `${owner.profile.firstName} ${owner.profile.lastName}`.trim() || owner.profile.email
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-ink-muted">
          No lots registered yet. Lots are created when the building is onboarded.
        </p>
      )}
    </Card>
  );
}
