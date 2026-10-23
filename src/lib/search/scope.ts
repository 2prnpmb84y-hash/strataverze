/**
 * Global search scope (pure). Security finding F11: globalSearch trusted a
 * client `portal` argument and searched every document, work order and
 * contact in every scheme the user belonged to, whatever their role there
 * (suppliers included).
 *
 * The scope is worked out per scheme from the caller's ACTIVE memberships:
 *   adviser / committee: documents, work orders, contacts and lots of the scheme
 *   owner:               the scheme's documents, lots and work orders; no contacts
 *                        (owners see all of their building's work orders, decided 23 Oct 2026)
 *   supplier:            only work orders awarded to them
 *   accountant / payment authoriser: the scheme itself only
 *
 * The client's portal can only NARROW the result (to the schemes where the
 * caller holds a role used in that portal); it never widens it.
 */

export type SearchLevel = "adviser" | "committee" | "owner" | "supplier" | "accountant" | "authoriser";

export type SchemeSearchScope = { schemeId: string; level: SearchLevel };

export type MembershipForSearch = { schemeId: string; role: string; isActive: boolean };

/** Roles a portal shows, in order of precedence (the first held role decides the level). */
const PORTAL_ROLES: Record<string, readonly string[]> = {
  adviser: ["ADVISER"],
  owner: ["COMMITTEE", "OWNER", "PAYMENT_AUTHORISER"],
  supplier: ["SUPPLIER"],
  accountant: ["ACCOUNTANT"],
};

/** Precedence when no portal is given. */
const ALL_ROLES = ["ADVISER", "COMMITTEE", "OWNER", "ACCOUNTANT", "PAYMENT_AUTHORISER", "SUPPLIER"];

const LEVEL_FOR_ROLE: Record<string, SearchLevel> = {
  ADVISER: "adviser",
  COMMITTEE: "committee",
  OWNER: "owner",
  SUPPLIER: "supplier",
  ACCOUNTANT: "accountant",
  PAYMENT_AUTHORISER: "authoriser",
};

/**
 * One scope per scheme. `portal` narrows to that portal's roles; an unknown
 * portal (including "") gives nothing; null or undefined considers every
 * role. Inactive memberships never count.
 */
export function searchScopes(
  memberships: readonly MembershipForSearch[],
  portal?: string | null,
): SchemeSearchScope[] {
  const precedence = portal == null ? ALL_ROLES : PORTAL_ROLES[portal];
  if (!precedence) return [];

  const rolesByScheme = new Map<string, Set<string>>();
  for (const m of memberships) {
    if (!m.isActive) continue;
    const set = rolesByScheme.get(m.schemeId) ?? new Set<string>();
    set.add(m.role);
    rolesByScheme.set(m.schemeId, set);
  }

  const scopes: SchemeSearchScope[] = [];
  for (const [schemeId, roles] of rolesByScheme) {
    const role = precedence.find((r) => roles.has(r));
    if (role) scopes.push({ schemeId, level: LEVEL_FOR_ROLE[role] });
  }
  return scopes;
}

export type SearchPlan = {
  /** Schemes whose name and address may match. */
  schemes: string[];
  lots: string[];
  documents: string[];
  contacts: string[];
  /** Every work order of these schemes. */
  workOrdersAll: string[];
  /** Only work orders the caller raised, in these schemes. */
  workOrdersRaised: string[];
  /** Only work orders awarded to the caller, in these schemes. */
  workOrdersAwarded: string[];
};

/** Which scheme ids each entity type is searched in. */
export function searchPlan(scopes: readonly SchemeSearchScope[]): SearchPlan {
  const ids = (levels: SearchLevel[]) =>
    scopes.filter((s) => levels.includes(s.level)).map((s) => s.schemeId);
  return {
    schemes: scopes.filter((s) => s.level !== "supplier").map((s) => s.schemeId),
    lots: ids(["adviser", "committee", "owner"]),
    documents: ids(["adviser", "committee", "owner"]),
    contacts: ids(["adviser", "committee"]),
    workOrdersAll: ids(["adviser", "committee", "owner"]),
    // Kept for a narrower owner policy; owners currently see every work order.
    workOrdersRaised: [],
    workOrdersAwarded: ids(["supplier"]),
  };
}

/** Links for a result, by the level the caller searched that scheme at. */
export function hrefFor(
  level: SearchLevel,
  kind: "scheme" | "lot" | "document" | "work-order" | "contact",
  schemeId: string,
  id: string,
): string {
  if (level === "adviser") {
    switch (kind) {
      case "scheme":
        return `/adviser/schemes/${schemeId}`;
      case "lot":
        return `/adviser/schemes/${schemeId}/lots/${id}`;
      case "document":
        return `/adviser/schemes/${schemeId}/documents/${id}`;
      case "work-order":
        return `/adviser/schemes/${schemeId}/work-orders/${id}`;
      case "contact":
        return `/adviser/schemes/${schemeId}/contacts/${id}`;
    }
  }
  if (level === "accountant") return `/accountant/schemes/${schemeId}`;
  if (level === "supplier") return kind === "work-order" ? `/supplier/work-orders/${id}` : "/supplier";
  if (level === "authoriser") return "/owner/finance/approvals";
  switch (kind) {
    case "scheme":
      return "/owner/dashboard";
    case "lot":
      return "/owner/scheme";
    case "document":
      return "/owner/documents";
    case "work-order":
      return `/owner/maintenance/${id}`;
    case "contact":
      return "/owner/contacts";
  }
}

/** Longest search text accepted; longer input is cut. */
export const MAX_QUERY_LENGTH = 100;
/** Most results returned in total, and per entity type. */
export const MAX_RESULTS = 20;
export const MAX_PER_TYPE = 5;
