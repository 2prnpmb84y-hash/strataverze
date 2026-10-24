import { connection } from "next/server";
import { notFound } from "next/navigation";
import { requirePageAccess } from "@/lib/auth/require-access";
import { getSchemeById } from "@/lib/queries/schemes";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { db } from "@/prisma/db";
import { RfqForm } from "./rfq-form";

export default async function NewRfqPage({
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

  // Load approved scopes that can be used for RFQs
  // First get request IDs for this scheme, then find their scopes
  const requests = await db.orm.public.WorksRequest
    .where((r) => r.schemeId.eq(id))
    .select("id")
    .all();
  const requestIds = requests.map((r) => r.id);

  const scopes = requestIds.length > 0
    ? await db.orm.public.WorksScope
        .where((s) => s.requestId.in(requestIds))
        .orderBy((s) => s.createdAt.desc())
        .all()
    : [];

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="New RFQ"
        description="Create a Request for Quotation from an approved scope of works."
        backHref={`/adviser/schemes/${id}/works/rfqs`}
        backLabel="RFQs"
      />

      <Card className="p-6">
        {scopes.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-ink-muted">
              No scopes of works are available. Create a scope from an approved
              works request before creating an RFQ.
            </p>
          </div>
        ) : (
          <RfqForm
            schemeId={id}
            scopes={scopes.map((s) => ({
              id: s.id,
              title: String(s.title),
              currentVersion: s.currentVersion,
            }))}
          />
        )}
      </Card>
    </div>
  );
}
