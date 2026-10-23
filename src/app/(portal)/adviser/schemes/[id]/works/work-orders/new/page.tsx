import { connection } from "next/server";
import { notFound } from "next/navigation";
import { requirePageAccess } from "@/lib/auth/require-access";
import { getSchemeById } from "@/lib/queries/schemes";
import { getWorksContractsForScheme } from "@/lib/queries/works";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { WorkOrderForm } from "./work-order-form";

export default async function NewWorkOrderPage({
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

  const rawContracts = await getWorksContractsForScheme(id, { status: "ACTIVE" });
  const executedContracts = await getWorksContractsForScheme(id, { status: "EXECUTED" });
  const allContracts = [...rawContracts, ...executedContracts];

  const contracts = allContracts.map((c) => ({
    id: c.id,
    contractNumber: String(c.contractNumber),
    title: String(c.title),
    contractorBusinessId: c.contractorBusinessId ?? c.contractorBusiness?.id ?? "",
    contractorName: String(c.contractorBusiness?.companyName ?? "Unknown"),
  }));

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="New Work Order"
        description="Create a work order for an active contract."
        backHref={`/adviser/schemes/${id}/works/work-orders`}
        backLabel="Work Orders"
      />

      <Card className="p-6">
        <WorkOrderForm schemeId={id} contracts={contracts} />
      </Card>
    </div>
  );
}
