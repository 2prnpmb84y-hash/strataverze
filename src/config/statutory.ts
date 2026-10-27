/**
 * Statutory rules, by jurisdiction.
 *
 * Each jurisdiction has its own file in `src/config/statutory/` (decided
 * 26 Oct 2026, multi-jurisdiction plan). This file is the index: code imports
 * statutory rules from `@/config/statutory`, never from a jurisdiction file.
 *
 * `RULE_PACKS` lists the jurisdictions whose rules have been added and
 * reviewed. Only those can have buildings (see `@/config/jurisdictions`).
 * `statutoryRulesFor(state)` gives a building's rules and refuses a
 * jurisdiction without a pack, rather than falling back to NSW.
 *
 * The NSW rules are also exported under their existing names, for tests and
 * for `src/config`. Application code gets a building's rules from
 * `statutoryRulesFor(state)` or `rulesForScheme(schemeId)` instead
 * (`statutory.imports.test.ts` checks this), so no building is silently given
 * the NSW rules.
 *
 * Plan: https://claude.ai/artifact/4mgrKi2E7VeBdSqTSgZhyc
 */
import * as NSW from "./statutory/nsw";
import * as QLD from "./statutory/qld";
import type { MeetingRuleSet } from "@/lib/meetings/rules";
import type {
  DebtRecoveryRules,
  DebtRecoveryStepRule,
  EntitlementScheduleDefinition,
  FeeVariant,
  FundDefinition,
  LateChargeRules,
  NoticeRules,
  PackFeatures,
  PaymentAllocationPart,
  SharedTerminology,
} from "./statutory/types";

export * from "./statutory/nsw";

/** The NSW pack's rules, every one of them. */
export type NswRules = typeof NSW;

/**
 * What every pack provides (stage 2, 27 Oct 2026). Shared code may read these
 * for any building.
 */
export interface SharedRules {
  TERMINOLOGY: SharedTerminology;
  FUND_CATALOGUE: readonly FundDefinition[];
  ENTITLEMENT_SCHEDULES: readonly EntitlementScheduleDefinition[];
  /** The order a payment is applied to the levy, the late charge and recovery costs (stage 2, step 6). */
  PAYMENT_ALLOCATION_ORDER: readonly PaymentAllocationPart[];
  FEATURES: PackFeatures;
  /** The levy (NSW) or contribution (Queensland) notice rules (stage 2, step 5). */
  NOTICE_RULES: NoticeRules;
  /** The late charge on overdue levies: NSW interest, Queensland penalty (stage 2, step 6). */
  LATE_CHARGE: LateChargeRules;
  /** The meeting rules: notice, minutes, quorum, resolution categories and what each meeting may carry (stage 2, step 7). */
  MEETING_RULES: MeetingRuleSet;
  /*
   * Debt recovery (stage 2, step 8, 27 Oct 2026). Any pack may have these;
   * a pack with FEATURES.debtRecoverySteps has the steps, their guidance and
   * labels. Get one with `needRule`, which refuses a pack without it.
   */
  /** The recovery steps copied onto each new case. */
  DEBT_RECOVERY_STEPS?: readonly DebtRecoveryStepRule[];
  /** Adviser-only guidance for each step type. */
  DEBT_RECOVERY_GUIDANCE?: Readonly<Record<string, string>>;
  /** The name the screens show for each step type. */
  DEBT_RECOVERY_STEP_LABELS?: Readonly<Record<string, string>>;
  /** Recovery rules shared code reads (the Queensland 2 year rule). NSW has none. */
  DEBT_RECOVERY?: DebtRecoveryRules;
  /**
   * How the fee disclosure says a recovery fee can be passed to the owner in
   * arrears, after "Charged to the body corporate and": "may be recoverable
   * from the owner if reasonably incurred (Standard Module s 166(1)(c))".
   * Where a pack has none, the disclosure keeps its NSW wording.
   */
  RECOVERY_COSTS_RECOVERABLE?: string;
  /**
   * StrataVerze fees never passed to an owner in this jurisdiction, whatever
   * the price book says (stage 2, step 8). A pack without the key has none.
   */
  NEVER_RECOVERABLE_FEE_VARIANTS?: readonly FeeVariant[];
}

/**
 * A building's rules. Everything beyond SharedRules is in the NSW shape and
 * optional: code that needs one of those rules gets it with `needRule`, which
 * refuses a building whose pack does not have it, or checks FEATURES first.
 * As each area is made jurisdiction-neutral, its rule moves into SharedRules.
 */
export type StatutoryRules = SharedRules & Partial<Omit<NswRules, keyof SharedRules>>;

/** `needRule` and `RuleNotInPackError` live in a module with no pack data, so the browser can use them. */
export { needRule, RuleNotInPackError } from "./statutory/need-rule";

export interface RulePack {
  /** Jurisdiction code, for example AU-NSW. */
  code: string;
  /** The `state` value stored on a building. */
  state: string;
  name: string;
  /**
   * The pack's version, recorded on every levy notice, interest charge and
   * debt recovery case it is used for. Change it whenever any rule in the
   * pack changes (`statutory.version.test.ts` checks this).
   */
  version: string;
  /** Who signs off the pack (multi-jurisdiction plan, section 8). */
  reviewer: string;
  /** When the reviewer signed off the pack as a whole, or null if not yet. */
  reviewedOn: string | null;
  rules: StatutoryRules;
}

export const RULE_PACKS: Readonly<Record<string, RulePack>> = {
  NSW: {
    code: "AU-NSW",
    state: "NSW",
    name: "New South Wales",
    // 2026.10.2 (26 Oct 2026): wording added (TERMINOLOGY, CITATIONS, HARDSHIP_INFORMATION, DEBT_RECOVERY_GUIDANCE); no rule value changed.
    // 2026.10.3 (26 Oct 2026): audit test counts lots without parking and utility lots (s 95, confirmed by StrataVerze);
    // debt recovery steps and guidance redrafted from sources, for review.
    // 2026.10.4 (26 Oct 2026): PAYMENT_PLANS added (the payment plan workflow).
    // 2026.10.5 (26 Oct 2026): COMMITTEE_TRAINING added (committee training tracking).
    // 2026.10.6 (26 Oct 2026): ANNUAL_REPORTING and RECORD_RETENTION added (Strata Hub reports, record keeping);
    // the audit lots test also leaves out common property rows (decided by StrataVerze).
    // 2026.10.7 (26 Oct 2026): SALE_CERTIFICATE and RECORDS_INSPECTION added (s 184 certificates, s 182 inspections).
    // 2026.10.8 (27 Oct 2026): FUND_CATALOGUE and ENTITLEMENT_SCHEDULES added (the funds and unit entitlement as data); no rule value changed.
    // 2026.10.9 (27 Oct 2026): FEATURES added (which NSW workflows the pack switches on); no rule value changed.
    // 2026.10.10 (27 Oct 2026): TERMINOLOGY gains levy, levies, lateCharge, planLabel, bodyCorporateName and
    // bodyCorporateShortName (wording only); no rule value changed.
    // 2026.10.11 (27 Oct 2026): FUND_CATALOGUE gains display labels (wording only); no rule value changed.
    // 2026.10.12 (27 Oct 2026): NOTICE_RULES added (the notice rules in the shared shape, from LEVY_NOTICE_RULES and HARDSHIP_INFORMATION); no rule value changed.
    // 2026.10.13 (27 Oct 2026): LATE_CHARGE added (the interest rule in the shared shape, from STATUTORY_INTEREST); no rule value changed.
    // 2026.10.14 (27 Oct 2026): MEETING_RULES in the shared shape (resolution labels, committee and general meeting categories); no rule value changed.
    // 2026.10.15 (27 Oct 2026): DEBT_RECOVERY_STEP_LABELS added (the step labels the screens show) and
    // NEVER_RECOVERABLE_FEE_VARIANTS (the fee never passed to an owner, moved from the fee engine unchanged); no rule value changed.
    version: "2026.10.15",
    reviewer: "Matthew Wrigley",
    // The NSW rules were in use before the plan. Several were confirmed one by
    // one (dates noted on each in nsw.ts), but the pack as a whole has not
    // yet been signed off.
    reviewedOn: null,
    rules: NSW,
  },
};

/**
 * A jurisdiction's rules that are written but not yet applied (phase 2,
 * 27 Oct 2026): a DRAFT while being reviewed, REVIEWED once the reviewer signs
 * them off. Neither is ever given to a building: `rulePackFor` and
 * `statutoryRulesFor` read RULE_PACKS only, and the state is not supported for
 * new buildings. A pack moves to RULE_PACKS, with the shared rule shape, when
 * the platform can apply it (stage 2).
 */
export interface PendingRulePack<R> {
  code: string;
  state: string;
  name: string;
  version: string;
  status: "DRAFT" | "REVIEWED";
  reviewer: string;
  /** When the reviewer signed the pack off (REVIEWED), or null (DRAFT). */
  reviewedOn: string | null;
  rules: R;
}

export const PENDING_RULE_PACKS = {
  QLD: {
    code: "AU-QLD",
    state: "QLD",
    name: "Queensland",
    // 2026.10.1 (27 Oct 2026): Standard Module, researched from the in-force Act and SM, for review.
    // 2026.10.2 (27 Oct 2026): signed off by Matthew Wrigley with the six decisions in DECISIONS; the
    // points in NOT_CONFIRMED stay not confirmed.
    // 2026.10.3 (27 Oct 2026): FEATURES added (none of the NSW workflows applies); a platform switch,
    // not a rule of law, so the sign-off stands.
    // 2026.10.4 (27 Oct 2026): TERMINOLOGY gains levies, lateCharge, planLabel, bodyCorporateName and
    // bodyCorporateShortName (wording only, as decided in the sign-off), so the sign-off stands.
    // 2026.10.5 (27 Oct 2026): FUND_CATALOGUE gains display labels (wording only, the names already
    // in the pack), so the sign-off stands.
    // 2026.10.6 (27 Oct 2026): NOTICE_RULES added (the contribution notice rules in the shared shape, from
    // CONTRIBUTION_NOTICE_RULES). The 35-day lead is a StrataVerze choice, not a rule of law; the legal
    // values are those already signed off, so the sign-off stands.
    // 2026.10.7 (27 Oct 2026): LATE_CHARGE added (the late payment penalty in the shared shape, from
    // LATE_PAYMENT_PENALTY). PAYMENT_ALLOCATION_ORDER is now read in two places only: the penalty
    // engine (monthlyPenalty applies payments to the penalty first) and lotArrears (payments against
    // posted interestCharged). Receipting, notice balances and status, owner credits and the receivable
    // journals still take a payment against the notice total, levy first (see the note in qld.ts).
    // The legal values are those already signed off, so the sign-off stands.
    // 2026.10.8 (27 Oct 2026): MEETING_RULES added (the meeting rules in the shared shape, from MEETINGS,
    // RESOLUTIONS, CONTRIBUTIONS.debtorMayVote and RECORD_RETENTION). Pre-meeting e-voting is not offered
    // (none like the NSW ballot), the labels and the committee refusal are wording, and the legal values
    // are those already signed off, so the sign-off stands. How the 21 days is counted stays not confirmed.
    // Also: MEETINGS.statutoryMotions and COMMITTEE.electionIsLastBusiness (from the research notes, CONFIRMED,
    // backing the draft AGM template), FOR_REVIEW (StrataVerze design choices for Matthew Wrigley to confirm)
    // and a GO-LIVE GAP note (special and majority resolutions are not counted yet).
    // 2026.10.9 (27 Oct 2026): DEBT_RECOVERY_STEPS, DEBT_RECOVERY_STEP_LABELS and DEBT_RECOVERY_GUIDANCE added.
    // They are draft content (DRAFT, FOR STRATAVERZE TO REVIEW) for Matthew Wrigley's review, listed in FOR_REVIEW
    // with the 2 year warning, the waiver step given to the committee and the fees. Also RECOVERY_COSTS_RECOVERABLE
    // (fee wording, SM s 166(1)(c)), NEVER_RECOVERABLE_FEE_VARIANTS (none), DEBT_RECOVERY.mustStartProceedings.citation
    // and FEATURES.debtRecoverySteps on. The legal values already signed off are unchanged, so the status stays
    // REVIEWED. A GO-LIVE GAP note lists what is still NSW worded on the screens and that the 2 year rule has no
    // daily reminder yet.
    version: "2026.10.9",
    status: "REVIEWED",
    reviewer: "Matthew Wrigley",
    reviewedOn: "2026-10-27",
    rules: QLD,
  } satisfies PendingRulePack<typeof QLD>,
} as const;

/** How a pack is recorded on a notice, charge or case, for example "AU-NSW 2026.10.1". */
export function rulePackLabel(pack: Pick<RulePack, "code" | "version">): string {
  return `${pack.code} ${pack.version}`;
}

/** A building is in a jurisdiction whose rules have not been added. */
export class UnsupportedJurisdictionError extends Error {
  constructor(readonly state: string) {
    const supported = Object.values(RULE_PACKS).map((p) => p.name).join(", ");
    super(
      `StrataVerze has no strata rules for ${state || "this state"} yet, so this building cannot be managed here. Buildings can be in: ${supported}.`,
    );
    this.name = "UnsupportedJurisdictionError";
  }
}

/** The rule pack for a building's state, or null when there is none. */
export function rulePackFor(state: string | null | undefined): RulePack | null {
  const key = (state ?? "").trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(RULE_PACKS, key) ? RULE_PACKS[key] : null;
}

/** A building's rule pack. Throws UnsupportedJurisdictionError when its state has no pack. */
export function rulePackForScheme(state: string | null | undefined): RulePack {
  const pack = rulePackFor(state);
  if (!pack) throw new UnsupportedJurisdictionError((state ?? "").trim().toUpperCase());
  return pack;
}

/** A building's statutory rules. Throws UnsupportedJurisdictionError when its state has no pack. */
export function statutoryRulesFor(state: string | null | undefined): StatutoryRules {
  return rulePackForScheme(state).rules;
}
