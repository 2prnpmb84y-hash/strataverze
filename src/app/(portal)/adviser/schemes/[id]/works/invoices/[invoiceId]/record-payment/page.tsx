import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
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

  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const invoice = await getWorksInvoiceById(invoiceId);
  if (!invoice) notFound();

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
        />
      </Card>
    </div>
  );
}
