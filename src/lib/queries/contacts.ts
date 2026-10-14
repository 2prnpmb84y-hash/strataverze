import { db } from "@/prisma/db";

/**
 * Fetch all contacts for a scheme, ordered by name.
 */
export async function getContactsForScheme(schemeId: string) {
  return db.orm.public.Contact
    .where((c) => c.schemeId.eq(schemeId))
    .orderBy((c) => c.name.asc())
    .all();
}

/**
 * Fetch contacts across multiple schemes.
 */
export async function getContactsForSchemes(schemeIds: string[]) {
  if (schemeIds.length === 0) return [];

  return db.orm.public.Contact
    .where((c) => c.schemeId.in(schemeIds))
    .include("scheme")
    .orderBy((c) => c.name.asc())
    .all();
}

/**
 * Fetch a single contact by ID.
 */
export async function getContactById(contactId: string) {
  return db.orm.public.Contact
    .include("scheme")
    .first({ id: contactId });
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
 * Delete a contact.
 */
export async function deleteContact(contactId: string) {
  return db.orm.public.Contact.where({ id: contactId }).delete();
}
