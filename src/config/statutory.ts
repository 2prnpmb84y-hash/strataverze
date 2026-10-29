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
import * as ACT from "./statutory/act";
import * as NSW from "./statutory/nsw";
import * as QLD from "./statutory/qld";
import * as VIC from "./statutory/vic";
import * as WA from "./statutory/wa";
import type { MeetingRuleSet } from "@/lib/meetings/rules";
import type {
  BuildingFactDefinition,
  BuildingSelector,
  RecordedFactKey,
  CertificateRules,
  ContributionInsuranceRules,
  DatedRules,
  DebtRecoveryRules,
  DocumentRetentionRules,
  InspectionRules,
  WorksQuoteRules,
  DebtRecoveryStepRule,
  EntitlementScheduleDefinition,
  FeeVariant,
  FundDefinition,
  LateChargeRules,
  NoticeRules,
  PackFeatures,
  PaymentAllocationPart,
  ProxyRules,
  SchemeSelector,
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
  /**
   * The setting chosen for each building that decides which of the
   * jurisdiction's rules apply, where there is one (Queensland's regulation
   * module, stage 2, step 10). Held in `schemes.regulation_module`. A pack
   * without it has none, and no setting shows.
   */
  REGULATION_MODULE?: SchemeSelector;
  /**
   * The kind of plan a building's lots are on, where a pack's rules depend on
   * it (Queensland's building, volumetric and standard format plans; QLD
   * go-live gap, 27 Oct 2026). Held in `schemes.plan_format`. An option that
   * is not supported may still be recorded: what depends on it is refused.
   */
  PLAN_FORMAT?: SchemeSelector;
  /**
   * The building settings that decide which of the pack's rules apply (VIC,
   * ACT and WA stage 2, PR 2, 28 Oct 2026), each recorded by an adviser or
   * worked out from the building's facts (see BuildingSelector). Shown in the
   * adviser's Building rules section. A pack without the key has none (NSW;
   * Queensland keeps REGULATION_MODULE and PLAN_FORMAT above).
   */
  BUILDING_SELECTORS?: readonly BuildingSelector[];
  /** The facts the pack's derived selectors ask advisers to record, with their words. */
  BUILDING_FACTS?: Partial<Readonly<Record<RecordedFactKey, BuildingFactDefinition>>>;
  /**
   * The insurance part of a contribution, shared by its own schedule
   * (Queensland, SM s 162(5)). A pack without it shares the whole levy by the
   * schedule that decides CONTRIBUTIONS, as NSW always has.
   */
  CONTRIBUTION_INSURANCE?: ContributionInsuranceRules;
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
  /*
   * Certificates, inspections, record keeping and works quotes (stage 2,
   * step 9, 27 Oct 2026), in one shape for every pack. Get one with
   * `needRule`; a pack without it does not have the workflow.
   */
  /** The certificate on a sale (FEATURES.strataInformationCertificate or bodyCorporateCertificate). */
  CERTIFICATE?: CertificateRules;
  /** Records inspections (FEATURES.recordsInspections). */
  INSPECTIONS?: InspectionRules;
  /** How long the document library shows each record must be kept. */
  DOCUMENT_RETENTION?: DocumentRetentionRules;
  /** When works need more than one quote. */
  WORKS_QUOTES?: WorksQuoteRules;
  /**
   * Rules that change on a date (VIC, ACT and WA stage 2, PR 1, 28 Oct 2026),
   * read with `ruleInForceOn` (src/lib/jurisdiction/dated-rules.ts). A pack
   * without the key has none (NSW, Queensland).
   */
  DATED_RULES?: DatedRules;
  /**
   * How many proxies one person may hold for a meeting (VIC, ACT and WA
   * stage 2, PR 8b-iv, 29 Oct 2026), warned only, never refused. A pack
   * without the key checks no cap (NSW, Queensland, Western Australia).
   */
  PROXY_RULES?: ProxyRules;
}

/**
 * A building's rules. Everything beyond SharedRules is in the NSW shape and
 * optional: code that needs one of those rules gets it with `needRule`, which
 * refuses a building whose pack does not have it, or checks FEATURES first.
 * As each area is made jurisdiction-neutral, its rule moves into SharedRules.
 */
export type StatutoryRules = SharedRules & Partial<Omit<NswRules, keyof SharedRules | OwnShapeRules>>;

/**
 * NSW rules another live pack holds under the same name in its own shape
 * (Queensland's RECORD_RETENTION and RECORDS_INSPECTION, QLD switch-on,
 * 28 Oct 2026). They are left out of StatutoryRules, so no shared code reads
 * one as if it were in the NSW shape. Shared code reads DOCUMENT_RETENTION
 * and INSPECTIONS instead; NSW code reads them from NswRules.
 */
type OwnShapeRules = "RECORD_RETENTION" | "RECORDS_INSPECTION";

/** `needRule` and `RuleNotInPackError` live in a module with no pack data, so the browser can use them. */
export { needRule, RuleNotInPackError } from "./statutory/need-rule";

/** The dated rule shapes (types only, no rules), for the reader in src/lib/jurisdiction/dated-rules.ts. */
export type { DatedLegalStatus, DatedRule, DatedRules, DatedValue, NoStatutoryRule, PendingDatedValue } from "./statutory/types";

/** The building selector shapes (types only, no rules), for the reader in src/lib/jurisdiction/building-selectors.ts. */
export type { BuildingFactKey, BuildingSelector, DerivedBuildingSelector, RecordedFactKey, SelectorCondition } from "./statutory/types";

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

/**
 * The Queensland pack (AU-QLD), active from 2026.10.19 (QLD stage 2, step 11,
 * 28 Oct 2026). Exported with its rules' own types for tests and `src/config`.
 * Application code gets a building's rules from `rulePackFor` or
 * `statutoryRulesFor`, never from here (`statutory.imports.test.ts`).
 */
export const QLD_RULE_PACK = {
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
  // 2026.10.10 (27 Oct 2026): CERTIFICATE (the body corporate certificate: 5 business days, fees in fee units with each
  // year's dollar table from FEE_UNIT_DOLLARS, the interested persons of Act s 205(13)), INSPECTIONS (access within 7 days,
  // owner and other fees and copies per page in fee units, the fee year from the written request), DOCUMENT_RETENTION
  // (as decided: minutes and insurance policies without a limit, by-laws in force without a limit as of current relevance,
  // every other category at least the 6 year disposal period of SM s 231) and WORKS_QUOTES (2 quotes above the major
  // spending limit) added from the values already signed off, with FEATURES.recordsInspections and the new
  // FEATURES.bodyCorporateCertificate on. The certificate follows the contents listed in SM s 233AA(1) (the approved
  // form was not read). The certificate headings are draft content (DRAFT, FOR STRATAVERZE TO REVIEW), and the new
  // StrataVerze choices are in FOR_REVIEW.
  // The legal values are unchanged, so the status stays REVIEWED. A GO-LIVE GAP note lists what is not applied yet
  // (the priority certificate, public holidays, the audit, the resolved spending limits).
  // 2026.10.11 (27 Oct 2026): the building data (stage 2, step 10). ENTITLEMENT_SCHEDULES gains a label and help
  // for each schedule (wording only) and `decides`, the uses of `usedFor` as keys for code, from the provisions
  // already signed off (Act s 47(2), (3), ss 106(3), 110(3); SM ss 162(5), 197(4)). The buildings insurance share
  // (SM s 201(1), (2): interest schedule for building and volumetric format lots only, reinstatement cost for standard
  // format lots) is given no schedule until each lot's plan format is held. REGULATION_MODULE
  // becomes a shared rule (the building setting) with its values unchanged. FOR_REVIEW gains four StrataVerze
  // choices (who saves the module, the interest schedule entitlement in the locked record, the buildings insurance
  // share not worked out, flagging missing data).
  // The legal values are unchanged, so the status stays REVIEWED. A GO-LIVE GAP note lists what is not applied
  // yet (the insurance part of contributions by the interest schedule, the onboarding wizard, the NSW labels).
  // 2026.10.12 (27 Oct 2026): PAYMENT_ALLOCATION_ORDER (penalty first, SM s 166(5)) is now applied by receipting, notice
  // balances and status, owner credit applied, reversals and the receivable journals, each as one transaction with the
  // building's journal numbering and each notice locked while its penalty is charged and a payment applied. The engine is the source of the penalty charged, and the part recorded on
  // each payment (levy_payments.late_charge_amount, migration 20261117) the source of the penalty paid (see the note in
  // qld.ts). FOR_REVIEW gains three StrataVerze choices (the part of the contribution left unpaid when only the contribution
  // is paid, as StrataVerze reads SM ss 165 and 166(5); charging the penalty to the payment date first, with future dates
  // refused; the order within a notice). The legal values are unchanged, so the status stays REVIEWED.
  // 2026.10.13 (27 Oct 2026): resolution tallies at conduct. MEETING_RULES gains pollCategories (ORDINARY, from
  // RESOLUTIONS.pollAvailable: Act ss 109, 110(3)) and proxiesBarredOn (MAJORITY: Act s 107, SM s 130(3), as in
  // PROXIES.notFor), both from values already signed off. Conduct now counts the votes at a Queensland general
  // meeting (not a committee meeting) and checks the chair's outcome against the count; a majority resolution
  // cannot be recorded as resolved until written votes are recorded. FOR_REVIEW gains the count deciding with no
  // override, the lot count and the meeting's date for debts, abstentions and votes cast, and the debtor test
  // reading contribution notices only. The legal values are unchanged, so the status stays REVIEWED.
  // The GO-LIVE GAP note on MEETING_RULES says what is applied and what remains.
  // 2026.10.14 (27 Oct 2026): insurance in contributions (go-live gap), as Matthew Wrigley decided on 27 Oct 2026
  // (DECISIONS): building and volumetric format plans only. PLAN_FORMAT added (the building setting, held in
  // schemes.plan_format: building, volumetric or standard format plan, SM ss 198, 199, 201; Act s 46B(2)(b)).
  // ENTITLEMENT_SCHEDULES: the interest schedule now decides INSURANCE_BUILDINGS for building and volumetric format
  // plans only (SM s 201(1)); no schedule decides it for a standard format plan. CONTRIBUTION_INSURANCE added: the
  // insurance part of an administrative fund contribution is shared by the interest schedule and the rest by the
  // contribution schedule (SM ss 160(2), 162(5), 197(4), 201(1)). FOR_REVIEW gains the s 201(2) adjustments not
  // offered, what counts as insurance in the budget, the voluntary insurance scheme (s 204) not offered, the refusal
  // without an insurance line (a StrataVerze choice, CONTRIBUTION_INSURANCE.insuranceLineRequired), special
  // contributions, the plan format setting and refusing a standard format plan outright (stricter than s 197(4));
  // the buildings premium and missing data points are updated. An insurance line in the sinking fund budget is refused. The legal values already signed off are unchanged and the new ones are from the same
  // provisions, so the status stays REVIEWED. The GO-LIVE GAP note on ENTITLEMENT_SCHEDULES says what is applied.
  // 2026.10.15 (27 Oct 2026): QLD wording and onboarding go-live. TERMINOLOGY gains paymentPlan ("Payment Arrangement",
  // the agreed arrangement a debt recovery case shows, as there is no statutory payment plan) and lateChargeGeneral
  // ("late payment charge", where Queensland and NSW lots are shown together), moved out of code (wording only).
  // FOR_REVIEW gains those words and the plan format asked for by the Add Property wizard. The legal values are
  // unchanged, so the status stays REVIEWED. The GO-LIVE GAP notes say which screens take the pack's words and which
  // still show NSW words.
  // 2026.10.16 (28 Oct 2026): the 2 year rule's daily reminder (go-live gap). DEBT_RECOVERY.proceedingsReminder added:
  // the reminder's subject and heading, StrataVerze wording that calls the deadline the StrataVerze date. FOR_REVIEW:
  // the 2 year warning point now says it is also a daily reminder, and new points give who is emailed and when (first
  // flagged, 30, 14 and 7 days before the deadline, once after), no email for a deadline passed more than 30 days
  // before the run (no burst at go-live), the owners left out and those not covered (several lots, company owners,
  // attorneys), and a case closed after judgment not counting as proceedings. The GO-LIVE GAP note on DEBT_RECOVERY
  // says what is applied and that migration 20261119 must be applied before go-live. No rule of law changed, so the
  // status stays REVIEWED.
  // 2026.10.17 (28 Oct 2026): QLD finance wording go-live. TERMINOLOGY gains ownersCorporations ("bodies corporate",
  // the plural where a page lists several buildings; wording only), and FOR_REVIEW gains that word and how buildings
  // in both states are named together. The finance screens, reports, PDFs and messages take the pack's words. The
  // legal values are unchanged, so the status stays REVIEWED. The GO-LIVE GAP note on the wording says what remains.
  // 2026.10.18 (28 Oct 2026): debtor voting lot by lot. SM s 102(2) bars each lot that owes money, so an owner of
  // several lots is no longer refused only when every lot owes: a lot that owes is barred and the same owner's lots
  // that owe nothing still vote, online and in the chair's count. An owner's vote online is judged on the meeting's
  // date, as the chair's count is, so the FOR_REVIEW point on what counts as owing now names that day (what counts is
  // unchanged: contribution notices only, still FOR_REVIEW). The FOR_REVIEW point on several lots records the lot by
  // lot rule and keeps for review only how the motions list (one vote per owner, not per lot) applies it. No legal
  // value changed, so the status stays REVIEWED.
  // 2026.10.19 (28 Oct 2026): ACTIVE. Moved from PENDING_RULE_PACKS into RULE_PACKS (QLD stage 2, step 11, the
  // switch-on, approved by Matthew Wrigley on 28 Oct 2026), so Queensland buildings can be set up and are given these
  // rules. defaultAccountingBasis added (the basis a new building's funds start on, as for NSW: the administrative fund
  // on a cash basis, the sinking fund on an accrual basis), a StrataVerze choice he decided on 28 Oct 2026. DECISIONS
  // gains that choice and his go-live sign-off: the stage 2 FOR_REVIEW points accepted as built, except the debtor test
  // for voting, applied per lot (SM s 102(2)) in 2026.10.18. FOR_REVIEW is kept as the record, and gains a NOT CONFIRMED
  // point on whether a committee seat ends when a lot is sold. No rule of law changed, so the sign-off of 27 Oct 2026 stands.
  // 2026.10.20 (29 Oct 2026): common property rows are not counted at conduct (a fix approved by Matthew Wrigley on
  // 29 Oct 2026). MEETING_RULES gains excludeCommonPropertyRows, as the draft packs have it: a common property row
  // entered with the lots is no longer counted as a lot in the number of lots (Act s 106(3)(b)), the entitlement
  // (s 106(3)(c)) or the lots entitled to vote (s 107), is not listed on the conduct screen, and a vote sent for it is
  // refused. Before, a building with such a row could not count a special or majority resolution, and the row made a
  // majority resolution harder to pass. No Queensland building was in production yet. No other rule value changed, so
  // the sign-off of 27 Oct 2026 stands.
  version: "2026.10.20",
  reviewer: "Matthew Wrigley",
  reviewedOn: "2026-10-27",
  rules: QLD,
} as const satisfies RulePack;

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
    // 2026.10.16 (27 Oct 2026): CERTIFICATE, INSPECTIONS, DOCUMENT_RETENTION and WORKS_QUOTES added (the s 184 certificate,
    // s 182 inspections, record keeping and the two-quote rule in the shared shapes, from SALE_CERTIFICATE,
    // RECORDS_INSPECTION, RECORD_RETENTION, WORKS_SPENDING_RULES and CITATIONS, with the words the screens and the PDF
    // already used, including the layout sentence "following the items of the approved form"); no rule value changed.
    version: "2026.10.16",
    reviewer: "Matthew Wrigley",
    // The NSW rules were in use before the plan. Several were confirmed one by
    // one (dates noted on each in nsw.ts), but the pack as a whole has not
    // yet been signed off.
    reviewedOn: null,
    rules: NSW,
  },
  QLD: QLD_RULE_PACK,
};

/**
 * A jurisdiction's rules that are written but not yet applied (phase 2,
 * 27 Oct 2026): a DRAFT while being reviewed, REVIEWED once the reviewer signs
 * them off. Neither is ever given to a building: `rulePackFor` and
 * `statutoryRulesFor` read RULE_PACKS only, and the state is not supported for
 * new buildings. A pack moves to RULE_PACKS, with the shared rule shape, when
 * the platform can apply it (stage 2). Queensland moved on 28 Oct 2026
 * (QLD_RULE_PACK, version 2026.10.19).
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
  ACT: {
    code: "AU-ACT",
    state: "ACT",
    name: "Australian Capital Territory",
    // 2026.10.1 (27 Oct 2026): units plans, drafted from the research notes (UTMA R25, UTMR R6, UTA R38,
    // DI2026-115, DI2026-22) for Matthew Wrigley to review; not signed off, no decisions yet.
    // 2026.10.2 (28 Oct 2026): DATED_RULES added (the dated rule shape, stage 2 PR 1). The Bill's quorum and absentee
    // vote changes are restated as NOT LAW values that are never applied, beside the in-force values from MEETINGS
    // (R25, from 26 Jun 2026); the commencement words follow the Bill's record. FOR_REVIEW gains that point. No legal
    // value or status changed; still a draft.
    // 2026.10.3 (28 Oct 2026): BUILDING_SELECTORS added (the building selector shape, stage 2 PR 2). SCHEME_TYPE becomes a
    // recorded selector with its values unchanged. The plan variants of SCHEME_VARIANTS (retirement village, mixed use, class B
    // units only) become recorded yes or no selectors, each "yes" marked not supported (a StrataVerze proposal: none of their
    // rules is applied yet). The unit thresholds of SIZE_THRESHOLDS (bank account exemption, sinking fund, communications
    // officer, proxy limit, the unit leg of the audit test) become selectors worked out from the number of units, with the
    // thresholds unchanged. Member thresholds are not worked out. TERMINOLOGY gains lot and lots ("unit", "units", wording
    // only), so the building rules say units. FOR_REVIEW gains that point. No legal value or status changed; still a draft.
    // 2026.10.4 (28 Oct 2026): fund conditions (stage 2 PR 3). The sinking fund gains `requiredWhen`, written against the
    // SINKING_FUND_REQUIRED selector: required with 4 or more units (ss 81(1), 82(1)), not required with fewer (s 81(1)),
    // so a building of 4 or more units is given one. `required` stays false and the threshold is unchanged. FOR_REVIEW's
    // sinking fund point is rewritten (whether fewer units may keep one is not in the notes). No legal value or status
    // changed; still a draft.
    // 2026.10.5 (28 Oct 2026): the annual resolved rate (stage 2 PR 5). LATE_CHARGE added in the shared shape (method
    // ANNUAL_RATE), from INTEREST unchanged: 10% a year simple by default (s 94(1)(a)), or 0 to 20% by special resolution
    // (s 94(1)), checked against the motion's recorded category (a GO-LIVE GAP: the meeting engine's CARRIED does not
    // apply the sch 3 s 3.16 test yet). From which day interest runs, any grace period and how
    // a day's share of the yearly rate is worked out are NOT_CONFIRMED (the notes do not say), so no interest is charged
    // until a pack version records them. No waiver (none in the notes) and no "no interest by ordinary resolution"
    // setting (s 94(1) opening words, for legal review). PAYMENT_ALLOCATION_ORDER added (contributions, then interest,
    // then recovery costs, as NSW): a StrataVerze choice Matthew Wrigley made on 28 Oct 2026, recorded in DECISIONS.
    // NOT_CONFIRMED and FOR_REVIEW gain the points. No legal value or status already recorded changed; still a draft.
    // 2026.10.6 (28 Oct 2026): the notice rules (stage 2, PR 6a). NOTICE_RULES added in the shared shape, from
    // CONTRIBUTION_NOTICES unchanged, with checked values: the due date not later than 28 days after the notice is the
    // most notice (ss 79(2)(e), 90(2)(e), CONFIRMED); the 14-day least notice and the 28-day lead are StrataVerze choices
    // Matthew Wrigley made on 28 Oct 2026, recorded in DECISIONS; a late notice may state a later date (a StrataVerze
    // reading of ss 80, 91, for review: the notes say only that a contribution is payable on the date stated). The
    // general fund is given one notice for each instalment (a StrataVerze reading, FOR LEGAL REVIEW against s 79(2)(f));
    // the sinking fund's yearly notice within 1 month after the AGM (s 90(1)) is refused until StrataVerze can give it.
    // Every notice is refused while StrataVerze notices cannot state what ss 79(2) and 90(2) require (each other unit's
    // contribution, the fund totals, the proportion and method, the instalment dates, any discount and the interest).
    // No approved form is recorded (Form 1 not read). FOR_REVIEW gains the points. No legal value or status already
    // recorded changed; still a draft.
    // 2026.10.7 (28 Oct 2026): the every-unit contents (stage 2, PR 6b). No rule value changed. Notices now state the
    // contribution for each unit (unit numbers and amounts only, a unit with no notice shown as nil), the fund with its
    // totals and the unit's proportion by unit entitlement (ss 79(2)(b) to (d), 90(2)(b) to (d)); they are still
    // refused for the instalment dates, any discount and the interest, and sinking fund notices for their yearly mode.
    // FOR_REVIEW's notice contents point is rewritten and gains the instalment dates, the every-unit list (takeover
    // notices never list), the fund and totals (withheld after a budget revision) and the proportion (only where every
    // amount is the unit's share by its current unit entitlement) points, and a point that the contents are read and
    // checked again from the data as it is when a notice is emailed or its PDF downloaded. Still a draft.
    // 2026.10.8 (28 Oct 2026): resolution bases and categories (stage 2, PR 8a-i). MEETING_RULES added in the shared shape,
    // from MEETINGS, RESOLUTIONS and RECORDS unchanged: notice 14 days (general) and 7 days (executive committee), minutes
    // within 14 days, quorum per motion as data, retention 7 years, each CONFIRMED; the tests by the number of members (sch 3
    // ss 3.15 to 3.18, CONFIRMED) chosen by MEMBER_BAND, a new recorded building selector (1 or 2, 3, or 4 or more members;
    // only 4 or more supported, a StrataVerze proposal); the 3-member special test (NOT_CONFIRMED), the unopposed resolution
    // (scope NOT_CONFIRMED) and 1 or 2 members refused; equal votes refused (casting vote not recorded); every count
    // refused until quorum is recorded for each motion (stage 2, PR 8a-ii). The debtor rule (sch 3 s 3.20(3)) is not
    // applied yet (debtorsMayVoteOn left out). Names, lists, common property rows not counted, no pre-meeting voting and an
    // item with no category not recorded as resolved at a general meeting (categoryRequiredAtGeneralMeetings) are
    // StrataVerze choices. The LATE_CHARGE GO-LIVE GAP and FOR_REVIEW are rewritten (votes present revisited with quorum). No legal value or status already
    // recorded changed; still a draft.
    // 2026.10.9 (29 Oct 2026): quorum attestation and the debtor condition (stage 2, PR 8a-ii). MEETING_RULES gains
    // quorumAttestation: whether the meeting had a standard quorum (sch 3 s 3.9) is the chair's answer for each motion,
    // never worked out or assumed, kept in the meeting record with who recorded it (Matthew Wrigley's decision of
    // 29 Oct 2026, recorded in DECISIONS); a motion not answered is refused, and "no" (a reduced quorum, ss 3.10, 3.11)
    // is refused until those decisions are tracked (stage 2, PR 8b). votesPresentAttestation: the units present or
    // represented for a special resolution are the chair's count, which must equal the units entered at the motion
    // (s 3.16(1), absentees present, s 3.31(4)), a StrataVerze check. The debtor rule is applied (s 3.20(3), CONFIRMED):
    // debtorsMayVoteOn unanimous and unopposed only, with debtorRuleAppliesWhen 3 or more members (MEMBER_BAND); with
    // none recorded it applies. So an ordinary resolution (3 or more members, the same test) and a special resolution
    // (4 or more members) are now recorded from the count, and a carried special resolution can set the LATE_CHARGE
    // rate (its GO-LIVE GAP is rewritten). With 1 or 2 members a resolution is counted (no vote against and at least 1 for,
    // ss 3.15(2), 3.16(3), 3.18(2), CONFIRMED; Matthew Wrigley's decision of 29 Oct 2026, recorded in DECISIONS): the
    // three variants lose their refusal and MEMBER_BAND marks the band supported. The 3-member special test and an
    // unopposed resolution stay refused.
    // MEETING_RULES_STATUS and FOR_REVIEW (member band, votes present, refusals, debtor rule, quorum, LATE_CHARGE) are
    // rewritten, and DECISIONS gains the quorum answer and 1 or 2 members. MEETING_RULES_STATUS.debtorsMayVoteOn moves
    // from STRATAVERZE to CONFIRMED, as the rule is now applied; the 1 or 2 member tests carry their own refusal without a
    // quorum (s 3.12: the meeting is adjourned). FOR_REVIEW gains a point on ballots for the draft packs. No legal value
    // already recorded changed, and no other status; still a draft.
    // 2026.10.10 (29 Oct 2026): reduced quorum decisions (stage 2, PR 8b-i). MEETING_RULES gains
    // reducedQuorumAttestation: after No to the standard quorum the chair answers whether a reduced quorum (2 or more
    // present and entitled to vote, sch 3 s 3.9(2) to (6)) was present; a count that passes at a reduced quorum is a
    // reduced quorum decision and one that fails is recorded as lost (decision D6). pendingResolutions REDUCED_QUORUM
    // (ss 3.10, 3.11): the decision is recorded as pending (the item stored as INTERIM) and decided later: 28 days, 14
    // days' notice to the members, a petition by more than half of the units entitled to vote, confirmation sooner by
    // a standard quorum meeting (values CONFIRMED; how they are applied STRATAVERZE, Matthew Wrigley's decisions D1 to
    // D3, D5, D6, D10, D11 and D19 of 29 Oct 2026, recorded in DECISIONS and kept in FOR_REVIEW for legal
    // confirmation). After review, Matthew Wrigley's decision of 29 Oct 2026 (review M1, a second DECISIONS entry):
    // settleAfterGraceDays 7 (STRATAVERZE), the daily run records the end of the period only 7 days after the 28 days
    // end, the day it takes effect unchanged, and a petition counted only where the units entered match the
    // building's number of units. The quorum help, notes, MEETING_RULES_STATUS and the FOR_REVIEW quorum and
    // LATE_CHARGE points are rewritten, and FOR_REVIEW gains the reduced quorum point. No legal value or status
    // already recorded changed; still a draft.
    // 2026.10.11 (29 Oct 2026): notice by motion (stage 2, PR 8b-iii). MEETING_RULES gains categoryNoticeDays: 21 days'
    // notice where an unopposed or unanimous resolution is to be moved, against 14 generally (sch 3 s 3.6(2),
    // CONFIRMED), checked with the agenda's categories when the notice is issued. A unanimous resolution joins
    // generalMeetingCategories (not motionCategories): it cannot be added once the notice is issued, and it is refused as
    // resolved at the meeting unless the latest notice issued is recorded as compliant with a period of 21 days or more
    // (how it is applied STRATAVERZE, Matthew Wrigley's decision D13 of 29 Oct 2026, recorded in DECISIONS and kept in
    // FOR_REVIEW for legal confirmation). An unopposed resolution stays refused and off the agenda. The file header, the
    // MEETING_RULES header and notes, the category comments and MEETING_RULES_STATUS.noticePeriods are rewritten,
    // MEETING_RULES_STATUS gains categoryNoticeDays, FOR_REVIEW's MEETING_RULES point is rewritten and it gains the
    // notice by motion point. After review (29 Oct 2026): FOR_REVIEW gains a point on a revised notice that fails
    // (no notice left issued, so the unanimous resolution is refused saying so), and the pre-meeting voting point adds
    // that a ballot must also apply categoryNoticeDays. No legal value or status already recorded changed; still a draft.
    // 2026.10.12 (29 Oct 2026): proxy caps and minutes content (stage 2, PR 8b-iv). PROXY_RULES added: 1 proxy with
    // 20 units or fewer, otherwise no more than 5% of the units (sch 3 s 3.26(3), from PROXY_LIMIT_BAND and PROXIES,
    // values unchanged), the chair exempt (s 3.26(4)), warned only (how it is applied STRATAVERZE, Matthew Wrigley's
    // decision D15 of 29 Oct 2026: warn only, rounding not confirmed so "may be over" above the share rounded down and
    // over above it rounded up). MEETING_RULES gains minutesContents: the kind of each special, unopposed and unanimous
    // resolution (sch 2 s 2.1(1)(c), CONFIRMED) and a reduced quorum decision's later effect; the members present and the
    // proxy and absentee details wait for Stage C. DECISIONS gains D15 only (the proxy caps). The minutes' later effect is a
    // StrataVerze choice kept in FOR_REVIEW (the minutes point), not a decision. The MEETING_RULES header
    // and notes and FOR_REVIEW's reduced quorum point are rewritten, MEETING_RULES_STATUS gains minutesContents, and
    // FOR_REVIEW gains the minutes and proxy caps points. No legal value or status already recorded changed; still a draft.
    version: "2026.10.12",
    status: "DRAFT",
    reviewer: "Matthew Wrigley",
    reviewedOn: null,
    rules: ACT,
  } satisfies PendingRulePack<typeof ACT>,
  VIC: {
    code: "AU-VIC",
    state: "VIC",
    name: "Victoria",
    // 2026.10.1 (27 Oct 2026): researched from OCA Version 024, OCR Version 002 and SA Part 5, for review. Pending
    // changes (CLAA 2026 Part 6 Div 2, SR 53/2026, HSRA 2025 Part 4 Div 1) are held as data, not in force.
    // 2026.10.2 (28 Oct 2026): DATED_RULES added (the dated rule shape, stage 2 PR 1). Every PENDING_CHANGES entry is
    // restated as a dated value with its legal status, dates and commencement unchanged, none recorded as commenced;
    // the proxy limit and manager fees also hold their in-force values (from OCA Version 024 and OCR Version 002),
    // the two proxy limit values in one shape with the exceptions on both (the pending one's NOT_CONFIRMED: the notes
    // say only that the s 89D(2) exceptions are not amended), and the payment order records no statutory order before
    // s 32I (NOT_CONFIRMED: the notes record none). FOR_REVIEW gains DATED_RULES and FIXED_DATE_COMMENCEMENT. No legal
    // value or status changed; still a draft. SR 53/2026 (25 Nov 2026) stays off until a pack version records that it
    // commenced, and from that day the reader refuses the manager fees until then.
    // 2026.10.3 (28 Oct 2026): BUILDING_SELECTORS and BUILDING_FACTS added (the building selector shape, stage 2 PR 2).
    // OWNERS_CORPORATION_TYPE becomes a recorded selector with its values unchanged, and SEVERAL_OWNERS_CORPORATIONS records
    // whether the owners corporation is one of several on its plan (SA s 27(1)). TIER is worked out from each lot's occupiable
    // answer and the services only answer (s 3), with the lot ranges, the 2-lot subdivision and the counting rules taken
    // unchanged from TIERS (s 7). Refused: one of several owners corporations (NOT_CONFIRMED in the notes), s 7(7) or (8)
    // (a StrataVerze choice: the notes do not say how the lots are counted there), and 2 occupiable lots with other lots (a
    // StrataVerze choice until decided). Services only is read as tier 5 before s 7(7) and (8) (a StrataVerze reading). A
    // PARKING or STORAGE lot answered occupiable is flagged (a StrataVerze reading of s 3). FOR_REVIEW gains
    // BUILDING_SELECTORS_TIER and BUILDING_FACTS_RECORDED_BY. No legal value or status changed; still a draft.
    // 2026.10.4 (28 Oct 2026): fund conditions (stage 2 PR 3). MAINTENANCE_PLAN_APPROVED added (a recorded yes or no,
    // flagged only where the maintenance fund depends on it). The maintenance fund gains `requiredWhen`, written against
    // TIER and that selector: required for tiers 1 and 2 (ss 36, 40, 42; requiring it before a plan is approved is a
    // StrataVerze reading), not required for tier 5 (ss 7A(1)(b), 8), and at tiers 3 and 4 required where a plan is
    // approved (ss 40, 42) and not required otherwise. `required` stays false. The administrative fund becomes required
    // as a ledger choice (status STRATAVERZE, unchanged), so every building has a ledger fund and a chart of accounts;
    // FOR_REVIEW ADMINISTRATIVE_FUND says so. The GO-LIVE GAP note is replaced, and FOR_REVIEW MAINTENANCE_FUND_REQUIRED
    // and BUILDING_FACTS_RECORDED_BY are rewritten. No legal value or status changed; still a draft.
    // 2026.10.5 (28 Oct 2026): the second schedule (stage 2 PR 4). ENTITLEMENT_SCHEDULES gains a label and help for each
    // schedule (wording only), an import heading for lot liability ("Lot Liability"), lot entitlement's uses in `usedFor`
    // gain the quorum fallback (s 77), the nomination by owners holding 25% of lot entitlements of the person who convenes
    // a meeting or arranges a ballot (ss 74, 83 to 85) and VCAT consent (SA s 34D(3)(ba)), all from the notes, and each
    // schedule gains `decides`: lot liability decides CONTRIBUTIONS (ss 23(3), 24(2), 53(1A)); lot entitlement decides
    // POLL_VOTE (s 89(3)), SPECIAL_RESOLUTION and UNANIMOUS_RESOLUTION (ss 95, 96), QUORUM_FALLBACK (s 77, only where 50%
    // of the lots is not available), COMMON_PROPERTY_SHARE (SA s 30) and INSURANCE_PREMIUM_FEE (s 23A). Lot entitlement is
    // now held (lots.lot_entitlement, migration 20261121, not applied). No CONTRIBUTION_INSURANCE: the s 23A fee covers
    // the reinstatement premium only and the budget holds every policy together, so every Victorian fee, insurance
    // included, is shared by lot liability (s 23(3)) until FOR_REVIEW CONTRIBUTION_INSURANCE_S23A is decided; nothing
    // reads INSURANCE_PREMIUM_FEE yet. FOR_REVIEW gains ENTITLEMENT_DECIDES, SECOND_SCHEDULE_HELD and
    // CONTRIBUTION_INSURANCE_S23A, and a GO-LIVE GAP note at ENTITLEMENT_SCHEDULES says what is applied. No legal value
    // or status already recorded changed; still a draft.
    // 2026.10.6 (28 Oct 2026): the annual resolved rate and the waiver (stage 2 PR 5). LATE_CHARGE added in the shared shape
    // (method ANNUAL_RATE), from INTEREST unchanged: no interest by default; a rate set by a resolution at a general meeting
    // (s 29(1)), capped at the Penalty Interest Rates Act maximum (s 29(2)), whose 10% is GUIDANCE and so not a cap: no
    // rate can be recorded until it is checked. Interest runs on amounts outstanding after the due date with no grace
    // period (s 29(1)); how it accrues and the days a year's rate is shared over are NOT_CONFIRMED, so none is charged
    // until a pack version records them. The waiver in a particular case (s 29(3), (4)) is in the shape, all of the
    // interest on one notice only, but who decides it is NOT_CONFIRMED (a general meeting resolution is proposed, not
    // decided), so none can be recorded yet; one is refused on a notice with interest already charged.
    // PAYMENT_ALLOCATION_ORDER added (fees, then interest, then recovery costs, as NSW): a StrataVerze choice Matthew
    // Wrigley made on 28 Oct 2026, recorded in DECISIONS; DATED_RULES still records no statutory order before s 32I.
    // DEFERRED_SHARED_SHAPES drops LATE_CHARGE and PAYMENT_ALLOCATION_ORDER. FOR_REVIEW gains LATE_CHARGE, INTEREST_WAIVER
    // and PAYMENT_ALLOCATION_ORDER. No legal value or status already recorded changed; still a draft.
    // 2026.10.7 (28 Oct 2026): the notice rules (stage 2, PR 6a). NOTICE_RULES added in the shared shape, from FEE_NOTICES
    // unchanged, with checked values: the 28-day least notice is StrataVerze's reading of s 31(2)(a), kept as CONFIRMED,
    // and the 35-day lead is a StrataVerze choice, both Matthew Wrigley's decision of 28 Oct 2026, recorded in DECISIONS.
    // The most notice is NOT_CONFIRMED (the approved form's "or by the due date specified below" is guidance only), the
    // approved form is required (s 31(1)) and its start date is NOT_CONFIRMED, and the notice must state the 28-day
    // obligation, the interest rate and the dispute process (s 31(2)). StrataVerze cannot produce the form or state those
    // yet, so every fee notice is refused, each with its reason. A late notice falling due 28 days after it is given and
    // one notice for each instalment are StrataVerze choices for review. DEFERRED_SHARED_SHAPES drops NOTICE_RULES.
    // FOR_REVIEW gains NOTICE_RULES, NOTICE_MINIMUM, NOTICE_MAXIMUM, NOTICE_DISPUTE_PROCESS, NOTICE_DUE_DATE_MOVE,
    // NOTICE_TIER_5 and FINAL_FEE_NOTICE, and APPROVED_FORMS_DATE, APPROVED_FORMS_USE and DEFERRED_SHARED_SHAPES are
    // updated. No legal value or status already recorded changed; still a draft.
    // 2026.10.8 (28 Oct 2026): resolution bases and categories (stage 2, PR 8a-i). MEETING_RULES added in the shared shape,
    // from MEETINGS, RESOLUTIONS, ARREARS and RECORDS unchanged: notice 14 days for general meetings, quorum as data,
    // retention 7 years and voting papers 12 months, owners in arrears voting on special and unanimous resolutions only
    // (s 89B), each CONFIRMED; ordinary resolutions by a majority of votes cast and a poll by lot entitlement (s 89),
    // refused on equal votes (s 89A) and until quorum is recorded for the item (s 78; stage 2, PR 8a-ii); special
    // resolutions by 75% of all lots (s 96) and unanimous by every lot (s 95), CONFIRMED; the interim special resolution
    // (s 97) as the category a failed special resolution passes as, refused at the meeting until interim resolutions are
    // recorded (stage 2, PR 8b); its second route needs at least 1 vote for (StrataVerze's reading), and with 2 lots or
    // fewer it is refused (s 7A; the 2-lot rules are stage 2, PR 8a-ii). No minutes deadline (NOT_CONFIRMED) and no
    // committee notice (business days). Names, lists, a poll on ordinary resolutions only, common property rows not
    // counted, no pre-meeting voting and an item with no category not recorded as resolved at a general meeting
    // (categoryRequiredAtGeneralMeetings) are StrataVerze choices. DEFERRED_SHARED_SHAPES is now empty. FOR_REVIEW gains MEETING_RULES, MEETING_RULES_SPECIAL,
    // MEETING_RULES_INTERIM, MEETING_RULES_ORDINARY, MEETING_RULES_TIER_5, MEETING_RULES_ARREARS and
    // MEETING_RULES_NOTICE_AND_MINUTES, and DEFERRED_SHARED_SHAPES and the GO-LIVE GAP on lot entitlement are rewritten.
    // No legal value or status already recorded changed; still a draft.
    // 2026.10.9 (29 Oct 2026): quorum attestation and tier 5 (stage 2, PR 8a-ii). MEETING_RULES gains quorumAttestation:
    // whether the meeting had a quorum (s 77) is the chair's answer for each item whose test depends on it (ordinary and
    // special resolutions), never worked out or assumed, kept in the meeting record with who recorded it (Matthew
    // Wrigley's decision of 29 Oct 2026, recorded in DECISIONS); an item not answered is refused, and a "no" the votes
    // counted contradict (half of all lots counted) is refused. So an ordinary resolution is recorded as carried or lost
    // with "yes", and as lost with "no" (carried without a quorum is interim, s 78, still refused). countingRefusedWhen:
    // a tier 5 owners corporation (ss 7(6), 7A, 8, CONFIRMED) is not counted at all, and neither is one whose tier cannot
    // be worked out (a StrataVerze choice, it fails closed), which tightens 8a-i. debtorRuleAppliesWhen: the arrears rule
    // (s 89B) applies to tiers 1 to 4 only (s 7A), and where the tier cannot be worked out it applies. MEETING_RULES_STATUS
    // gains quorumAttestation and countingRefusedWhen and its arrears note is rewritten; FOR_REVIEW gains
    // MEETING_RULES_QUORUM and MEETING_RULES_BALLOTS, and MEETING_RULES_ORDINARY, MEETING_RULES_TIER_5 and MEETING_RULES_ARREARS are rewritten (a
    // carried ordinary resolution can now authorise LATE_CHARGE interest); the lot entitlement GO-LIVE note is
    // rewritten. No legal value or status already recorded changed; still a draft.
    // 2026.10.10 (29 Oct 2026): interim resolutions (stage 2, PR 8b-i). MEETING_RULES gains pendingResolutions:
    // INTERIM_SPECIAL (s 97: 29 days, then a special resolution unless a petition for more than 25% of all lots
    // stops it, notice within 14 days) and INTERIM_NO_QUORUM (s 78: 29 days unless notice of a special general
    // meeting is given, which must then confirm it within 28 days of the notice, notice within 14 days). Each is
    // recorded at the meeting as pending (the item stored as INTERIM) instead of refused, and decided later (values
    // CONFIRMED; how they are applied STRATAVERZE, Matthew Wrigley's decisions D1 to D4, D7, D10, D11, D19 and D20 of
    // 29 Oct 2026, recorded in DECISIONS and kept in FOR_REVIEW MEETING_RULES_PENDING for legal confirmation). After
    // review, Matthew Wrigley's decision of 29 Oct 2026 (review M1, a further DECISIONS entry): settleAfterGraceDays 7
    // (STRATAVERZE), the daily run records the end of the period (or of the days to hold the special general meeting)
    // only 7 days after it ends, the day it takes effect unchanged. The header, the quorum help, notes and
    // MEETING_RULES_STATUS (minutesDeadlines note, pendingResolutions) are rewritten, and FOR_REVIEW
    // MEETING_RULES_INTERIM and MEETING_RULES_ORDINARY are rewritten. No legal value or status already recorded
    // changed; still a draft.
    // 2026.10.11 (29 Oct 2026): committee notice not checked (stage 2, PR 8b-iii). MEETING_RULES gains
    // noticeNotCheckedFor COMMITTEE: a committee meeting's notice (at least 3 business days, or as the owners
    // corporation decides, s 109, CONFIRMED) is not checked, and such a notice is stored as not compliant with no period
    // and shown as "Notice period not checked" (Matthew Wrigley's decision D12 of 29 Oct 2026); business days, s 109 and
    // the 4 business days of s 89B, stay not checked until "business day" and a public holiday source are decided
    // (decision D14). Both are recorded in DECISIONS and kept in FOR_REVIEW. The MEETING_RULES header, the noticePeriods
    // comment and notes are rewritten, MEETING_RULES_STATUS gains noticeNotCheckedFor, and FOR_REVIEW
    // MEETING_RULES_NOTICE_AND_MINUTES and MEETING_RULES_ARREARS are rewritten. No legal value or status already
    // recorded changed; still a draft.
    // 2026.10.12 (29 Oct 2026): proxy caps and minutes content (stage 2, PR 8b-iv). PROXY_RULES added: the s 89D limit
    // read on the meeting's day from DATED_RULES.PROXY_LIMIT (1 lot owner with 20 or fewer occupiable lots, otherwise
    // 5% of the lot owners, and 1 lot owner always once CLAA 2026 Part 6 Div 2 is recorded as commenced; values
    // unchanged), the reg 8A exceptions and the s 89C(10) bar on an owner in arrears acting as a proxy, each warned only
    // (how they are applied STRATAVERZE, Matthew Wrigley's decisions D15 to D17 of 29 Oct 2026: warn only, rounding
    // not confirmed so "may be over" above the share rounded down and over above it rounded up, no floor where the
    // share is less than 1 proxy, 5% of the distinct
    // owners recorded or the lots where any lot has none, the holder in arrears matched by email). MEETING_RULES gains
    // minutesContents: the votes counted for each item (s 81, decision D18) and an interim resolution's later effect;
    // the attendance parts wait for Stage C. All recorded in DECISIONS and kept in FOR_REVIEW (PROXY_CAPS,
    // MINUTES_CONTENTS). The MEETING_RULES header and notes, the DATED_RULES note and FOR_REVIEW MEETING_RULES_PENDING
    // are rewritten, and MEETING_RULES_STATUS gains minutesContents. No legal value or status already recorded changed;
    // still a draft.
    version: "2026.10.12",
    status: "DRAFT",
    reviewer: "Matthew Wrigley",
    reviewedOn: null,
    rules: VIC,
  } satisfies PendingRulePack<typeof VIC>,
  WA: {
    code: "AU-WA",
    state: "WA",
    name: "Western Australia",
    // 2026.10.1 (27 Oct 2026): strata schemes, researched from the in-force STA (08-a0-00) and STGR (00-w0-00), as a draft for review.
    // 2026.10.2 (28 Oct 2026): BUILDING_SELECTORS and BUILDING_FACTS added (the building selector shape, stage 2 PR 2).
    // SCHEME_TYPE and TENURE become recorded selectors with their values unchanged. SCHEME_SIZE is worked out from the number
    // of lots (s 3(1): 2, 3 to 5, 6 or more; none below 2). DESIGNATED_STATUS is worked out from DESIGNATED_STRATA_COMPANY
    // unchanged (s 100(7), reg 79: 10 or more lots, or a replacement cost of more than $5,000,000 for the scheme type), with
    // the replacement cost as a recorded fact. No override, as the notes record none. FOR_REVIEW gains three points. No legal
    // value or status changed; still a draft.
    // 2026.10.3 (28 Oct 2026): fund conditions (stage 2 PR 3). `requiredWhen` is now written against the building
    // selectors, with the meaning of the first forms (PR #107) unchanged: the administrative fund by SCHEME_SIZE and the
    // new ADMINISTRATIVE_FUND_BY_LAWS (recorded, flagged only for 2 to 5 lots: s 140(1)(b), (2)), plus an SAT order
    // (s 140(3), from the notes: CONFIRMED for 3 to 5 lots, NOT_CONFIRMED for 2 lots, whose scope against s 140(1)(b)
    // the notes do not give), and the reserve fund by DESIGNATED_STATUS (s 100(2), (7); reg 79). defaultFunds reads
    // them, so the GO-LIVE GAP at FUND_CATALOGUE is closed. FOR_REVIEW's funds point is rewritten and gains the by-laws
    // selector, the 2-lot SAT order and schemes with no fund (refused at onboarding, flagged after). No legal value or
    // status changed; still a draft.
    // 2026.10.4 (28 Oct 2026): the annual resolved rate (stage 2 PR 5). LATE_CHARGE added in the shared shape (method
    // ANNUAL_RATE), from INTEREST_ON_UNPAID_CONTRIBUTIONS unchanged: 11% a year simple from the due date with no grace period
    // (s 100(4)(b); reg 78). A lower rate (0, which is no interest, up to but not including 11%) and a one-case waiver of
    // all the interest on a notice are in the shape, but who in the strata company determines them is NOT_CONFIRMED, so
    // neither can be recorded (a waiver is also refused on a notice with interest already charged). How a day's share
    // of the yearly rate is worked out is NOT_CONFIRMED, so no interest is
    // charged until a pack version records it. PAYMENT_ALLOCATION_ORDER added (contributions, then interest, then recovery
    // costs, as NSW): a StrataVerze choice Matthew Wrigley made on 28 Oct 2026, recorded in DECISIONS. NOT_CONFIRMED and
    // FOR_REVIEW gain the points. No legal value or status already recorded changed; still a draft.
    // 2026.10.5 (28 Oct 2026): the notice rules (stage 2, PR 6a). NOTICE_RULES added in the shared shape, from LEVY_NOTICES
    // unchanged, with checked values: no most notice and no content or form (CONFIRMED absent from the STA and STGR; by-laws
    // not checked); the 35-day lead, the 14-day least notice and never moving a due date (s 100(4)(a): the levy decision
    // fixes it) are StrataVerze choices Matthew Wrigley made on 28 Oct 2026, recorded in DECISIONS; one notice for each
    // instalment is a StrataVerze choice for review. FOR_REVIEW gains the points. No legal value or status already
    // recorded changed; still a draft.
    // 2026.10.6 (28 Oct 2026): resolution bases and categories (stage 2, PR 8a-i). MEETING_RULES added in the shared shape,
    // from MEETINGS, RESOLUTIONS, SIZE_CLASSES, DEBT_RECOVERY and RECORD_RETENTION unchanged: notice 14 days for general
    // meetings, quorum as data, an ordinary resolution by more than half of the lots voting (a tie fails) and by unit
    // entitlement where demanded, the special, without dissent and unanimous tests by size class (s 123), unfinancial
    // owners voting on unanimous and without dissent resolutions only (s 120(2)), each CONFIRMED. Special, without
    // dissent and unanimous resolutions are decided when their 28-day voting period closes (s 121), so the meeting cannot
    // record them as resolved or lost until that is tracked (stage 2, PR 8b), and their count is undetermined whatever the
    // votes. Retention of the meeting record for 20 years, names, lists, common property rows not counted, no pre-meeting
    // voting and an item with no category not recorded as resolved at a general meeting (categoryRequiredAtGeneralMeetings)
    // are StrataVerze choices. FOR_REVIEW gains the points. No legal value or status already recorded changed; still a draft.
    // 2026.10.7 (29 Oct 2026): the 2-lot quorum (stage 2, PR 8a-ii). MEETING_RULES gains quorumNeedsEveryLot: a 2-lot
    // scheme's quorum needs both lots with no fallback (s 130(2), (4), CONFIRMED), so at a general meeting its count is
    // refused unless both lots have a vote or an abstention recorded at the item, and nothing is written (Matthew
    // Wrigley's decision of 29 Oct 2026, recorded in DECISIONS). A lot whose vote is not counted for money owed (s 120(2))
    // still makes up the quorum if it is recorded at the item (s 130), as he decided the same day, relaxing the stricter
    // reading first applied; the resolution is then decided by the counted votes. Fewer than 2 lots entered is refused. MEETING_RULES_STATUS's quorum note is rewritten and FOR_REVIEW gains the
    // point, and one on ballots for the draft packs. No legal value or status already recorded changed; still a draft.
    // 2026.10.8 (29 Oct 2026): the voting period (stage 2, PR 8b-ii). MEETING_RULES gains pendingResolutions
    // VOTING_PERIOD (s 121): a special, without dissent or unanimous resolution counted at a general meeting is recorded
    // with the votes cast and stays open (the item stored as OPEN), written votes from the lots with nothing entered at
    // the item are recorded until the 28 days end (s 121(2)), a debt judged on the day received (s 120(2)), and the
    // written notice of the outcome must be recorded as given before it is decided; it is decided only at the close, as
    // at the next day, on the votes then by the s 123 test for the building's size (carried or lost, VOTES_AT_CLOSE),
    // and the daily run records that after 7 days of grace (settleAfterGraceDays). The 28 days, the outcome notice and
    // the tests are CONFIRMED; how they are applied is STRATAVERZE, Matthew Wrigley's decisions D1, D2 and D8 to D11 of
    // 29 Oct 2026, recorded in DECISIONS and kept in FOR_REVIEW for legal confirmation. The 2-lot quorum still applies at
    // the meeting. The MEETING_RULES header and notes are rewritten, and FOR_REVIEW's voting period and without dissent
    // points. After review (same day, same version): only the building's lots at the meeting, kept with the resolution,
    // may vote in writing, the debtor rule a written vote is judged by is the pack's at the meeting, kept with it, and an
    // outcome notice given after the close is flagged; FOR_REVIEW's voting period point records these and that the
    // minutes show an open item's stored outcome until PR 8b-iv. No legal value or status already recorded changed;
    // still a draft.
    // 2026.10.9 (29 Oct 2026): council notice not checked (stage 2, PR 8b-iii). MEETING_RULES gains
    // noticeNotCheckedFor COMMITTEE: a council meeting's notice (7 days by default, Sch 1 by-law 8(2)(a), a default
    // by-law a scheme may have changed) is not checked, and such a notice is stored as not compliant with no period and
    // shown as "Notice period not checked" (Matthew Wrigley's decision D12 of 29 Oct 2026, recorded in DECISIONS and kept
    // in FOR_REVIEW). The MEETING_RULES header, the noticePeriods comment and notes are rewritten,
    // MEETING_RULES_STATUS gains noticeNotCheckedFor and its noticePeriods note cites by-law 8(2)(a) (the notice) in
    // place of 8(1) (the decisions), as COUNCIL.meetings and the notes give it, and FOR_REVIEW gains the council notice
    // point. No legal value or status already recorded changed; still a draft.
    // 2026.10.10 (29 Oct 2026): minutes content (stage 2, PR 8b-iv). MEETING_RULES gains minutesContents laterEffect: an
    // item whose voting period is open (s 121) is named "Voting open" in the minutes in place of its stored outcome, and
    // its later effect is given as at the day the minutes are assembled (the day voting closes, the day it is decided as at,
    // and once decided whether it was carried or lost), a StrataVerze choice, as the STA and STGR read prescribe no
    // minutes content. No proxy cap is in force, so PROXY_RULES is not added. The MEETING_RULES header and notes are
    // rewritten, MEETING_RULES_STATUS gains minutesContents and FOR_REVIEW's voting period point is rewritten. No legal
    // value or status already recorded changed; still a draft.
    // 2026.10.11 (29 Oct 2026): debt recovery (stage 2, PR 9a). DEBT_RECOVERY follows the shared DebtRecoveryRules
    // shape, its other fields kept (its forum words move to forumWords, unchanged), and gains authorityToSue: a motion
    // carried at a council meeting or a general meeting decides to start proceedings, never the strata manager alone
    // (s 143(5)(e), CONFIRMED; who decides is not stated, so the accepted resolutions are STRATAVERZE, decision D9),
    // recorded when COMMITTEE_REVIEW is completed and needed before the legal referral; and forum: a court of
    // competent jurisdiction (s 100(4)(c), CONFIRMED), recorded when PROCEEDINGS is completed, SAT excluded
    // (s 197(3)(f), CONFIRMED), the Magistrates Court limits guidance only, never applied (D13). DEBT_RECOVERY_STEPS
    // (the NSW step types, D11), DEBT_RECOVERY_STEP_LABELS and DEBT_RECOVERY_GUIDANCE added: owner-facing text states
    // only CONFIRMED law and says StrataVerze practice where a step is StrataVerze's own. NEVER_RECOVERABLE_FEE_VARIANTS
    // lists all four recovery step fees (D10), and FEATURES.debtRecoverySteps is on (D11). Matthew Wrigley's decisions
    // D1, D4 and D9 to D13 of 29 Oct 2026, recorded in DECISIONS and kept in FOR_REVIEW; the FOR_REVIEW forum point is
    // rewritten. After review (same day, same version): D12 reworded as accepted (step order enforced for the draft
    // packs; NSW and Queensland fixed separately), and the COMMITTEE_REVIEW guidance and the FOR_REVIEW debt recovery
    // point say the motion must be of a held meeting, take effect on or after the day the case was opened, and that its
    // subject is not checked, and that the amount recorded is the amount owing when the step is completed. No legal
    // value or status already recorded changed; still a draft.
    version: "2026.10.11",
    status: "DRAFT",
    reviewer: "Matthew Wrigley",
    reviewedOn: null,
    rules: WA,
  } satisfies PendingRulePack<typeof WA>,
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
