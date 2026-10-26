import Link from "next/link";
import { schemeToday } from "@/lib/jurisdiction/scheme-time";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemeById } from "@/lib/queries/schemes";
import { getPlans } from "@/lib/finance/capital-works-plans";
import { formatAud, toCents } from "@/lib/billing/money";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { NewPlanForm } from "./plan-forms";

const STATUS: Record<string, string> = { DRAFT: "Draft", ADOPTED: "Adopted", SUPERSEDED: "Superseded" };

export default async function CapitalWorksPlansPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const scheme = await getSchemeById(id);
  if (!scheme) notFound();
  if (!scheme.memberships.some((m) => m.profileId === profile.id && m.role === "ADVISER")) notFound();
  const plans = await getPlans(id);
  const CAPITAL_WORKS_PLAN = rulesForState(scheme.state).rules.CAPITAL_WORKS_PLAN;
  const today = await schemeToday(id);
  const fyStart = Number(today.slice(5, 7)) >= 7 ? Number(today.slice(0, 4)) : Number(today.slice(0, 4)) - 1;
  const adopted = plans.find((p) => p.status === "ADOPTED");
  const overdue = adopted && String(adopted.reviewDueAt).slice(0, 10) < today;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Capital Works Fund Plan"
        description={`A plan of anticipated major expenditure for at least the next ${CAPITAL_WORKS_PLAN.horizonYears} years, reviewed at least every ${CAPITAL_WORKS_PLAN.reviewEveryYears} years (${CAPITAL_WORKS_PLAN.source}).`}
      />
      {!adopted && (
        <p className="rounded-[var(--radius-card)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          No plan has been adopted. Prepare one below and record its adoption at a general meeting.
        </p>
      )}
      {overdue && (
        <p role="alert" className="rounded-[var(--radius-card)] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          The adopted plan was due for review by {String(adopted!.reviewDueAt).slice(0, 10)}. Open it and start the review.
        </p>
      )}
      <Card>
        <CardHeader title="Plans" />
        {plans.length === 0 ? (
          <p className="text-sm text-ink-muted">No plans yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {plans.map((p) => {
              const total = (p.items ?? []).reduce((s, i) => s + toCents(String(i.estimatedCost)), 0);
              return (
                <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3 text-sm">
                  <Link href={`/adviser/schemes/${id}/finance/capital-works/${p.id}`} className="font-medium text-ink underline">
                    {p.title}
                  </Link>
                  <span className="text-ink-muted">
                    {STATUS[p.status] ?? p.status} · FY {p.periodStartYear} to FY {p.periodStartYear + CAPITAL_WORKS_PLAN.horizonYears - 1} ·{" "}
                    {formatAud(total)} planned · review due {String(p.reviewDueAt).slice(0, 10)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Card>
        <CardHeader
          title="Prepare a new plan"
          description="From 1 April 2026 a new or reviewed plan must follow the NSW standard form. Record the items from that form here."
        />
        <NewPlanForm schemeId={id} defaultStartYear={fyStart} today={today} />
      </Card>
    </div>
  );
}
