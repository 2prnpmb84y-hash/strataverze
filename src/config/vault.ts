/**
 * The building vault trial (24 Oct 2026): only these buildings, by state and
 * plan number, can open a vault. Everyone else's document library is
 * unchanged. Plan numbers are unique within each state only (decided
 * 27 Oct 2026), so a Queensland building with the same plan number as a
 * trial building is not in the trial.
 */
export const VAULT_TRIAL_BUILDINGS: readonly { state: string; planNumber: string }[] = [{ state: "NSW", planNumber: "SP 99999" }];

export function isVaultTrialBuilding(scheme: { state: string | null | undefined; planNumber: string | null | undefined }): boolean {
  const state = (scheme.state ?? "").trim().toUpperCase();
  const planNumber = (scheme.planNumber ?? "").trim();
  return !!planNumber && VAULT_TRIAL_BUILDINGS.some((b) => b.state === state && b.planNumber === planNumber);
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
