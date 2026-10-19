import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemeById } from "@/lib/queries/schemes";
import { getApprovalRouteById } from "@/lib/queries/works";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { ApprovalRouteForm } from "../../new/approval-route-form";

export default async function EditApprovalRoutePage({
  params,
}: {
  params: Promise<{ id: string; routeId: string }>;
}) {
  await connection();
  const { id, routeId } = await params;

  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const route = await getApprovalRouteById(routeId);
  if (!route) notFound();

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Edit Approval Route"
        description={`Update ${route.name}`}
        backHref={`/adviser/schemes/${id}/works/approvals`}
        backLabel="Approvals"
      />

      <Card className="p-6">
        <ApprovalRouteForm
          schemeId={id}
          route={{
            id: route.id,
            name: String(route.name),
            description: route.description ? String(route.description) : null,
            minAmount: route.minAmount ? String(route.minAmount) : null,
            maxAmount: route.maxAmount ? String(route.maxAmount) : null,
            requiredApprovers: route.requiredApprovers,
            approverRoles: route.approverRoles as string[],
            sortOrder: route.sortOrder,
            isActive: route.isActive,
          }}
        />
      </Card>
    </div>
  );
}
