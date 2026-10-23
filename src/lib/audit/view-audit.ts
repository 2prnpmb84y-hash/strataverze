/**
 * Page views recorded in the security audit log (security stage S6): pages
 * that show owners' personal details or a building's financial records. The
 * proxy matches each page request against these rules.
 *
 * A view event means the page was requested by a signed-in user whose
 * session was accepted. If the page then refuses them, that refusal is a
 * separate access.denied event.
 */

const ID = "([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})";

export type ViewRule = { pattern: RegExp; action: string; resourceType: string };

export const VIEW_RULES: readonly ViewRule[] = [
  // The strata roll (owners' names and lots) on the building's main page.
  { pattern: new RegExp(`^/adviser/schemes/${ID}/?$`), action: "view.strata_roll", resourceType: "Scheme" },
  // A lot and its owners' contact details.
  { pattern: new RegExp(`^/adviser/schemes/${ID}/lots/${ID}(/|$)`), action: "view.owner_details", resourceType: "Lot" },
  { pattern: new RegExp(`^/adviser/schemes/${ID}/members(/|$)`), action: "view.member_list", resourceType: "Scheme" },
  { pattern: new RegExp(`^/adviser/schemes/${ID}/activity(/|$)`), action: "view.activity_log", resourceType: "Scheme" },
  // Financial reports, ledgers, levies, bank and debt records.
  {
    pattern: new RegExp(
      `^/adviser/schemes/${ID}/(finance/(reports|journal|accounts|levies|reconciliation|bank-accounts|bank-import|debt-recovery|owner-credits|invoices|interest|budget|periods)|levies)(/|$)`,
    ),
    action: "view.financial",
    resourceType: "Scheme",
  },
];

/** The view event for a page path, or null when the page is not audited. */
export function viewEventFor(pathname: string): { action: string; schemeId: string; resourceType: string; resourceId: string; area: string } | null {
  for (const rule of VIEW_RULES) {
    const m = rule.pattern.exec(pathname);
    if (!m) continue;
    const schemeId = m[1];
    const lotId = rule.resourceType === "Lot" ? m[2] : null;
    const area = pathname.split("/").slice(4, 7).join("/").slice(0, 120) || "overview";
    return { action: rule.action, schemeId, resourceType: rule.resourceType, resourceId: lotId ?? schemeId, area };
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
