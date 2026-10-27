/**
 * Payment plan requests and plans (server side). A request is recorded as
 * the owner gave it on the standard form, from the owner portal or by the
 * adviser when it arrives another way. The meeting's decision is recorded
 * against it; an approval sets up the plan and its instalments.
 *
 * The rules (reply period, longest plan, current levies, paused recovery
 * steps) come from the building's rule pack, `rules.PAYMENT_PLANS`.
 */
import { and } from "@prisma/orm-postgres/orm-client";
import type { Numeric } from "@prisma/orm-postgres/target/codec-types";
import { db } from "@/prisma/db";
import { rulesForScheme } from "@/lib/jurisdiction/scheme-rules";
import { schemeToday } from "@/lib/jurisdiction/scheme-time";
import { captureUsageFee } from "@/lib/billing/capture";
import { fromCents, toCents } from "@/lib/billing/money";
import { logDebtRecoveryActivity, updateDebtRecoveryCase } from "@/lib/queries/debt-recovery";
import { CLOSED_STATUSES } from "@/lib/auth/debt-recovery-access";
import {
  decisionProblems,
  instalmentSchedule,
  replyDueOn,
  requestProblems,
  termsProblems,
  type DecisionInput,
  type PlanFrequency,
  type RequestInput,
  type TermsInput,
} from "./payment-plans";
import { needRule } from "@/config/statutory";
import { allocatePayment, type PaymentAllocationOrder } from "@/lib/finance/statutory-interest";

export class PaymentPlanError extends Error {
  constructor(message: string, readonly fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = "PaymentPlanError";
  }
}

/** True for a Postgres unique violation, wherever the driver puts the code. */
function isUniqueViolation(err: unknown): boolean {
  const text = err instanceof Error ? `${err.message} ${JSON.stringify((err as { cause?: unknown }).cause ?? "")} ${String((err as { code?: unknown }).code ?? "")}` : String(err);
  return /23505|unique|duplicate key/i.test(text);
}

/** Days after an ownership ends during which the former owner still counts as an owner of the lot. */
const OWNER_CONFLICT_DAYS = 30;
/** A building whose rule pack does not have the payment plan workflow. */
const NOT_AVAILABLE = "This is not available for this building.";

/**
 * Profiles holding an OWNER membership on the lot, active or ended in the
 * last 30 days. Nobody acts on their own lot's payment plan as adviser
 * (security finding SEC-003).
 */
export async function lotOwnerProfileIds(schemeId: string, lotId: string): Promise<string[]> {
  const rows = await db.orm.public.SchemeMembership.where((m) => and(m.schemeId.eq(schemeId), m.lotId.eq(lotId), m.role.eq("OWNER"))).limit(50).all();
  const cutoff = Date.now() - OWNER_CONFLICT_DAYS * 86_400_000;
  return rows.filter((m) => m.isActive || (m.endDate != null && new Date(String(m.endDate)).getTime() >= cutoff)).map((m) => m.profileId);
}

/** The lot a request or plan belongs to, for the own-lot check. */
export async function lotOfRequest(schemeId: string, requestId: string) {
  const r = await db.orm.public.PaymentPlanRequest.where((x) => x.id.eq(requestId)).first();
  return r && r.schemeId === schemeId ? r.lotId : null;
}
export async function lotOfPlan(schemeId: string, planId: string) {
  const p = await db.orm.public.PaymentPlan.where((x) => x.id.eq(planId)).first();
  return p && p.schemeId === schemeId ? p.lotId : null;
}

/**
 * Whether an owner may see a request: one they made, or one received on or
 * after their ownership began (a new owner does not see the previous
 * owner's hardship request or its reply).
 */
export function ownerMaySeeRequest(r: { submittedBy: string | null; receivedOn: unknown }, viewer: { profileId: string; ownerSince: string }) {
  return r.submittedBy === viewer.profileId || day(r.receivedOn) >= viewer.ownerSince;
}

const money = (cents: number) => fromCents(cents).toFixed(2) as unknown as Numeric<12, 2>;
const day = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? "")).slice(0, 10);

/** An open recovery case for the lot, if any (requests and plans are linked to it). */
async function openCaseFor(schemeId: string, lotId: string) {
  const cases = await db.orm.public.DebtRecoveryCase.where((c) => and(c.schemeId.eq(schemeId), c.lotId.eq(lotId))).limit(50).all();
  return cases.find((c) => !(CLOSED_STATUSES as readonly string[]).includes(String(c.status))) ?? null;
}

/**
 * What the lot owes now on levy notices past their due date: levies and
 * interest, with each notice's payments applied in the building's order
 * (`rules.PAYMENT_ALLOCATION_ORDER`): NSW applies them to the levy first, then
 * interest. Without an order, levy first.
 */
export async function lotArrears(schemeId: string, lotId: string, today: string, order?: PaymentAllocationOrder) {
  const notices = await db.orm.public.LevyNotice.where((n) => and(n.schemeId.eq(schemeId), n.lotId.eq(lotId), n.status.neq("DRAFT"), n.status.neq("WRITTEN_OFF"))).limit(2000).all();
  let leviesCents = 0;
  let interestCents = 0;
  for (const n of notices) {
    if (day(n.dueDate) >= today) continue;
    const due = toCents(String(n.amountDue));
    const paid = toCents(String(n.amountPaid ?? 0));
    const interest = toCents(String(n.interestCharged ?? 0));
    // A notice with a negative levy (a credit) adds it to what is paid, as before.
    const applied = allocatePayment(paid - Math.min(0, due), { levyCents: Math.max(0, due), interestCents: interest, recoveryCostsCents: 0 }, order);
    leviesCents += Math.max(0, due - applied.levyCents);
    interestCents += Math.max(0, interest - applied.interestCents);
  }
  return { leviesCents, interestCents };
}

/** Record a request for a payment plan. Throws PaymentPlanError with field errors. */
export async function recordPaymentPlanRequest(input: {
  schemeId: string;
  lotId: string;
  source: "OWNER_PORTAL" | "RECEIVED";
  submittedBy: string;
  form: RequestInput;
  notes?: string | null;
}) {
  const [{ rules, label }, today, lot] = await Promise.all([
    rulesForScheme(input.schemeId),
    schemeToday(input.schemeId),
    db.orm.public.Lot.where((l) => l.id.eq(input.lotId)).first(),
  ]);
  if (!rules.FEATURES.statutoryPaymentPlans) throw new PaymentPlanError(NOT_AVAILABLE);
  const plans = needRule(rules, "PAYMENT_PLANS");
  if (!lot || lot.schemeId !== input.schemeId) throw new PaymentPlanError("Lot not found.");
  const problems = requestProblems(input.form, plans, today);
  if (Object.keys(problems).length) throw new PaymentPlanError("Check the request.", problems);

  const [open, active] = await Promise.all([
    db.orm.public.PaymentPlanRequest.where((r) => and(r.lotId.eq(input.lotId), r.status.eq("RECEIVED"))).first(),
    db.orm.public.PaymentPlan.where((p) => and(p.lotId.eq(input.lotId), p.status.eq("ACTIVE"))).first(),
  ]);
  if (open) throw new PaymentPlanError("A request for this lot is already waiting for a decision.");
  if (active) throw new PaymentPlanError("This lot already has a payment plan being followed. Ask for an extension instead.");

  const caseRow = await openCaseFor(input.schemeId, input.lotId);
  const f = input.form;
  // One request waiting per lot (payment_plan_requests_one_open_per_lot): a second sent at the same moment is refused.
  const created = await db.orm.public.PaymentPlanRequest.create({
    schemeId: input.schemeId,
    lotId: input.lotId,
    caseId: caseRow?.id ?? null,
    ownerNames: f.ownerNames.trim(),
    hardshipStatement: f.hardshipStatement,
    currentDebt: f.currentDebtCents != null ? money(f.currentDebtCents) : null,
    proposedInstalment: f.proposedInstalmentCents != null ? money(f.proposedInstalmentCents) : null,
    proposedFrequency: f.proposedFrequency || null,
    proposedMonths: f.proposedMonths,
    interestWaiverRequested: f.interestWaiverRequested,
    receivedOn: f.receivedOn,
    replyDueOn: replyDueOn(f.receivedOn, plans),
    source: input.source,
    submittedBy: input.submittedBy,
    status: "RECEIVED",
    rulePack: label,
    notes: input.notes?.trim() || null,
  }).catch((err: unknown) => {
    if (isUniqueViolation(err)) throw new PaymentPlanError("A request for this lot is already waiting for a decision.");
    throw err;
  });
  if (caseRow) {
    await logDebtRecoveryActivity({
      caseId: caseRow.id,
      activityType: "PAYMENT_PLAN_REQUESTED",
      description: `Payment plan requested on the standard form (received ${f.receivedOn}). Written reply due by ${replyDueOn(f.receivedOn, plans)}.`,
      performedBy: input.submittedBy,
    });
  }
  return { id: String((created as { id: string }).id), replyDueOn: replyDueOn(f.receivedOn, plans), caseId: caseRow?.id ?? null };
}

export interface ApprovedTerms extends TermsInput {
  leviesOwingCents: number;
  interestOwingCents: number;
  interestMethod: string;
  paymentMethods: string;
  contactDetails: string;
}

/**
 * Record the meeting's decision on a request. An approval sets up the plan
 * (ACTIVE, being followed) with its instalments. The StrataVerze set-up fee,
 * when charging is on, is charged to the owners corporation only.
 */
export async function recordPaymentPlanDecision(input: {
  schemeId: string;
  requestId: string;
  actorId: string;
  decision: Omit<DecisionInput, "interestWaiverRequested">;
  terms: ApprovedTerms | null;
  feeConfirmedCents: number | null;
}) {
  const [{ rules, label }, today, request] = await Promise.all([
    rulesForScheme(input.schemeId),
    schemeToday(input.schemeId),
    db.orm.public.PaymentPlanRequest.where((r) => r.id.eq(input.requestId)).first(),
  ]);
  // Before any write, whatever the decision: only buildings whose pack has the payment plan workflow.
  if (!rules.FEATURES.statutoryPaymentPlans) throw new PaymentPlanError(NOT_AVAILABLE);
  if (!request || request.schemeId !== input.schemeId) throw new PaymentPlanError("Request not found.");
  if (request.status !== "RECEIVED") throw new PaymentPlanError("This request has already been decided or withdrawn.");

  const decision: DecisionInput = { ...input.decision, interestWaiverRequested: !!request.interestWaiverRequested };
  const problems = decisionProblems(decision, day(request.receivedOn), today);
  if (decision.decision === "APPROVED") {
    if (!input.terms) problems.terms = "Enter the agreed terms.";
    else {
      Object.assign(problems, termsProblems(input.terms, needRule(rules, "PAYMENT_PLANS")));
      if (input.terms.agreedOn < decision.meetingOn) problems.agreedOn = "The plan cannot be agreed before the meeting that approved it.";
      if (input.terms.agreedOn > today) problems.agreedOn = "The date agreed cannot be in the future.";
      // The statement must add up: overdue levies plus interest (unless waived), plus current levies if covered.
      const owing = input.terms.leviesOwingCents + (decision.interestWaiver === "WAIVED" ? 0 : input.terms.interestOwingCents);
      if (!problems.totalCents && !input.terms.coversCurrentLevies && input.terms.totalCents !== owing) {
        problems.totalCents = `The plan covers overdue levies only, so the amount should be the levies owing${decision.interestWaiver === "WAIVED" ? "" : " plus the interest owing"}.`;
      }
      if (!problems.totalCents && input.terms.coversCurrentLevies && input.terms.totalCents < owing) problems.totalCents = "The amount cannot be less than the overdue levies and interest it covers.";
      if (!input.terms.paymentMethods.trim()) problems.paymentMethods = "Enter how the owner can pay.";
      if (!input.terms.contactDetails.trim()) problems.contactDetails = "Enter the contact for questions about the plan.";
      if (!input.terms.interestMethod.trim()) problems.interestMethod = "Say how interest is calculated (or that it is waived).";
      if (input.terms.leviesOwingCents < 0 || input.terms.interestOwingCents < 0) problems.leviesOwingCents = "Amounts owing cannot be negative.";
    }
  }
  if (Object.keys(problems).length) throw new PaymentPlanError("Check the decision.", problems);

  const active = await db.orm.public.PaymentPlan.where((p) => and(p.lotId.eq(request.lotId), p.status.eq("ACTIVE"))).first();
  if (decision.decision === "APPROVED" && active) throw new PaymentPlanError("This lot already has a payment plan being followed.");

  const recordedAt = new Date().toISOString();
  // The lot's open case now (the one the request was linked to may have closed since).
  const caseId = (await openCaseFor(input.schemeId, request.lotId))?.id ?? null;
  let planId: string | null = null;

  try {
  await db.transaction(async (tx) => {
    // Claim the request first: a decision or withdrawal made at the same moment finds it no longer RECEIVED.
    const claimed = await tx.orm.public.PaymentPlanRequest.where((r) => and(r.id.eq(request.id), r.status.eq("RECEIVED"))).updateAndCount({
      status: decision.decision,
      caseId,
      decisionBody: decision.body,
      decidedOn: decision.meetingOn,
      decisionRecordedBy: input.actorId,
      decisionRecordedAt: recordedAt,
      refusalReasons: decision.decision === "REFUSED" ? decision.refusalReasons.trim() : null,
      interestWaiver: request.interestWaiverRequested ? decision.interestWaiver : null,
    });
    if (claimed !== 1) throw new PaymentPlanError("This request has just been decided or withdrawn. Reload the page.");
    if (decision.decision === "APPROVED" && input.terms) {
      const t = input.terms;
      const schedule = instalmentSchedule({ totalCents: t.totalCents, numberOfInstalments: t.numberOfInstalments, startOn: t.startOn, frequency: t.frequency as PlanFrequency });
      const plan = (await tx.orm.public.PaymentPlan.create({
        caseId,
        schemeId: input.schemeId,
        lotId: request.lotId,
        requestId: request.id,
        agreedOn: t.agreedOn,
        coversCurrentLevies: t.coversCurrentLevies,
        leviesOwing: money(t.leviesOwingCents),
        interestOwing: money(t.interestOwingCents),
        interestMethod: t.interestMethod.trim(),
        paymentMethods: t.paymentMethods.trim(),
        contactDetails: t.contactDetails.trim(),
        rulePack: label,
        totalAmount: money(t.totalCents),
        instalmentAmount: money(schedule[0].amountCents),
        frequency: t.frequency,
        startDate: t.startOn,
        endDate: schedule[schedule.length - 1].dueOn,
        numberOfInstalments: t.numberOfInstalments,
        includesInterest: t.interestOwingCents > 0 && decision.interestWaiver !== "WAIVED",
        includesOngoing: t.coversCurrentLevies,
        interestWaived: decision.interestWaiver === "WAIVED",
        status: "ACTIVE",
        approvedBy: input.actorId,
        approvedAt: recordedAt,
      })) as { id: string };
      planId = plan.id;
      for (const i of schedule) {
        await tx.orm.public.PaymentPlanInstalment.create({ planId: plan.id, instalmentNumber: i.instalmentNumber, dueDate: i.dueOn, amount: money(i.amountCents) });
      }
      // StrataVerze's set-up fee: charged to the owners corporation, never to the owner.
      await captureUsageFee(tx.orm, {
        schemeId: input.schemeId,
        code: "RECOVERY_STEP",
        variant: "PAYMENT_PLAN",
        sourceType: "PaymentPlan",
        sourceId: plan.id,
        actorId: input.actorId,
        payerProfileId: null,
        confirmedCents: input.feeConfirmedCents,
      });
    }
  });
  } catch (err) {
    if (isUniqueViolation(err)) throw new PaymentPlanError("This lot already has a payment plan being followed.");
    throw err;
  }

  if (caseId) {
    if (planId) await updateDebtRecoveryCase(caseId, { status: "PAYMENT_PLAN" });
    await logDebtRecoveryActivity({
      caseId,
      activityType: planId ? "PAYMENT_PLAN_CREATED" : "PAYMENT_PLAN_REFUSED",
      description: planId
        ? `Payment plan approved at the meeting of ${decision.meetingOn}: ${input.terms!.numberOfInstalments} ${input.terms!.frequency.toLowerCase()} instalments.`
        : `Payment plan request refused at the meeting of ${decision.meetingOn}.`,
      performedBy: input.actorId,
    });
  }
  return { planId, caseId };
}

/** Record the date the written reply was given to the owner. */
export async function recordPaymentPlanReply(input: { schemeId: string; requestId: string; repliedOn: string }) {
  const [request, today] = await Promise.all([
    db.orm.public.PaymentPlanRequest.where((r) => r.id.eq(input.requestId)).first(),
    schemeToday(input.schemeId),
  ]);
  if (!request || request.schemeId !== input.schemeId) throw new PaymentPlanError("Request not found.");
  if (request.status !== "APPROVED" && request.status !== "REFUSED") throw new PaymentPlanError("Record the decision before the reply.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.repliedOn) || input.repliedOn > today || input.repliedOn < day(request.decidedOn)) {
    throw new PaymentPlanError("Enter the date the written reply was given.", { repliedOn: "Enter a date from the day of the meeting that decided it to today." });
  }
  await db.orm.public.PaymentPlanRequest.where((r) => r.id.eq(input.requestId)).update({ repliedOn: input.repliedOn });
}

/** The owner (or the adviser for them) withdraws a request that has not been decided. */
export async function withdrawPaymentPlanRequest(input: { schemeId: string; requestId: string; lotId?: string }) {
  const request = await db.orm.public.PaymentPlanRequest.where((r) => r.id.eq(input.requestId)).first();
  if (!request || request.schemeId !== input.schemeId || (input.lotId && request.lotId !== input.lotId)) throw new PaymentPlanError("Request not found.");
  const n = await db.orm.public.PaymentPlanRequest.where((r) => and(r.id.eq(input.requestId), r.status.eq("RECEIVED"))).updateAndCount({ status: "WITHDRAWN" });
  if (n !== 1) throw new PaymentPlanError("Only a request waiting for a decision can be withdrawn.");
}

/**
 * Mark a plan as not followed. Recovery steps that waited for the plan can
 * then go ahead for the levies it covered.
 */
export async function markPaymentPlanNotFollowed(input: { schemeId: string; planId: string; reason: string; actorId: string }) {
  const plan = await db.orm.public.PaymentPlan.where((p) => p.id.eq(input.planId)).first();
  if (!plan || plan.schemeId !== input.schemeId) throw new PaymentPlanError("Payment plan not found.");
  if (input.reason.trim().length < 10) throw new PaymentPlanError("Say how the plan was not followed.", { reason: "Say how the plan was not followed (for example, which instalments were missed)." });
  const n = await db.orm.public.PaymentPlan.where((p) => and(p.id.eq(input.planId), p.status.eq("ACTIVE"))).updateAndCount({ status: "DEFAULTED", defaultedAt: new Date().toISOString(), defaultReason: input.reason.trim() });
  if (n !== 1) throw new PaymentPlanError("Only a plan being followed can be marked as not followed.");
  if (plan.caseId) {
    const c = await db.orm.public.DebtRecoveryCase.where((x) => x.id.eq(plan.caseId!)).first();
    if (c && !(CLOSED_STATUSES as readonly string[]).includes(String(c.status))) await updateDebtRecoveryCase(plan.caseId, { status: "IN_PROGRESS" });
    await logDebtRecoveryActivity({ caseId: plan.caseId, activityType: "PAYMENT_PLAN_DEFAULTED", description: `Payment plan marked as not followed: ${input.reason.trim()}`, performedBy: input.actorId });
  }
}

/**
 * Record a payment towards an instalment. Payments add up; the instalment is
 * paid when they reach its amount, and the plan is completed when every
 * instalment is paid.
 */
export async function recordPlanInstalmentPayment(input: { schemeId: string; planId: string; instalmentId: string; amountCents: number; paidOn: string; actorId: string }) {
  if (!(Number.isInteger(input.amountCents) && input.amountCents > 0)) throw new PaymentPlanError("Enter the amount paid.", { amount: "Enter the amount paid." });
  const today = await schemeToday(input.schemeId);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paidOn) || input.paidOn > today) throw new PaymentPlanError("Enter the date it was paid.", { paidOn: "Enter a date up to today." });
  const [plan, instalment] = await Promise.all([
    db.orm.public.PaymentPlan.where((p) => p.id.eq(input.planId)).first(),
    db.orm.public.PaymentPlanInstalment.where((i) => i.id.eq(input.instalmentId)).first(),
  ]);
  if (!plan || plan.schemeId !== input.schemeId || !instalment || instalment.planId !== plan.id) throw new PaymentPlanError("Instalment not found.");
  if (plan.status !== "ACTIVE" && plan.status !== "DEFAULTED") throw new PaymentPlanError("This plan is not open.");
  if (instalment.status === "PAID") throw new PaymentPlanError("This instalment is already paid.");
  const previous = String(instalment.amountPaid ?? 0);
  const paidCents = toCents(previous) + input.amountCents;
  const fully = paidCents >= toCents(String(instalment.amount));
  // Only if nobody recorded a payment in the meantime (the amount paid is still what was read).
  const n = await db.orm.public.PaymentPlanInstalment.where((i) => and(i.id.eq(instalment.id), i.amountPaid.eq(instalment.amountPaid))).updateAndCount({
    amountPaid: money(paidCents),
    status: fully ? "PAID" : "PARTIALLY_PAID",
    paidAt: `${input.paidOn}T00:00:00Z`,
  });
  if (n !== 1) throw new PaymentPlanError(`Another payment was recorded on this instalment at the same moment (${previous} was paid before). Reload the page and check.`);
  const all = await db.orm.public.PaymentPlanInstalment.where((i) => i.planId.eq(plan.id)).limit(500).all();
  const allPaid = all.every((i) => i.status === "PAID");
  if (plan.caseId) {
    await logDebtRecoveryActivity({ caseId: plan.caseId, activityType: "PAYMENT_RECEIVED", description: `Instalment ${instalment.instalmentNumber} payment of $${fromCents(input.amountCents).toFixed(2)} recorded (paid ${input.paidOn}).`, performedBy: input.actorId });
  }
  if (allPaid) await completePlan({ planId: plan.id, caseId: plan.caseId ?? null, actorId: input.actorId });
  return { completed: allPaid };
}

/**
 * Every instalment is paid: the plan is completed, and its recovery case (if
 * open) is closed as paid. The one place this happens.
 */
async function completePlan(input: { planId: string; caseId: string | null; actorId: string }) {
  const n = await db.orm.public.PaymentPlan.where((p) => and(p.id.eq(input.planId), p.status.in(["ACTIVE", "DEFAULTED"]))).updateAndCount({ status: "COMPLETED" });
  if (n !== 1 || !input.caseId) return;
  const c = await db.orm.public.DebtRecoveryCase.where((x) => x.id.eq(input.caseId!)).first();
  if (!c || (CLOSED_STATUSES as readonly string[]).includes(String(c.status))) return;
  await updateDebtRecoveryCase(input.caseId, { status: "CLOSED_PAID", closedAt: new Date().toISOString(), closedReason: "All payment plan instalments paid", currentStep: "CLOSED" });
  await logDebtRecoveryActivity({ caseId: input.caseId, activityType: "CASE_CLOSED", description: "Case closed: all payment plan instalments paid", performedBy: input.actorId });
}

/** Requests and plans for a building, newest first, with lot numbers. */
export async function paymentPlanOverview(schemeId: string) {
  const [requests, plans, lots] = await Promise.all([
    db.orm.public.PaymentPlanRequest.where((r) => r.schemeId.eq(schemeId)).orderBy((r) => r.createdAt.desc()).limit(500).all(),
    db.orm.public.PaymentPlan.where((p) => p.schemeId.eq(schemeId)).orderBy((p) => p.createdAt.desc()).limit(500).all(),
    db.orm.public.Lot.where((l) => l.schemeId.eq(schemeId)).limit(5000).all(),
  ]);
  const lotNumber = new Map(lots.map((l) => [l.id, String(l.lotNumber)]));
  return { requests, plans, lotNumber };
}

/** One request with its plan and instalments. */
export async function paymentPlanRequestDetail(schemeId: string, requestId: string) {
  const request = await db.orm.public.PaymentPlanRequest.where((r) => r.id.eq(requestId)).first();
  if (!request || request.schemeId !== schemeId) return null;
  const plan = await db.orm.public.PaymentPlan.where((p) => p.requestId.eq(requestId)).first();
  const instalments = plan
    ? await db.orm.public.PaymentPlanInstalment.where((i) => i.planId.eq(plan.id)).orderBy((i) => i.instalmentNumber.asc()).limit(500).all()
    : [];
  const lot = await db.orm.public.Lot.where((l) => l.id.eq(request.lotId)).first();
  return { request, plan, instalments, lotNumber: String(lot?.lotNumber ?? "") };
}

/**
 * Suggested values for an approval: what the lot owes now, how interest is
 * calculated under the building's rule pack, how to pay (the operating
 * account) and who to contact. The adviser checks and edits them.
 */
export async function decisionDefaults(schemeId: string, lotId: string, actorId: string) {
  const { getSchemeInterestSetting } = await import("@/lib/finance/interest-setting");
  const { graceText } = await import("@/lib/jurisdiction/wording");
  const [today, setting, lot, accounts, actor] = await Promise.all([
    schemeToday(schemeId),
    getSchemeInterestSetting(schemeId),
    db.orm.public.Lot.where((l) => l.id.eq(lotId)).first(),
    db.orm.public.SchemeBankAccount.where((a) => and(a.schemeId.eq(schemeId), a.isActive.eq(true))).limit(20).all(),
    db.orm.public.Profile.where((p) => p.id.eq(actorId)).first(),
  ]);
  const rules = setting.rules.rules;
  const { leviesCents, interestCents } = await lotArrears(schemeId, lotId, today, rules.PAYMENT_ALLOCATION_ORDER);
  const i = needRule(rules, "STATUTORY_INTEREST");
  const citations = needRule(rules, "CITATIONS");
  const interestMethod =
    setting.mode === "NO_INTEREST"
      ? `No interest is charged: the ${rules.TERMINOLOGY.ownersCorporation} has resolved that contributions bear no interest (${citations.noInterestResolution}).`
      : `Simple interest at ${i.annualRatePercent}% a year on each levy not paid ${graceText(i)} after its due date, from the due date (${citations.interest}).`;
  const account = accounts.find((a) => a.isOperating) ?? accounts[0] ?? null;
  const reference = `Lot ${String(lot?.lotNumber ?? "")}`.trim();
  const paymentMethods = account
    ? `Bank transfer to ${String(account.accountName ?? "")}, BSB ${String(account.bsb ?? "")}, account ${String(account.accountNumber ?? "")}, reference "${reference}".`
    : "";
  const contactDetails = actor ? [`${actor.firstName ?? ""} ${actor.lastName ?? ""}`.trim(), actor.email ?? "", actor.phone ?? ""].filter(Boolean).join(", ") : "";
  return { today, leviesCents, interestCents, interestMethod, paymentMethods, contactDetails, rules: needRule(rules, "PAYMENT_PLANS") };
}
