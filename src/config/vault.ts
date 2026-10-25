/**
 * The building vault trial (24 Oct 2026): only these buildings, by plan
 * number, can open a vault. Everyone else's document library is unchanged.
 */
export const VAULT_TRIAL_PLAN_NUMBERS: readonly string[] = ["SP 99999"];

export function isVaultTrialBuilding(planNumber: string | null | undefined): boolean {
  return !!planNumber && VAULT_TRIAL_PLAN_NUMBERS.includes(planNumber.trim());
}

/** The StrataVerze documents written into the vault when they are created. */
export const VAULT_CAPTURED_FINANCIAL_TYPES = ["LEVY_NOTICE", "REMITTANCE_ADVICE", "COMMITTEE_PACK", "STATUTORY_PACK"] as const;

/** Library categories, as vault record types. */
export const LIBRARY_CATEGORY_TO_RECORD_TYPE: Record<string, string> = {
  MINUTES: "MINUTES",
  INSURANCE: "INSURANCE",
  BYLAW: "PLAN_OR_BYLAW",
  FINANCIAL: "FINANCIAL",
  COMPLIANCE: "REPORT",
  OTHER: "OTHER",
};
