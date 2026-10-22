/**
 * Price book fixture for tests, using the prices in the platform billing brief.
 * The live prices are seeded in the database, not read from here.
 */
import type { PriceBookEntry } from "./price-book";

const base = { gstInclusive: false, effectiveFrom: "2026-01-01", isActive: true } as const;

export const TEST_PRICE_BOOK: PriceBookEntry[] = [
  { ...base, code: "SUBSCRIPTION_SMALL", description: "Small scheme subscription (up to 10 lots)", amountCents: 4900, unit: "PER_MONTH", payerType: "OC" },
  { ...base, code: "SUBSCRIPTION_MEDIUM", description: "Medium scheme subscription (11 to 50 lots)", amountCents: 14900, unit: "PER_MONTH", payerType: "OC" },
  { ...base, code: "SUBSCRIPTION_LARGE", description: "Large scheme subscription (51 to 150 lots)", amountCents: 34900, unit: "PER_MONTH", payerType: "OC" },
  { ...base, code: "TXN_FEE", description: "Transaction fee, payment under $500", amountCents: 150, unit: "PER_EVENT", payerType: "OC", bandMin: 1, bandMax: 49_999 },
  { ...base, code: "TXN_FEE", description: "Transaction fee, payment $500 to $5,000", amountCents: 250, unit: "PER_EVENT", payerType: "OC", bandMin: 50_000, bandMax: 500_000 },
  { ...base, code: "TXN_FEE", description: "Transaction fee, payment over $5,000", amountCents: 500, unit: "PER_EVENT", payerType: "OC", bandMin: 500_001 },
  { ...base, code: "TXN_FEE_FLAT", description: "Transaction fee, flat (pilot)", amountCents: 250, unit: "PER_EVENT", payerType: "OC" },
  { ...base, code: "MEETING_EGM", description: "General meeting (EGM or adjourned)", amountCents: 5500, unit: "PER_EVENT", payerType: "OC" },
  { ...base, code: "BALLOT", description: "Electronic ballot", amountCents: 2500, unit: "PER_EVENT", payerType: "OC" },
  { ...base, code: "RECOVERY_STEP", variant: "REMINDER", description: "Debt recovery: reminder", amountCents: 1500, unit: "PER_STEP", payerType: "OWNER_VIA_OC", recoverableFromOwner: true },
  { ...base, code: "RECOVERY_STEP", variant: "REFERRAL", description: "Debt recovery: referral", amountCents: 6000, unit: "PER_STEP", payerType: "OWNER_VIA_OC", recoverableFromOwner: true },
  { ...base, code: "ACCOUNTANT_SEAT", description: "External accountant seat", amountCents: 2000, unit: "PER_SEAT_MONTH", payerType: "OC" },
  { ...base, code: "WORKS_CONTRACT", description: "Works contract (band 1)", amountCents: 15000, unit: "PER_EVENT", payerType: "OC", bandMin: 0, bandMax: 1_000_000 },
  { ...base, code: "WORKS_CONTRACT", description: "Works contract (band 2)", amountCents: 30000, unit: "PER_EVENT", payerType: "OC", bandMin: 1_000_001, bandMax: 5_000_000 },
  { ...base, code: "WORKS_CONTRACT", description: "Works contract (band 3)", amountCents: 50000, unit: "PER_EVENT", payerType: "OC", bandMin: 5_000_001 },
  { ...base, code: "PAPER_NOTICE", description: "Paper notice margin", amountCents: 100, unit: "PER_NOTICE", payerType: "OC" },
  { ...base, code: "CLAIM_HANDLING", description: "Insurance claim handling", amountCents: 10000, unit: "PER_EVENT", payerType: "OC", isActive: false },
];
