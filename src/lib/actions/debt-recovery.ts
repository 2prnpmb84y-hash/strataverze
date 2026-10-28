"use server";
import { logError } from "@/lib/log";

import { revalidatePath } from "next/cache";
import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "@/prisma/db";
import { requireSchemeMembership, AuthorisationError } from "@/lib/auth/require-membership";
import {
  caseAccessProblem,
  initiatingRole,
  isCaseClosed,
  isCasePriority,
  isCaseStatus,
  isClosedStatus,
  isValidAmount,
  MAX_NOTE_LENGTH,
} from "@/lib/auth/debt-recovery-access";
import { confirmedCentsFrom, feeErrorMessage } from "@/lib/billing/disclosure";
import { captureUsageFee } from "@/lib/billing/capture";
import { recoveryFeeVariant } from "@/lib/billing/hook-codes";
import {
  createDebtRecoveryCase,
  updateDebtRecoveryCase,
  createDebtRecoveryStep,
  updateDebtRecoveryStep,
  createDebtRecoveryDocument,
  logDebtRecoveryActivity,
  generateCaseNumber,
  getOverdueLevyNoticesForLot,
  getDebtRecoveryCaseById,
  getPaymentPlanForCase,
  getDebtRecoverySteps,
} from "@/lib/queries/debt-recovery";
import { messageTermsFor, rulesForScheme } from "@/lib/jurisdiction/scheme-rules";
import { UnsupportedJurisdictionError, needRule } from "@/config/statutory";
import { stepPausedByPlan } from "@/lib/debt-recovery/payment-plans";
import { lotOwnerIds } from "@/lib/debt-recovery/lot-owners";

type ActionResult = { error?: string; success?: boolean; id?: string };

/**
 * Authorise an action on an existing case: the caller must be an adviser or
 * committee member of the scheme, the case must belong to that scheme, and
 * the caller must not be the debtor. Throws AuthorisationError otherwise.
 */
async function authoriseCaseAction(
  caseId: string,
  schemeId: string,
  roles: ("ADVISER" | "COMMITTEE")[] = ["ADVISER", "COMMITTEE"],
) {
  const { profile } = await requireSchemeMembership(schemeId, roles);
  const caseRow = await getDebtRecoveryCaseById(caseId);
  const owners = caseRow ? await lotOwnerIds(schemeId, caseRow.lotId) : [];
  const problem = caseAccessProblem(caseRow, schemeId, profile.id, owners);
  if (problem || !caseRow) throw new AuthorisationError(problem ?? "Case not found.");
  return { profile, caseRow };
}

// ─── Initiate Debt Recovery Case ────────────────────────────────

export async function initiateDebtRecoveryAction(
  schemeId: string,
  lotId: string,
  ownerId: string,
  // Kept for the existing callers; the role recorded comes from the
  // caller's memberships, never from the client.
  _requestedRole?: "COMMITTEE" | "ADVISER",
): Promise<ActionResult> {
  try {
    const { profile, roles } = await requireSchemeMembership(schemeId, ["ADVISER", "COMMITTEE"]);
    const role = initiatingRole(roles);
    if (!role) return { error: "You do not have permission to perform this action." };

    // The lot must belong to this scheme, and the owner must be an active
    // owner of that lot. Nobody may open a case against their own lot.
    const lot = await db.orm.public.Lot.where({ id: lotId }).first();
    if (!lot || lot.schemeId !== schemeId) return { error: "Lot not found" };
    const ownerMembership = await db.orm.public.SchemeMembership
      .where((m) =>
        and(
          m.schemeId.eq(schemeId),
          m.lotId.eq(lotId),
          m.profileId.eq(ownerId),
          m.role.eq("OWNER"),
          m.isActive.eq(true),
        ),
      )
      .first();
    if (!ownerMembership) return { error: "That person is not an owner of this lot" };
    if (ownerId === profile.id) {
      return { error: "You cannot act on a debt recovery case for your own lot." };
    }

    // Gather overdue levy notices
    const overdueNotices = await getOverdueLevyNoticesForLot(schemeId, lotId);
    if (overdueNotices.length === 0) {
      return { error: `No overdue ${(await messageTermsFor(schemeId)).levy} notices found for this lot` };
    }

    const principalOwed = overdueNotices.reduce(
      (sum, n) => sum + Number(n.balanceOutstanding),
      0,
    );
    const interestOwed = overdueNotices.reduce(
      (sum, n) => sum + Number(n.interestCharged || 0),
      0,
    );
    const totalOwed = principalOwed + interestOwed;

    // The building's rule pack sets the recovery steps (throws for a state with no pack).
    const { rules, label: rulePack } = await rulesForScheme(schemeId);
    if (!rules.FEATURES.debtRecoverySteps) return { error: "This is not available for this building." };
    // Resolved before anything is written, so a pack without steps leaves no case behind.
    const steps = needRule(rules, "DEBT_RECOVERY_STEPS");
    const caseNumber = await generateCaseNumber(schemeId);

    const newCase = await createDebtRecoveryCase({
      schemeId,
      lotId,
      ownerId,
      caseNumber,
      principalOwed,
      interestOwed,
      totalOwed,
      initiatedBy: profile.id,
      initiatedRole: role,
      rulePack,
    });

    // The recovery steps of the building's rule pack. A step's `status` says
    // how far the rule was checked: pack data, never the case step's status.
    for (const { status: _ruleStatus, ...step } of steps) {
      await createDebtRecoveryStep({
        caseId: newCase.id,
        ...step,
      });
    }

    // A plan already being followed for the lot (agreed before any case) is
    // linked to the case, which starts in PAYMENT_PLAN: its recovery steps
    // wait while the plan is followed. Only for a pack with the payment plan
    // workflow (FEATURES.statutoryPaymentPlans).
    const followed = rules.FEATURES.statutoryPaymentPlans
      ? await db.orm.public.PaymentPlan.where((p) => and(p.lotId.eq(lotId), p.status.eq("ACTIVE"))).first()
      : null;
    if (followed) {
      if (!followed.caseId) await db.orm.public.PaymentPlan.where((p) => p.id.eq(followed.id)).update({ caseId: newCase.id });
      await updateDebtRecoveryCase(newCase.id, { status: "PAYMENT_PLAN" });
    }

    // Log the activity
    await logDebtRecoveryActivity({
      caseId: newCase.id,
      activityType: "CASE_OPENED",
      description: `Debt recovery case ${caseNumber} initiated by ${role.toLowerCase()} for $${totalOwed.toFixed(2)} owing`,
      performedBy: profile.id,
      metadata: {
        principalOwed,
        interestOwed,
        totalOwed,
        overdueNoticeCount: overdueNotices.length,
      },
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);
    revalidatePath(`/owner/levies`);

    return { success: true, id: newCase.id };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    if (err instanceof UnsupportedJurisdictionError) return { error: err.message };
    logError("Failed to initiate debt recovery:", err);
    return { error: "Failed to initiate debt recovery case" };
  }
}

// ─── Update Case ────────────────────────────────────────────────

export async function updateDebtRecoveryCaseAction(
  caseId: string,
  schemeId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const { profile, caseRow } = await authoriseCaseAction(caseId, schemeId);

    const data: Record<string, unknown> = {};
    const status = formData.get("status") as string;
    const priority = formData.get("priority") as string;
    const notes = formData.get("notes") as string;
    const solicitorRef = formData.get("solicitorRef") as string;
    const solicitorName = formData.get("solicitorName") as string;
    const courtFileNumber = formData.get("courtFileNumber") as string;
    const excludeFromRecovery = formData.get("excludeFromRecovery") === "on";
    const exclusionReason = formData.get("exclusionReason") as string;

    if (status && !isCaseStatus(status)) return { error: "Invalid case status" };
    // Closing goes through closeDebtRecoveryCaseAction, which records a reason.
    if (status && isClosedStatus(status) && status !== caseRow.status) {
      return { error: "Close the case from the close case form" };
    }
    if (priority && !isCasePriority(priority)) return { error: "Invalid priority" };
    if ((notes ?? "").length > MAX_NOTE_LENGTH || (exclusionReason ?? "").length > MAX_NOTE_LENGTH) {
      return { error: "Text is too long" };
    }
    if (excludeFromRecovery && !(exclusionReason ?? "").trim()) {
      return { error: "Give a reason for excluding this case from recovery" };
    }
    if (status === "REFERRED_LEGAL" && caseRow.status !== "REFERRED_LEGAL") {
      const followed = await db.orm.public.PaymentPlan.where((p) => and(p.lotId.eq(caseRow.lotId), p.status.eq("ACTIVE"))).limit(5).all();
      const { rules } = await rulesForScheme(schemeId);
      // Only a pack with the payment plan workflow pauses recovery for a plan.
      if (rules.FEATURES.statutoryPaymentPlans && stepPausedByPlan("LEGAL_REFERRAL", followed, needRule(rules, "PAYMENT_PLANS"))) {
        return { error: "A payment plan is being followed for this lot, so the case cannot be referred for legal recovery. Mark the plan as not followed first." };
      }
    }

    if (status) data.status = status;
    if (priority) data.priority = priority;
    if (notes !== null) data.notes = notes || null;
    if (solicitorRef !== null) data.solicitorRef = solicitorRef || null;
    if (solicitorName !== null) data.solicitorName = solicitorName || null;
    if (courtFileNumber !== null) data.courtFileNumber = courtFileNumber || null;
    data.excludeFromRecovery = excludeFromRecovery;
    if (exclusionReason !== null) data.exclusionReason = exclusionReason || null;

    await updateDebtRecoveryCase(caseId, data);

    await logDebtRecoveryActivity({
      caseId,
      activityType: "STATUS_CHANGED",
      description: `Case updated${status ? ` — status changed to ${status}` : ""}`,
      performedBy: profile.id,
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);
    revalidatePath(`/owner/levies`);

    return { success: true };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    logError("Failed to update debt recovery case:", err);
    return { error: "Failed to update case" };
  }
}

// ─── Advance Step ───────────────────────────────────────────────

export async function completeDebtRecoveryStepAction(
  stepId: string,
  caseId: string,
  schemeId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER", "COMMITTEE"]);

    const outcome = formData.get("outcome") as string;
    const evidenceNotes = formData.get("evidenceNotes") as string;
    const noticeMethod = formData.get("noticeMethod") as string;

    // The step must belong to this case, and the case to this scheme.
    const [step, caseRow] = await Promise.all([
      db.orm.public.DebtRecoveryStep.where({ id: stepId }).first(),
      getDebtRecoveryCaseById(caseId),
    ]);
    if (!step || step.caseId !== caseId || !caseRow || caseRow.schemeId !== schemeId) {
      return { error: "Step not found" };
    }
    const accessProblem = caseAccessProblem(caseRow, schemeId, profile.id, await lotOwnerIds(schemeId, caseRow.lotId));
    if (accessProblem) return { error: accessProblem };
    if (step.status === "COMPLETED") return { error: "This step is already complete" };

    // No recovery action for levies covered by a payment plan being followed (the building's rule pack).
    const [{ rules, pack }, lotPlans] = await Promise.all([
      rulesForScheme(schemeId),
      db.orm.public.PaymentPlan.where((p) => and(p.lotId.eq(caseRow.lotId), p.status.eq("ACTIVE"))).limit(5).all(),
    ]);
    // Only a pack with the payment plan workflow pauses recovery for a plan.
    if (rules.FEATURES.statutoryPaymentPlans && stepPausedByPlan(step.stepType, lotPlans, needRule(rules, "PAYMENT_PLANS"))) {
      return { error: "A payment plan is being followed for this lot, so this step waits. Mark the plan as not followed if instalments are missed." };
    }

    await db.transaction(async (tx) => {
      await updateDebtRecoveryStep(
        stepId,
        {
          status: "COMPLETED",
          completedAt: new Date().toISOString(),
          completedBy: profile.id,
          outcome: outcome || null,
          evidenceNotes: evidenceNotes || null,
          noticeMethod: noticeMethod || null,
          noticeSentAt: noticeMethod ? new Date().toISOString() : null,
        },
        tx.orm,
      );
      // StrataVerze recovery step fee, recoverable from the defaulting owner.
      const variant = recoveryFeeVariant(step.stepType);
      if (variant) {
        await captureUsageFee(tx.orm, {
          schemeId,
          code: "RECOVERY_STEP",
          variant,
          sourceType: "DebtRecoveryStep",
          sourceId: stepId,
          actorId: profile.id,
          payerProfileId: caseRow.ownerId ?? null,
          confirmedCents: confirmedCentsFrom(formData),
          // Which fees can be passed to the owner is the building's pack's.
          state: pack.state,
        });
      }
    });

    // The next step is the case's own next step (its steps were set from the
    // rule pack when it was opened), after the one just completed.
    const caseSteps = await getDebtRecoverySteps(caseId);
    const nextStep = caseSteps.find((s) => s.stepOrder > step.stepOrder);
    if (nextStep) {
      await updateDebtRecoveryCase(caseId, { currentStep: nextStep.stepType });
    }

    await logDebtRecoveryActivity({
      caseId,
      activityType: "STEP_ADVANCED",
      description: `Step completed: ${outcome || "No details provided"}`,
      performedBy: profile.id,
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);

    return { success: true };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    const feeError = feeErrorMessage(err);
    if (feeError) return { error: feeError };
    logError("Failed to complete step:", err);
    return { error: "Failed to complete step" };
  }
}

// ─── Close Case ─────────────────────────────────────────────────

export async function closeDebtRecoveryCaseAction(
  caseId: string,
  schemeId: string,
  closedReason: string,
  status: "CLOSED_PAID" | "CLOSED_WRITTEN_OFF" | "CLOSED_SETTLED",
): Promise<ActionResult> {
  try {
    const { profile, caseRow } = await authoriseCaseAction(caseId, schemeId);
    if (!isClosedStatus(status)) return { error: "Invalid closing status" };
    if (isCaseClosed(caseRow)) return { error: "This case is already closed" };
    const reason = (closedReason ?? "").trim();
    if (!reason) return { error: "Give a reason for closing the case" };
    if (reason.length > MAX_NOTE_LENGTH) return { error: "Reason is too long" };

    await updateDebtRecoveryCase(caseId, {
      status,
      closedAt: new Date().toISOString(),
      closedReason: reason,
      currentStep: "CLOSED",
    });

    await logDebtRecoveryActivity({
      caseId,
      activityType: "CASE_CLOSED",
      description: `Case closed: ${status.replace("CLOSED_", "").toLowerCase()} — ${closedReason}`,
      performedBy: profile.id,
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);
    revalidatePath(`/owner/levies`);

    return { success: true };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    logError("Failed to close case:", err);
    return { error: "Failed to close case" };
  }
}

// ─── Record Instalment Payment ──────────────────────────────────

export async function recordInstalmentPaymentAction(
  instalmentId: string,
  caseId: string,
  schemeId: string,
  amountPaid: number,
): Promise<ActionResult> {
  try {
    const { profile, caseRow } = await authoriseCaseAction(caseId, schemeId);
    if (isCaseClosed(caseRow)) return { error: "This case is already closed" };
    if (!isValidAmount(amountPaid)) return { error: "Enter a valid amount" };

    // The instalment must belong to this case's payment plan.
    const [instalment, casePlan] = await Promise.all([
      db.orm.public.PaymentPlanInstalment.where({ id: instalmentId }).first(),
      getPaymentPlanForCase(caseId),
    ]);
    if (!instalment || !casePlan || instalment.planId !== casePlan.id) {
      return { error: "Instalment not found" };
    }
    if (instalment.status === "PAID") return { error: "This instalment is already paid" };

    // One way of recording plan payments: they add up, and the plan and its
    // case are completed in one place when every instalment is paid.
    const { recordPlanInstalmentPayment } = await import("@/lib/debt-recovery/payment-plan-requests");
    const { schemeToday } = await import("@/lib/jurisdiction/scheme-time");
    await recordPlanInstalmentPayment({
      schemeId,
      planId: casePlan.id,
      instalmentId,
      amountCents: Math.round(amountPaid * 100),
      paidOn: await schemeToday(schemeId),
      actorId: profile.id,
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);

    return { success: true };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    if (err instanceof Error && err.name === "PaymentPlanError") return { error: err.message };
    logError("Failed to record payment:", err);
    return { error: "Failed to record payment" };
  }
}

// ─── Add Note ───────────────────────────────────────────────────

export async function addDebtRecoveryNoteAction(
  caseId: string,
  schemeId: string,
  note: string,
): Promise<ActionResult> {
  try {
    const { profile } = await authoriseCaseAction(caseId, schemeId);
    const text = (note ?? "").trim();
    if (!text) return { error: "Note cannot be empty" };
    if (text.length > MAX_NOTE_LENGTH) return { error: "Note is too long" };

    await logDebtRecoveryActivity({
      caseId,
      activityType: "NOTE_ADDED",
      description: text,
      performedBy: profile.id,
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);

    return { success: true };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    logError("Failed to add note:", err);
    return { error: "Failed to add note" };
  }
}

// ─── Generate Notice Document ───────────────────────────────────

export async function generateNoticeDocumentAction(
  caseId: string,
  schemeId: string,
  documentType: string,
  title: string,
  content: string,
): Promise<ActionResult> {
  try {
    // Drafting recovery notices is the adviser's job.
    const { profile } = await authoriseCaseAction(caseId, schemeId, ["ADVISER"]);
    if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(documentType ?? "")) return { error: "Invalid document type" };
    if (!(title ?? "").trim() || title.length > 300) return { error: "Enter a title of up to 300 characters" };
    if ((content ?? "").length > 100_000) return { error: "Document is too long" };

    const doc = await createDebtRecoveryDocument({
      caseId,
      documentType,
      title,
      generatedContent: content,
      isDraft: true,
      createdBy: profile.id,
    });

    await logDebtRecoveryActivity({
      caseId,
      activityType: "DOCUMENT_ADDED",
      description: `${documentType.replace(/_/g, " ").toLowerCase()} draft created: ${title}`,
      performedBy: profile.id,
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);

    return { success: true, id: doc.id };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    logError("Failed to generate document:", err);
    return { error: "Failed to generate document" };
  }
}
