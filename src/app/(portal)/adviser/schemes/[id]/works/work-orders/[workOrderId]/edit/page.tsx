import { connection } from "next/server";
import { notFound } from "next/navigation";
import { requirePageAccess } from "@/lib/auth/require-access";
import { getSchemeById } from "@/lib/queries/schemes";
import {
  getWorksWorkOrderById,
  getWorksContractsForScheme,
} from "@/lib/queries/works";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { WorkOrderForm } from "../../new/work-order-form";

export default async function EditWorkOrderPage({
  params,
}: {
  params: Promise<{ id: string; workOrderId: string }>;
}) {
  await connection();
  const { id, workOrderId } = await params;

  // Role check on this scheme (SEC-004 / H5): a page is a privileged read.
  const access = await requirePageAccess(id, "works.manage");
  if (!access) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const wo = await getWorksWorkOrderById(workOrderId);
  if (!wo || wo.schemeId !== id) notFound();

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
        title="Edit Work Order"
        description={`Update ${wo.workOrderNumber}`}
        backHref={`/adviser/schemes/${id}/works/work-orders/${workOrderId}`}
        backLabel="Work Order Details"
      />

      <Card className="p-6">
        <WorkOrderForm
          schemeId={id}
          contracts={contracts}
          workOrder={{
            id: wo.id,
            contractId: wo.contractId,
            contractorBusinessId: wo.contractorBusinessId,
            title: String(wo.title),
            description: wo.description ? String(wo.description) : null,
            scheduledStart: wo.scheduledStart
              ? String(wo.scheduledStart).slice(0, 10)
              : null,
            scheduledEnd: wo.scheduledEnd
              ? String(wo.scheduledEnd).slice(0, 10)
              : null,
          }}
        />
      </Card>
    </div>
  );
}
