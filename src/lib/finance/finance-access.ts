/**
 * Who may download a scheme's finance documents and exports.
 * - Finance readers: advisers, accountants, the treasurer, platform admins.
 * - Committee members: also committee and statutory reports.
 * - Owners: also the levy notices and statements of their own lots.
 */
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";

type Profile = { id: string; isPlatformAdmin?: boolean | null };

async function memberships(profileId: string, schemeId: string) {
  return db.orm.public.SchemeMembership
    .where((m) => and(m.profileId.eq(profileId), m.schemeId.eq(schemeId), m.isActive.eq(true)))
    .limit(20)
    .all();
}

export async function canReadSchemeFinance(profile: Profile, schemeId: string): Promise<boolean> {
  if (profile.isPlatformAdmin) return true;
  const rows = await memberships(profile.id, schemeId);
  return rows.some((m) => m.role === "ADVISER" || m.role === "ACCOUNTANT" || (m.role === "COMMITTEE" && m.isTreasurer));
}

export async function canReadCommitteeReports(profile: Profile, schemeId: string): Promise<boolean> {
  if (await canReadSchemeFinance(profile, schemeId)) return true;
  return (await memberships(profile.id, schemeId)).some((m) => m.role === "COMMITTEE");
}

export async function canReadLotDocuments(profile: Profile, schemeId: string, lotId: string | null): Promise<boolean> {
  if (await canReadSchemeFinance(profile, schemeId)) return true;
  if (!lotId) return false;
  return (await memberships(profile.id, schemeId)).some((m) => m.role === "OWNER" && m.lotId === lotId);
}

/** Access to a stored generated document by its type. */
export async function canReadFinancialDocument(profile: Profile, doc: { schemeId: string; documentType: string; lotId: string | null }) {
  switch (doc.documentType) {
    case "LEVY_NOTICE":
    case "OWNER_STATEMENT":
      return canReadLotDocuments(profile, doc.schemeId, doc.lotId);
    case "COMMITTEE_PACK":
    case "STATUTORY_PACK":
      return canReadCommitteeReports(profile, doc.schemeId);
    default:
      return canReadSchemeFinance(profile, doc.schemeId);
  }
}
