import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getInsuranceForScheme } from "@/lib/queries/insurance";
import { PageHeader } from "@/components/ui/page-header";
import { NewClaimForm } from "../claim-form";
import { POLICY_TYPE_LABELS } from "@/lib/insurance/constants";
import { connection } from "next/server";

export default async function NewClaimPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  const policies = await getInsuranceForScheme(id);
  const policyOptions = policies.map((p) => ({
    id: p.id,
    label: `${POLICY_TYPE_LABELS[p.policyType] ?? p.policyType} · ${p.insurer} · ${p.policyNumber}`,
  }));

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="New insurance claim"
        description={scheme.name}
        backHref={`/adviser/schemes/${id}/insurance`}
        backLabel="Insurance"
      />
      <NewClaimForm schemeId={id} policies={policyOptions} />
    </div>
  );
}
