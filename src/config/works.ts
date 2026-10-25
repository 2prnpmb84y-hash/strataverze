/**
 * The works marketplace (decided 25 Oct 2026; plan:
 * https://claude.ai/artifact/VAj6SJ5PrsVry3HJ5RAYbF). Settings and lists
 * that are StrataVerze's own choices, not statute. Statutory rules are in
 * src/config/statutory.ts.
 */

/**
 * The trades a works request is raised under and contractors are matched by.
 * One list, so a request and a contractor's trades can be compared exactly.
 */
export const WORKS_TRADES = [
  "Plumbing",
  "Electrical",
  "Roofing and gutters",
  "Painting",
  "Carpentry and joinery",
  "Locksmith and security",
  "Glazing",
  "Waterproofing",
  "Tiling",
  "Concreting and paving",
  "Drainage",
  "Air conditioning and ventilation",
  "Fire safety",
  "Lifts",
  "Pest control",
  "Cleaning",
  "Gardening and landscaping",
  "Pools",
  "Intercoms and access control",
  "General building and maintenance",
  "Other",
] as const;

export type WorksTrade = (typeof WORKS_TRADES)[number];

export function isWorksTrade(value: unknown): value is WorksTrade {
  return typeof value === "string" && (WORKS_TRADES as readonly string[]).includes(value);
}

/**
 * How many committee members must agree a works decision, set per building
 * (25 Oct 2026). Decisions are made by electronic vote in StrataVerze, with
 * no meeting needed (Matthew's reading of SSMA Sch 2 as in force).
 */
export const APPROVAL_RULES = {
  ONE: "Any one committee member",
  TWO: "Two committee members",
  MAJORITY: "A majority of the committee",
} as const;

export type ApprovalRule = keyof typeof APPROVAL_RULES;

export const DEFAULT_APPROVAL_RULE: ApprovalRule = "TWO";

export function isApprovalRule(value: unknown): value is ApprovalRule {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(APPROVAL_RULES, value);
}

/** Photos an owner may attach to one works request. */
export const WORKS_PHOTOS_MAX = 6;

/**
 * Marketplace quotes (works stage 3, decided 25 Oct 2026): the committee sets
 * the deadlines per request; these are the defaults.
 */
export const MARKETPLACE_DEFAULTS = {
  /** Days contractors have to express interest. */
  interestDays: 3,
  /** Days invited contractors have to quote. */
  quoteDays: 7,
  /** How many contractors the committee invites, by default. */
  inviteLimit: 3,
  /** The most the committee may invite to one request. */
  maxInviteLimit: 10,
} as const;
