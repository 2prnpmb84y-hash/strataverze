/**
 * Page views recorded in the security audit log (security stage S6).
 *
 * Every page of a building's Adviser and Accountant areas is recorded, with
 * the most sensitive ones (the strata roll, a lot and its owners, members,
 * contacts, financial records, documents, the logs) named separately. Owner
 * and committee finance pages that show other owners' arrears are recorded
 * too.
 *
 * The proxy works out who may see the page from their roles on that
 * building: a view by someone without the role is recorded as denied (the
 * page itself then refuses them).
 */

export type ViewArea = "adviser" | "accountant" | "owner";

export type ViewTarget = {
  action: string;
  area: ViewArea;
  /** Null for owner pages, whose building comes from the scheme cookie. */
  schemeId: string | null;
  resourceType: string;
  resourceId: string | null;
  /** The sub-page, for the log (no query string). */
  page: string;
  /** Roles on the building that may see this page. */
  roles: readonly string[];
};

/**
 * A UUID in canonical form (lower case, hyphenated), accepting the forms the
 * database also accepts: upper case, without hyphens, or in braces. Null for
 * anything else.
 */
export function canonicalUuid(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim();
  if (s.startsWith("{") && s.endsWith("}")) s = s.slice(1, -1);
  const hex = s.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** The audit action for a building page, by its sub-path. */
function buildingPageAction(rest: string[]): { action: string; resourceType: string; resourceId: string | null } {
  const [first, second] = rest.map((s) => s.toLowerCase());
  if (!first) return { action: "view.strata_roll", resourceType: "Scheme", resourceId: null };
  if (first === "lots" && second && second !== "new") {
    return { action: "view.owner_details", resourceType: "Lot", resourceId: canonicalUuid(decode(rest[1])) };
  }
  if (first === "lots") return { action: "view.lot_list", resourceType: "Scheme", resourceId: null };
  if (first === "members") return { action: "view.member_list", resourceType: "Scheme", resourceId: null };
  if (first === "contacts") return { action: "view.contacts", resourceType: "Scheme", resourceId: null };
  if (first === "activity" || first === "security-log") return { action: "view.audit_log", resourceType: "Scheme", resourceId: null };
  if (first === "finance" || first === "levies" || first === "funds") return { action: "view.financial", resourceType: "Scheme", resourceId: null };
  if (first === "documents") return { action: "view.documents", resourceType: "Scheme", resourceId: null };
  return { action: "view.scheme_page", resourceType: "Scheme", resourceId: null };
}

const OWNER_AUDITED = [
  /^\/owner\/finance\/(treasurer|reconciliation|approvals)(\/|$)/i,
  /^\/owner\/levies\/debt-recovery(\/|$)/i,
];

/** What a page request is, for the audit log, or null when it is not audited. */
export function viewTargetFor(pathname: string): ViewTarget | null {
  const parts = pathname.split("/").filter(Boolean);
  const top = parts[0]?.toLowerCase();
  if ((top === "adviser" || top === "accountant") && parts[1]?.toLowerCase() === "schemes" && parts[2]) {
    const schemeId = canonicalUuid(decode(parts[2]));
    if (!schemeId) return null;
    const rest = parts.slice(3);
    const page = rest.join("/").toLowerCase().slice(0, 120) || "overview";
    const { action, resourceType, resourceId } =
      top === "accountant"
        ? { action: "view.financial", resourceType: "Scheme", resourceId: null }
        : buildingPageAction(rest);
    return {
      action,
      area: top,
      schemeId,
      resourceType,
      resourceId: resourceId ?? schemeId,
      page,
      roles: top === "accountant" ? ["ACCOUNTANT", "ADVISER"] : ["ADVISER"],
    };
  }
  if (top === "owner" && OWNER_AUDITED.some((re) => re.test(pathname))) {
    return {
      action: "view.financial",
      area: "owner",
      schemeId: null,
      resourceType: "Scheme",
      resourceId: null,
      page: parts.slice(1).join("/").toLowerCase().slice(0, 120),
      roles: ["OWNER", "COMMITTEE"],
    };
  }
  return null;
}

/** Whether a request is a prefetch (the user has not opened the page yet). */
export function isPrefetch(headers: Headers): boolean {
  return (
    headers.get("next-router-prefetch") === "1" ||
    headers.get("purpose") === "prefetch" ||
    headers.get("sec-purpose")?.includes("prefetch") === true
  );
}
