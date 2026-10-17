import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type { TimestampString } from "@prisma/orm-postgres/target/codec-types";

/** Cast an ISO string to the Prisma 8 TimestampString branded type. */
function toTimestamp(value: string): TimestampString<3> {
  return value as unknown as TimestampString<3>;
}

/**
 * Fetch all compliance items for a scheme, ordered by due date.
 */
export async function getComplianceForScheme(schemeId: string, limit = 200) {
  return db.orm.public.ComplianceItem
    .where((c) => and(c.schemeId.eq(schemeId), c.deletedAt.eq(null)))
    .orderBy((c) => c.dueDate.asc())
    .limit(limit)
    .all();
}

/**
 * Fetch a single compliance item by ID.
 */
export async function getComplianceItemById(itemId: string) {
  return db.orm.public.ComplianceItem
    .where((c) => and(c.id.eq(itemId), c.deletedAt.eq(null)))
    .first();
}

/**
 * Create a new compliance item.
 */
export async function createComplianceItem(data: {
  schemeId: string;
  title: string;
  description?: string;
  category: string;
  dueDate?: string;
  notes?: string;
}) {
  return db.orm.public.ComplianceItem.create({
    schemeId: data.schemeId,
    title: data.title,
    description: data.description ?? null,
    category: data.category,
    dueDate: data.dueDate ? toTimestamp(data.dueDate) : null,
    notes: data.notes ?? null,
  });
}

/**
 * Update a compliance item.
 */
export async function updateComplianceItem(
  itemId: string,
  data: {
    title?: string;
    description?: string | null;
    category?: string;
    dueDate?: string | null;
    status?: string;
    lastChecked?: string | null;
    notes?: string | null;
  },
) {
  const update: Record<string, unknown> = {};
  if (data.title !== undefined) update.title = data.title;
  if (data.description !== undefined) update.description = data.description;
  if (data.category !== undefined) update.category = data.category;
  if (data.dueDate !== undefined)
    update.dueDate = data.dueDate ? toTimestamp(data.dueDate) : null;
  if (data.status !== undefined) update.status = data.status;
  if (data.lastChecked !== undefined)
    update.lastChecked = data.lastChecked ? toTimestamp(data.lastChecked) : null;
  if (data.notes !== undefined) update.notes = data.notes;

  return db.orm.public.ComplianceItem
    .where({ id: itemId })
    .update(update);
}

/**
 * Soft-delete a compliance item.
 */
export async function deleteComplianceItem(itemId: string) {
  return db.orm.public.ComplianceItem
    .where({ id: itemId })
    .update({ deletedAt: toTimestamp(new Date().toISOString()) });
}

/**
 * Fetch compliance items across multiple schemes.
 */
export async function getComplianceForSchemes(schemeIds: string[], limit = 200) {
  if (schemeIds.length === 0) return [];
  return db.orm.public.ComplianceItem
    .where((c) => and(c.schemeId.in(schemeIds), c.deletedAt.eq(null)))
    .include("scheme")
    .orderBy((c) => c.dueDate.asc())
    .limit(limit)
    .all();
}
