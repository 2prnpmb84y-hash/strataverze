/**
 * Fees and deadlines for information certificates (s 184) and records
 * inspections (s 182) (pure). The amounts and periods come from the
 * building's rule pack (`rules.SALE_CERTIFICATE`, `rules.RECORDS_INSPECTION`).
 */
import { addDays, addMonths } from "@/lib/levies/notice-plan";

export interface CertificateFeeRules {
  feeCents: number;
  repeatFeeCents: number;
  repeatWithinMonths: number;
}

/**
 * The fee for a certificate issued on `issuedOn`: the repeat fee when a
 * certificate for the same lot was issued within the repeat period before it.
 */
export function certificateFee(issuedOn: string, earlierIssuedOn: readonly string[], rules: CertificateFeeRules): { cents: number; repeat: boolean } {
  const repeat = earlierIssuedOn.some((d) => d <= issuedOn && addMonths(d, rules.repeatWithinMonths) >= issuedOn);
  return { cents: repeat ? rules.repeatFeeCents : rules.feeCents, repeat };
}

export type InspectorType = "OWNER" | "AUTHORISED_PERSON";
export interface InspectionRules {
  agreeWithinDays: number;
  setWithinDays: number;
  fees: Readonly<Record<InspectorType, { firstHourCents: number; extraHalfHourCents: number }>>;
}

/** The fee for an inspection of `minutes`: the first hour, then each further half hour (a part counted as a whole). */
export function inspectionFee(type: InspectorType, minutes: number, rules: InspectionRules): number {
  const f = rules.fees[type];
  if (!(minutes > 0)) return 0;
  const extra = Math.max(0, Math.ceil((minutes - 60) / 30));
  return f.firstHourCents + extra * f.extraHalfHourCents;
}

/**
 * The dates that follow a request: the time and place are to be agreed
 * within `agreeWithinDays`; failing that, the owners corporation may set a
 * date within `setWithinDays` of the request by written notice.
 */
export function inspectionDeadlines(requestedOn: string, rules: Pick<InspectionRules, "agreeWithinDays" | "setWithinDays">) {
  return { agreeBy: addDays(requestedOn, rules.agreeWithinDays), setBy: addDays(requestedOn, rules.setWithinDays) };
}
