/**
 * Scheme section navigation (pure, no React).
 *
 * The single source of truth for the persistent scheme navigation. The order and
 * labels follow the approved scheme design and must not be reordered without
 * sign-off.
 */

export interface SchemeNavItem {
  label: string;
  href: string;
  /** Extra path prefixes that should also mark this item active. */
  match?: string[];
}

/** The 13 adviser scheme sections, in the approved order. */
export function adviserSchemeNav(schemeId: string): SchemeNavItem[] {
  const base = `/adviser/schemes/${schemeId}`;
  return [
    { label: "Lots / Owners", href: `${base}/lots` },
    { label: "Levies", href: `${base}/levies` },
    { label: "Financials", href: `${base}/finance`, match: [`${base}/funds`] },
    { label: "Compliance", href: `${base}/compliance` },
    { label: "Insurance", href: `${base}/insurance` },
    { label: "Documents", href: `${base}/documents` },
    { label: "Work Orders", href: `${base}/work-orders`, match: [`${base}/works`] },
    { label: "Meetings", href: `${base}/meetings` },
    { label: "By-laws", href: `${base}/bylaws` },
    { label: "Contacts", href: `${base}/contacts` },
    { label: "Announcements", href: `${base}/announcements` },
    { label: "Governance", href: `${base}/governance`, match: [`${base}/members`] },
    { label: "Notifications", href: `${base}/notifications` },
  ];
}

function isUnder(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Whether a nav item represents the section the user is currently in. */
export function isNavItemActive(item: SchemeNavItem, pathname: string): boolean {
  if (isUnder(pathname, item.href)) return true;
  return (item.match ?? []).some((prefix) => isUnder(pathname, prefix));
}

/** Present a building class the way the design shows it, e.g. "2" → "Class 2". */
export function formatBuildingClass(value: string | null | undefined): string | null {
  if (value == null || value.trim() === "") return null;
  const v = value.trim();
  return /^class\b/i.test(v) ? v : `Class ${v}`;
}

/** Title-case an enum-style value, e.g. "STRATA" → "Strata", "COMPANY_TITLE" → "Company Title". */
export function formatEnumLabel(value: string | null | undefined): string | null {
  if (value == null || value.trim() === "") return null;
  return value
    .trim()
    .toLowerCase()
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** The address as the design's heading shows it: "42 Harbour Street, Sydney NSW 2000". */
export function formatSchemeAddress(s: {
  address: string;
  suburb: string;
  state: string;
  postcode: string;
}): string {
  return `${s.address}, ${s.suburb} ${s.state} ${s.postcode}`.replace(/\s+/g, " ").trim();
}
