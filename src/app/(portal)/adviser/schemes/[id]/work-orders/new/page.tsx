import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { WorkOrderCreateForm } from "../work-order-form";

export default async function NewWorkOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="New Work Order"
        description={scheme.name}
        backHref={`/adviser/schemes/${id}`}
        backLabel="Scheme"
      />
      <Card>
        <WorkOrderCreateForm schemeId={id} />
      </Card>
    </div>
  );
}
