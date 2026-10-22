import { getLotsForScheme } from "@/lib/queries/lots";
import type { PlanLot } from "./notice-plan";

/**
 * The scheme's lots as levy planning needs them: unit entitlement and, when
 * the lot has an active owner on the platform, that owner's profile.
 */
export async function loadPlanLots(schemeId: string): Promise<PlanLot[]> {
  const lots = await getLotsForScheme(schemeId, 2000);
  return lots
    .filter((l) => !("deletedAt" in l) || (l as { deletedAt?: unknown }).deletedAt == null)
    .map((l) => ({
      lotId: l.id,
      lotNumber: String(l.lotNumber),
      entitlement: Number(l.entitlement),
      ownerId: l.memberships.find((m) => m.role === "OWNER")?.profileId ?? null,
    }));
}
