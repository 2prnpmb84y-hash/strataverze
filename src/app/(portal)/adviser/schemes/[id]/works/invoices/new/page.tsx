import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemeById } from "@/lib/queries/schemes";
import {
  getWorksContractsForScheme,
  getContractorBusinesses,
} from "@/lib/queries/works";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { InvoiceForm } from "./invoice-form";

export default async function NewInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;

  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

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

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Submit Invoice"
        description="Record a new contractor invoice"
        backHref={`/adviser/schemes/${id}/works/invoices`}
        backLabel="Invoices"
      />

      <Card className="p-6">
        <InvoiceForm
          schemeId={id}
          contracts={contractOptions}
          contractors={contractorOptions}
        />
      </Card>
    </div>
  );
}
