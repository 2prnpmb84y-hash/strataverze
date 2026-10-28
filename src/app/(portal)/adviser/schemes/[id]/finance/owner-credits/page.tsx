import { notFound } from "next/navigation";
import { schemeToday } from "@/lib/jurisdiction/scheme-time";
import { connection } from "next/server";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemeById } from "@/lib/queries/schemes";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";
import { packWordsFor } from "@/lib/jurisdiction/screen-words";
import { getOwnerCreditRefunds, getOwnerCredits } from "@/lib/finance/owner-credits";
import { getInvoiceControlView } from "@/lib/finance/control-view";
import { formatAud, toCents } from "@/lib/billing/money";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { ApprovalPanel } from "@/components/finance/approval-panel";
import {
  ApplyCreditNowButton,
  AutoApplyToggle,
  CancelRefundButton,
  RecordRefundPaidForm,
  RefundRequestForm,
} from "./credit-forms";

const STATUS_LABEL: Record<string, string> = {
  AWAITING_APPROVAL: "Awaiting approval",
  APPROVED: "Approved, ready to pay",
  PAID: "Paid",
  CANCELLED: "Cancelled",
};

/**
 * Owner credits: payments above what a notice owed, held for the lot in each
 * fund. Credit is applied to the next notice (automatically when the scheme
 * has that on) or refunded under the scheme's payment approval rules.
 */
export default async function OwnerCreditsPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const today = await schemeToday(id);
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const scheme = await getSchemeById(id);
  if (!scheme) notFound();
  const isAdviser = scheme.memberships.some((m) => m.profileId === profile.id && m.role === "ADVISER");
  if (!isAdviser) notFound();

  const [credits, refunds] = await Promise.all([getOwnerCredits(id), getOwnerCreditRefunds([id])]);
  const w = packWordsFor(rulesForState(scheme.state).rules);
  const lotNumber = (lotId: string) => String(scheme.lots?.find((l) => l.id === lotId)?.lotNumber ?? "?");
  const fundName = (fundId: string) => String(scheme.funds.find((f) => f.id === fundId)?.name ?? "Fund");
  const openRefunds = refunds.filter((r) => r.status === "AWAITING_APPROVAL" || r.status === "APPROVED");
  const views = new Map(
    await Promise.all(
      openRefunds.map(async (r) => [r.id, await getInvoiceControlView(id, { ownerCreditRefundId: r.id }, profile.id)] as const),
    ),
  );
  const total = credits.reduce((s, c) => s + c.balanceCents, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Owner Credits"
        description={`Payments above what a ${w.levy} notice owed are held as the owner's credit for that lot, in the same fund.`}
      />

      <Card>
        <div className="space-y-4">
          <AutoApplyToggle schemeId={id} enabled={scheme.autoApplyOwnerCredit !== false} levy={w.levy} />
          <ApplyCreditNowButton schemeId={id} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Credit balances" description={credits.length > 0 ? `Total held: ${formatAud(total)}` : undefined} />
        {credits.length === 0 ? (
          <p className="text-sm text-ink-muted">No lot has a credit.</p>
        ) : (
          <ul className="divide-y divide-line">
            {credits.map((c) => (
              <li key={`${c.lotId}:${c.fundId}`} className="space-y-2 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium text-ink">
                    Lot {c.lotNumber}, {c.fundName}
                  </span>
                  <span className="tabular-nums font-semibold">{formatAud(c.balanceCents)}</span>
                </div>
                {c.pendingRefundsCents > 0 && (
                  <p className="text-xs text-ink-muted">
                    {formatAud(c.pendingRefundsCents)} is set aside for a refund waiting to be paid. Available: {formatAud(c.availableCents)}.
                  </p>
                )}
                <RefundRequestForm schemeId={id} lotId={c.lotId} fundId={c.fundId} availableCents={c.availableCents} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Refunds"
          description="A refund is approved under the scheme's payment policy, by someone other than the person who prepared it, before it is paid."
        />
        {refunds.length === 0 ? (
          <p className="text-sm text-ink-muted">No refunds yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {refunds.map((r) => {
              const view = views.get(r.id) ?? null;
              return (
                <li key={r.id} className="space-y-3 py-4 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium text-ink">
                      Lot {lotNumber(r.lotId)}, {fundName(r.fundId)}: refund to {r.payeeName}
                    </span>
                    <span className="tabular-nums font-semibold">{formatAud(toCents(String(r.amount)))}</span>
                  </div>
                  <p className="text-ink-muted">
                    BSB {r.bsb}, account ending {String(r.accountNumber).slice(-4)}. Details confirmed by{" "}
                    {r.verificationMethod === "CALLBACK" ? "a call to the owner on a known number" : "a bank document from the owner"}.{" "}
                    <span className="font-medium text-ink">{STATUS_LABEL[r.status] ?? r.status}.</span>
                  </p>
                  {view && <ApprovalPanel view={view} status={r.status} />}
                  {r.status === "APPROVED" && <RecordRefundPaidForm schemeId={id} refundId={r.id} today={today} />}
                  {(r.status === "AWAITING_APPROVAL" || r.status === "APPROVED") && <CancelRefundButton schemeId={id} refundId={r.id} />}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
