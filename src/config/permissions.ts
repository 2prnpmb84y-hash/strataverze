import type { PortalRole } from "@/lib/auth/require-membership";

/**
 * The permissions matrix as code. Each capability lists the scheme roles that
 * hold it. A person's roles are checked on the specific scheme in hand, so
 * someone who is an adviser on one building and an owner on another gets
 * each building's rules separately.
 *
 * Capabilities answer "may this role do this kind of thing on this scheme".
 * Every action must ALSO check that the record it touches belongs to that
 * scheme (and, for owners and suppliers, to their own lot or assignment);
 * see src/lib/auth/scheme-scope.ts.
 *
 * Source: the permissions matrix in docs/security/findings-and-plan.md,
 * approved 23 October 2026. Platform admins are handled separately
 * (requirePlatformAdmin) and every use of that access is audited.
 */
export const CAPABILITIES = {
  /** Building profile, settings, deletion. */
  "scheme.manage": ["ADVISER"],
  /** The building's security audit log (read-only). Platform admins read every building's. */
  "audit.read": ["ADVISER"],
  /** Invitations, memberships, roles. */
  "members.manage": ["ADVISER"],
  /** Lots, entitlements, lot workflow records (tenants, proxies, powers of attorney). */
  "lots.manage": ["ADVISER"],
  /** The strata roll's owner details: change of owner, owner contact details (24 Oct). */
  "roll.manage": ["ADVISER", "COMMITTEE"],

  /** Ledger, bank, reconciliation, reports. The treasurer also reads finance through canReadSchemeFinance. */
  "finance.read": ["ADVISER", "ACCOUNTANT"],
  /** Journals, levies, invoices, periods, bank accounts, account codes, matching rules. */
  "finance.write": ["ADVISER"],

  /** Meetings, notices, agendas, minutes, ballots in the adviser portal. */
  "governance.manage": ["ADVISER"],
  /**
   * Committee business in the owner portal: committee meetings and motions,
   * and calling general meetings (decided 23 Oct 2026: the committee as well
   * as the adviser may call an AGM or EGM, as in self-managed buildings).
   */
  "governance.committee": ["COMMITTEE", "ADVISER"],
  /** Voting at general meetings and on ballots: owners, per lot. */
  "governance.vote.owner": ["OWNER"],
  /** Voting on committee motions. */
  "governance.vote.committee": ["COMMITTEE"],

  /** Full control of the scheme document library. */
  "documents.manage": ["ADVISER"],
  /** The building vault (trial, 24 Oct 2026): reading it, its timeline and checks. */
  "vault.read": ["ADVISER"],
  /** Opening the vault, adding versions and notes, running checks and exporting evidence. */
  "vault.manage": ["ADVISER"],
  /** Publishing official documents (minutes, by-laws, financial). */
  "documents.publish": ["ADVISER", "COMMITTEE"],

  /** Insurance policies, claims, renewals. */
  "insurance.manage": ["ADVISER"],
  "insurance.read": ["ADVISER", "COMMITTEE", "OWNER"],

  /** Raising maintenance requests. Owners see all of their building's work orders (decided 23 Oct 2026). */
  "maintenance.request": ["OWNER", "COMMITTEE"],
  /** Managing work orders. */
  "maintenance.manage": ["ADVISER", "COMMITTEE"],

  /** Works module: requests, scopes, RFQs, contracts, variations, invoices. */
  "works.manage": ["ADVISER"],
  "works.read": ["ADVISER", "COMMITTEE", "ACCOUNTANT"],
  /** Approval decisions, further limited by each approval route's approver roles. */
  "works.approve": ["COMMITTEE", "ADVISER"],
  /** Recording payments against works invoices. */
  "works.payments": ["ADVISER"],

  "compliance.manage": ["ADVISER"],
  "announcements.manage": ["ADVISER"],
  "debt.manage": ["ADVISER", "COMMITTEE"],
} as const satisfies Record<string, readonly PortalRole[]>;

export type Capability = keyof typeof CAPABILITIES;

/** The roles that hold a capability. */
export function rolesFor(capability: Capability): PortalRole[] {
  return [...CAPABILITIES[capability]];
}

/** Whether any of the given roles holds the capability. */
export function rolesAllow(roles: readonly string[], capability: Capability): boolean {
  const allowed = CAPABILITIES[capability] as readonly string[];
  return roles.some((r) => allowed.includes(r));
}
