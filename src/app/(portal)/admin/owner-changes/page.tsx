import { connection } from "next/server";
import { requirePlatformAdminPage } from "@/lib/auth/require-access";
import { listPendingOwnerChanges } from "@/lib/owner/owner-change-requests";
import { formatLotLabel } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { PendingOwnerChange } from "@/components/lots/pending-owner-change";

/**
 * Changes of owner recorded by a committee member and waiting for review
 * (H-1, 31 Oct 2026), across every building. The building's Adviser reviews
 * them on the lot page; StrataVerze reviews them here, and is the only
 * reviewer for a building with no Adviser. StrataVerze staff only.
 */
export default async function AdminOwnerChangesPage() {
  await connection();
  // Checked on every admin page, not only in the layout (finding F5).
  await requirePlatformAdminPage();
  const pending = await listPendingOwnerChanges();

  return (
    <>
      <PageHeader title="Changes of owner" description="Changes of owner recorded by a committee member, waiting to be confirmed or rejected." />
      <div className="max-w-3xl space-y-2">
        {pending.length === 0 ? (
          <Card>
            <p className="text-sm text-ink-muted">No changes of owner are waiting for review.</p>
          </Card>
        ) : (
          pending.map((p) => (
            <div key={p.view.id}>
              <p className="mb-1 text-xs font-medium text-ink-muted">
                {p.schemeName}
                {p.view.reviewer === "StrataVerze" ? " · no Adviser: StrataVerze reviews" : " · the Adviser can also review it"}
              </p>
              <PendingOwnerChange schemeId={p.schemeId} lotLabel={formatLotLabel(p.lotNumber)} change={p.view} canDecide />
            </div>
          ))
        )}
      </div>
    </>
  );
}
