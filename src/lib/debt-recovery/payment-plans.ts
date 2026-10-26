/**
 * Payment plans for overdue levies (pure, safe in the browser). The rules
 * come from the building's rule pack (`rules.PAYMENT_PLANS`): how long the
 * owners corporation has to reply, the longest plan, who decides, and which
 * recovery steps wait while a plan is being followed.
 *
 * A request is recorded as the owner gave it on the standard form. The
 * decision is made by a vote at a meeting of the owners corporation or the
 * strata committee; the platform records that decision, it does not make it.
 */
import { addDays, addMonths } from "@/lib/levies/notice-plan";

export interface PaymentPlanRules {
  maxMonths: number;
  replyWithinDays: number;
  currentLeviesFrom: string;
  pausedSteps: readonly string[];
}

export const PLAN_FREQUENCIES = ["WEEKLY", "FORTNIGHTLY", "MONTHLY"] as const;
export type PlanFrequency = (typeof PLAN_FREQUENCIES)[number];
export const isPlanFrequency = (v: unknown): v is PlanFrequency => PLAN_FREQUENCIES.includes(v as PlanFrequency);

export const DECISION_BODIES = ["STRATA_COMMITTEE", "OWNERS_CORPORATION"] as const;
export type DecisionBody = (typeof DECISION_BODIES)[number];

/** Request statuses: received and awaiting a decision, or decided, or withdrawn by the owner. */
export const REQUEST_STATUSES = ["RECEIVED", "APPROVED", "REFUSED", "WITHDRAWN"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (v: string) => ISO_DAY.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

/** The last day for the written reply: the day the complete request was received plus the reply period. */
export function replyDueOn(receivedOn: string, rules: Pick<PaymentPlanRules, "replyWithinDays">): string {
  return addDays(receivedOn, rules.replyWithinDays);
}

/** Days left to reply (negative when overdue), counted in whole days from `today`. */
export function daysToReply(dueOn: string, today: string): number {
  return Math.round((Date.parse(`${dueOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** Due date of instalment `index` (0 for the first). Monthly instalments fall on the same day each month. */
export function instalmentDueOn(startOn: string, frequency: PlanFrequency, index: number): string {
  if (frequency === "MONTHLY") return addMonths(startOn, index);
  return addDays(startOn, (frequency === "WEEKLY" ? 7 : 14) * index);
}

/**
 * The instalments for a plan: equal amounts in cents, with any remainder on
 * the last instalment, so they add up to the total exactly.
 */
export function instalmentSchedule(input: { totalCents: number; numberOfInstalments: number; startOn: string; frequency: PlanFrequency }) {
  const n = input.numberOfInstalments;
  const each = Math.floor(input.totalCents / n);
  return Array.from({ length: n }, (_, i) => ({
    instalmentNumber: i + 1,
    dueOn: instalmentDueOn(input.startOn, input.frequency, i),
    amountCents: i === n - 1 ? input.totalCents - each * (n - 1) : each,
  }));
}

export interface RequestInput {
  ownerNames: string;
  receivedOn: string;
  hardshipStatement: boolean;
  currentDebtCents: number | null;
  proposedInstalmentCents: number | null;
  proposedFrequency: string | null;
  proposedMonths: number | null;
  interestWaiverRequested: boolean;
}

/** Problems with a request as entered, by field (empty when it can be recorded). */
export function requestProblems(r: RequestInput, rules: Pick<PaymentPlanRules, "maxMonths">, today: string): Record<string, string> {
  const e: Record<string, string> = {};
  if (!r.ownerNames.trim()) e.ownerNames = "Enter the owner's name, as on the form (each co-owner).";
  if (!isDay(r.receivedOn)) e.receivedOn = "Enter the date the complete request was received.";
  else if (r.receivedOn > today) e.receivedOn = "The date received cannot be in the future.";
  if (!r.hardshipStatement) e.hardshipStatement = "The form includes the owner's statement of financial hardship. Confirm it was given.";
  if (r.currentDebtCents != null && !(r.currentDebtCents > 0)) e.currentDebtCents = "Enter the debt amount on the form, or leave it blank.";
  if (r.proposedInstalmentCents != null && !(r.proposedInstalmentCents > 0)) e.proposedInstalmentCents = "Enter the proposed instalment, or leave it blank.";
  if (r.proposedFrequency && !isPlanFrequency(r.proposedFrequency)) e.proposedFrequency = "Choose weekly, fortnightly or monthly.";
  if (r.proposedMonths != null && !(Number.isInteger(r.proposedMonths) && r.proposedMonths >= 1 && r.proposedMonths <= rules.maxMonths)) {
    e.proposedMonths = `The plan can run for up to ${rules.maxMonths} months.`;
  }
  return e;
}

export interface TermsInput {
  totalCents: number;
  numberOfInstalments: number;
  frequency: string;
  startOn: string;
  agreedOn: string;
  coversCurrentLevies: boolean;
}

/** Problems with the agreed terms (empty when the plan can be set up). */
export function termsProblems(t: TermsInput, rules: Pick<PaymentPlanRules, "maxMonths" | "currentLeviesFrom">): Record<string, string> {
  const e: Record<string, string> = {};
  if (!(Number.isInteger(t.totalCents) && t.totalCents > 0)) e.totalCents = "Enter the amount the plan covers.";
  if (!isPlanFrequency(t.frequency)) e.frequency = "Choose weekly, fortnightly or monthly.";
  if (!(Number.isInteger(t.numberOfInstalments) && t.numberOfInstalments >= 1 && t.numberOfInstalments <= 60)) e.numberOfInstalments = "Enter the number of instalments.";
  if (!isDay(t.agreedOn)) e.agreedOn = "Enter the date the plan was agreed.";
  if (!isDay(t.startOn)) e.startOn = "Enter the first instalment date.";
  else if (isDay(t.agreedOn) && t.startOn < t.agreedOn) e.startOn = "The first instalment cannot be before the plan was agreed.";
  if (!e.frequency && !e.numberOfInstalments && !e.startOn && !e.agreedOn) {
    const last = instalmentDueOn(t.startOn, t.frequency as PlanFrequency, t.numberOfInstalments - 1);
    if (last > addMonths(t.agreedOn, rules.maxMonths)) e.numberOfInstalments = `The last instalment (${last}) is more than ${rules.maxMonths} months after the plan was agreed.`;
  }
  if (!e.totalCents && !e.numberOfInstalments && t.totalCents < t.numberOfInstalments) e.totalCents = "The amount is too small for that many instalments.";
  if (t.coversCurrentLevies && isDay(t.agreedOn) && t.agreedOn < rules.currentLeviesFrom) {
    e.coversCurrentLevies = `A plan agreed before ${rules.currentLeviesFrom} covers overdue levies only.`;
  }
  return e;
}

export interface DecisionInput {
  decision: string;
  body: string;
  meetingOn: string;
  majorityVote: boolean;
  refusalReasons: string;
  interestWaiverRequested: boolean;
  interestWaiver: string;
}

/** Problems with a recorded decision (empty when it can be recorded). */
export function decisionProblems(d: DecisionInput, receivedOn: string, today: string): Record<string, string> {
  const e: Record<string, string> = {};
  if (d.decision !== "APPROVED" && d.decision !== "REFUSED") e.decision = "Choose approved or refused.";
  if (!DECISION_BODIES.includes(d.body as DecisionBody)) e.body = "Choose the meeting that decided it.";
  if (!isDay(d.meetingOn)) e.meetingOn = "Enter the date of the meeting.";
  else if (d.meetingOn > today) e.meetingOn = "The meeting date cannot be in the future.";
  else if (d.meetingOn < receivedOn) e.meetingOn = "The meeting was before the request was received.";
  if (!d.majorityVote) e.majorityVote = "The decision must be a majority vote at the meeting. Confirm it was.";
  if (d.decision === "REFUSED" && d.refusalReasons.trim().length < 20) {
    e.refusalReasons = "Give the reasons for the refusal and how they apply to this request.";
  }
  if (d.interestWaiverRequested && d.interestWaiver !== "WAIVED" && d.interestWaiver !== "NOT_WAIVED") {
    e.interestWaiver = "The owner asked for interest to be waived. Record the meeting's decision on it.";
  }
  return e;
}

/** A plan being followed: agreed (ACTIVE) and not marked as not followed. */
export function planBeingFollowed(plan: { status: string } | null | undefined): boolean {
  return plan?.status === "ACTIVE";
}

/** Whether a recovery step must wait because a plan is being followed. */
export function stepPausedByPlan(stepType: string, plans: ReadonlyArray<{ status: string }>, rules: Pick<PaymentPlanRules, "pausedSteps">): boolean {
  return rules.pausedSteps.includes(stepType) && plans.some(planBeingFollowed);
}
