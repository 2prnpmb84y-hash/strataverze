/**
 * Who may see a scheme's StrataVerze billing (pure). Mirrors the database
 * policy can_view_scheme_billing: owners, committee, advisers and
 * accountants of that scheme, or a platform admin. Suppliers may not.
 */
export const BILLING_VIEWER_ROLES = ["OWNER", "COMMITTEE", "ADVISER", "ACCOUNTANT"] as const;

export function canViewSchemeBilling(
  memberships: { schemeId: string; role: string; isActive?: boolean | null }[],
  schemeId: string,
  isPlatformAdmin = false,
): boolean {
  if (isPlatformAdmin) return true;
  return memberships.some(
    (m) =>
      m.schemeId === schemeId &&
      m.isActive !== false &&
      (BILLING_VIEWER_ROLES as readonly string[]).includes(m.role),
  );
}
