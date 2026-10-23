import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "@/prisma/db";

/**
 * Reading the security audit log (security stage S6). Read-only: there is no
 * way to change an event. Platform admins read every event; an Adviser reads
 * their own building's (callers must authorise first).
 */

export const AUDIT_CATEGORIES = [
  "auth",
  "mfa",
  "session",
  "access",
  "view",
  "export",
  "document",
  "activity",
  "scheme",
  "contractor",
  "admin",
  "action",
] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

export const AUDIT_OUTCOMES = ["allowed", "denied", "failed"] as const;

export type AuditFilters = {
  schemeId?: string | null;
  category?: string | null;
  outcome?: string | null;
  /** Show events numbered below this (the next page). */
  beforeSeq?: number | null;
  limit?: number;
};

export async function listSecurityEvents(filters: AuditFilters) {
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 200);
  const category = AUDIT_CATEGORIES.includes(filters.category as AuditCategory) ? filters.category : null;
  const outcome = (AUDIT_OUTCOMES as readonly string[]).includes(filters.outcome ?? "") ? filters.outcome : null;
  const beforeSeq = Number.isSafeInteger(filters.beforeSeq) && (filters.beforeSeq ?? 0) > 0 ? filters.beforeSeq! : null;

  const rows = await db.orm.public.SecurityAuditEvent
    .where((e) => {
      const conditions = [];
      if (filters.schemeId) conditions.push(e.schemeId.eq(filters.schemeId));
      if (category) conditions.push(e.action.like(`${category}.%`));
      if (outcome) conditions.push(e.outcome.eq(outcome));
      if (beforeSeq) conditions.push(e.seq.lt(BigInt(beforeSeq)));
      return conditions.length ? and(...conditions) : e.seq.gt(BigInt(0));
    })
    .orderBy((e) => e.seq.desc())
    .limit(limit + 1)
    .all();

  const page = rows.slice(0, limit);
  const actorIds = [...new Set(page.map((r) => r.actorProfileId).filter((id): id is string => !!id))];
  const actors = actorIds.length
    ? await db.orm.public.Profile.where((p) => p.id.in(actorIds)).limit(actorIds.length).all()
    : [];
  const names = new Map(
    actors.map((a) => [a.id, [a.firstName, a.lastName].filter(Boolean).join(" ") || String(a.email)]),
  );

  return {
    events: page.map((r) => ({
      seq: Number(r.seq),
      occurredAt: String(r.occurredAt),
      action: r.action,
      outcome: r.outcome,
      actor: r.actorProfileId ? (names.get(r.actorProfileId) ?? "Unknown user") : r.actorAuthId ? "Auth user" : "Not signed in",
      actorRole: r.actorRole,
      schemeId: r.schemeId,
      resourceType: r.resourceType,
      resourceId: r.resourceId,
      reason: r.reason,
      ipHash: r.ipHash ? r.ipHash.slice(0, 8) : null,
      metadata: (r.metadata ?? {}) as Record<string, unknown>,
    })),
    nextBeforeSeq: rows.length > limit ? Number(page[page.length - 1].seq) : null,
  };
}

/** The latest hash chain check, or null before the first one has run. */
export async function latestAuditCheck() {
  const row = await db.orm.public.SecurityAuditCheck.orderBy((c) => c.checkedAt.desc()).limit(1).first();
  if (!row) return null;
  return {
    checkedAt: String(row.checkedAt),
    ok: row.ok,
    rowsChecked: Number(row.rowsChecked),
    firstBadSeq: row.firstBadSeq == null ? null : Number(row.firstBadSeq),
  };
}
