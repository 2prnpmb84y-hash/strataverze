import { notFound } from "next/navigation";
import { rulesForScheme } from "@/lib/jurisdiction/scheme-rules";
import { connection } from "next/server";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemeById } from "@/lib/queries/schemes";
import {
  getDebtRecoveryCasesForScheme,
  getDebtRecoveryStats,
} from "@/lib/queries/debt-recovery";
import { db } from "@/prisma/db";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { DebtRecoveryListClient } from "./debt-recovery-client";
import { needRule } from "@/config/statutory";
import { schemeToday } from "@/lib/jurisdiction/scheme-time";
import { auDate } from "@/lib/onboarding/property-onboarding";
import { proceedingsDeadlineRule, proceedingsDeadlineWarning } from "@/lib/debt-recovery/proceedings-deadline";
import { proceedingsDeadlineFlagsFor } from "@/lib/debt-recovery/proceedings-deadline-repo";

const currency = (v: number) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(v);

export default async function DebtRecoveryPage({
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
  const { rules } = await rulesForScheme(id);
  if (!rules.FEATURES.debtRecoverySteps) notFound();

  const [cases, stats] = await Promise.all([
    getDebtRecoveryCasesForScheme(id),
    getDebtRecoveryStats(id),
  ]);

  // Fetch lots with owner memberships for the initiation form
  const lots = await db.orm.public.Lot
    .where((l) => l.schemeId.eq(id))
    .orderBy((l) => l.lotNumber.asc())
    .all();

  const ownerMemberships = scheme.memberships.filter(
    (m) => m.role === "OWNER" && m.isActive && m.lotId,
  );

  const lotsWithOwners = lots.map((lot) => {
    const membership = ownerMemberships.find((m) => m.lotId === lot.id);
    return {
      id: lot.id,
      lotNumber: String(lot.lotNumber),
      unitNumber: lot.unitNumber ?? null,
      ownerId: membership?.profileId ?? null,
      ownerName: membership?.profile
        ? `${membership.profile.firstName ?? ""} ${membership.profile.lastName ?? ""}`.trim()
        : null,
    };
  });

  // The building's terms ("NSW", "Strata Schemes Management Act 2015").
  const terms = rules.TERMINOLOGY;
  // Lots that must have proceedings started (Queensland's 2 year rule). A pack
  // without the rule (NSW) has none, and nothing is loaded.
  const deadlineRule = proceedingsDeadlineRule(rules);
  const deadlineFlags = deadlineRule ? await proceedingsDeadlineFlagsFor(id, deadlineRule, await schemeToday(id)) : [];
  return (
    <div className="space-y-6">
      <PageHeader
        title="Debt Recovery"
        description={`Manage ${terms.levy} debt recovery cases following the ${terms.jurisdictionShort} ${terms.act}`}
        backHref={`/adviser/schemes/${id}/finance`}
        backLabel="Financials"
      />

      {deadlineRule && deadlineFlags.length > 0 && (
        <div role="alert" className="rounded-[var(--radius-card)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 space-y-1">
          <p className="font-medium">Proceedings must start ({deadlineRule.citation})</p>
          <ul className="list-disc pl-5 space-y-1">
            {deadlineFlags.map((f) => (
              <li key={f.lotId}>{proceedingsDeadlineWarning(f, deadlineRule, terms, auDate)}</li>
            ))}
          </ul>
        </div>
      )}

      {rules.FEATURES.statutoryPaymentPlans && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" href={`/adviser/schemes/${id}/finance/debt-recovery/payment-plans`}>
            Payment plans
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Cases" value={stats.totalCases} />
        <StatCard
          label="Active Cases"
          value={stats.activeCases}
          accent="bg-[#F59E0B]"
        />
        <StatCard
          label="Total Owing"
          value={currency(stats.totalOwed)}
          accent="bg-[#E88A7A]"
        />
        <StatCard
          label="Legal Referrals"
          value={stats.legalReferrals}
          accent="bg-[#B33A3A]"
        />
      </div>

      <DebtRecoveryListClient
        schemeId={id}
        cases={cases.map((c) => ({
          id: c.id,
          caseNumber: c.caseNumber,
          lotId: c.lotId,
          ownerId: c.ownerId,
          status: c.status,
          priority: c.priority,
          totalOwed: Number(c.totalOwed),
          currentStep: c.currentStep,
          createdAt: String(c.createdAt),
        }))}
        lotsWithOwners={lotsWithOwners}
        stepLabels={needRule(rules, "DEBT_RECOVERY_STEP_LABELS")}
        levies={terms.levies}
      />
    </div>
  );
}
