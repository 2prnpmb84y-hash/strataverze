/**
 * The payment form's words for the owner's buildings (QLD finance wording
 * review, 28 Oct 2026). Where every building uses the same word for a levy,
 * the form names it ("Levy Notice (optional)"). Where they differ, the form
 * just says "Notice", so it never reads "Levy or Contribution Notice".
 */
import type { PackWords } from "@/lib/jurisdiction/screen-words";

export interface PaymentFormWords {
  noticeField: string;
  noticePrompt: string;
  referenceExample: string;
}

export function paymentFormWords(w: Pick<PackWords, "levy" | "Levy">, levyWords: readonly string[]): PaymentFormWords {
  if (new Set(levyWords).size > 1) {
    return { noticeField: "Notice (optional)", noticePrompt: "Select a notice...", referenceExample: "e.g. Q1 2026 Lot 5" };
  }
  return { noticeField: `${w.Levy} Notice (optional)`, noticePrompt: `Select a ${w.levy} notice...`, referenceExample: `e.g. ${w.Levy} Q1 2026 Lot 5` };
}
