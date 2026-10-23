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
  "lot",
  "membership",
] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

export const AUDIT_OUTCOMES = ["allowed", "denied", "failed"] as const;

export type AuditFilters = {
  /** Who is reading: every event (platform admins), or one building's. Required, so nothing defaults to everything. */
  scope: { kind: "platform" } | { kind: "scheme"; schemeId: string };
  category?: string | null;
  outcome?: string | null;
  /** Show events numbered below this (the next page). */
  beforeSeq?: number | null;
  limit?: number;
};

export async function listSecurityEvents(filters: AuditFilters) {
  if (filters.scope.kind === "scheme" && !filters.scope.schemeId) throw new Error("A building is required.");
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 200);
  const category = AUDIT_CATEGORIES.includes(filters.category as AuditCategory) ? filters.category : null;
  const outcome = (AUDIT_OUTCOMES as readonly string[]).includes(filters.outcome ?? "") ? filters.outcome : null;
  const beforeSeq = Number.isSafeInteger(filters.beforeSeq) && (filters.beforeSeq ?? 0) > 0 ? filters.beforeSeq! : null;

  const rows = await db.orm.public.SecurityAuditEvent
    .where((e) => {
      const conditions = [];
      if (filters.scope.kind === "scheme") conditions.push(e.schemeId.eq(filters.scope.schemeId));
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
  // A building's log names only its own people and StrataVerze staff;
  // anyone else who requested its pages is shown without their name.
  let known: Set<string> | null = null;
  if (filters.scope.kind === "scheme" && actorIds.length) {
    const schemeId = filters.scope.schemeId;
    const members = await db.orm.public.SchemeMembership
      .where((m) => and(m.schemeId.eq(schemeId), m.profileId.in(actorIds)))
      .limit(1000)
      .all();
    known = new Set(members.map((m) => m.profileId));
  }
  const names = new Map(
    actors.map((a) => {
      if (known && !known.has(a.id)) {
        return [a.id, a.isPlatformAdmin ? "StrataVerze staff" : "Someone outside this building"];
      }
      return [a.id, [a.firstName, a.lastName].filter(Boolean).join(" ") || (known ? "A member" : String(a.email))];
    }),
  );
  const showSource = filters.scope.kind === "platform";

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
      ipHash: showSource && r.ipHash ? r.ipHash.slice(0, 8) : null,
      metadata: (r.metadata ?? {}) as Record<string, unknown>,
    })),
    nextBeforeSeq: rows.length > limit ? Number(page[page.length - 1].seq) : null,
  };
}

/** A check older than this is shown as stale (it runs hourly). */
export const AUDIT_CHECK_STALE_MS = 3 * 60 * 60 * 1000;

/** The latest hash chain check, or null before the first one has run. */
export async function latestAuditCheck() {
  const row = await db.orm.public.SecurityAuditCheck.orderBy((c) => c.checkSeq.desc()).limit(1).first();
  if (!row) return null;
  const checkedAt = String(row.checkedAt);
  return {
    checkedAt,
    ok: row.ok,
    fullCheck: row.fullCheck,
    rowsChecked: Number(row.rowsChecked),
    firstBadSeq: row.firstBadSeq == null ? null : Number(row.firstBadSeq),
    problem: row.problem,
    stale: Date.now() - Date.parse(checkedAt) > AUDIT_CHECK_STALE_MS,
  };
}
