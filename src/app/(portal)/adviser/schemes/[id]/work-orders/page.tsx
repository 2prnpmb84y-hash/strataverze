import { connection } from "next/server";
import { getWorkOrdersForScheme } from "@/lib/queries/work-orders";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { WorkOrdersCard } from "../_sections/work-orders-card";
import { requireAdviserScheme } from "../_sections/require-adviser-scheme";

/**
 * Work Orders section. The Works module (requests, RFQs, contracts,
 * approvals) sits under this section so it stays one click away.
 */
export default async function WorkOrdersSectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const scheme = await requireAdviserScheme(id);
  if (!scheme) return null;

  const workOrders = await getWorkOrdersForScheme(id);

  return (
    <div>
      <WorkOrdersCard id={id} workOrders={workOrders} />
      <Card className="mb-6">
        <CardHeader
          title="Works"
          description="Works requests, RFQs, contracts, approvals and contractor compliance."
          action={
            <Button href={`/adviser/schemes/${id}/works`} variant="secondary">
              Open Works
            </Button>
          }
        />
      </Card>
    </div>
  );
}
