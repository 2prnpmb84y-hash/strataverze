import { connection } from "next/server";
import { notFound } from "next/navigation";
import { requirePageAccess } from "@/lib/auth/require-access";
import { getSchemeById } from "@/lib/queries/schemes";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import { WorksRequestForm } from "./works-request-form";

export default async function NewWorksRequestPage({
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

  // Load categories for the form
  const categories = await db.orm.public.WorksCategory
    .where((c) => and(c.schemeId.eq(id), c.isActive.eq(true)))
    .orderBy((c) => c.name.asc())
    .all();

  // Load approval routes
  const approvalRoutes = await db.orm.public.WorksApprovalRoute
    .where((r) => and(r.schemeId.eq(id), r.isActive.eq(true)))
    .orderBy((r) => r.sortOrder.asc())
    .all();

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="New Works Request"
        description="Submit a request for maintenance, repairs, or capital works."
        backHref={`/adviser/schemes/${id}/works`}
        backLabel="Works"
      />

      <Card className="p-6">
        <WorksRequestForm
          schemeId={id}
          categories={categories}
          approvalRoutes={approvalRoutes.map((r) => ({
            id: r.id,
            name: String(r.name),
            maxAmount: r.maxAmount ? Number(r.maxAmount) : null,
          }))}
        />
      </Card>
    </div>
  );
}
