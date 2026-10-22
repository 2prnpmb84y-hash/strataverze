import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getFinancialSupplierById } from "@/lib/queries/supplier-invoices";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { connection } from "next/server";
import { getApprovalMembers, getBankDetailVersions, getPaymentSettings } from "@/lib/queries/payment-controls";
import { canVerifyBankChange, checkBankDetailsForPayment } from "@/lib/finance/payment-controls";
import { BankChangeForm, VerifyBankChangeForm } from "./bank-detail-controls";

function formatCurrency(value: number | string | null): string {
  const num = Number(value ?? 0);
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(num);
}

function formatDate(date: string | Date | null): string {
  if (!date) return "—";
  return new Date(String(date)).toLocaleDateString("en-AU");
}

function maskBsb(bsb: string | null): string {
  if (!bsb) return "—";
  const raw = String(bsb).replace(/\D/g, "");
  if (raw.length < 3) return "—";
  return `•••-${raw.slice(-3)}`;
}

function maskAccountNumber(accNum: string | null): string {
  if (!accNum) return "—";
  const raw = String(accNum).replace(/\D/g, "");
  if (raw.length < 4) return "—";
  return `••••${raw.slice(-4)}`;
}

const statusStyles: Record<string, string> = {
  DRAFT: "bg-zinc-100 text-zinc-600",
  AWAITING_APPROVAL: "bg-amber-100 text-amber-700",
  APPROVED: "bg-blue-100 text-blue-700",
  PARTIALLY_PAID: "bg-purple-100 text-purple-700",
  PAID: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-700",
};

const statusLabels: Record<string, string> = {
  DRAFT: "Draft",
  AWAITING_APPROVAL: "Awaiting Approval",
  APPROVED: "Approved",
  PARTIALLY_PAID: "Partially Paid",
  PAID: "Paid",
  CANCELLED: "Cancelled",
};

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-ink">
        {value ? String(value) : "—"}
      </dd>
    </div>
  );
}

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string; supplierId: string }>;
}) {
  await connection();
  const { id, supplierId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  const supplier = await getFinancialSupplierById(supplierId);
  if (!supplier || supplier.schemeId !== id) notFound();

  // Bank detail change control.
  const [versions, settings, members] = await Promise.all([
    getBankDetailVersions(supplierId),
    getPaymentSettings(id),
    getApprovalMembers(id),
  ]);
  const latestVersion = versions[0] ?? null;
  const bankDecision = checkBankDetailsForPayment(latestVersion, new Date().toISOString(), settings.coolingOffDays);
  const verifyCheck = latestVersion ? canVerifyBankChange(latestVersion, profile.id) : null;
  const needsVerification = latestVersion && (latestVersion.status === "PENDING" || bankDecision.result === "blocked");
  const verifySlot = needsVerification && verifyCheck?.ok ? verifyCheck.slot : null;
  const memberName = (pid: string) => members.find((m) => m.profileId === pid)?.name ?? "a former member";
  const when = (iso: string) =>
    new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Sydney" });

  const invoices = supplier.supplierInvoices ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={String(supplier.companyName)}
        backHref={`/adviser/schemes/${id}/finance/suppliers`}
        backLabel="Suppliers"
      />

      {/* Company Details */}
      <Card>
        <CardHeader title="Company Details" />
        <dl className="grid grid-cols-1 gap-4 px-6 pb-6 sm:grid-cols-2">
          <DetailItem label="Company Name" value={String(supplier.companyName)} />
          <DetailItem label="Trading Name" value={supplier.tradingName ? String(supplier.tradingName) : null} />
          <DetailItem label="ABN" value={supplier.abn ? String(supplier.abn) : null} />
          <DetailItem label="Contact Name" value={supplier.contactName ? String(supplier.contactName) : null} />
          <DetailItem label="Email" value={supplier.email ? String(supplier.email) : null} />
          <DetailItem label="Phone" value={supplier.phone ? String(supplier.phone) : null} />
        </dl>
      </Card>

      {/* Bank Details */}
      <Card>
        <CardHeader title="Bank Details" />
        <dl className="grid grid-cols-1 gap-4 px-6 pb-6 sm:grid-cols-2">
          <DetailItem label="BSB" value={maskBsb(supplier.bankBsb)} />
          <DetailItem label="Account Number" value={maskAccountNumber(supplier.bankAccountNumber)} />
          <DetailItem label="Account Name" value={supplier.bankAccountName ? String(supplier.bankAccountName) : null} />
          <DetailItem
            label="Payment Terms"
            value={`${String(supplier.paymentTerms ?? 30)} days`}
          />
        </dl>
        <div className="px-6 pb-6 space-y-4">
          {bankDecision.result === "blocked" && (
            <p className="rounded-[var(--radius-card)] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Payments blocked. {bankDecision.reason}
            </p>
          )}
          {latestVersion && verifySlot && (
            <div className="rounded-[var(--radius-card)] border border-line p-4 space-y-2">
              <p className="text-sm text-ink">
                Changed by {memberName(latestVersion.changedById)} on {when(latestVersion.changedAt)}
                {latestVersion.previousAccountNumber
                  ? ` (was BSB ${maskBsb(latestVersion.previousBsb)}, account ${maskAccountNumber(latestVersion.previousAccountNumber)})`
                  : ""}
                .
              </p>
              <VerifyBankChangeForm schemeId={id} versionId={latestVersion.id} slot={verifySlot} />
            </div>
          )}
          <BankChangeForm schemeId={id} supplierId={supplierId} />
          {versions.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-2">Bank detail history</h3>
              <ul className="space-y-1 text-sm text-ink-muted">
                {versions.map((v) => (
                  <li key={v.id}>
                    {when(v.changedAt)}: changed by {memberName(v.changedById)} to account {maskAccountNumber(v.newAccountNumber)}.{" "}
                    {v.status === "PENDING" && "Not yet verified."}
                    {v.status === "REJECTED" && `Rejected: ${v.rejectionReason ?? ""}`}
                    {v.status === "VERIFIED" &&
                      `Verified by ${memberName(v.verifiedById ?? "")}${v.secondVerifiedById ? ` and ${memberName(v.secondVerifiedById)}` : ""}.`}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Card>

      {/* Status */}
      <Card>
        <div className="flex items-center gap-4 px-6 py-4">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                supplier.isActive !== false ? "bg-green-500" : "bg-zinc-400"
              }`}
            />
            <span className="text-sm text-ink">
              {supplier.isActive !== false ? "Active" : "Inactive"}
            </span>
          </div>
          {supplier.createdAt && (
            <span className="text-xs text-ink-muted">
              Added {formatDate(supplier.createdAt)}
            </span>
          )}
        </div>
      </Card>

      {/* Invoices */}
      <Card>
        <CardHeader
          title="Invoices"
          description={`${invoices.length} invoice${invoices.length !== 1 ? "s" : ""}`}
        />

        {invoices.length === 0 ? (
          <div className="px-6 pb-6">
            <EmptyState
              title="No invoices"
              description="No invoices have been recorded for this supplier yet."
            />
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="hidden sm:grid sm:grid-cols-[1fr_100px_120px_120px] gap-4 px-6 pb-2 text-xs font-medium text-ink-muted uppercase tracking-wide border-b border-line">
              <div>Invoice #</div>
              <div>Date</div>
              <div className="text-right">Amount</div>
              <div className="text-right">Status</div>
            </div>

            <div className="divide-y divide-line">
              {invoices.map((invoice) => (
                <div
                  key={String(invoice.id)}
                  className="grid grid-cols-1 sm:grid-cols-[1fr_100px_120px_120px] gap-2 sm:gap-4 px-6 py-3 items-center"
                >
                  <div className="font-medium text-sm text-ink">
                    {String(invoice.invoiceNumber ?? "—")}
                  </div>
                  <div className="text-sm text-ink-muted">
                    {formatDate(invoice.invoiceDate)}
                  </div>
                  <div className="text-sm text-ink text-right font-medium">
                    {formatCurrency(invoice.totalAmount)}
                  </div>
                  <div className="text-right">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        statusStyles[String(invoice.status)] ?? "bg-zinc-100 text-zinc-600"
                      }`}
                    >
                      {statusLabels[String(invoice.status)] ?? String(invoice.status)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
