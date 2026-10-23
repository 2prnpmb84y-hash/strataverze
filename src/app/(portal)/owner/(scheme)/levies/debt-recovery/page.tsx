import { getVerifiedSelectedSchemeId } from "@/lib/owner/selected-scheme";
import { scopeToSelectedScheme, scopeSchemeIds } from "@/lib/owner/scheme-scope";
import { debtorMayView } from "@/lib/owner/debt-case-view";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForCommittee, getSchemesForOwner } from "@/lib/queries/schemes";
import {
  getDebtRecoveryCasesForOwner,
  getDebtRecoveryCasesForSchemes,
} from "@/lib/queries/debt-recovery";
import { PageHeader } from "@/components/ui/page-header";
import { connection } from "next/server";
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import { DebtRecoveryOwnerClient } from "./debt-recovery-owner-client";

export default async function OwnerDebtRecoveryPage() {
  await connection();
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const [committeeSchemes, ownerSchemes, selectedSchemeId, ownerMemberships, ownCases] =
    await Promise.all([
      getSchemesForCommittee(profile.id),
      getSchemesForOwner(profile.id),
      getVerifiedSelectedSchemeId(),
      // Inactive too, for the former-owner grace period.
      db.orm.public.SchemeMembership
        .where((m) => and(m.profileId.eq(profile.id), m.role.eq("OWNER")))
        .limit(200)
        .all(),
      getDebtRecoveryCasesForOwner(profile.id),
    ]);

  // Committee members see every case of the schemes where they sit on the
  // committee (per scheme, not "committee somewhere"); everywhere else an
  // owner sees only their own cases, while they still own (or within 30
  // days of owning) the lot.
  const committeeIds = scopeSchemeIds(committeeSchemes.map((s) => s.id), selectedSchemeId);
  const isCommittee = committeeIds.length > 0;
  const committeeCases = await getDebtRecoveryCasesForSchemes(committeeIds);
  const seen = new Set(committeeCases.map((c) => c.id));
  const cases = [
    ...committeeCases,
    ...ownCases.filter(
      (c) =>
        !seen.has(c.id) &&
        (!selectedSchemeId || c.schemeId === selectedSchemeId) &&
        debtorMayView(c, profile.id, ownerMemberships),
    ),
  ];

  // Build lot/scheme lookup from the user's schemes
  const byId = new Map<string, { id: string; name: string }>();
  for (const s of [...ownerSchemes, ...committeeSchemes]) byId.set(s.id, { id: s.id, name: s.name });
  const schemes = scopeToSelectedScheme([...byId.values()], selectedSchemeId);

  const schemeLookup = new Map(schemes.map((s) => [s.id, s.name]));

  // Build lot lookup from scheme lots
  const lotLookup = new Map<string, { lotNumber: string; unitNumber: string | null }>();
  const schemeIds = schemes.map((s) => s.id);
  if (schemeIds.length > 0) {
    const lots = await db.orm.public.Lot
      .where((l) => l.schemeId.in(schemeIds))
      .all();
    for (const lot of lots) {
      lotLookup.set(lot.id, {
        lotNumber: String(lot.lotNumber),
        unitNumber: lot.unitNumber ? String(lot.unitNumber) : null,
      });
    }
  }

  // Serialise for client
  const serialisedCases = cases.map((c) => {
    const lot = lotLookup.get(c.lotId);
    return {
      id: c.id,
      caseNumber: c.caseNumber,
      schemeId: c.schemeId,
      schemeName: schemeLookup.get(c.schemeId) ?? "",
      lotId: c.lotId,
      lotLabel: lot
        ? `Lot ${lot.lotNumber}${lot.unitNumber ? ` (Unit ${lot.unitNumber})` : ""}`
        : "",
      ownerId: c.ownerId,
      status: c.status,
      currentStep: c.currentStep ?? "",
      priority: c.priority ?? "NORMAL",
      totalOwed: Number(c.totalOwed),
      principalOwed: Number(c.principalOwed),
      interestOwed: Number(c.interestOwed ?? 0),
      createdAt: String(c.createdAt),
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Debt Recovery"
        description={
          isCommittee
            ? "Manage levy debt recovery cases across your schemes."
            : "View debt recovery cases related to your lots."
        }
        backHref="/owner/levies"
        backLabel="Back to Levies"
      />

      <DebtRecoveryOwnerClient
        cases={serialisedCases}
        isCommittee={isCommittee}
      />
    </div>
  );
}
