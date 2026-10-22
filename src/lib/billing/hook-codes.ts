/**
 * Which application events attract which StrataVerze usage fee (pure).
 */

/** Recovery step types that are priced, mapped to their price book variant. */
const RECOVERY_STEP_VARIANTS: Record<string, string> = {
  REMINDER_NOTICE: "REMINDER",
  FINAL_NOTICE: "FINAL_NOTICE",
  LEGAL_REFERRAL: "REFERRAL",
};

/** The RECOVERY_STEP price variant for a debt recovery step, or null if unpriced. */
export function recoveryFeeVariant(stepType: string): string | null {
  return RECOVERY_STEP_VARIANTS[stepType] ?? null;
}

/** Meeting types whose notice attracts the MEETING_EGM fee. AGMs are covered by the subscription. */
export function isChargeableMeetingType(meetingType: string | null | undefined): boolean {
  const t = String(meetingType ?? "").toUpperCase();
  return t === "EGM" || t === "EXTRAORDINARY" || t.includes("ADJOURN") || t === "SGM";
}

/** Works contract statuses that mean the contract has been executed. */
export function isExecutedContractStatus(status: string | null | undefined): boolean {
  return ["EXECUTED", "ACTIVE"].includes(String(status ?? "").toUpperCase());
}
