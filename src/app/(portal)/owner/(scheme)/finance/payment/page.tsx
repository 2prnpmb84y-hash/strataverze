import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForOwner } from "@/lib/queries/schemes";
import { getLevyNoticesForLots } from "@/lib/queries/levies";
import { getSelectedSchemeId } from "@/lib/actions/scheme-selection";
import { scopeToSelectedScheme } from "@/lib/owner/scheme-scope";
import { noticeLabel } from "@/lib/levies/levy-ledger";
import { PageHeader } from "@/components/ui/page-header";
import { PaymentUploadForm } from "./payment-upload-form";
import { connection } from "next/server";

export default async function PaymentUploadPage() {
  await connection();
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const schemes = scopeToSelectedScheme(
    await getSchemesForOwner(profile.id),
    await getSelectedSchemeId(),
  );
  if (schemes.length === 0) notFound();

  // Collect outstanding levy notices for the owner
  const lotEntries = schemes.flatMap((s) =>
    s.memberships
      .filter((m) => m.lotId)
      .map((m) => ({
        lotId: m.lotId!,
        schemeId: s.id,
        schemeName: String(s.name),
      })),
  );
  const lotIds = lotEntries.map((e) => e.lotId);
  const notices = await getLevyNoticesForLots(lotIds);

  const outstandingNotices = notices
    .filter(
      (n) => String(n.status) !== "DRAFT" && Number(n.balanceOutstanding ?? 0) > 0,
    )
    .map((n) => {
      const entry = lotEntries.find((e) => e.lotId === n.lotId);
      return {
        id: n.id,
        label: `${String(n.noticeNumber)} · ${noticeLabel(n)} · $${Number(n.balanceOutstanding ?? 0).toFixed(2)} outstanding`,
        schemeId: entry?.schemeId ?? n.schemeId,
        schemeName: entry?.schemeName ?? "",
      };
    });

  // Default to the first scheme
  const defaultSchemeId = schemes[0].id;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Upload Payment Confirmation"
        description="Upload proof of payment for your levy contributions. Your strata manager will review and confirm the payment."
        backHref="/owner/finance"
        backLabel="Finance"
      />
      <PaymentUploadForm
        defaultSchemeId={defaultSchemeId}
        outstandingNotices={outstandingNotices}
      />
    </div>
  );
}
