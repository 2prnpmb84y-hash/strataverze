import { requireSchemeMembership, AuthorisationError } from "./require-membership";

/**
 * Verify the current user has ACCOUNTANT or ADVISER role on a scheme.
 * Accountants get read-only access to financial data.
 * Advisers also pass this check since they have full access.
 */
export async function requireFinancialReadAccess(schemeId: string) {
  return requireSchemeMembership(schemeId, ["ADVISER", "ACCOUNTANT"]);
}

export { AuthorisationError };
