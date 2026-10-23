import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "@/prisma/db";
import { canSeeDocument, type DocumentViewer } from "./visibility";

/** The viewer's roles and own lot numbers on each of these buildings. */
export async function documentViewers(profileId: string, schemeIds: readonly string[]): Promise<Map<string, DocumentViewer>> {
  const result = new Map<string, DocumentViewer>();
  if (schemeIds.length === 0) return result;
  const memberships = await db.orm.public.SchemeMembership
    .where((m) => and(m.profileId.eq(profileId), m.isActive.eq(true), m.schemeId.in([...schemeIds])))
    .limit(1000)
    .all();
  const lotIds = memberships.filter((m) => m.role === "OWNER" && m.lotId).map((m) => m.lotId as string);
  const lots = lotIds.length
    ? await db.orm.public.Lot.where((l) => l.id.in(lotIds)).limit(lotIds.length).all()
    : [];
  const lotNumber = new Map(lots.map((l) => [l.id, String(l.lotNumber)]));
  for (const schemeId of schemeIds) {
    const mine = memberships.filter((m) => m.schemeId === schemeId);
    result.set(schemeId, {
      roles: [...new Set(mine.map((m) => String(m.role)))],
      ownLotNumbers: mine
        .filter((m) => m.role === "OWNER" && m.lotId && lotNumber.has(m.lotId))
        .map((m) => lotNumber.get(m.lotId as string) as string),
    });
  }
  return result;
}

/**
 * Library documents on these buildings that this person may see (S3),
 * newest first. Filters by each document's visibility and the person's
 * roles and lots on its building.
 */
export async function getVisibleDocumentsForSchemes(profileId: string, schemeIds: readonly string[], limit = 200) {
  if (schemeIds.length === 0) return [];
  const [viewers, docs] = await Promise.all([
    documentViewers(profileId, schemeIds),
    db.orm.public.Document
      .where((d) => and(d.schemeId.in([...schemeIds]), d.deletedAt.eq(null)))
      .orderBy((d) => d.createdAt.desc())
      .limit(Math.min(limit * 5, 1000))
      .all(),
  ]);
  return docs
    .filter((d) => {
      const viewer = viewers.get(d.schemeId);
      return !!viewer && canSeeDocument(d, viewer);
    })
    .slice(0, limit);
}
