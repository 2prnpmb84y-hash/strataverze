import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemeById } from "@/lib/queries/schemes";
import { getPlans } from "@/lib/finance/capital-works-plans";
import { CONTRIBUTION_METHOD_LABELS, projectPlan, type ContributionMethod } from "@/lib/finance/capital-works-plan";
import { resolutionMeetings } from "@/lib/finance/resolutions";
import { formatAud, toCents } from "@/lib/billing/money";
import { CAPITAL_WORKS_PLAN } from "@/config/statutory";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { AddItemForm, AdoptPlanForm, GenerateLevyForm, PlanSettingsForm, RemoveItemButton, ReviewPlanButton } from "../plan-forms";

export default async function CapitalWorksPlanPage({ params }: { params: Promise<{ id: string; planId: string }> }) {
  await connection();
  const { id, planId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const scheme = await getSchemeById(id);
  if (!scheme) notFound();
  if (!scheme.memberships.some((m) => m.profileId === profile.id && m.role === "ADVISER")) notFound();
  const plan = (await getPlans(id)).find((p) => p.id === planId);
  if (!plan) notFound();
  const meetings = plan.status === "DRAFT" ? await resolutionMeetings(id) : [];
  const items = [...(plan.items ?? [])].sort((a, b) => a.plannedYear - b.plannedYear || a.description.localeCompare(b.description));
  const years = Array.from({ length: CAPITAL_WORKS_PLAN.horizonYears }, (_, k) => plan.periodStartYear + k);
  const contribution = toCents(String(plan.annualContribution ?? 0));
  const projection = projectPlan({
    items: items.map((i) => ({ plannedYear: i.plannedYear, estimatedCostCents: toCents(String(i.estimatedCost)) })),
    startYear: plan.periodStartYear,
    openingBalanceCents: toCents(String(plan.openingBalance)),
    annualContributionCents: contribution,
  });
  const method = plan.contributionMethod as ContributionMethod;
  const fy = (y: number) => `FY ${y}/${String(y + 1).slice(2)}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title={plan.title}
        description={`${plan.status === "ADOPTED" ? "Adopted" : plan.status === "DRAFT" ? "Draft" : "Superseded"} · ${fy(years[0])} to ${fy(years[years.length - 1])} · prepared ${String(plan.preparedAt).slice(0, 10)}${plan.preparedBy ? ` by ${plan.preparedBy}` : ""} · review due ${String(plan.reviewDueAt).slice(0, 10)}`}
        backHref={`/adviser/schemes/${id}/finance/capital-works`}
        backLabel="Capital works plans"
      />

      <Card>
        <CardHeader title="Yearly contribution needed" description={CONTRIBUTION_METHOD_LABELS[method]} />
        <p className="text-2xl font-semibold tabular-nums">{formatAud(contribution)} a year</p>
        {plan.status === "DRAFT" && (
          <div className="mt-4">
            <PlanSettingsForm schemeId={id} planId={plan.id} openingBalance={(toCents(String(plan.openingBalance)) / 100).toFixed(2)} method={plan.contributionMethod} />
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Anticipated major expenditure" />
        {items.length === 0 ? (
          <p className="text-sm text-ink-muted">No items yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-ink-muted">
                  <th scope="col" className="py-2 pr-4 font-medium">Year</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Work</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Component</th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">Estimate</th>
                  <th scope="col" className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((i) => (
                  <tr key={i.id}>
                    <td className="py-2 pr-4 whitespace-nowrap">{fy(i.plannedYear)}</td>
                    <td className="py-2 pr-4">{i.description}{i.notes ? <span className="block text-xs text-ink-muted">{i.notes}</span> : null}</td>
                    <td className="py-2 pr-4 text-ink-muted">{i.component ?? ""}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{formatAud(toCents(String(i.estimatedCost)))}</td>
                    <td className="py-2 text-right">{plan.status === "DRAFT" && <RemoveItemButton schemeId={id} planId={plan.id} itemId={i.id} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {plan.status === "DRAFT" && (
          <div className="mt-4 border-t border-line pt-4">
            <AddItemForm schemeId={id} planId={plan.id} years={years} />
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Fund balance over the plan" description="With the yearly contribution above, before inflation and interest." />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-ink-muted">
                <th scope="col" className="py-2 pr-4 font-medium">Year</th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">Opening</th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">Contribution</th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">Planned spending</th>
                <th scope="col" className="py-2 text-right font-medium">Closing</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line tabular-nums">
              {projection.map((y) => (
                <tr key={y.year}>
                  <td className="py-2 pr-4">{fy(y.year)}</td>
                  <td className="py-2 pr-4 text-right">{formatAud(y.openingCents)}</td>
                  <td className="py-2 pr-4 text-right">{formatAud(y.contributionCents)}</td>
                  <td className="py-2 pr-4 text-right">{formatAud(y.spendCents)}</td>
                  <td className={`py-2 text-right ${y.closingCents < 0 ? "text-red-700" : ""}`}>{formatAud(y.closingCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {plan.status === "DRAFT" && (
        <Card>
          <CardHeader title="Adopt the plan" description="Record the general meeting and the motion that adopted the plan. The five-yearly review is then added to the compliance register." />
          <AdoptPlanForm schemeId={id} planId={plan.id} meetings={meetings} />
        </Card>
      )}

      {plan.status === "ADOPTED" && (
        <>
          <Card>
            <CardHeader
              title="Capital works levy"
              description="Create a draft capital works levy schedule for a year of this plan, using the yearly contribution above. It still needs the owners corporation's approval and an adopted budget before notices can issue."
            />
            <GenerateLevyForm schemeId={id} years={years} />
          </Card>
          <Card>
            <CardHeader title="Review" description="Start the review to prepare a new draft from this plan. When the new plan is adopted, this one is superseded." />
            <ReviewPlanButton schemeId={id} planId={plan.id} />
          </Card>
        </>
      )}
    </div>
  );
}
