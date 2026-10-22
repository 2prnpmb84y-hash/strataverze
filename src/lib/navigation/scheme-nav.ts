/**
 * Scheme section navigation (pure, no React).
 *
 * The single source of truth for the persistent scheme navigation. The order,
 * labels and colours follow the approved scheme design and must not be changed
 * without sign-off.
 */

export type SchemeNavTone = "section" | "action";

export interface SchemeNavItem {
  label: string;
  href: string;
  /** Extra path prefixes that should also mark this item active. */
  match?: string[];
  /**
   * Pill style from the design: "section" is the peach row, "action" is the
   * mint row with the plus icon. Defaults to "section".
   */
  tone?: SchemeNavTone;
}

/**
 * The 9 adviser scheme pills, in the approved order and with the design's
 * labels. Sections without their own pill are nested so the right pill stays
 * active: Contacts under Lots / Owners, Levies and Funds under Financials,
 * Notifications under Conversations, Works under Work Order, and By-laws and
 * Members under Governance.
 */
export function adviserSchemeNav(schemeId: string): SchemeNavItem[] {
  const base = `/adviser/schemes/${schemeId}`;
  return [
    { label: "Lots / Owners", href: `${base}/lots`, match: [`${base}/contacts`] },
    {
      label: "Financials",
      href: `${base}/finance`,
      match: [`${base}/levies`, `${base}/funds`],
    },
    { label: "Compliance", href: `${base}/compliance` },
    { label: "Insurance", href: `${base}/insurance` },
    {
      label: "Conversations",
      href: `${base}/announcements`,
      match: [`${base}/notifications`],
    },
    { label: "Document", href: `${base}/documents` },
    {
      label: "Work Order",
      href: `${base}/work-orders`,
      match: [`${base}/works`],
      tone: "action",
    },
    { label: "Meetings", href: `${base}/meetings`, tone: "action" },
    {
      label: "Governance",
      href: `${base}/governance`,
      match: [`${base}/bylaws`, `${base}/members`],
      tone: "action",
    },
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
