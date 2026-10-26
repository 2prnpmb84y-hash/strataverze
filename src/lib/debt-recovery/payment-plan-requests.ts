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

export class PaymentPlanError extends Error {
  constructor(message: string, readonly fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = "PaymentPlanError";
  }
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
 * interest, with payments applied to the levy first, then interest.
 */
export async function lotArrears(schemeId: string, lotId: string, today: string) {
  const notices = await db.orm.public.LevyNotice.where((n) => and(n.schemeId.eq(schemeId), n.lotId.eq(lotId), n.status.neq("DRAFT"), n.status.neq("WRITTEN_OFF"))).limit(2000).all();
  let leviesCents = 0;
  let interestCents = 0;
  for (const n of notices) {
    if (day(n.dueDate) >= today) continue;
    const due = toCents(String(n.amountDue));
    const paid = toCents(String(n.amountPaid ?? 0));
    const interest = toCents(String(n.interestCharged ?? 0));
    leviesCents += Math.max(0, due - paid);
    interestCents += Math.max(0, interest - Math.max(0, paid - due));
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
  if (!lot || lot.schemeId !== input.schemeId) throw new PaymentPlanError("Lot not found.");
  const problems = requestProblems(input.form, rules.PAYMENT_PLANS, today);
  if (Object.keys(problems).length) throw new PaymentPlanError("Check the request.", problems);

  const [open, active] = await Promise.all([
    db.orm.public.PaymentPlanRequest.where((r) => and(r.lotId.eq(input.lotId), r.status.eq("RECEIVED"))).first(),
    db.orm.public.PaymentPlan.where((p) => and(p.lotId.eq(input.lotId), p.status.eq("ACTIVE"))).first(),
  ]);
  if (open) throw new PaymentPlanError("A request for this lot is already waiting for a decision.");
  if (active) throw new PaymentPlanError("This lot already has a payment plan being followed. Ask for an extension instead.");

  const caseRow = await openCaseFor(input.schemeId, input.lotId);
  const f = input.form;
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
    replyDueOn: replyDueOn(f.receivedOn, rules.PAYMENT_PLANS),
    source: input.source,
    submittedBy: input.submittedBy,
    status: "RECEIVED",
    rulePack: label,
    notes: input.notes?.trim() || null,
  });
  if (caseRow) {
    await logDebtRecoveryActivity({
      caseId: caseRow.id,
      activityType: "PAYMENT_PLAN_REQUESTED",
      description: `Payment plan requested on the standard form (received ${f.receivedOn}). Written reply due by ${replyDueOn(f.receivedOn, rules.PAYMENT_PLANS)}.`,
      performedBy: input.submittedBy,
    });
  }
  return { id: String((created as { id: string }).id), replyDueOn: replyDueOn(f.receivedOn, rules.PAYMENT_PLANS), caseId: caseRow?.id ?? null };
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
  if (!request || request.schemeId !== input.schemeId) throw new PaymentPlanError("Request not found.");
  if (request.status !== "RECEIVED") throw new PaymentPlanError("This request has already been decided or withdrawn.");

  const decision: DecisionInput = { ...input.decision, interestWaiverRequested: !!request.interestWaiverRequested };
  const problems = decisionProblems(decision, day(request.receivedOn), today);
  if (decision.decision === "APPROVED") {
    if (!input.terms) problems.terms = "Enter the agreed terms.";
    else {
      Object.assign(problems, termsProblems(input.terms, rules.PAYMENT_PLANS));
      if (input.terms.agreedOn < decision.meetingOn) problems.agreedOn = "The plan cannot be agreed before the meeting that approved it.";
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
  const caseId = request.caseId ?? (await openCaseFor(input.schemeId, request.lotId))?.id ?? null;
  let planId: string | null = null;

  await db.transaction(async (tx) => {
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
    await tx.orm.public.PaymentPlanRequest.where((r) => r.id.eq(request.id)).update({
      status: decision.decision,
      caseId,
      decisionBody: decision.body,
      decidedOn: decision.meetingOn,
      decisionRecordedBy: input.actorId,
      decisionRecordedAt: recordedAt,
      refusalReasons: decision.decision === "REFUSED" ? decision.refusalReasons.trim() : null,
      interestWaiver: request.interestWaiverRequested ? decision.interestWaiver : null,
    });
  });

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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.repliedOn) || input.repliedOn > today || input.repliedOn < day(request.receivedOn)) {
    throw new PaymentPlanError("Enter the date the written reply was given.", { repliedOn: "Enter a date from the day the request was received to today." });
  }
  await db.orm.public.PaymentPlanRequest.where((r) => r.id.eq(input.requestId)).update({ repliedOn: input.repliedOn });
}

/** The owner (or the adviser for them) withdraws a request that has not been decided. */
export async function withdrawPaymentPlanRequest(input: { schemeId: string; requestId: string; lotId?: string }) {
  const request = await db.orm.public.PaymentPlanRequest.where((r) => r.id.eq(input.requestId)).first();
  if (!request || request.schemeId !== input.schemeId || (input.lotId && request.lotId !== input.lotId)) throw new PaymentPlanError("Request not found.");
  if (request.status !== "RECEIVED") throw new PaymentPlanError("Only a request waiting for a decision can be withdrawn.");
  await db.orm.public.PaymentPlanRequest.where((r) => r.id.eq(input.requestId)).update({ status: "WITHDRAWN" });
}

/**
 * Mark a plan as not followed. Recovery steps that waited for the plan can
 * then go ahead for the levies it covered.
 */
export async function markPaymentPlanNotFollowed(input: { schemeId: string; planId: string; reason: string; actorId: string }) {
  const plan = await db.orm.public.PaymentPlan.where((p) => p.id.eq(input.planId)).first();
  if (!plan || plan.schemeId !== input.schemeId) throw new PaymentPlanError("Payment plan not found.");
  if (plan.status !== "ACTIVE") throw new PaymentPlanError("Only a plan being followed can be marked as not followed.");
  if (input.reason.trim().length < 10) throw new PaymentPlanError("Say how the plan was not followed.", { reason: "Say how the plan was not followed (for example, which instalments were missed)." });
  await db.orm.public.PaymentPlan.where((p) => p.id.eq(input.planId)).update({ status: "DEFAULTED", defaultedAt: new Date().toISOString(), defaultReason: input.reason.trim() });
  if (plan.caseId) {
    await updateDebtRecoveryCase(plan.caseId, { status: "IN_PROGRESS" });
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
  const paidCents = toCents(String(instalment.amountPaid ?? 0)) + input.amountCents;
  const fully = paidCents >= toCents(String(instalment.amount));
  await db.orm.public.PaymentPlanInstalment.where((i) => i.id.eq(instalment.id)).update({
    amountPaid: money(paidCents),
    status: fully ? "PAID" : "PARTIALLY_PAID",
    paidAt: `${input.paidOn}T00:00:00Z`,
  });
  const all = await db.orm.public.PaymentPlanInstalment.where((i) => i.planId.eq(plan.id)).limit(500).all();
  const allPaid = all.every((i) => (i.id === instalment.id ? fully : i.status === "PAID"));
  if (allPaid) await db.orm.public.PaymentPlan.where((p) => p.id.eq(plan.id)).update({ status: "COMPLETED" });
  if (plan.caseId) {
    await logDebtRecoveryActivity({ caseId: plan.caseId, activityType: "PAYMENT_RECEIVED", description: `Instalment ${instalment.instalmentNumber} payment of $${fromCents(input.amountCents).toFixed(2)} recorded (paid ${input.paidOn}).`, performedBy: input.actorId });
  }
  return { completed: allPaid };
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
  const { leviesCents, interestCents } = await lotArrears(schemeId, lotId, today);
  const rules = setting.rules.rules;
  const i = rules.STATUTORY_INTEREST;
  const interestMethod =
    setting.mode === "NO_INTEREST"
      ? `No interest is charged: the ${rules.TERMINOLOGY.ownersCorporation} has resolved that contributions bear no interest (${rules.CITATIONS.noInterestResolution}).`
      : `Simple interest at ${i.annualRatePercent}% a year on each levy not paid ${graceText(i)} after its due date, from the due date (${rules.CITATIONS.interest}).`;
  const account = accounts.find((a) => a.isOperating) ?? accounts[0] ?? null;
  const reference = `Lot ${String(lot?.lotNumber ?? "")}`.trim();
  const paymentMethods = account
    ? `Bank transfer to ${String(account.accountName ?? "")}, BSB ${String(account.bsb ?? "")}, account ${String(account.accountNumber ?? "")}, reference "${reference}".`
    : "";
  const contactDetails = actor ? [`${actor.firstName ?? ""} ${actor.lastName ?? ""}`.trim(), actor.email ?? "", actor.phone ?? ""].filter(Boolean).join(", ") : "";
  return { today, leviesCents, interestCents, interestMethod, paymentMethods, contactDetails, rules: rules.PAYMENT_PLANS };
}
