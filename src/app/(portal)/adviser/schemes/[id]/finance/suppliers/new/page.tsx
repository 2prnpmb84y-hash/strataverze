import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { PageHeader } from "@/components/ui/page-header";
import { SupplierForm } from "../supplier-form";

export default async function NewSupplierPage({
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
        title="New Supplier"
        backHref={`/adviser/schemes/${id}/finance/suppliers`}
        backLabel="Suppliers"
      />
      <SupplierForm schemeId={id} />
    </div>
  );
}
