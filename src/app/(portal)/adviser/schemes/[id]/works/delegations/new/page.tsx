import { connection } from "next/server";
import { notFound } from "next/navigation";
import { requirePageAccess } from "@/lib/auth/require-access";
import { getSchemeById } from "@/lib/queries/schemes";
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { DelegationForm } from "./delegation-form";

export default async function NewDelegationPage({
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

  // Get active scheme members to populate the delegate dropdown
  const memberships = await db.orm.public.SchemeMembership
    .where((m) => and(m.schemeId.eq(id), m.isActive.eq(true)))
    .include("profile")
    .all();

  const members = memberships
    .filter((m) => m.profile)
    .map((m) => ({
      id: m.profile.id,
      name: `${m.profile.firstName} ${m.profile.lastName} (${m.role})`,
    }));

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="New Delegation"
        description="Delegate authority to a team member for specific actions."
        backHref={`/adviser/schemes/${id}/works/approvals`}
        backLabel="Approvals"
      />

      <Card className="p-6">
        <DelegationForm schemeId={id} members={members} />
      </Card>
    </div>
  );
}
