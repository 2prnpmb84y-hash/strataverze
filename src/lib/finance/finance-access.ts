/**
 * Who may download a scheme's finance exports: its advisers and accountants,
 * the treasurer, and platform admins.
 */
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";

export async function canReadSchemeFinance(profile: { id: string; isPlatformAdmin?: boolean | null }, schemeId: string): Promise<boolean> {
  if (profile.isPlatformAdmin) return true;
  const rows = await db.orm.public.SchemeMembership
    .where((m) => and(m.profileId.eq(profile.id), m.schemeId.eq(schemeId), m.isActive.eq(true)))
    .limit(10)
    .all();
  return rows.some((m) => m.role === "ADVISER" || m.role === "ACCOUNTANT" || (m.role === "COMMITTEE" && m.isTreasurer));
}
