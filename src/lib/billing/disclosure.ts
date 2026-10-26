/**
 * Fee disclosure (pure, safe to import in the browser). Every StrataVerze
 * charge is shown to the person taking the action, including GST, with a
 * one-line explanation, before the action is confirmed (hard rule 6).
 */
import type { FeeQuote } from "./fee-engine";
import { formatAud } from "./money";

/** What the disclosure box shows. Serializable, so pages can pass it to client forms. */
export interface FeeView {
  code: string;
  variant: string | null;
  description: string;
  explanation: string;
  exGstCents: number;
  gstCents: number;
  totalCents: number;
  payerLabel: string;
  recoverableFromOwner: boolean;
}

export const EXPLANATIONS: Record<string, string> = {
  TXN_FEE: "StrataVerze's flat service fee for processing this payment. It is charged to the owners corporation, never added to an owner's levy.",
  TXN_FEE_FLAT: "StrataVerze's flat service fee for processing this payment. It is charged to the owners corporation, never added to an owner's levy.",
  MEETING_EGM: "StrataVerze charges a flat fee for each extraordinary or adjourned general meeting it runs. AGMs are included in the subscription.",
  BALLOT: "StrataVerze charges a flat fee for running an electronic ballot.",
  RECOVERY_STEP: "StrataVerze charges a flat fee for this debt recovery step. The owners corporation may recover it from the owner in arrears.",
  S184_CERTIFICATE: "The prescribed fee for a strata information certificate, paid by the person requesting it.",
  S182_INSPECTION: "The prescribed fee for inspecting the owners corporation's records, paid by the person requesting it.",
  TRANSFER: "StrataVerze charges a flat fee for processing a change of ownership.",
  YEAR_END_PACK: "StrataVerze charges a flat fee for preparing the year-end pack.",
  ACCOUNTANT_SEAT: "StrataVerze charges a flat monthly fee for each external accountant or auditor with access to the scheme.",
  CLAIM_HANDLING: "StrataVerze charges a flat fee for handling an insurance claim.",
  WORKS_CONTRACT: "StrataVerze charges a flat fee by contract value band for managing an executed works contract. It is never a percentage of the contract.",
  WORKS_VARIATION: "StrataVerze charges a flat fee for each approved contract variation.",
  PAPER_NOTICE: "The mail house cost plus StrataVerze's flat margin for a paper notice.",
  DEVELOPER_SETUP: "StrataVerze's flat set-up fee for a new scheme, paid by the developer.",
  EDUCATION: "StrataVerze's annual committee education subscription.",
  COMPLIANCE_VERIFICATION: "StrataVerze checks the contractor's licences, insurance and ABN once a year. Paid by the contractor.",
  SUPPLIER_PLAN: "The flat monthly StrataVerze Contractor plan. Paid by the contractor, never by the scheme.",
};

export const PAYER_LABELS: Record<string, string> = {
  OC: "Charged to the owners corporation",
  OWNER_VIA_OC: "Charged to the owners corporation and recoverable from the owner in arrears (SSMA s 86)",
  REQUESTING_PARTY: "Paid by the person requesting it",
  INCOMING_OWNER: "Paid by the incoming owner",
  DEVELOPER: "Paid by the developer",
  SUPPLIER: "Paid by the supplier",
};

/** Explanations for one variant of a fee, where it differs from the fee's own. */
export const VARIANT_EXPLANATIONS: Record<string, string> = {
  "RECOVERY_STEP:PAYMENT_PLAN": "StrataVerze charges a flat fee for setting up a payment plan. It is charged to the owners corporation and cannot be passed to the owner.",
};

export function toFeeView(quote: FeeQuote): FeeView {
  return {
    code: quote.code,
    variant: quote.variant,
    description: quote.description,
    explanation: VARIANT_EXPLANATIONS[`${quote.code}:${quote.variant ?? ""}`] ?? EXPLANATIONS[quote.code] ?? "A StrataVerze charge for this action.",
    exGstCents: quote.exGstCents,
    gstCents: quote.gstCents,
    totalCents: quote.totalCents,
    payerLabel: PAYER_LABELS[quote.payerType] ?? "Charged to the owners corporation",
    recoverableFromOwner: quote.recoverableFromOwner,
  };
}

export class FeeConfirmationError extends Error {}

export interface ConfirmedDisclosure {
  shownToId: string;
  shownAt: string;
  amountCents: number;
}

/**
 * Check the user confirmed the fee that applies. `confirmedCents` is the
 * amount (including GST) the user saw and confirmed. Throws when there is a
 * fee and it was not confirmed, or the confirmed amount is out of date.
 */
export function resolveDisclosure(
  quote: FeeQuote | null,
  confirmedCents: number | null | undefined,
  shownToId: string,
  now: Date = new Date(),
): ConfirmedDisclosure | null {
  if (!quote) return null;
  if (confirmedCents == null || Number.isNaN(confirmedCents)) {
    throw new FeeConfirmationError(
      `Confirm the StrataVerze fee of ${formatAud(quote.totalCents)} (incl. GST) to continue.`,
    );
  }
  if (confirmedCents !== quote.totalCents) {
    throw new FeeConfirmationError(
      `The StrataVerze fee for this is now ${formatAud(quote.totalCents)} (incl. GST). Review it and confirm again.`,
    );
  }
  return { shownToId, shownAt: now.toISOString(), amountCents: confirmedCents };
}

/** Read the confirmed fee amount from a form (field feeConfirmedCents). */
export function confirmedCentsFrom(formData: FormData): number | null {
  const raw = formData.get("feeConfirmedCents");
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) ? n : null;
}

/** The message to show when an action failed because its fee was not confirmed. */
export function feeErrorMessage(err: unknown): string | null {
  return err instanceof FeeConfirmationError ? err.message : null;
}
