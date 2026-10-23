import { connection } from "next/server";
import { notFound } from "next/navigation";
import { requirePageAccess } from "@/lib/auth/require-access";
import { getSchemeById } from "@/lib/queries/schemes";
import { getWorksInvoiceById } from "@/lib/queries/works";
import { getContractorBankDetails } from "@/lib/queries/contractor";
import { toCents } from "@/lib/billing/money";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { PaymentForm } from "./payment-form";

export default async function AuthorisePaymentPage({
  params,
}: {
  params: Promise<{ id: string; invoiceId: string }>;
}) {
  await connection();
  const { id, invoiceId } = await params;

  // Role check on this scheme (SEC-004 / H5): a page is a privileged read.
  const access = await requirePageAccess(id, "works.payments");
  if (!access) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const invoice = await getWorksInvoiceById(invoiceId);
  if (!invoice || invoice.schemeId !== id) notFound();

  // The most that can still be instructed: the approved (assessed) amount
  // less what is already instructed. The action enforces the same cap.
  const approvedCents = [invoice.assessedAmount, invoice.approvedAmount]
    .filter((v) => v != null)
    .map((v) => toCents(String(v)));
  const capCents = approvedCents.length ? Math.min(...approvedCents) : 0;
  const instructedCents = invoice.paymentInstructions
    .filter((pi) => pi.status !== "INVALIDATED")
    .reduce((sum, pi) => sum + toCents(String(pi.approvedAmount)), 0);
  const approvedAmount = (Math.max(0, capCents - instructedCents) / 100).toFixed(2);

  // Payment goes only to the contractor's current, verified bank details.
  const bankVersions = await getContractorBankDetails(invoice.contractorBusinessId);
  const current = bankVersions.find((v) => v.status !== "REJECTED") ?? null;
  const bank =
    current && current.status === "VERIFIED"
      ? {
          id: current.id,
          accountName: String(current.accountName),
          bsb: String(current.bsb),
          accountLast3: String(current.accountNumber).slice(-3),
        }
      : null;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Authorise Payment"
        description={`Authorise payment for ${invoice.invoiceNumber}`}
        backHref={`/adviser/schemes/${id}/works/invoices/${invoiceId}`}
        backLabel="Invoice"
      />

      <Card className="p-6">
        <PaymentForm
          schemeId={id}
          invoiceId={invoiceId}
          approvedAmount={approvedAmount}
          contractorName={String(invoice.contractorBusiness.companyName)}
          bank={bank}
        />
      </Card>
    </div>
  );
}
