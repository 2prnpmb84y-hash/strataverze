/**
 * Each lot's share of a contribution whose insurance part is shared by its
 * own schedule (QLD go-live gap, insurance in contributions, 27 Oct 2026).
 * Pure, no I/O.
 *
 * Queensland contributions are proportionate to the contribution schedule,
 * except insurance (SM s 162(5)). The insurance part is shared by the
 * schedule the pack says decides both premiums for the building: the
 * interest schedule, for a building or volumetric format plan (SM ss 197(4),
 * 201(1)). The rest is shared by the schedule that decides CONTRIBUTIONS.
 * Victoria's pack has no CONTRIBUTION_INSURANCE yet (stage 2, PR 4): its s 23A
 * fee covers the reinstatement premium only, which the budget does not hold
 * apart from other policies, so a Victorian fee is never split here.
 * Each part is shared in whole cents by the largest remainder method, so each
 * adds up exactly, and a lot's share is the sum of its two parts.
 *
 * A pack without CONTRIBUTION_INSURANCE (NSW) is never split: `insuranceSplit`
 * returns null and the levy is shared by `lots.entitlement` as it always was.
 * Anything that would make the split wrong is refused with a plain message
 * (ContributionShareError), never worked out another way.
 */
import type { StatutoryRules } from "@/config/statutory";
import {
  EntitlementRuleError,
  MissingEntitlementError,
  entitlementField,
  entitlementFor,
  planFormatProblem,
  scheduleFor,
  type EntitlementSchedule,
} from "@/lib/jurisdiction/building-data";
import { allocateCents, type LotShare, type PlanLot } from "./notice-plan";

/** A contribution cannot be shared between the lots as the building's pack requires. */
export class ContributionShareError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContributionShareError";
  }
}

export type ShareRules = Pick<StatutoryRules, "ENTITLEMENT_SCHEDULES" | "FUND_CATALOGUE" | "TERMINOLOGY"> &
  Partial<Pick<StatutoryRules, "PLAN_FORMAT" | "CONTRIBUTION_INSURANCE">>;

/** A lot as the split needs it: the plan lot, with its separately held entitlement. */
export interface ShareLot extends PlanLot {
  interestScheduleEntitlement?: number | null;
  /** Victoria's lot entitlement (stage 2, PR 4), for a pack whose insurance part it would share. */
  lotEntitlement?: number | null;
}

export interface InsuranceSplit {
  /** The insurance part of the contribution, in cents. */
  insuranceCents: number;
  /** Each lot's share, in the order of the lots given. */
  shares: LotShare[];
  /** The schedule the insurance part is shared by, and the one the rest is shared by. */
  insuranceSchedule: Pick<EntitlementSchedule, "key" | "name">;
  contributionSchedule: Pick<EntitlementSchedule, "key" | "name">;
}

const dollars = (cents: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100);

const lotList = (numbers: string[]) => {
  const shown = numbers.slice(0, 10);
  const more = numbers.length - shown.length;
  const text = shown.length > 1 ? `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}` : shown[0];
  return more > 0 ? `${text}, and ${more} more` : text;
};

/**
 * Each lot's share of a contribution, split into its insurance part and the
 * rest, or null when the contribution is not split: the pack has no
 * CONTRIBUTION_INSURANCE (NSW), it is a special contribution, or it has no
 * insurance part and is not to the fund insurance is paid from (a sinking
 * fund contribution). Throws ContributionShareError, with a plain message for
 * the adviser, when it cannot be split as the pack requires.
 */
export function insuranceSplit(input: {
  rules: ShareRules;
  /** The building's plan format (`schemes.plan_format`). */
  planFormat: string | null | undefined;
  lots: readonly ShareLot[];
  /** The contribution, in cents. */
  totalCents: number;
  /** The insurance in the fund's adopted budget, in cents. */
  insuranceCents: number;
  /** The ledger fund type the contribution is to (`funds.fund_type`). */
  ledgerFund: string;
  levyType: "ORDINARY" | "SPECIAL";
}): InsuranceSplit | null {
  const { rules } = input;
  const rule = rules.CONTRIBUTION_INSURANCE;
  if (!rule || input.levyType === "SPECIAL") return null;
  const levies = rules.TERMINOLOGY.levies;
  const fundName = (ledgerFund: string) => rules.FUND_CATALOGUE.find((f) => f.ledgerFund === ledgerFund)?.name;
  if (input.ledgerFund !== rule.paidFrom) {
    // Insurance is paid from one fund only (SM ss 167, 169(2)): an insurance line in another fund's budget is never shared as insurance.
    if (input.insuranceCents <= 0) return null;
    throw new ContributionShareError(
      `The ${fundName(input.ledgerFund) ?? "fund's"} budget has an insurance line, but insurance is paid from the ${fundName(rule.paidFrom) ?? "other fund"}. Move the insurance to the ${fundName(rule.paidFrom) ?? "other fund"} budget, then issue the ${levies}.`,
    );
  }
  if (input.insuranceCents <= 0) {
    // A StrataVerze choice (FOR_REVIEW), not a rule of law: the fund's budget estimates insurance (SM s 160(2)), so none is taken as a mistake.
    if (!rule.insuranceLineRequired.value) return null;
    throw new ContributionShareError(
      `The ${fundName(rule.paidFrom) ?? "fund's"} budget has no insurance. Put the insurance premium in the budget on the Insurance account, so each lot's share of it can be worked out, then issue the ${levies}.`,
    );
  }
  if (input.insuranceCents > input.totalCents) {
    throw new ContributionShareError(
      `The insurance in the budget (${dollars(input.insuranceCents)}) is more than the ${levies} to be raised (${dollars(input.totalCents)}). Check the budget and the amount to be raised.`,
    );
  }

  // The plan format first, so the adviser is told what to record rather than which rule failed.
  const formatProblem = planFormatProblem(rules, input.planFormat);
  if (formatProblem) throw new ContributionShareError(`${formatProblem} The ${levies} were not issued.`);

  let insuranceSchedule: EntitlementSchedule;
  let contributionSchedule: EntitlementSchedule;
  try {
    const building = { planFormat: input.planFormat };
    const decided = rule.uses.map((use) => scheduleFor(rules, use, building));
    if (new Set(decided.map((s) => s.key)).size !== 1) {
      throw new ContributionShareError(
        `The building's rule pack shares the insurance premiums by different lot entitlements, but the budget holds insurance as one amount. StrataVerze cannot split it, so the ${levies} were not issued.`,
      );
    }
    insuranceSchedule = decided[0];
    contributionSchedule = scheduleFor(rules, "CONTRIBUTIONS", building);
  } catch (err) {
    if (err instanceof EntitlementRuleError) throw new ContributionShareError(`${err.message} The ${levies} were not issued.`);
    throw err;
  }

  // Every lot needs both entitlements. Missing ones are listed together, so they can be entered at once.
  const weigh = (schedule: EntitlementSchedule) => {
    const missing: string[] = [];
    const zero: string[] = [];
    const field = entitlementField(schedule);
    const weights = input.lots.map((lot) => {
      try {
        return entitlementFor(lot, schedule);
      } catch (err) {
        if (err instanceof MissingEntitlementError) {
          const raw = field ? lot[field] : null;
          (raw != null && Number(raw) === 0 ? zero : missing).push(lot.lotNumber);
          return 0;
        }
        if (err instanceof EntitlementRuleError) throw new ContributionShareError(`${err.message} The ${levies} were not issued.`);
        throw err;
      }
    });
    const problems: string[] = [];
    if (missing.length === 1) problems.push(`Lot ${missing[0]} has no ${schedule.name} recorded, so its share cannot be worked out.`);
    if (missing.length > 1) problems.push(`${missing.length} lots have no ${schedule.name} recorded (lots ${lotList(missing)}), so their shares cannot be worked out.`);
    if (zero.length === 1) problems.push(`The ${schedule.name} of lot ${zero[0]} is 0, but each entitlement is a whole number of at least 1.`);
    if (zero.length > 1) problems.push(`The ${schedule.name} of ${zero.length} lots is 0 (lots ${lotList(zero)}), but each entitlement is a whole number of at least 1.`);
    if (problems.length) {
      const plural = missing.length + zero.length > 1;
      const verb = zero.length ? "corrects" : "enters";
      throw new ContributionShareError(`${problems.join(" ")} StrataVerze ${verb} ${plural ? "them" : "it"} from the building's records. The ${levies} were not issued.`);
    }
    return weights;
  };
  const insuranceWeights = weigh(insuranceSchedule);
  const contributionWeights = weigh(contributionSchedule);

  const insurance = allocateCents(input.insuranceCents, insuranceWeights);
  const rest = allocateCents(input.totalCents - input.insuranceCents, contributionWeights);
  return {
    insuranceCents: input.insuranceCents,
    shares: input.lots.map((_, i) => ({ totalCents: insurance[i] + rest[i], insuranceCents: insurance[i] })),
    insuranceSchedule: { key: insuranceSchedule.key, name: insuranceSchedule.name },
    contributionSchedule: { key: contributionSchedule.key, name: contributionSchedule.name },
  };
}

/**
 * The sentence a split notice states about how its two parts are shared, with
 * the schedules named from the pack, or null when the pack does not name them
 * (the notice still states the insurance amount). It reads nothing about the
 * building: a notice is split only when every insurance use is decided by one
 * schedule, so a regenerated PDF says what the original said, whatever the
 * building's plan format is now.
 */
export function insuranceBasis(rules: ShareRules): string | null {
  const rule = rules.CONTRIBUTION_INSURANCE;
  if (!rule?.uses.length) return null;
  const listing = rules.ENTITLEMENT_SCHEDULES.filter((s) => s.decides?.some((d) => rule.uses.includes(typeof d === "string" ? d : d.use)));
  if (listing.length !== 1) return null;
  try {
    const rest = scheduleFor(rules, "CONTRIBUTIONS");
    return `Your share of the insurance is worked out by your lot's ${listing[0].name}, and the rest by its ${rest.name}.`;
  } catch (err) {
    if (err instanceof EntitlementRuleError) return null;
    throw err;
  }
}
