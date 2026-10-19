import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemeById } from "@/lib/queries/schemes";
import {
  getWorksInvoiceById,
  getWorksContractsForScheme,
  getContractorBusinesses,
} from "@/lib/queries/works";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { InvoiceForm } from "../../new/invoice-form";

export default async function EditInvoicePage({
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

  const [contracts, contractors] = await Promise.all([
    getWorksContractsForScheme(id, { status: "ACTIVE" }),
    getContractorBusinesses({ status: "APPROVED" }),
  ]);

  const contractOptions = contracts.map((c) => ({
    id: String(c.id),
    contractNumber: String(c.contractNumber),
    title: String(c.title),
    contractorBusinessId: String(c.contractorBusinessId),
    contractorName: String(c.contractorBusiness?.companyName ?? ""),
  }));

  const contractorOptions = contractors.map((c) => ({
    id: String(c.id),
    companyName: String(c.companyName),
  }));

  const invoiceData = {
    id: String(invoice.id),
    invoiceNumber: String(invoice.invoiceNumber),
    invoiceDate: new Date(String(invoice.invoiceDate))
      .toISOString()
      .split("T")[0],
    dueDate: new Date(String(invoice.dueDate)).toISOString().split("T")[0],
    claimedAmount: String(invoice.claimedAmount),
    gstAmount: String(invoice.gstAmount),
    contractId: invoice.contractId ? String(invoice.contractId) : null,
    contractorBusinessId: String(invoice.contractorBusinessId),
  };

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Edit Invoice"
        description={`Edit ${invoice.invoiceNumber} from ${invoice.contractorBusiness.companyName}`}
        backHref={`/adviser/schemes/${id}/works/invoices/${invoiceId}`}
        backLabel="Invoice"
      />

      <Card className="p-6">
        <InvoiceForm
          schemeId={id}
          contracts={contractOptions}
          contractors={contractorOptions}
          invoice={invoiceData}
        />
      </Card>
    </div>
  );
}
