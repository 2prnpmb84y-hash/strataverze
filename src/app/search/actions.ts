"use server";

import { db } from "@/prisma/db";
import { and, or } from "@prisma/orm-postgres/orm-client";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForAdviser } from "@/lib/queries/schemes";

export type SearchResult = {
  type: "scheme" | "lot" | "document" | "work-order" | "contact" | "meeting";
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

/**
 * Global search across all entities the current user can access.
 * Returns up to 20 results grouped by type.
 */
export async function globalSearch(
  query: string,
  portal: string,
): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const profile = await getCurrentProfile();
  if (!profile) return [];

  const safe = trimmed.replace(/[%_\\]/g, (ch) => `\\${ch}`);
  const pattern = `%${safe}%`;
  const results: SearchResult[] = [];

  // Get scheme IDs this user can access
  let schemeIds: string[] = [];

  if (portal === "adviser") {
    const schemes = await getSchemesForAdviser(profile.id);
    schemeIds = schemes.map((s) => s.id);
  } else if (portal === "owner") {
    const memberships = await db.orm.public.SchemeMembership
      .where((m) =>
        and(m.profileId.eq(profile.id), m.isActive.eq(true)),
      )
      .include("scheme")
      .all();
    schemeIds = memberships.map((m) => m.schemeId);
  } else if (portal === "supplier") {
    const memberships = await db.orm.public.SchemeMembership
      .where((m) =>
        and(
          m.profileId.eq(profile.id),
          m.role.eq("SUPPLIER"),
          m.isActive.eq(true),
        ),
      )
      .all();
    schemeIds = memberships.map((m) => m.schemeId);
  } else if (portal === "accountant") {
    const memberships = await db.orm.public.SchemeMembership
      .where((m) =>
        and(
          m.profileId.eq(profile.id),
          m.role.eq("ACCOUNTANT"),
          m.isActive.eq(true),
        ),
      )
      .all();
    schemeIds = memberships.map((m) => m.schemeId);
  }

  if (schemeIds.length === 0) return [];

  // Search schemes
  const schemes = await db.orm.public.Scheme
    .where((s) =>
      and(
        s.id.in(schemeIds),
        or(
          s.name.ilike(pattern),
          s.planNumber.ilike(pattern),
          s.address.ilike(pattern),
          s.suburb.ilike(pattern),
        ),
      ),
    )
    .limit(5)
    .all();

  for (const s of schemes) {
    const href =
      portal === "adviser"
        ? `/adviser/schemes/${s.id}`
        : portal === "accountant"
          ? `/accountant/schemes/${s.id}`
          : `/owner/dashboard`;
    results.push({
      type: "scheme",
      id: s.id,
      title: s.name,
      subtitle: `${s.planNumber} · ${s.address}, ${s.suburb}`,
      href,
    });
  }

  // Search lots (by lot number, unit number, or owner name)
  const lots = await db.orm.public.Lot
    .where((l) =>
      and(
        l.schemeId.in(schemeIds),
        or(
          l.lotNumber.ilike(pattern),
          l.unitNumber.ilike(pattern),
        ),
      ),
    )
    .include("scheme")
    .limit(5)
    .all();

  for (const lot of lots) {
    const href =
      portal === "adviser"
        ? `/adviser/schemes/${lot.schemeId}/lots/${lot.id}`
        : `/owner/scheme`;
    results.push({
      type: "lot",
      id: lot.id,
      title: `Lot ${lot.lotNumber}${lot.unitNumber ? ` (Unit ${lot.unitNumber})` : ""}`,
      subtitle: lot.scheme?.name ?? "",
      href,
    });
  }

  // Search documents
  const documents = await db.orm.public.Document
    .where((d) =>
      and(
        d.schemeId.in(schemeIds),
        d.deletedAt.eq(null),
        or(d.title.ilike(pattern), d.fileName.ilike(pattern)),
      ),
    )
    .include("scheme")
    .limit(5)
    .all();

  for (const doc of documents) {
    const href =
      portal === "adviser"
        ? `/adviser/schemes/${doc.schemeId}/documents/${doc.id}`
        : `/owner/documents`;
    results.push({
      type: "document",
      id: doc.id,
      title: doc.title,
      subtitle: `${doc.scheme?.name ?? ""} · ${doc.category}`,
      href,
    });
  }

  // Search work orders
  const workOrders = await db.orm.public.WorkOrder
    .where((wo) =>
      and(
        wo.schemeId.in(schemeIds),
        wo.deletedAt.eq(null),
        or(wo.title.ilike(pattern), wo.description.ilike(pattern)),
      ),
    )
    .include("scheme")
    .limit(5)
    .all();

  for (const wo of workOrders) {
    const href =
      portal === "adviser"
        ? `/adviser/schemes/${wo.schemeId}/work-orders/${wo.id}`
        : `/owner/maintenance/${wo.id}`;
    results.push({
      type: "work-order",
      id: wo.id,
      title: wo.title,
      subtitle: `${wo.scheme?.name ?? ""} · ${wo.status}`,
      href,
    });
  }

  // Search contacts
  const contacts = await db.orm.public.Contact
    .where((c) =>
      and(
        c.schemeId.in(schemeIds),
        c.deletedAt.eq(null),
        or(
          c.name.ilike(pattern),
          c.company.ilike(pattern),
        ),
      ),
    )
    .include("scheme")
    .limit(5)
    .all();

  for (const contact of contacts) {
    const href =
      portal === "adviser"
        ? `/adviser/schemes/${contact.schemeId}/contacts/${contact.id}`
        : `/owner/contacts`;
    results.push({
      type: "contact",
      id: contact.id,
      title: contact.name,
      subtitle: `${contact.scheme?.name ?? ""} · ${contact.category}`,
      href,
    });
  }

  return results.slice(0, 20);
}
