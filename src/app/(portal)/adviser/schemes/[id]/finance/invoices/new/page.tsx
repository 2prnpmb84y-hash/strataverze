import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { PageHeader } from "@/components/ui/page-header";
import { getFundsForScheme } from "@/lib/queries/funds";
import { getAccountCodesForScheme } from "@/lib/queries/account-codes";
import { getFinancialSuppliersForScheme } from "@/lib/queries/supplier-invoices";
import { InvoiceForm } from "../invoice-form";
import { connection } from "next/server";

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

  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  const [funds, accountCodes, suppliers] = await Promise.all([
    getFundsForScheme(id),
    getAccountCodesForScheme(id),
    getFinancialSuppliersForScheme(id),
  ]);

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="New Supplier Invoice"
        description="Create a new supplier invoice for this scheme."
        backHref={`/adviser/schemes/${id}/finance/invoices`}
        backLabel="Invoices"
      />
      <InvoiceForm
        schemeId={id}
        suppliers={suppliers.map((s) => ({
          id: String(s.id),
          companyName: String(s.companyName),
        }))}
        accountCodes={accountCodes.map((a) => ({
          id: String(a.id),
          code: String(a.code),
          name: String(a.name),
        }))}
        funds={funds.map((f) => ({
          id: String(f.id),
          name: String(f.name),
        }))}
      />
    </div>
  );
}
