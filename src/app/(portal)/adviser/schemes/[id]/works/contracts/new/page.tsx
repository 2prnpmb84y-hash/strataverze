import { connection } from "next/server";
import { notFound } from "next/navigation";
import { requirePageAccess } from "@/lib/auth/require-access";
import { getSchemeById } from "@/lib/queries/schemes";
import {
  getWorksRequestsForScheme,
  getContractorBusinesses,
} from "@/lib/queries/works";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { ContractForm } from "./contract-form";

export default async function NewContractPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;

  // Role check on this scheme (SEC-004 / H5): a page is a privileged read.
  const access = await requirePageAccess(id, "works.manage");
  if (!access) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const [requests, contractors] = await Promise.all([
    getWorksRequestsForScheme(id, { limit: 200 }),
    getContractorBusinesses({ status: "APPROVED", limit: 200 }),
  ]);

  const requestOptions = requests.map((r) => ({
    id: r.id,
    title: String(r.title ?? r.requestNumber),
    requestNumber: String(r.requestNumber),
  }));

  const contractorOptions = contractors.map((c) => ({
    id: c.id,
    companyName: String(c.companyName),
  }));

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="New Contract"
        description="Create a new works contract."
        backHref={`/adviser/schemes/${id}/works/contracts`}
        backLabel="Contracts"
      />

      <Card className="p-6">
        <ContractForm
          schemeId={id}
          requests={requestOptions}
          contractors={contractorOptions}
        />
      </Card>
    </div>
  );
}
