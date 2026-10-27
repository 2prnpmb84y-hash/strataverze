import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemeById } from "@/lib/queries/schemes";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";
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
    <div>
      <PageHeader title="Financial Management" />
      <FinanceTabs schemeId={id} capitalWorksPlan={rulesForState(scheme.state).rules.FEATURES.capitalWorksFundPlan} />
      {children}
    </div>
  );
}
