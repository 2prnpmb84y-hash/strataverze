/**
 * Insurance referral income (pure). StrataVerze records, and shows in
 * dollars, any commission a broker or underwriter partner pays it on a
 * scheme's policy. StrataVerze does not quote, compare, recommend or place
 * insurance. Switched off unless PLATFORM_REFERRAL_INCOME=on.
 */
import { formatAud } from "./money";

export function referralIncomeEnabled(): boolean {
  return process.env.PLATFORM_REFERRAL_INCOME === "on";
}

/**
 * The default disclosure wording. {partner} and {amount} are filled in. It
 * can be replaced with PLATFORM_REFERRAL_DISCLOSURE, and edited per record.
 */
export const DEFAULT_REFERRAL_DISCLOSURE =
  "StrataVerze received {amount} from {partner} in connection with this policy. " +
  "StrataVerze introduced the owners corporation to {partner} and records this payment so the owners can see it. " +
  "StrataVerze does not give insurance advice and does not quote, compare, recommend or arrange cover. " +
  "It does not act for the insurer or for the owners corporation in the placement, and no part of this payment goes to the strata manager.";

export function referralDisclosureTemplate(): string {
  const custom = process.env.PLATFORM_REFERRAL_DISCLOSURE?.trim();
  return custom || DEFAULT_REFERRAL_DISCLOSURE;
}

/** Fill the disclosure template for one payment. */
export function renderReferralDisclosure(template: string, input: { partnerName: string; amountCents: number }): string {
  return template.replaceAll("{partner}", input.partnerName.trim()).replaceAll("{amount}", formatAud(input.amountCents));
}

export interface ReferralIncomeInput {
  schemeId: string;
  insurancePolicyId: string | null;
  partnerName: string;
  amountCents: number;
  receivedAt: string;
  disclosureText: string;
}

/** Why a referral income record is not valid, or null. */
export function referralIncomeProblem(input: ReferralIncomeInput, today: string): string | null {
  if (!input.schemeId) return "Choose the scheme.";
  if (!input.partnerName.trim()) return "Enter the partner's name.";
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) return "Enter the amount received, in dollars and cents.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.receivedAt)) return "Enter the date it was received.";
  if (input.receivedAt > today) return "The date received cannot be in the future.";
  if (!input.disclosureText.trim()) return "The disclosure text cannot be empty.";
  if (/\{(partner|amount)\}/.test(input.disclosureText)) return "Fill in the {partner} and {amount} placeholders.";
  return null;
}
