import { connection } from "next/server";
import { schemeToday } from "@/lib/jurisdiction/scheme-time";
import { notFound } from "next/navigation";
import { requirePageAccess } from "@/lib/auth/require-access";
import { getSchemeById } from "@/lib/queries/schemes";
import { getWorksInvoiceById } from "@/lib/queries/works";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { RecordPaymentForm } from "./record-payment-form";

export default async function RecordPaymentPage({
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

  const instructionOptions = invoice.paymentInstructions.map((pi) => ({
    id: String(pi.id),
    beneficiary: String(pi.beneficiary),
    approvedAmount: String(pi.approvedAmount),
    status: String(pi.status),
  }));

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Record Payment"
        description={`Record payment for ${invoice.invoiceNumber}`}
        backHref={`/adviser/schemes/${id}/works/invoices/${invoiceId}`}
        backLabel="Invoice"
      />

      <Card className="p-6">
        <RecordPaymentForm
          schemeId={id}
          invoiceId={invoiceId}
          instructions={instructionOptions}
          today={await schemeToday(id)}
        />
      </Card>
    </div>
  );
}
