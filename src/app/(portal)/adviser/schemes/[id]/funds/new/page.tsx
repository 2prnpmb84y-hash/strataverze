import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { PageHeader } from "@/components/ui/page-header";
import { FundForm } from "../fund-form";
import { connection } from "next/server";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";
import { fundRequirementsView, hasFundConditions } from "@/lib/jurisdiction/funds";
import { getRecordedSelectorValues } from "@/lib/queries/building-selectors";
import { FundRequirements } from "../../_sections/fund-requirements";

export default async function NewFundPage({
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

  const rules = rulesForState(scheme.state).rules;
  // Which funds the building needs and why, for a pack with fund conditions
  // (stage 2, PR 3). Read only for such a pack: nothing shows for NSW or Queensland.
  const requirements = hasFundConditions(rules)
    ? fundRequirementsView(rules, { scheme, lots: scheme.lots, recorded: await getRecordedSelectorValues(scheme.id) })
    : null;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="New Fund"
        description={`Add a fund to ${scheme.name}.`}
        backHref={`/adviser/schemes/${id}/finance`}
        backLabel="Financials"
      />

      <FundRequirements requirements={requirements} className="mb-6" />

      <FundForm schemeId={id} mode="create" catalogue={rules.FUND_CATALOGUE} />
    </div>
  );
}
