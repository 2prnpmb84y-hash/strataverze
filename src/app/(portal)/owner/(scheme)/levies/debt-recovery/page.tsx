import { getSelectedSchemeId } from "@/lib/actions/scheme-selection";
import { scopeToSelectedScheme, scopeSchemeIds } from "@/lib/owner/scheme-scope";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForOwner } from "@/lib/queries/schemes";
import {
  getDebtRecoveryCasesForOwner,
  getDebtRecoveryCasesForSchemes,
} from "@/lib/queries/debt-recovery";
import { requireCommitteeAccess } from "@/lib/queries/committee-access";
import { PageHeader } from "@/components/ui/page-header";
import { connection } from "next/server";
import { db } from "@/prisma/db";
import { DebtRecoveryOwnerClient } from "./debt-recovery-owner-client";

export default async function OwnerDebtRecoveryPage() {
  await connection();
  const profile = await getCurrentProfile();
  if (!profile) return null;

  // Check if user has committee access (elevated permissions)
  const committee = await requireCommitteeAccess();
  const isCommittee = !!committee;

  const selectedSchemeId = await getSelectedSchemeId();

  let cases;
  if (isCommittee) {
    // Committee members see all cases across their schemes
    cases = await getDebtRecoveryCasesForSchemes(
      scopeSchemeIds(committee.schemeIds, selectedSchemeId),
    );
  } else {
    // Regular owners see only their own cases
    cases = (await getDebtRecoveryCasesForOwner(profile.id)).filter(
      (c) => !selectedSchemeId || c.schemeId === selectedSchemeId,
    );
  }

  // Build lot/scheme lookup from owner schemes
  const schemes = scopeToSelectedScheme(
    isCommittee ? committee.schemes : await getSchemesForOwner(profile.id),
    selectedSchemeId,
  );

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
