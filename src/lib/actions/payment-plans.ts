"use server";
/**
 * Payment plan actions. Advisers record requests that arrive by email, post
 * or in person, the meeting's decision, the reply date, payments and a plan
 * that is not followed. Owners ask for a plan on the standard form in the
 * owner portal, and can withdraw a request that has not been decided.
 */
import { revalidatePath } from "next/cache";
import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "@/prisma/db";
import { AuthorisationError, requireSchemeMembership } from "@/lib/auth/require-membership";
import { confirmedCentsFrom, feeErrorMessage } from "@/lib/billing/disclosure";
import { logError } from "@/lib/log";
import { UnsupportedJurisdictionError } from "@/config/statutory";
import {
  PaymentPlanError,
  lotOfPlan,
  lotOfRequest,
  lotOwnerProfileIds,
  markPaymentPlanNotFollowed,
  recordPaymentPlanDecision,
  recordPaymentPlanReply,
  recordPaymentPlanRequest,
  recordPlanInstalmentPayment,
  withdrawPaymentPlanRequest,
} from "@/lib/debt-recovery/payment-plan-requests";
import { notifyPaymentPlanDecision, notifyPaymentPlanRequest } from "@/lib/debt-recovery/payment-plan-notify";
import type { RequestInput } from "@/lib/debt-recovery/payment-plans";

export type PaymentPlanFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
  id?: string;
  /** The values submitted, so a form shows them again after an error. */
  values?: Record<string, string>;
};

/** The submitted text values (not files), echoed back after an error. */
const echo = (f: FormData) => Object.fromEntries([...f.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;

/**
 * An adviser who owns (or recently owned) the lot does not act on its
 * payment plan (security finding SEC-003). Throws AuthorisationError.
 */
async function notOwnLot(schemeId: string, profileId: string, lotId: string | null) {
  if (!lotId) throw new PaymentPlanError("Not found.");
  if ((await lotOwnerProfileIds(schemeId, lotId)).includes(profileId)) {
    throw new AuthorisationError("You own this lot, so another adviser or the committee must handle its payment plan.");
  }
}

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
/** Dollars as typed ("1,250.50") to cents, or null when blank, or NaN when not a number. */
function cents(f: FormData, k: string): number | null {
  const v = text(f, k).replace(/[$,\s]/g, "");
  if (!v) return null;
  return /^\d+(\.\d{1,2})?$/.test(v) ? Math.round(Number(v) * 100) : Number.NaN;
}
const int = (f: FormData, k: string) => {
  const v = text(f, k);
  return v ? (/^\d+$/.test(v) ? Number(v) : Number.NaN) : null;
};

function failure(err: unknown, what: string): PaymentPlanFormState {
  if (err instanceof PaymentPlanError) return { error: err.message, fieldErrors: err.fieldErrors };
  if (err instanceof AuthorisationError || err instanceof UnsupportedJurisdictionError) return { error: err.message };
  const fee = feeErrorMessage(err);
  if (fee) return { error: fee };
  logError(`[payment plans] ${what} failed:`, err);
  return { error: `Could not ${what}. Try again.` };
}

function requestForm(f: FormData, receivedOn: string): RequestInput {
  return {
    ownerNames: text(f, "ownerNames"),
    receivedOn,
    hardshipStatement: f.get("hardshipStatement") === "on",
    currentDebtCents: cents(f, "currentDebt"),
    proposedInstalmentCents: cents(f, "proposedInstalment"),
    proposedFrequency: text(f, "proposedFrequency") || null,
    proposedMonths: int(f, "proposedMonths"),
    interestWaiverRequested: f.get("interestWaiverRequested") === "on",
  };
}

const paths = (schemeId: string) => {
  revalidatePath(`/adviser/schemes/${schemeId}/finance/debt-recovery`, "layout");
  revalidatePath("/owner/levies", "layout");
};

/** Adviser: record a request received by email, post or in person. */
export async function recordPaymentPlanRequestAction(schemeId: string, _prev: PaymentPlanFormState, formData: FormData): Promise<PaymentPlanFormState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    const lotId = text(formData, "lotId");
    await notOwnLot(schemeId, profile.id, lotId || null);
    const r = await recordPaymentPlanRequest({
      schemeId,
      lotId,
      source: "RECEIVED",
      submittedBy: profile.id,
      form: requestForm(formData, text(formData, "receivedOn")),
      notes: text(formData, "notes") || null,
    });
    await notifyPaymentPlanRequest({ schemeId, requestId: r.id, lotId, replyDueOn: r.replyDueOn, submittedBy: profile.id });
    paths(schemeId);
    return { success: `Request recorded. The written reply is due by ${r.replyDueOn}.`, id: r.id };
  } catch (err) {
    return { ...failure(err, "record the request"), values: echo(formData) };
  }
}

/** Owner: ask for a payment plan on the standard form for a lot they own. */
export async function ownerRequestPaymentPlanAction(schemeId: string, lotId: string, _prev: PaymentPlanFormState, formData: FormData): Promise<PaymentPlanFormState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["OWNER"]);
    const owns = await db.orm.public.SchemeMembership
      .where((m) => and(m.schemeId.eq(schemeId), m.profileId.eq(profile.id), m.lotId.eq(lotId), m.role.eq("OWNER"), m.isActive.eq(true)))
      .first();
    if (!owns) return { error: "You can ask for a payment plan only for a lot you own." };
    const { schemeToday } = await import("@/lib/jurisdiction/scheme-time");
    const r = await recordPaymentPlanRequest({
      schemeId,
      lotId,
      source: "OWNER_PORTAL",
      submittedBy: profile.id,
      // Received today: a request made in the portal reaches the owners corporation when it is sent.
      form: requestForm(formData, await schemeToday(schemeId)),
    });
    await notifyPaymentPlanRequest({ schemeId, requestId: r.id, lotId, replyDueOn: r.replyDueOn, submittedBy: profile.id });
    paths(schemeId);
    return { success: `Your request has been sent. You will get a written reply by ${r.replyDueOn}.`, id: r.id };
  } catch (err) {
    return { ...failure(err, "send the request"), values: echo(formData) };
  }
}

/** Owner: withdraw their own request before it is decided. */
export async function ownerWithdrawPaymentPlanRequestAction(schemeId: string, lotId: string, requestId: string): Promise<PaymentPlanFormState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["OWNER"]);
    const owns = await db.orm.public.SchemeMembership
      .where((m) => and(m.schemeId.eq(schemeId), m.profileId.eq(profile.id), m.lotId.eq(lotId), m.role.eq("OWNER"), m.isActive.eq(true)))
      .first();
    if (!owns) return { error: "Request not found." };
    await withdrawPaymentPlanRequest({ schemeId, requestId, lotId });
    paths(schemeId);
    return { success: "Request withdrawn." };
  } catch (err) {
    return failure(err, "withdraw the request");
  }
}

/** Adviser: withdraw a request at the owner's direction. */
export async function withdrawPaymentPlanRequestAction(schemeId: string, requestId: string): Promise<PaymentPlanFormState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    await notOwnLot(schemeId, profile.id, await lotOfRequest(schemeId, requestId));
    await withdrawPaymentPlanRequest({ schemeId, requestId });
    paths(schemeId);
    return { success: "Request withdrawn." };
  } catch (err) {
    return failure(err, "withdraw the request");
  }
}

/** Adviser: record the decision of the owners corporation or strata committee meeting. */
export async function recordPaymentPlanDecisionAction(schemeId: string, requestId: string, _prev: PaymentPlanFormState, formData: FormData): Promise<PaymentPlanFormState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    await notOwnLot(schemeId, profile.id, await lotOfRequest(schemeId, requestId));
    const decision = text(formData, "decision");
    const approved = decision === "APPROVED";
    const total = cents(formData, "totalAmount");
    const levies = cents(formData, "leviesOwing");
    const interest = cents(formData, "interestOwing");
    const r = await recordPaymentPlanDecision({
      schemeId,
      requestId,
      actorId: profile.id,
      decision: {
        decision,
        body: text(formData, "body"),
        meetingOn: text(formData, "meetingOn"),
        majorityVote: formData.get("majorityVote") === "on",
        refusalReasons: text(formData, "refusalReasons"),
        interestWaiver: text(formData, "interestWaiver"),
      },
      terms: approved
        ? {
            totalCents: total ?? Number.NaN,
            numberOfInstalments: int(formData, "numberOfInstalments") ?? Number.NaN,
            frequency: text(formData, "frequency"),
            startOn: text(formData, "startOn"),
            agreedOn: text(formData, "agreedOn"),
            coversCurrentLevies: formData.get("coversCurrentLevies") === "on",
            leviesOwingCents: levies ?? 0,
            interestOwingCents: interest ?? 0,
            interestMethod: text(formData, "interestMethod"),
            paymentMethods: text(formData, "paymentMethods"),
            contactDetails: text(formData, "contactDetails"),
          }
        : null,
      feeConfirmedCents: approved ? confirmedCentsFrom(formData) : null,
    });
    await notifyPaymentPlanDecision({ schemeId, requestId, approved });
    paths(schemeId);
    return { success: approved ? "Approval recorded and the plan set up. Give the owner the written reply." : "Refusal recorded. Give the owner the written reply with the reasons.", id: r.planId ?? undefined };
  } catch (err) {
    return { ...failure(err, "record the decision"), values: echo(formData) };
  }
}

/** Adviser: record the date the written reply was given. */
export async function recordPaymentPlanReplyAction(schemeId: string, requestId: string, _prev: PaymentPlanFormState, formData: FormData): Promise<PaymentPlanFormState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    await notOwnLot(schemeId, profile.id, await lotOfRequest(schemeId, requestId));
    await recordPaymentPlanReply({ schemeId, requestId, repliedOn: text(formData, "repliedOn") });
    paths(schemeId);
    return { success: "Reply date recorded." };
  } catch (err) {
    return { ...failure(err, "record the reply date"), values: echo(formData) };
  }
}

/** Adviser: mark a plan as not followed, so recovery can resume. */
export async function markPaymentPlanNotFollowedAction(schemeId: string, planId: string, _prev: PaymentPlanFormState, formData: FormData): Promise<PaymentPlanFormState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    await notOwnLot(schemeId, profile.id, await lotOfPlan(schemeId, planId));
    await markPaymentPlanNotFollowed({ schemeId, planId, reason: text(formData, "reason"), actorId: profile.id });
    paths(schemeId);
    return { success: "Plan marked as not followed. Recovery steps can go ahead." };
  } catch (err) {
    return { ...failure(err, "update the plan"), values: echo(formData) };
  }
}

/** Adviser: record a payment towards an instalment. */
export async function recordPlanInstalmentPaymentAction(schemeId: string, planId: string, _prev: PaymentPlanFormState, formData: FormData): Promise<PaymentPlanFormState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    await notOwnLot(schemeId, profile.id, await lotOfPlan(schemeId, planId));
    const r = await recordPlanInstalmentPayment({
      schemeId,
      planId,
      instalmentId: text(formData, "instalmentId"),
      amountCents: cents(formData, "amount") ?? Number.NaN,
      paidOn: text(formData, "paidOn"),
      actorId: profile.id,
    });
    paths(schemeId);
    return { success: r.completed ? "Payment recorded. Every instalment is paid and the plan is complete." : "Payment recorded." };
  } catch (err) {
    return { ...failure(err, "record the payment"), values: echo(formData) };
  }
}
