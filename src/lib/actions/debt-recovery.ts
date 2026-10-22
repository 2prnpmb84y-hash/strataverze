"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { db } from "@/prisma/db";
import { requireSchemeMembership, AuthorisationError } from "@/lib/auth/require-membership";
import { confirmedCentsFrom, feeErrorMessage } from "@/lib/billing/disclosure";
import { captureUsageFee } from "@/lib/billing/capture";
import { recoveryFeeVariant } from "@/lib/billing/hook-codes";
import {
  createDebtRecoveryCase,
  updateDebtRecoveryCase,
  createDebtRecoveryStep,
  updateDebtRecoveryStep,
  createPaymentPlan,
  updatePaymentPlan,
  createInstalment,
  updateInstalment,
  createDebtRecoveryDocument,
  logDebtRecoveryActivity,
  generateCaseNumber,
  getOverdueLevyNoticesForLot,
  getDebtRecoveryCaseById,
  getPaymentPlanForCase,
  DEFAULT_RECOVERY_STEPS,
} from "@/lib/queries/debt-recovery";

type ActionResult = { error?: string; success?: boolean; id?: string };

// ─── Initiate Debt Recovery Case ────────────────────────────────

export async function initiateDebtRecoveryAction(
  schemeId: string,
  lotId: string,
  ownerId: string,
  role: "COMMITTEE" | "ADVISER",
): Promise<ActionResult> {
  try {
    const profile = await getCurrentProfile();
    if (!profile) return { error: "Not authenticated" };

    // Gather overdue levy notices
    const overdueNotices = await getOverdueLevyNoticesForLot(schemeId, lotId);
    if (overdueNotices.length === 0) {
      return { error: "No overdue levy notices found for this lot" };
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
    });

    // Create all default recovery steps
    for (const step of DEFAULT_RECOVERY_STEPS) {
      await createDebtRecoveryStep({
        caseId: newCase.id,
        ...step,
      });
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
    console.error("Failed to initiate debt recovery:", err);
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
    const profile = await getCurrentProfile();
    if (!profile) return { error: "Not authenticated" };

    const data: Record<string, unknown> = {};
    const status = formData.get("status") as string;
    const priority = formData.get("priority") as string;
    const notes = formData.get("notes") as string;
    const solicitorRef = formData.get("solicitorRef") as string;
    const solicitorName = formData.get("solicitorName") as string;
    const courtFileNumber = formData.get("courtFileNumber") as string;
    const excludeFromRecovery = formData.get("excludeFromRecovery") === "on";
    const exclusionReason = formData.get("exclusionReason") as string;

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
    console.error("Failed to update debt recovery case:", err);
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
    if (step.status === "COMPLETED") return { error: "This step is already complete" };

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
        });
      }
    });

    // Find the next step and activate it
    const debtCase = await getDebtRecoveryCaseById(caseId);
    if (debtCase) {
      const currentStepType = formData.get("stepType") as string;
      const nextStepIdx = DEFAULT_RECOVERY_STEPS.findIndex(
        (s) => s.stepType === currentStepType,
      );
      if (nextStepIdx >= 0 && nextStepIdx < DEFAULT_RECOVERY_STEPS.length - 1) {
        const nextStep = DEFAULT_RECOVERY_STEPS[nextStepIdx + 1];
        await updateDebtRecoveryCase(caseId, {
          currentStep: nextStep.stepType,
        });
      }
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
    console.error("Failed to complete step:", err);
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
    const profile = await getCurrentProfile();
    if (!profile) return { error: "Not authenticated" };

    await updateDebtRecoveryCase(caseId, {
      status,
      closedAt: new Date().toISOString(),
      closedReason,
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
    console.error("Failed to close case:", err);
    return { error: "Failed to close case" };
  }
}

// ─── Create Payment Plan ────────────────────────────────────────

export async function createPaymentPlanAction(
  caseId: string,
  schemeId: string,
  lotId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    const caseRow = await getDebtRecoveryCaseById(caseId);
    if (!caseRow || caseRow.schemeId !== schemeId || caseRow.lotId !== lotId) {
      return { error: "Case not found" };
    }

    const totalAmount = parseFloat(formData.get("totalAmount") as string);
    const instalmentAmount = parseFloat(formData.get("instalmentAmount") as string);
    const frequency = formData.get("frequency") as string;
    const startDate = formData.get("startDate") as string;
    const numberOfInstalments = parseInt(formData.get("numberOfInstalments") as string, 10);
    const includesInterest = formData.get("includesInterest") === "on";
    const includesOngoing = formData.get("includesOngoing") === "on";
    const interestWaived = formData.get("interestWaived") === "on";
    const conditions = formData.get("conditions") as string;

    if (!totalAmount || !instalmentAmount || !frequency || !startDate || !numberOfInstalments) {
      return { error: "Missing required payment plan fields" };
    }

    // Calculate end date based on frequency and instalments
    const start = new Date(startDate);
    const end = new Date(start);
    const freqDays = frequency === "WEEKLY" ? 7 : frequency === "FORTNIGHTLY" ? 14 : 30;
    end.setDate(end.getDate() + freqDays * numberOfInstalments);

    const plan = await db.transaction(async (tx) => {
      const created = await createPaymentPlan(
        {
          caseId,
          schemeId,
          lotId,
          totalAmount,
          instalmentAmount,
          frequency,
          startDate,
          endDate: end.toISOString().split("T")[0],
          numberOfInstalments,
          includesInterest,
          includesOngoing,
          interestWaived,
          conditions: conditions || undefined,
        },
        tx.orm,
      );
      // StrataVerze payment plan set-up fee, recoverable from the owner.
      await captureUsageFee(tx.orm, {
        schemeId,
        code: "RECOVERY_STEP",
        variant: "PAYMENT_PLAN",
        sourceType: "PaymentPlan",
        sourceId: created.id,
        actorId: profile.id,
        payerProfileId: caseRow.ownerId ?? null,
        confirmedCents: confirmedCentsFrom(formData),
      });
      return created;
    });

    // Create instalment records
    for (let i = 0; i < numberOfInstalments; i++) {
      const dueDate = new Date(start);
      dueDate.setDate(dueDate.getDate() + freqDays * i);
      await createInstalment({
        planId: plan.id,
        instalmentNumber: i + 1,
        dueDate: dueDate.toISOString().split("T")[0],
        amount: instalmentAmount,
      });
    }

    // Update case status
    await updateDebtRecoveryCase(caseId, { status: "PAYMENT_PLAN" });

    await logDebtRecoveryActivity({
      caseId,
      activityType: "PAYMENT_PLAN_CREATED",
      description: `Payment plan created: ${numberOfInstalments} ${frequency.toLowerCase()} instalments of $${instalmentAmount.toFixed(2)}`,
      performedBy: profile.id,
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);

    return { success: true, id: plan.id };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    const feeError = feeErrorMessage(err);
    if (feeError) return { error: feeError };
    console.error("Failed to create payment plan:", err);
    return { error: "Failed to create payment plan" };
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
    const profile = await getCurrentProfile();
    if (!profile) return { error: "Not authenticated" };

    await updateInstalment(instalmentId, {
      status: "PAID",
      amountPaid,
      paidAt: new Date().toISOString(),
    });

    await logDebtRecoveryActivity({
      caseId,
      activityType: "PAYMENT_RECEIVED",
      description: `Instalment payment of $${amountPaid.toFixed(2)} recorded`,
      performedBy: profile.id,
    });

    // Check if all instalments are paid
    const plan = await getPaymentPlanForCase(caseId);
    if (plan) {
      const { getInstalmentsForPlan } = await import("@/lib/queries/debt-recovery");
      const instalments = await getInstalmentsForPlan(plan.id);
      const allPaid = instalments.every((i) => i.status === "PAID");
      if (allPaid) {
        await updatePaymentPlan(plan.id, { status: "COMPLETED" });
        await updateDebtRecoveryCase(caseId, {
          status: "CLOSED_PAID",
          closedAt: new Date().toISOString(),
          closedReason: "All payment plan instalments completed",
          currentStep: "CLOSED",
        });
        await logDebtRecoveryActivity({
          caseId,
          activityType: "CASE_CLOSED",
          description: "Case closed — all payment plan instalments paid",
          performedBy: profile.id,
        });
      }
    }

    revalidatePath(`/adviser/schemes/${schemeId}`);

    return { success: true };
  } catch (err) {
    console.error("Failed to record payment:", err);
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
    const profile = await getCurrentProfile();
    if (!profile) return { error: "Not authenticated" };

    await logDebtRecoveryActivity({
      caseId,
      activityType: "NOTE_ADDED",
      description: note,
      performedBy: profile.id,
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);

    return { success: true };
  } catch (err) {
    console.error("Failed to add note:", err);
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
    const profile = await getCurrentProfile();
    if (!profile) return { error: "Not authenticated" };

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
    console.error("Failed to generate document:", err);
    return { error: "Failed to generate document" };
  }
}
