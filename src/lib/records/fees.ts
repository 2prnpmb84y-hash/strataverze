/**
 * Fees and deadlines for certificates (NSW s 184, the Queensland body
 * corporate certificate) and records inspections (pure). The amounts and
 * periods come from the building's rule pack (`rules.CERTIFICATE`,
 * `rules.INSPECTIONS`).
 */
import type { StatutoryRules } from "@/config/statutory";
import { addDays, addMonths } from "@/lib/levies/notice-plan";

export type CertificateRule = NonNullable<StatutoryRules["CERTIFICATE"]>;
export type InspectionRule = NonNullable<StatutoryRules["INSPECTIONS"]>;
type FeeYearTable<T> = { yearStartsOn: string; byYear: Readonly<Record<string, T>> };

export interface CertificateFeeRules {
  feeCents: number;
  repeatFeeCents: number;
  repeatWithinMonths: number;
}

const withinRepeat = (issuedOn: string, earlierOn: string, months: number) => earlierOn <= issuedOn && addMonths(earlierOn, months) >= issuedOn;

/**
 * The fee for a certificate issued on `issuedOn`: the repeat fee when a
 * certificate for the same lot was issued within the repeat period before it.
 */
export function certificateFee(issuedOn: string, earlierIssuedOn: readonly string[], rules: CertificateFeeRules): { cents: number; repeat: boolean } {
  const repeat = earlierIssuedOn.some((d) => withinRepeat(issuedOn, d, rules.repeatWithinMonths));
  return { cents: repeat ? rules.repeatFeeCents : rules.feeCents, repeat };
}

/** The financial year a date falls in, as the fee tables key it ("2026-27"), for a year starting on `yearStartsOn` (MM-DD). */
export function feeYear(date: string, yearStartsOn: string): string {
  const year = Number(date.slice(0, 4));
  const start = date.slice(5, 10) >= yearStartsOn ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** The dollar amounts for the financial year of `date`, or null when the pack has none for that year yet. */
export function feeTableFor<T>(table: FeeYearTable<T>, date: string): T | null {
  return table.byYear[feeYear(date, table.yearStartsOn)] ?? null;
}

const samePerson = (a: string, b: string) => a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * The fee for a certificate issued on `issuedOn`, from the pack, or null when
 * the pack holds no dollar amounts for the financial year of `feeOn` (the day
 * the written request was received; the issue day if not given). `earlier`
 * are the lot's issued certificates. Where the repeat fee is for the same
 * person only (Queensland), it applies to an earlier certificate for a
 * requester of the same name.
 */
export function certificateFeeFor(
  rule: CertificateRule["fee"],
  issuedOn: string,
  earlier: readonly { issuedOn: string; requesterName: string }[],
  requesterName: string,
  feeOn: string = issuedOn,
): { cents: number; repeat: boolean } | null {
  if (rule.basis === "CENTS") return certificateFee(issuedOn, earlier.map((e) => e.issuedOn), rule);
  const dollars = feeTableFor(rule.dollars, feeOn);
  if (!dollars) return null;
  const repeat = earlier.some((e) => samePerson(e.requesterName, requesterName) && withinRepeat(issuedOn, e.issuedOn, rule.repeatWithinMonths));
  return { cents: repeat ? dollars.repeatFeeCents : dollars.feeCents, repeat };
}

/** The day `businessDays` business days after `date`, skipping Saturdays and Sundays (public holidays are not held). */
export function addBusinessDays(date: string, businessDays: number): string {
  let d = date;
  for (let left = businessDays; left > 0; ) {
    d = addDays(d, 1);
    const weekday = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (weekday !== 0 && weekday !== 6) left--;
  }
  return d;
}

export type InspectorType = "OWNER" | "AUTHORISED_PERSON";
export interface InspectionRules {
  agreeWithinDays: number;
  setWithinDays: number;
  /** Fees by requester type. The pack keys them by its own types, so a type it does not price is refused below. */
  fees: Readonly<Partial<Record<string, { firstHourCents: number; extraHalfHourCents: number }>>>;
}

/** A requester type the pack has no fee for. */
export class UnknownInspectorTypeError extends Error {
  constructor(readonly inspectorType: string) {
    super(`The building's rules have no inspection fee for "${inspectorType}".`);
    this.name = "UnknownInspectorTypeError";
  }
}

/** The fee for an inspection of `minutes`: the first hour, then each further half hour (a part counted as a whole). */
export function inspectionFee(type: InspectorType, minutes: number, rules: InspectionRules): number {
  const f = rules.fees[type];
  if (!f) throw new UnknownInspectorTypeError(type);
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

type FeeUnitInspection = Extract<InspectionRule, { basis: "FEE_UNITS" }>;

/**
 * The fee for access to the records (Queensland): the owner's or the other
 * inspection fee if the records were inspected, and the fee for each page
 * copied, at the guidance's amount per page. Copies alone carry no inspection
 * fee. `feeOn` is the day the written request was received. Null when the
 * pack holds no dollar amounts for that date's financial year.
 */
export function accessFee(rule: FeeUnitInspection, input: { requesterType: string; inspected: boolean; copyPages: number; feeOn: string }): number | null {
  const dollars = feeTableFor(rule.dollars, input.feeOn);
  if (!dollars) return null;
  const inspection = input.inspected ? (rule.ownerFeeTypes.includes(input.requesterType) ? dollars.ownerCents : dollars.otherCents) : 0;
  return inspection + Math.max(0, input.copyPages) * dollars.copyPerPageCents;
}
