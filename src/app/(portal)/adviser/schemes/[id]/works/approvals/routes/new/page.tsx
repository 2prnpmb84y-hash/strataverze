import { connection } from "next/server";
import { notFound } from "next/navigation";
import { requirePageAccess } from "@/lib/auth/require-access";
import { getSchemeById } from "@/lib/queries/schemes";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { ApprovalRouteForm } from "./approval-route-form";

export default async function NewApprovalRoutePage({
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

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="New Approval Route"
        description="Define a new approval route with thresholds and approver roles."
        backHref={`/adviser/schemes/${id}/works/approvals`}
        backLabel="Approvals"
      />

      <Card className="p-6">
        <ApprovalRouteForm schemeId={id} />
      </Card>
    </div>
  );
}
