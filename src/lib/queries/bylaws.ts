import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type { TimestampString } from "@prisma/orm-postgres/target/codec-types";
import { logActivityTx } from "./activity-log";

/** Cast an ISO string to the Prisma 8 TimestampString branded type. */
function toTimestamp(value: string): TimestampString<3> {
  return value as unknown as TimestampString<3>;
}

/**
 * Fetch all by-laws for a scheme, ordered by by-law number.
 */
export async function getBylawsForScheme(schemeId: string) {
  return db.orm.public.ByLaw
    .where((b) => and(b.schemeId.eq(schemeId), b.deletedAt.eq(null)))
    .orderBy((b) => b.bylawNumber.asc())
    .all();
}

/**
 * Fetch active by-laws for a scheme (excludes repealed).
 */
export async function getActiveBylawsForScheme(schemeId: string) {
  const all = await db.orm.public.ByLaw
    .where((b) => and(b.schemeId.eq(schemeId), b.deletedAt.eq(null)))
    .orderBy((b) => b.bylawNumber.asc())
    .all();
  return all.filter((b) => b.status !== "REPEALED");
}

/**
 * Fetch by-laws across multiple schemes.
 */
export async function getBylawsForSchemes(
  schemeIds: string[],
  options?: { includeRepealed?: boolean },
) {
  if (schemeIds.length === 0) return [];

  const all = await db.orm.public.ByLaw
    .where((b) => and(b.schemeId.in(schemeIds), b.deletedAt.eq(null)))
    .include("scheme")
    .orderBy((b) => b.bylawNumber.asc())
    .all();

  if (options?.includeRepealed) return all;
  return all.filter((b) => b.status !== "REPEALED");
}

/**
 * Fetch a single by-law by ID.
 */
export async function getBylawById(bylawId: string) {
  return db.orm.public.ByLaw
    .where((b) => and(b.id.eq(bylawId), b.deletedAt.eq(null)))
    .include("scheme")
    .first();
}

/**
 * Get the next available by-law number for a scheme.
 */
export async function getNextBylawNumber(schemeId: string): Promise<number> {
  const all = await db.orm.public.ByLaw
    .where((b) => and(b.schemeId.eq(schemeId), b.deletedAt.eq(null)))
    .orderBy((b) => b.bylawNumber.desc())
    .limit(1)
    .all();
  return all.length > 0 ? all[0].bylawNumber + 1 : 1;
}

/**
 * Create a new by-law.
 */
export async function createBylaw(data: {
  schemeId: string;
  bylawNumber: number;
  title: string;
  body: string;
  category?: string;
  effectiveDate: string;
  motionRef?: string;
  notes?: string;
}) {
  return db.orm.public.ByLaw.create({
    schemeId: data.schemeId,
    bylawNumber: data.bylawNumber,
    title: data.title,
    body: data.body,
    category: data.category ?? "GENERAL",
    effectiveDate: toTimestamp(data.effectiveDate),
    motionRef: data.motionRef ?? null,
    notes: data.notes ?? null,
  });
}

/**
 * Atomically assign the next by-law number, create the by-law, and log
 * the activity in a single transaction to prevent duplicate numbers
 * under concurrent requests.
 */
export async function createBylawAtomic(data: {
  schemeId: string;
  title: string;
  body: string;
  category?: string;
  effectiveDate: string;
  motionRef?: string;
  notes?: string;
  actorId: string;
}) {
  return db.transaction(async (tx) => {
    // Determine next number inside the transaction
    const existing = await tx.orm.public.ByLaw
      .where((b) => b.schemeId.eq(data.schemeId))
      .orderBy((b) => b.bylawNumber.desc())
      .limit(1)
      .all();
    const bylawNumber = existing.length > 0 ? existing[0].bylawNumber + 1 : 1;

    const bylaw = await tx.orm.public.ByLaw.create({
      schemeId: data.schemeId,
      bylawNumber,
      title: data.title,
      body: data.body,
      category: data.category ?? "GENERAL",
      effectiveDate: toTimestamp(data.effectiveDate),
      motionRef: data.motionRef ?? null,
      notes: data.notes ?? null,
    });

    await logActivityTx(tx, {
      schemeId: data.schemeId,
      actorId: data.actorId,
      action: "BYLAW_CREATED",
      entityType: "ByLaw",
      entityId: bylaw.id,
      metadata: { title: data.title, bylawNumber },
    });

    return bylaw;
  });
}

/**
 * Update an existing by-law.
 */
export async function updateBylaw(
  bylawId: string,
  data: Partial<{
    title: string;
    body: string;
    category: string;
    status: string;
    effectiveDate: string;
    amendedDate: string | null;
    repealedDate: string | null;
    motionRef: string | null;
    notes: string | null;
  }>,
) {
  const update: Record<string, unknown> = {};
  if (data.title !== undefined) update.title = data.title;
  if (data.body !== undefined) update.body = data.body;
  if (data.category !== undefined) update.category = data.category;
  if (data.status !== undefined) update.status = data.status;
  if (data.effectiveDate !== undefined)
    update.effectiveDate = toTimestamp(data.effectiveDate);
  if (data.amendedDate !== undefined)
    update.amendedDate = data.amendedDate ? toTimestamp(data.amendedDate) : null;
  if (data.repealedDate !== undefined)
    update.repealedDate = data.repealedDate
      ? toTimestamp(data.repealedDate)
      : null;
  if (data.motionRef !== undefined) update.motionRef = data.motionRef;
  if (data.notes !== undefined) update.notes = data.notes;

  return db.orm.public.ByLaw.where({ id: bylawId }).update(update);
}

/**
 * Soft-delete a by-law.
 */
export async function deleteBylaw(bylawId: string) {
  return db.orm.public.ByLaw
    .where({ id: bylawId })
    .update({ deletedAt: toTimestamp(new Date().toISOString()) });
}
