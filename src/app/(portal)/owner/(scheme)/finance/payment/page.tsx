import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForOwner } from "@/lib/queries/schemes";
import { getLevyNoticesForLots } from "@/lib/queries/levies";
import { getVerifiedSelectedSchemeId } from "@/lib/owner/selected-scheme";
import { scopeToSelectedScheme } from "@/lib/owner/scheme-scope";
import { noticeLabel } from "@/lib/levies/levy-ledger";
import { PageHeader } from "@/components/ui/page-header";
import { PaymentUploadForm } from "./payment-upload-form";
import { paymentFormWords } from "./payment-words";
import { connection } from "next/server";
import { rulesForListedStates, rulesForState, rulesForWords } from "@/lib/jurisdiction/scheme-rules";
import { sharedPackWords } from "@/lib/jurisdiction/screen-words";
import { DEFAULT_SCHEME_STATE } from "@/config/jurisdictions";

/** "levy contributions" from "Levy contributions". */
const lowerFirst = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);

export default async function PaymentUploadPage() {
  await connection();
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const schemes = scopeToSelectedScheme(
    await getSchemesForOwner(profile.id),
    await getVerifiedSelectedSchemeId(),
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
  // Each building's words, from its rule pack, and the words the page uses for them all.
  // A building with no live pack is shown in the default state's words and never fails the page.
  const rulesBy = new Map(schemes.map((s) => [s.id, rulesForWords(s.state)]));
  const listed = rulesForListedStates(schemes.map((s) => s.state));
  const w = sharedPackWords(listed, rulesForState(DEFAULT_SCHEME_STATE).rules);

  const outstandingNotices = notices
    .filter(
      (n) => String(n.status) !== "DRAFT" && Number(n.balanceOutstanding ?? 0) > 0,
    )
    .map((n) => {
      const entry = lotEntries.find((e) => e.lotId === n.lotId);
      const terms = rulesBy.get(entry?.schemeId ?? n.schemeId)?.TERMINOLOGY ?? w;
      return {
        id: n.id,
        label: `${String(n.noticeNumber)} · ${noticeLabel(n, terms)} · $${Number(n.balanceOutstanding ?? 0).toFixed(2)} outstanding`,
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
        description={`Upload proof of payment for your ${lowerFirst(w.OwnerContributions)}. Your strata manager will review and confirm the payment.`}
        backHref="/owner/finance"
        backLabel="Finance"
      />
      <PaymentUploadForm
        defaultSchemeId={defaultSchemeId}
        outstandingNotices={outstandingNotices}
        words={paymentFormWords(w, listed.map((r) => r.TERMINOLOGY.levy))}
      />
    </div>
  );
}
