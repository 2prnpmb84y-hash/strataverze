import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemeById } from "@/lib/queries/schemes";
import { PageHeader } from "@/components/ui/page-header";
import { FinanceTabs } from "./finance-tabs";

export default async function FinanceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
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
    <div className="max-w-5xl">
      <PageHeader
        title="Financial Management"
        description={`${scheme.planNumber} — ${scheme.address}, ${scheme.suburb}`}
        backHref={`/adviser/schemes/${id}`}
        backLabel="Scheme"
      />
      <FinanceTabs schemeId={id} />
      {children}
    </div>
  );
}
