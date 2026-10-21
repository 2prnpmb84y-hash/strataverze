/**
 * Insurance domain constants (pure, no DB).
 *
 * These enumerations are the configurable vocabularies used across the
 * insurance section. They are intentionally not exhaustive of every possible
 * cover, and categories are not assumed to apply to every policy.
 */

// ─── Policy ──────────────────────────────────────────────────────

export const POLICY_TYPES = [
  "STRATA",
  "BUILDING",
  "PUBLIC_LIABILITY",
  "WORKERS_COMP",
  "OFFICE_BEARERS",
  "FIDELITY_GUARANTEE",
  "MACHINERY",
  "VOLUNTARY_WORKERS",
  "OTHER",
] as const;
export type PolicyType = (typeof POLICY_TYPES)[number];

export const POLICY_TYPE_LABELS: Record<string, string> = {
  STRATA: "Strata / residential",
  BUILDING: "Building",
  PUBLIC_LIABILITY: "Public liability",
  WORKERS_COMP: "Workers compensation",
  OFFICE_BEARERS: "Office bearers' liability",
  FIDELITY_GUARANTEE: "Fidelity guarantee",
  MACHINERY: "Machinery breakdown",
  VOLUNTARY_WORKERS: "Voluntary workers",
  OTHER: "Other",
};

/**
 * Stored policy lifecycle status. Kept separate from renewal status: a policy
 * can be ACTIVE while its renewal is UNDER_REVIEW.
 */
export const POLICY_STATUSES = [
  "DRAFT",
  "UPCOMING",
  "ACTIVE",
  "EXPIRED",
  "CANCELLED",
] as const;
export type PolicyStatus = (typeof POLICY_STATUSES)[number];

// ─── Coverage ────────────────────────────────────────────────────

export const COVERAGE_CATEGORIES = [
  "BUILDING",
  "COMMON_CONTENTS",
  "PUBLIC_LIABILITY",
  "OFFICE_BEARERS",
  "MACHINERY_BREAKDOWN",
  "FIDELITY_GUARANTEE",
  "LOSS_OF_RENT",
  "VOLUNTARY_WORKERS",
  "FLOOD",
  "CATASTROPHE",
  "OTHER",
] as const;
export type CoverageCategory = (typeof COVERAGE_CATEGORIES)[number];

export const COVERAGE_CATEGORY_LABELS: Record<string, string> = {
  BUILDING: "Building",
  COMMON_CONTENTS: "Common contents",
  PUBLIC_LIABILITY: "Public liability",
  OFFICE_BEARERS: "Office bearers' liability",
  MACHINERY_BREAKDOWN: "Machinery breakdown",
  FIDELITY_GUARANTEE: "Fidelity guarantee",
  LOSS_OF_RENT: "Loss of rent",
  VOLUNTARY_WORKERS: "Voluntary workers",
  FLOOD: "Flood",
  CATASTROPHE: "Catastrophe",
  OTHER: "Other",
};

// ─── Premium line items ──────────────────────────────────────────

export const PREMIUM_KINDS = [
  "BASE",
  "TAX",
  "DUTY",
  "LEVY",
  "FEE",
  "COMMISSION",
  "OTHER",
] as const;
export type PremiumKind = (typeof PREMIUM_KINDS)[number];

export const PREMIUM_KIND_LABELS: Record<string, string> = {
  BASE: "Base premium",
  TAX: "GST / tax",
  DUTY: "Stamp duty",
  LEVY: "Levy",
  FEE: "Fee",
  COMMISSION: "Commission",
  OTHER: "Other",
};

// ─── Documents ───────────────────────────────────────────────────

export const DOCUMENT_CATEGORIES = [
  "POLICY_SCHEDULE",
  "POLICY_WORDING_PDS",
  "CERTIFICATE_OF_CURRENCY",
  "ENDORSEMENT",
  "PREMIUM_INVOICE",
  "PAYMENT_RECEIPT",
  "VALUATION_REPORT",
  "BROKER_CORRESPONDENCE",
  "CLAIM_EVIDENCE",
  "RENEWAL_NOTICE",
  "QUOTE",
  "APPROVAL_EVIDENCE",
  "OTHER",
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export const DOCUMENT_CATEGORY_LABELS: Record<string, string> = {
  POLICY_SCHEDULE: "Policy schedule",
  POLICY_WORDING_PDS: "Policy wording / PDS",
  CERTIFICATE_OF_CURRENCY: "Certificate of currency",
  ENDORSEMENT: "Endorsement",
  PREMIUM_INVOICE: "Premium invoice",
  PAYMENT_RECEIPT: "Payment receipt",
  VALUATION_REPORT: "Valuation report",
  BROKER_CORRESPONDENCE: "Broker correspondence",
  CLAIM_EVIDENCE: "Claim evidence",
  RENEWAL_NOTICE: "Renewal notice",
  QUOTE: "Quote",
  APPROVAL_EVIDENCE: "Approval evidence",
  OTHER: "Other supporting document",
};

// ─── Claims ──────────────────────────────────────────────────────

export const CLAIM_CATEGORIES = [
  "WATER_DAMAGE",
  "FIRE",
  "STORM",
  "FLOOD",
  "IMPACT",
  "THEFT_BURGLARY",
  "MALICIOUS_DAMAGE",
  "GLASS",
  "LIABILITY",
  "MACHINERY_BREAKDOWN",
  "OFFICE_BEARERS",
  "OTHER",
] as const;
export type ClaimCategory = (typeof CLAIM_CATEGORIES)[number];

export const CLAIM_CATEGORY_LABELS: Record<string, string> = {
  WATER_DAMAGE: "Water damage",
  FIRE: "Fire",
  STORM: "Storm",
  FLOOD: "Flood",
  IMPACT: "Impact",
  THEFT_BURGLARY: "Theft / burglary",
  MALICIOUS_DAMAGE: "Malicious damage",
  GLASS: "Glass",
  LIABILITY: "Liability",
  MACHINERY_BREAKDOWN: "Machinery breakdown",
  OFFICE_BEARERS: "Office bearers",
  OTHER: "Other",
};

export const CLAIM_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  ACKNOWLEDGED: "Acknowledged",
  UNDER_ASSESSMENT: "Under assessment",
  FURTHER_INFO_REQUIRED: "Further information required",
  APPROVED: "Approved",
  PARTIALLY_APPROVED: "Partially approved",
  DECLINED: "Declined",
  WITHDRAWN: "Withdrawn",
  CLOSED: "Closed",
};

export const REPORTER_TYPES = ["STRATA_MANAGER", "LOT_OWNER"] as const;
export type ReporterType = (typeof REPORTER_TYPES)[number];

export const REPORTER_TYPE_LABELS: Record<string, string> = {
  STRATA_MANAGER: "Strata manager",
  LOT_OWNER: "Lot owner",
};

// ─── Renewal ─────────────────────────────────────────────────────

export const RENEWAL_STAGE_LABELS: Record<string, string> = {
  NOT_STARTED: "Not started",
  INFORMATION_REQUIRED: "Information required",
  QUOTES_REQUESTED: "Quotes requested",
  QUOTES_RECEIVED: "Quotes received",
  UNDER_REVIEW: "Under review",
  AWAITING_APPROVAL: "Awaiting approval",
  PLACEMENT_REQUESTED: "Placement requested",
  COVER_CONFIRMED: "Cover confirmed",
  COMPLETED: "Completed",
  NOT_PROCEEDING: "Not proceeding",
};

export const DEFAULT_CURRENCY = "AUD";
