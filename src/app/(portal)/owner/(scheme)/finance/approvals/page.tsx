import { connection } from "next/server";
import { schemeTimeZone } from "@/lib/jurisdiction/scheme-time";
import { db } from "@/prisma/db";
import { getSelectedOwnerScheme } from "@/lib/owner/selected-scheme";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getApprovalMembers, getBankDetailVersions, getPaymentSettings } from "@/lib/queries/payment-controls";
import { getInvoiceControlView } from "@/lib/finance/control-view";
import { getInvoicesAwaitingApproval, getWorksInvoicesAwaitingApproval } from "@/lib/finance/invoice-approval";
import { businessDaysBetween, canVerifyBankChange, eligibleApprovers } from "@/lib/finance/payment-controls";
import Link from "next/link";
import { and } from "@prisma/orm-postgres/orm-client";
import { signDownloads } from "@/lib/storage/server-storage";
import { schemeStoragePathProblem } from "@/lib/queries/document-url";
import { approveWorksInvoiceAction } from "@/lib/actions/works";
import { formatAud, toCents } from "@/lib/billing/money";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ApprovalPanel } from "@/components/finance/approval-panel";
import { ApproveButton } from "@/components/finance/approve-button";
import { TreasurerToggle } from "@/components/finance/treasurer-toggle";
import { VerifyBankChangeForm } from "@/app/(portal)/adviser/schemes/[id]/finance/suppliers/[supplierId]/bank-detail-controls";
import { ownerApproveSupplierInvoiceAction } from "./approve-actions";
import { getOwnerCreditRefunds } from "@/lib/finance/owner-credits";
import { approveOwnerCreditRefundAction } from "@/lib/actions/owner-credits";
import { PaymentPolicyForm } from "./policy-form";

const dollars = (cents: number) => (cents / 100).toFixed(2);

/**
 * Payment approvals for the treasurer, payment authorisers and the committee:
 * invoices waiting for approval, bank detail changes to verify, and (for the
 * committee) the treasurer flag and payment policy.
 */
export default async function OwnerApprovalsPage() {
  await connection();
  const profile = await getCurrentProfile();
  if (!profile) return null;
  // The selected scheme, verified: committee or payment authoriser of THIS scheme.
  const selected = await getSelectedOwnerScheme(["COMMITTEE", "PAYMENT_AUTHORISER"]);
  const schemeId = selected?.schemeId ?? null;
  const mine = selected?.memberships ?? [];
  const isCommittee = mine.some((m) => m.role === "COMMITTEE");
  const isAuthoriser = mine.some((m) => m.role === "PAYMENT_AUTHORISER");

  const header = (
    <PageHeader
      title="Payment Approvals"
      description="Invoices waiting for approval and bank detail changes to verify."
      backHref="/owner/finance"
      backLabel="Finance"
    />
  );
  if (!schemeId || (!isCommittee && !isAuthoriser)) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          title="Not available"
          description="Payment approvals are for the committee and payment authorisers of the selected scheme."
        />
      </div>
    );
  }

  const [settings, members, supplierInvoices, worksInvoices, suppliers, refunds, lots] = await Promise.all([
    getPaymentSettings(schemeId),
    getApprovalMembers(schemeId),
    getInvoicesAwaitingApproval([schemeId]),
    getWorksInvoicesAwaitingApproval([schemeId]),
    db.orm.public.Supplier.where((s) => s.schemeId.eq(schemeId)).limit(1000).all(),
    getOwnerCreditRefunds([schemeId], ["AWAITING_APPROVAL"]),
    db.orm.public.Lot.where((l) => l.schemeId.eq(schemeId)).limit(5000).all(),
  ]);
  const refundViews = await Promise.all(
    refunds.map(async (r) => ({ refund: r, view: await getInvoiceControlView(schemeId, { ownerCreditRefundId: r.id }, profile.id) })),
  );
  const eligible = eligibleApprovers(members, settings.policy);
  const supplierViews = await Promise.all(
    supplierInvoices.map(async (i) => ({ invoice: i, view: await getInvoiceControlView(schemeId, { supplierInvoiceId: i.id }, profile.id) })),
  );
  const worksViews = await Promise.all(
    worksInvoices.map(async (i) => ({ invoice: i, view: await getInvoiceControlView(schemeId, { worksInvoiceId: i.id }, profile.id) })),
  );
  const contractors = new Map(
    (
      await db.orm.public.ContractorBusiness.where((b) => b.id.in(worksInvoices.map((w) => w.contractorBusinessId))).limit(500).all()
    ).map((b) => [b.id, b.companyName]),
  );
  // Waiting for verification, or verified once but still in the cooling-off
  // period, when a second person must also verify before payment.
  const nowIso = new Date().toISOString();
  const tz = await schemeTimeZone(schemeId);
  const bankChanges = (
    await Promise.all(suppliers.map(async (s) => ({ supplier: s, latest: (await getBankDetailVersions(s.id))[0] ?? null })))
  ).filter(
    (x) =>
      x.latest &&
      (x.latest.status === "PENDING" ||
        (x.latest.status === "VERIFIED" && !x.latest.secondVerifiedById && businessDaysBetween(x.latest.changedAt, nowIso, tz) < settings.coolingOffDays)),
  );
  // Works invoices from marketplace contractors (stage 4): the contractor's
  // own tax invoice for every approver, and the job for the committee.
  const worksRows = await db.orm.public.WorksInvoice.where((w) => and(w.schemeId.eq(schemeId), w.id.in(supplierInvoices.map((i) => i.worksInvoiceId).filter((x): x is string => !!x)))).limit(500).all();
  const docRows = worksRows.filter((w) => w.documentPath && !schemeStoragePathProblem(schemeId, String(w.documentPath)));
  const docLinks = docRows.length ? await signDownloads(docRows.map((w) => String(w.documentPath)), 15 * 60) : [];
  const worksLinks = new Map(
    worksRows.map((w) => {
      const i = docRows.indexOf(w);
      return [w.id, { requestId: w.requestId, documentUrl: i >= 0 ? docLinks[i] ?? null : null }];
    }),
  );

  return (
    <div className="space-y-6">
      {header}

      {eligible.length === 0 && (
        <p className="rounded-[var(--radius-card)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Nobody can approve payments for this scheme yet. Flag the treasurer below.
        </p>
      )}

      <Card>
        <CardHeader title="Payments waiting for approval" />
        {supplierViews.length + worksViews.length + refundViews.length === 0 ? (
          <p className="text-sm text-ink-muted">Nothing is waiting for approval.</p>
        ) : (
          <ul className="divide-y divide-line">
            {supplierViews.map(({ invoice, view }) => {
              async function approve() {
                "use server";
                return ownerApproveSupplierInvoiceAction(schemeId!, invoice.id);
              }
              return (
                <li key={invoice.id} className="py-4 space-y-3">
                  <div className="flex flex-wrap justify-between gap-2 text-sm">
                    <span className="font-medium text-ink">
                      {invoice.supplier?.companyName ?? "Supplier"}, invoice {invoice.invoiceNumber}
                    </span>
                    <span className="tabular-nums font-semibold">{formatAud(toCents(String(invoice.totalAmount)))}</span>
                  </div>
                  <p className="text-sm text-ink-muted">{invoice.description}</p>
                  {invoice.worksInvoiceId && worksLinks.get(invoice.worksInvoiceId) && (
                    <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      {worksLinks.get(invoice.worksInvoiceId)!.documentUrl && (
                        <a href={worksLinks.get(invoice.worksInvoiceId)!.documentUrl!} target="_blank" rel="noopener noreferrer" className="text-turquoise underline">
                          Open the contractor&apos;s tax invoice
                        </a>
                      )}
                      {isCommittee && worksLinks.get(invoice.worksInvoiceId)!.requestId && (
                        <Link href={`/owner/works/${worksLinks.get(invoice.worksInvoiceId)!.requestId}`} className="text-turquoise underline">
                          See the work and the photos
                        </Link>
                      )}
                    </p>
                  )}
                  {view && <ApprovalPanel view={view} status={invoice.status} />}
                  {view && <ApproveButton action={approve} blockedReason={view.approve.result === "blocked" ? view.approve.reason : null} />}
                </li>
              );
            })}
            {worksViews.map(({ invoice, view }) => {
              async function approve() {
                "use server";
                return approveWorksInvoiceAction(schemeId!, invoice.id);
              }
              const amount = invoice.assessedAmount ?? invoice.claimedAmount;
              return (
                <li key={invoice.id} className="py-4 space-y-3">
                  <div className="flex flex-wrap justify-between gap-2 text-sm">
                    <span className="font-medium text-ink">
                      {contractors.get(invoice.contractorBusinessId) ?? "Contractor"}, works invoice {invoice.invoiceNumber}
                    </span>
                    <span className="tabular-nums font-semibold">{formatAud(toCents(String(amount)))}</span>
                  </div>
                  {view && <ApprovalPanel view={view} status={invoice.status} />}
                  {view && <ApproveButton action={approve} blockedReason={view.approve.result === "blocked" ? view.approve.reason : null} />}
                </li>
              );
            })}
            {refundViews.map(({ refund, view }) => {
              async function approve() {
                "use server";
                return approveOwnerCreditRefundAction(schemeId!, refund.id);
              }
              return (
                <li key={refund.id} className="py-4 space-y-3">
                  <div className="flex flex-wrap justify-between gap-2 text-sm">
                    <span className="font-medium text-ink">
                      Refund of owner credit, lot {String(lots.find((l) => l.id === refund.lotId)?.lotNumber ?? "?")}, to {refund.payeeName}
                    </span>
                    <span className="tabular-nums font-semibold">{formatAud(toCents(String(refund.amount)))}</span>
                  </div>
                  <p className="text-sm text-ink-muted">
                    BSB {refund.bsb}, account ending {String(refund.accountNumber).slice(-4)}.{" "}
                    {refund.verificationMethod === "CALLBACK"
                      ? "Confirmed by a call to the owner on a known number."
                      : "Confirmed by a bank document from the owner."}
                    {refund.reason ? ` Reason: ${refund.reason}` : ""}
                  </p>
                  {view && <ApprovalPanel view={view} status={refund.status} />}
                  {view && (
                    <ApproveButton
                      action={approve}
                      label="Approve refund"
                      blockedReason={view.approve.result === "blocked" ? view.approve.reason : null}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Bank detail changes to verify" description="Payments to these suppliers are blocked until someone other than the person who made the change verifies it." />
        {bankChanges.length === 0 ? (
          <p className="text-sm text-ink-muted">No changes are waiting.</p>
        ) : (
          <ul className="divide-y divide-line">
            {bankChanges.map(({ supplier, latest }) => {
              const check = canVerifyBankChange(latest!, profile.id);
              return (
                <li key={supplier.id} className="py-4 space-y-2 text-sm">
                  <p className="font-medium text-ink">{supplier.companyName}</p>
                  <p className="text-ink-muted">
                    New details: BSB {latest!.newBsb ?? "?"}, account ending {String(latest!.newAccountNumber ?? "").slice(-4)},{" "}
                    {latest!.newAccountName}. Changed by{" "}
                    {members.find((m) => m.profileId === latest!.changedById)?.name ?? (supplier.contractorBusinessId ? "the contractor, in StrataVerze" : "a former member")}.
                    {latest!.status === "VERIFIED" ? " Verified once. Changed recently, so a second person must also verify it before payment." : ""}
                  </p>
                  {check.ok ? (
                    <VerifyBankChangeForm schemeId={schemeId} versionId={latest!.id} slot={check.slot} />
                  ) : (
                    <p className="text-ink-muted">{check.reason}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {isCommittee && (
        <>
          <Card>
            <CardHeader title="Treasurer" description="The treasurer can approve payments. Another committee member appoints the treasurer. Nobody can appoint themselves." />
            <ul className="divide-y divide-line">
              {members
                .filter((m) => m.role === "COMMITTEE")
                .map((m) => (
                  <li key={m.membershipId} className="py-3 flex items-center justify-between text-sm">
                    <span>{m.name}</span>
                    {m.profileId !== profile.id || m.isTreasurer ? (
                      <TreasurerToggle schemeId={schemeId} membershipId={m.membershipId} isTreasurer={m.isTreasurer} />
                    ) : (
                      <span className="text-xs text-ink-muted">Another committee member can appoint you</span>
                    )}
                  </li>
                ))}
            </ul>
          </Card>
          <Card>
            <CardHeader
              title="Payment policy"
              description={settings.isDefault ? "This scheme uses the default policy: two approvers for every invoice." : undefined}
            />
            <PaymentPolicyForm
              schemeId={schemeId}
              values={{
                singleApproverLimit: dollars(settings.policy.singleApproverLimitCents),
                requireSecondApproverAbove:
                  settings.policy.requireSecondApproverAboveCents == null ? "" : dollars(settings.policy.requireSecondApproverAboveCents),
                allowSelfApproval: settings.policy.allowSelfApproval,
                allowAdviserApproval: settings.policy.allowAdviserApproval,
                coolingOffDays: settings.coolingOffDays,
              }}
            />
          </Card>
        </>
      )}
    </div>
  );
}
