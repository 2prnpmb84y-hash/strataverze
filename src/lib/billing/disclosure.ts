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

/**
 * The building's words for a fee disclosure (stage 2, step 8, 27 Oct 2026):
 * its name for the owners corporation and, where its pack says it
 * differently, how a recovery fee can be passed to the owner
 * (RECOVERY_COSTS_RECOVERABLE). `recoverable` null keeps the NSW text above,
 * unchanged.
 */
export interface FeeWording {
  ownersCorporation: string;
  recoverable: string | null;
}

const NSW_WORDING: FeeWording = { ownersCorporation: "owners corporation", recoverable: null };

/** A building's fee wording from its rule pack (pass `rules`). */
export function feeWordingFor(rules: { TERMINOLOGY: { ownersCorporation: string }; RECOVERY_COSTS_RECOVERABLE?: string }): FeeWording {
  return { ownersCorporation: rules.TERMINOLOGY.ownersCorporation, recoverable: rules.RECOVERY_COSTS_RECOVERABLE ?? null };
}

/** The NSW sentences that say a fee is recoverable, replaced where a pack words it differently. */
const NSW_RECOVERY_SENTENCE = "The owners corporation may recover it from the owner in arrears.";
const NSW_RECOVERABLE_PAYER = "and recoverable from the owner in arrears (SSMA s 86)";

/** How a variant explanation starts when the fee can be passed to the owner (its NSW text says it cannot). */
const RECOVERABLE_VARIANT_LEADS: Record<string, string> = {
  "RECOVERY_STEP:PAYMENT_PLAN": "StrataVerze charges a flat fee for setting up a payment plan.",
};

const DEFAULT_EXPLANATION = "A StrataVerze charge for this action.";
const DEFAULT_PAYER = "Charged to the owners corporation";

const isNsw = (w: FeeWording) => w.recoverable == null && w.ownersCorporation === NSW_WORDING.ownersCorporation;
const named = (text: string, w: FeeWording) => text.split(NSW_WORDING.ownersCorporation).join(w.ownersCorporation);

function explanationFor(quote: FeeQuote, w: FeeWording): string {
  const key = `${quote.code}:${quote.variant ?? ""}`;
  if (isNsw(w)) return VARIANT_EXPLANATIONS[key] ?? EXPLANATIONS[quote.code] ?? DEFAULT_EXPLANATION;
  const recoverable = w.recoverable ? `It ${w.recoverable}.` : null;
  // A variant whose text says it cannot be passed to the owner, where this building's pack lets it be.
  if (VARIANT_EXPLANATIONS[key] && quote.recoverableFromOwner && RECOVERABLE_VARIANT_LEADS[key]) {
    return named(`${RECOVERABLE_VARIANT_LEADS[key]} ${recoverable ?? NSW_RECOVERY_SENTENCE}`, w);
  }
  const text = VARIANT_EXPLANATIONS[key] ?? EXPLANATIONS[quote.code] ?? DEFAULT_EXPLANATION;
  return named(recoverable ? text.split(NSW_RECOVERY_SENTENCE).join(recoverable) : text, w);
}

function payerLabelFor(quote: FeeQuote, w: FeeWording): string {
  const text = PAYER_LABELS[quote.payerType] ?? DEFAULT_PAYER;
  if (isNsw(w)) return text;
  return named(w.recoverable ? text.split(NSW_RECOVERABLE_PAYER).join(`and ${w.recoverable}`) : text, w);
}

/**
 * What the disclosure box shows for a quote. Pass the building's `wording`
 * (feeWordingFor) where the building is at hand. Without it the NSW words
 * are used.
 */
export function toFeeView(quote: FeeQuote, wording: FeeWording = NSW_WORDING): FeeView {
  return {
    code: quote.code,
    variant: quote.variant,
    description: quote.description,
    explanation: explanationFor(quote, wording),
    exGstCents: quote.exGstCents,
    gstCents: quote.gstCents,
    totalCents: quote.totalCents,
    payerLabel: payerLabelFor(quote, wording),
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
