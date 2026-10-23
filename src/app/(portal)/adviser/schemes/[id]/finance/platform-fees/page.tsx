import { connection } from "next/server";
import { getLotsForScheme } from "@/lib/queries/lots";
import { getPlatformFeesData } from "@/lib/queries/platform-billing";
import { PlatformFeesView } from "@/components/billing/platform-fees-view";
import { requirePageAccess } from "@/lib/auth/require-access";

/**
 * StrataVerze fees for the scheme. Adviser access is checked by the finance
 * layout. This page is the "fee schedule" link in every fee disclosure.
 */
export default async function PlatformFeesPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  // Adviser finance: checked here as well as in the layout.
  if (!(await requirePageAccess(id, "finance.write"))) return null;
  const lots = await getLotsForScheme(id);
  const data = await getPlatformFeesData(id, lots.length);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-ink">StrataVerze Fees</h2>
        <p className="text-sm text-ink-muted">What StrataVerze charges this scheme, and why.</p>
      </div>
      <PlatformFeesView data={data} />
    </div>
  );
}
