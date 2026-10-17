import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type { TimestampString } from "@prisma/orm-postgres/target/codec-types";

/** Cast an ISO string to the Prisma 8 TimestampString branded type. */
function toTimestamp(value: string): TimestampString<3> {
  return value as unknown as TimestampString<3>;
}

/**
 * Fetch all contacts for a scheme, ordered by name.
 */
export async function getContactsForScheme(schemeId: string) {
  return db.orm.public.Contact
    .where((c) => and(c.schemeId.eq(schemeId), c.deletedAt.eq(null)))
    .orderBy((c) => c.name.asc())
    .all();
}

/**
 * Fetch contacts across multiple schemes.
 */
export async function getContactsForSchemes(schemeIds: string[]) {
  if (schemeIds.length === 0) return [];

  return db.orm.public.Contact
    .where((c) => and(c.schemeId.in(schemeIds), c.deletedAt.eq(null)))
    .include("scheme")
    .orderBy((c) => c.name.asc())
    .all();
}

/**
 * Fetch a single contact by ID.
 */
export async function getContactById(contactId: string) {
  return db.orm.public.Contact
    .where((c) => and(c.id.eq(contactId), c.deletedAt.eq(null)))
    .include("scheme")
    .first();
}

/**
 * Create a new contact.
 */
export async function createContact(data: {
  schemeId: string;
  name: string;
  company?: string;
  category: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  isPreferred?: boolean;
}) {
  return db.orm.public.Contact.create({
    schemeId: data.schemeId,
    name: data.name,
    company: data.company ?? null,
    category: data.category,
    phone: data.phone ?? null,
    email: data.email ?? null,
    address: data.address ?? null,
    notes: data.notes ?? null,
    isPreferred: data.isPreferred ?? false,
  });
}

/**
 * Update an existing contact.
 */
export async function updateContact(
  contactId: string,
  data: Partial<{
    name: string;
    company: string | null;
    category: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    notes: string | null;
    isPreferred: boolean;
  }>,
) {
  const update: Record<string, unknown> = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.company !== undefined) update.company = data.company;
  if (data.category !== undefined) update.category = data.category;
  if (data.phone !== undefined) update.phone = data.phone;
  if (data.email !== undefined) update.email = data.email;
  if (data.address !== undefined) update.address = data.address;
  if (data.notes !== undefined) update.notes = data.notes;
  if (data.isPreferred !== undefined) update.isPreferred = data.isPreferred;

  return db.orm.public.Contact.where({ id: contactId }).update(update);
}

/**
 * Soft-delete a contact.
 */
export async function deleteContact(contactId: string) {
  return db.orm.public.Contact
    .where({ id: contactId })
    .update({ deletedAt: toTimestamp(new Date().toISOString()) });
}
