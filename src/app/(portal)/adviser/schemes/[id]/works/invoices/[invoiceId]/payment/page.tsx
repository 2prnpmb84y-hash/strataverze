import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemeById } from "@/lib/queries/schemes";
import { getWorksInvoiceById } from "@/lib/queries/works";
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

  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const invoice = await getWorksInvoiceById(invoiceId);
  if (!invoice) notFound();

  const approvedAmount = String(
    invoice.assessedAmount ?? invoice.claimedAmount,
  );

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
        />
      </Card>
    </div>
  );
}
