"use server";

import { db } from "@/prisma/db";
import { and, or } from "@prisma/orm-postgres/orm-client";
import { getCurrentProfile } from "@/lib/queries/profiles";
import {
  MAX_PER_TYPE,
  MAX_QUERY_LENGTH,
  MAX_RESULTS,
  hrefFor,
  searchPlan,
  searchScopes,
  type SearchLevel,
} from "@/lib/search/scope";

export type SearchResult = {
  type: "scheme" | "lot" | "document" | "work-order" | "contact" | "meeting";
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

/**
 * Global search across the entities the current user may see (finding F11).
 *
 * What is searched in each scheme comes from the caller's active memberships
 * on that scheme, never from the client: see src/lib/search/scope.ts. The
 * `portal` argument only narrows the search to the schemes where the caller
 * holds a role used in that portal (so the links match the portal they are
 * in); it can never widen it. Returns up to 20 results.
 */
export async function globalSearch(
  query: string,
  portal: string,
): Promise<SearchResult[]> {
  const trimmed = String(query ?? "").trim().slice(0, MAX_QUERY_LENGTH);
  if (trimmed.length < 2) return [];

  const profile = await getCurrentProfile();
  if (!profile) return [];

  const memberships = await db.orm.public.SchemeMembership
    .where((m) => and(m.profileId.eq(profile.id), m.isActive.eq(true)))
    .limit(500)
    .all();

  // Scope per scheme from the caller's own memberships; the portal only narrows.
  const scopes = searchScopes(memberships, typeof portal === "string" ? portal : "unknown");
  if (scopes.length === 0) return [];
  const levelOf = new Map<string, SearchLevel>(scopes.map((s) => [s.schemeId, s.level]));
  const plan = searchPlan(scopes);

  const safe = trimmed.replace(/[%_\\]/g, (ch) => `\\${ch}`);
  const pattern = `%${safe}%`;
  const results: SearchResult[] = [];

  // Schemes
  if (plan.schemes.length > 0) {
    const schemes = await db.orm.public.Scheme
      .where((s) =>
        and(
          s.id.in(plan.schemes),
          or(
            s.name.ilike(pattern),
            s.planNumber.ilike(pattern),
            s.address.ilike(pattern),
            s.suburb.ilike(pattern),
          ),
        ),
      )
      .limit(MAX_PER_TYPE)
      .all();

    for (const s of schemes) {
      results.push({
        type: "scheme",
        id: s.id,
        title: s.name,
        subtitle: `${s.planNumber} · ${s.address}, ${s.suburb}`,
        href: hrefFor(levelOf.get(s.id)!, "scheme", s.id, s.id),
      });
    }
  }

  // Lots (by lot number or unit number)
  if (plan.lots.length > 0) {
    const lots = await db.orm.public.Lot
      .where((l) =>
        and(
          l.schemeId.in(plan.lots),
          or(l.lotNumber.ilike(pattern), l.unitNumber.ilike(pattern)),
        ),
      )
      .include("scheme")
      .limit(MAX_PER_TYPE)
      .all();

    for (const lot of lots) {
      results.push({
        type: "lot",
        id: lot.id,
        title: `Lot ${lot.lotNumber}${lot.unitNumber ? ` (Unit ${lot.unitNumber})` : ""}`,
        subtitle: lot.scheme?.name ?? "",
        href: hrefFor(levelOf.get(lot.schemeId)!, "lot", lot.schemeId, lot.id),
      });
    }
  }

  // Documents
  if (plan.documents.length > 0) {
    const documents = await db.orm.public.Document
      .where((d) =>
        and(
          d.schemeId.in(plan.documents),
          d.deletedAt.eq(null),
          or(d.title.ilike(pattern), d.fileName.ilike(pattern)),
        ),
      )
      .include("scheme")
      .limit(MAX_PER_TYPE)
      .all();

    for (const doc of documents) {
      results.push({
        type: "document",
        id: doc.id,
        title: doc.title,
        subtitle: `${doc.scheme?.name ?? ""} · ${doc.category}`,
        href: hrefFor(levelOf.get(doc.schemeId)!, "document", doc.schemeId, doc.id),
      });
    }
  }

  // Work orders: all of the scheme for advisers and committee, the caller's
  // own requests for owners, the caller's awarded jobs for suppliers.
  const workOrderScopes = [
    ...(plan.workOrdersAll.length > 0 ? ["all" as const] : []),
    ...(plan.workOrdersRaised.length > 0 ? ["raised" as const] : []),
    ...(plan.workOrdersAwarded.length > 0 ? ["awarded" as const] : []),
  ];
  if (workOrderScopes.length > 0) {
    const workOrders = await db.orm.public.WorkOrder
      .where((wo) =>
        and(
          wo.deletedAt.eq(null),
          or(wo.title.ilike(pattern), wo.description.ilike(pattern)),
          or(
            ...workOrderScopes.map((kind) =>
              kind === "all"
                ? wo.schemeId.in(plan.workOrdersAll)
                : kind === "raised"
                  ? and(wo.schemeId.in(plan.workOrdersRaised), wo.raisedById.eq(profile.id))
                  : and(wo.schemeId.in(plan.workOrdersAwarded), wo.supplierId.eq(profile.id)),
            ),
          ),
        ),
      )
      .include("scheme")
      .limit(MAX_PER_TYPE)
      .all();

    for (const wo of workOrders) {
      results.push({
        type: "work-order",
        id: wo.id,
        title: wo.title,
        subtitle: `${wo.scheme?.name ?? ""} · ${wo.status}`,
        href: hrefFor(levelOf.get(wo.schemeId)!, "work-order", wo.schemeId, wo.id),
      });
    }
  }

  // Contacts: advisers and committee only.
  if (plan.contacts.length > 0) {
    const contacts = await db.orm.public.Contact
      .where((c) =>
        and(
          c.schemeId.in(plan.contacts),
          c.deletedAt.eq(null),
          or(c.name.ilike(pattern), c.company.ilike(pattern)),
        ),
      )
      .include("scheme")
      .limit(MAX_PER_TYPE)
      .all();

    for (const contact of contacts) {
      results.push({
        type: "contact",
        id: contact.id,
        title: contact.name,
        subtitle: `${contact.scheme?.name ?? ""} · ${contact.category}`,
        href: hrefFor(levelOf.get(contact.schemeId)!, "contact", contact.schemeId, contact.id),
      });
    }
  }

  return results.slice(0, MAX_RESULTS);
}
