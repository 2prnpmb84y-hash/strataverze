/**
 * Sentences the certificate and inspection pages show about fees and
 * deadlines, from the building's pack (pure, stage 2, step 9). The NSW
 * sentences are the ones the pages showed before.
 */
import { addBusinessDays, feeTableFor, feeYear, type CertificateRule, type InspectionRule } from "./fees";

const aud = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** The certificate fee, as the new certificate card states it on `today`. */
export function certificateFeeText(c: CertificateRule, today: string): string {
  const f = c.fee;
  if (f.basis === "CENTS") return `Fee: ${aud(f.feeCents)}, or ${aud(f.repeatFeeCents)} for a further certificate for the lot within ${f.repeatWithinMonths} months (${f.source}).`;
  const dollars = feeTableFor(f.dollars, today);
  const further = `for a further certificate for the same person and lot within ${f.repeatWithinMonths} months`;
  if (!dollars) return `Fee: ${f.feeUnits} fee units, or ${f.repeatFeeUnits} ${further} (${f.source}). StrataVerze does not hold the dollar amounts for this financial year yet, so a certificate cannot be issued until they are added.`;
  return `Fee: ${aud(dollars.feeCents)} (${f.feeUnits} fee units), or ${aud(dollars.repeatFeeCents)} (${f.repeatFeeUnits} fee units) ${further}, at the amounts for ${feeYear(today, f.dollars.yearStartsOn)} (${f.source}).`;
}

/** When the certificate must be given, for a pack that sets a time (null otherwise). */
export function certificateDueText(c: CertificateRule, requestedOn: string): string | null {
  if (c.giveWithinBusinessDays == null) return null;
  return `Give it within ${c.giveWithinBusinessDays} business days after the written request and fee: by ${addBusinessDays(requestedOn, c.giveWithinBusinessDays)}. This skips weekends but not public holidays, so check.`;
}

/** The inspections page's summary of the rules (Queensland; the NSW summary is the page's own). */
export function accessRulesText(r: Extract<InspectionRule, { basis: "FEE_UNITS" }>, today: string, body: string): string {
  const dollars = feeTableFor(r.dollars, today);
  const fees = dollars
    ? `Fees for ${feeYear(today, r.dollars.yearStartsOn)}${r.feesIncludeGst ? ", including GST" : ", with no GST"}: an owner ${aud(dollars.ownerCents)} to inspect, anyone else ${aud(dollars.otherCents)}, and ${aud(dollars.copyPerPageCents)} for each page copied. Copies alone carry no inspection fee.`
    : `Fees in fee units: an owner ${r.feeUnits.owner} to inspect, anyone else ${r.feeUnits.other}, and ${r.feeUnits.copyPerPage} for each page copied. StrataVerze does not hold the dollar amounts for this financial year yet.`;
  return `${r.section}. The ${body} must let the person inspect the records, or give the copies asked for, within ${r.accessWithinDays} days after the written request and fee. ${fees}`;
}
