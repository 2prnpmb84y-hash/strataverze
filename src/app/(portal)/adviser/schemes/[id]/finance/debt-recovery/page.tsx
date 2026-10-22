import { notFound } from "next/navigation";
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
import { DebtRecoveryListClient } from "./debt-recovery-client";

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Debt Recovery"
        description="Manage levy debt recovery cases following the NSW Strata Schemes Management Act 2015"
        backHref={`/adviser/schemes/${id}/finance`}
        backLabel="Financials"
      />

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
      />
    </div>
  );
}
