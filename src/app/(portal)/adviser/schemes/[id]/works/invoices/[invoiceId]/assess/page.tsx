import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemeById } from "@/lib/queries/schemes";
import { getWorksInvoiceById } from "@/lib/queries/works";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { AssessForm } from "./assess-form";

export default async function AssessInvoicePage({
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

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Assess Invoice"
        description={`Assess ${invoice.invoiceNumber} from ${invoice.contractorBusiness.companyName}`}
        backHref={`/adviser/schemes/${id}/works/invoices/${invoiceId}`}
        backLabel="Invoice"
      />

      <Card className="p-6">
        <AssessForm
          schemeId={id}
          invoiceId={invoiceId}
          claimedAmount={String(invoice.claimedAmount)}
        />
      </Card>
    </div>
  );
}
