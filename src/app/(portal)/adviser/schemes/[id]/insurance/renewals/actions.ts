"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSchemeMembership, AuthorisationError } from "@/lib/auth/require-membership";
import { logActivity } from "@/lib/queries/activity-log";
import {
  getInsurancePolicyById,
  createInsurancePolicy,
} from "@/lib/queries/insurance";
import {
  createRenewal,
  getRenewalById,
  getActiveRenewalForPolicy,
  updateRenewal,
  setRenewalStage,
  setSuccessorPolicy,
  addQuote,
  getQuoteById,
  deleteQuote,
} from "@/lib/queries/insurance-renewals";
import {
  canAdvanceRenewal,
  isRenewalStage,
  derivePolicyStatus,
} from "@/lib/insurance/status";
import { detectContinuity } from "@/lib/insurance/renewal";

export type RenewalFormState = { error?: string; fieldErrors?: Record<string, string> };

function str(fd: FormData, k: string): string {
  return ((fd.get(k) as string) ?? "").trim();
}
function optStr(fd: FormData, k: string): string | null {
  const v = str(fd, k);
  return v === "" ? null : v;
}
function isoOrNull(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
function numOrNull(fd: FormData, k: string): number | null {
  const v = str(fd, k);
  if (!v || Number.isNaN(Number(v))) return null;
  return Number(v);
}
function intOrNull(fd: FormData, k: string): number | null {
  const v = str(fd, k);
  if (!v || Number.isNaN(parseInt(v, 10))) return null;
  return parseInt(v, 10);
}
function isRedirect(err: unknown): boolean {
  return (
    !!err &&
    typeof err === "object" &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export async function startRenewalAction(schemeId: string, policyId: string) {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    const policy = await getInsurancePolicyById(policyId);
    if (!policy || policy.schemeId !== schemeId) return;

    const existing = await getActiveRenewalForPolicy(policyId);
    if (existing) {
      redirect(`/adviser/schemes/${schemeId}/insurance/renewals/${existing.id}`);
    }

    const renewal = await createRenewal({
      schemeId,
      expiringPolicyId: policyId,
      reminderLeadDays: 60,
    });
    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "INSURANCE_RENEWAL_STARTED",
      entityType: "InsuranceRenewal",
      entityId: renewal.id,
      metadata: { policyId },
    });
    revalidatePath(`/adviser/schemes/${schemeId}/insurance`);
    redirect(`/adviser/schemes/${schemeId}/insurance/renewals/${renewal.id}`);
  } catch (err) {
    if (isRedirect(err)) throw err;
    if (err instanceof AuthorisationError) return;
    throw err;
  }
}

export async function updateRenewalPrepAction(
  schemeId: string,
  renewalId: string,
  _prev: RenewalFormState,
  formData: FormData,
): Promise<RenewalFormState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    await updateRenewal(renewalId, {
      dueDate: isoOrNull(str(formData, "dueDate")),
      reminderLeadDays: intOrNull(formData, "reminderLeadDays"),
      declaredChanges: optStr(formData, "declaredChanges"),
      outstandingInfo: optStr(formData, "outstandingInfo"),
      notes: optStr(formData, "notes"),
    });
    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "INSURANCE_RENEWAL_UPDATED",
      entityType: "InsuranceRenewal",
      entityId: renewalId,
    });
    revalidatePath(`/adviser/schemes/${schemeId}/insurance/renewals/${renewalId}`);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to update the renewal. Please try again." };
  }
}

/** Save the pre-renewal declaration as a structured JSON snapshot. */
export async function saveDeclarationAction(
  schemeId: string,
  renewalId: string,
  _prev: RenewalFormState,
  formData: FormData,
): Promise<RenewalFormState> {
  try {
    await requireSchemeMembership(schemeId, ["ADVISER"]);
    const declaration: Record<string, unknown> = {};
    for (const [key, value] of formData.entries()) {
      if (typeof value === "string") declaration[key] = value;
    }
    await updateRenewal(renewalId, { declaration });
    revalidatePath(`/adviser/schemes/${schemeId}/insurance/renewals/${renewalId}`);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to save the declaration. Please try again." };
  }
}

export async function changeRenewalStageAction(
  schemeId: string,
  renewalId: string,
  toStage: string,
): Promise<{ error?: string }> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    const renewal = await getRenewalById(renewalId);
    if (!renewal || renewal.schemeId !== schemeId) return { error: "Renewal not found." };
    if (!isRenewalStage(toStage)) return { error: "Invalid stage." };
    if (!canAdvanceRenewal(renewal.stage, toStage))
      return { error: `Cannot move from ${renewal.stage} to ${toStage}.` };

    await setRenewalStage(renewalId, toStage, {
      coverConfirmedAt:
        toStage === "COVER_CONFIRMED" ? new Date().toISOString() : undefined,
    });
    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "INSURANCE_RENEWAL_STAGE_CHANGED",
      entityType: "InsuranceRenewal",
      entityId: renewalId,
      metadata: { from: renewal.stage, to: toStage },
    });
    revalidatePath(`/adviser/schemes/${schemeId}/insurance/renewals/${renewalId}`);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to change the renewal stage." };
  }
}

export async function addQuoteAction(
  schemeId: string,
  renewalId: string,
  _prev: RenewalFormState,
  formData: FormData,
): Promise<RenewalFormState> {
  const insurer = str(formData, "insurer");
  if (!insurer) return { fieldErrors: { insurer: "Insurer is required." } };
  try {
    await requireSchemeMembership(schemeId, ["ADVISER"]);
    const renewal = await getRenewalById(renewalId);
    if (!renewal || renewal.schemeId !== schemeId) return { error: "Renewal not found." };

    await addQuote(renewalId, {
      insurer,
      broker: optStr(formData, "broker"),
      periodStart: isoOrNull(str(formData, "periodStart")),
      periodEnd: isoOrNull(str(formData, "periodEnd")),
      premium: numOrNull(formData, "premium"),
      sumInsured: numOrNull(formData, "sumInsured"),
      excesses: optStr(formData, "excesses"),
      exclusions: optStr(formData, "exclusions"),
      conditions: optStr(formData, "conditions"),
      endorsements: optStr(formData, "endorsements"),
      materialDifferences: optStr(formData, "materialDifferences"),
      validUntil: isoOrNull(str(formData, "validUntil")),
      notes: optStr(formData, "notes"),
    });

    // Advance to QUOTES_RECEIVED if still in an earlier stage.
    if (["NOT_STARTED", "INFORMATION_REQUIRED", "QUOTES_REQUESTED"].includes(renewal.stage)) {
      await setRenewalStage(renewalId, "QUOTES_RECEIVED");
    }
    revalidatePath(`/adviser/schemes/${schemeId}/insurance/renewals/${renewalId}`);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to add the quote. Please try again." };
  }
}

export async function deleteQuoteAction(
  schemeId: string,
  renewalId: string,
  quoteId: string,
): Promise<{ error?: string }> {
  try {
    await requireSchemeMembership(schemeId, ["ADVISER"]);
    const quote = await getQuoteById(quoteId);
    if (!quote || quote.renewalId !== renewalId) return { error: "Quote not found." };
    await deleteQuote(quoteId);
    revalidatePath(`/adviser/schemes/${schemeId}/insurance/renewals/${renewalId}`);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to delete the quote." };
  }
}

export async function selectQuoteAction(
  schemeId: string,
  renewalId: string,
  quoteId: string,
  rationale: string,
): Promise<{ error?: string }> {
  try {
    await requireSchemeMembership(schemeId, ["ADVISER"]);
    const quote = await getQuoteById(quoteId);
    if (!quote || quote.renewalId !== renewalId) return { error: "Quote not found." };
    await updateRenewal(renewalId, {
      selectedQuoteId: quoteId,
      selectionRationale: rationale.trim() || null,
    });
    revalidatePath(`/adviser/schemes/${schemeId}/insurance/renewals/${renewalId}`);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to select the quote." };
  }
}

export async function recordApprovalAction(
  schemeId: string,
  renewalId: string,
  _prev: RenewalFormState,
  formData: FormData,
): Promise<RenewalFormState> {
  try {
    await requireSchemeMembership(schemeId, ["ADVISER"]);
    await updateRenewal(renewalId, {
      approvedBy: optStr(formData, "approvedBy"),
      placementInstructions: optStr(formData, "placementInstructions"),
    });
    revalidatePath(`/adviser/schemes/${schemeId}/insurance/renewals/${renewalId}`);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to record approval." };
  }
}

/**
 * Complete the renewal: create the successor policy from the selected quote,
 * preserve the expiring policy, link the two, and flag any gap or overlap in
 * dates. Only reachable once cover has been confirmed.
 */
export async function completeRenewalAction(
  schemeId: string,
  renewalId: string,
  _prev: RenewalFormState,
  formData: FormData,
): Promise<RenewalFormState> {
  const newPolicyNumber = str(formData, "newPolicyNumber");
  const startDate = isoOrNull(str(formData, "startDate"));
  const endDate = isoOrNull(str(formData, "endDate"));
  const errors: Record<string, string> = {};
  if (!newPolicyNumber) errors.newPolicyNumber = "New policy number is required.";
  if (!startDate) errors.startDate = "Start date is required.";
  if (!endDate) errors.endDate = "End date is required.";
  if (Object.keys(errors).length > 0) return { fieldErrors: errors };

  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    const renewal = await getRenewalById(renewalId);
    if (!renewal || renewal.schemeId !== schemeId) return { error: "Renewal not found." };
    if (renewal.stage !== "COVER_CONFIRMED")
      return { error: "Confirm cover before completing the renewal." };
    if (!renewal.selectedQuoteId)
      return { error: "Select the accepted quote before completing." };

    const quote = await getQuoteById(renewal.selectedQuoteId);
    const prev = renewal.expiringPolicy;
    if (!prev) return { error: "The expiring policy could not be found." };

    const status = derivePolicyStatus({
      startDate: new Date(startDate!),
      endDate: new Date(endDate!),
    });

    const successor = await createInsurancePolicy({
      schemeId,
      policyNumber: newPolicyNumber,
      policyType: prev.policyType,
      insurer: quote?.insurer ?? prev.insurer,
      broker: quote?.broker ?? prev.broker ?? null,
      brokerContact: prev.brokerContact ?? null,
      coverageAmount:
        quote?.sumInsured != null
          ? Number(quote.sumInsured)
          : Number(prev.coverageAmount),
      premium: quote?.premium != null ? Number(quote.premium) : Number(prev.premium),
      startDate: startDate!,
      endDate: endDate!,
      status,
      insuredEntityName: prev.insuredEntityName ?? null,
      insuredAddress: prev.insuredAddress ?? null,
      currency: prev.currency ?? "AUD",
    });

    await setSuccessorPolicy(renewalId, successor.id);
    await setRenewalStage(renewalId, "COMPLETED");

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "INSURANCE_RENEWAL_COMPLETED",
      entityType: "InsuranceRenewal",
      entityId: renewalId,
      metadata: { successorPolicyId: successor.id },
    });

    const continuity = detectContinuity(
      new Date(String(prev.endDate)),
      new Date(startDate!),
    );

    revalidatePath(`/adviser/schemes/${schemeId}/insurance`);
    revalidatePath(`/adviser/schemes/${schemeId}/insurance/renewals/${renewalId}`);
    // Redirect to the new policy, flagging any gap/overlap for review.
    const flag =
      continuity.type === "CONTIGUOUS"
        ? ""
        : `?continuity=${continuity.type}&days=${continuity.days}`;
    redirect(`/adviser/schemes/${schemeId}/insurance/${successor.id}${flag}`);
  } catch (err) {
    if (isRedirect(err)) throw err;
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to complete the renewal. Please try again." };
  }
}

export async function markNotProceedingAction(
  schemeId: string,
  renewalId: string,
  reason: string,
): Promise<{ error?: string }> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    const renewal = await getRenewalById(renewalId);
    if (!renewal || renewal.schemeId !== schemeId) return { error: "Renewal not found." };
    if (!canAdvanceRenewal(renewal.stage, "NOT_PROCEEDING"))
      return { error: "This renewal cannot be marked as not proceeding." };
    await updateRenewal(renewalId, { notProceedingReason: reason.trim() || null });
    await setRenewalStage(renewalId, "NOT_PROCEEDING");
    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "INSURANCE_RENEWAL_STAGE_CHANGED",
      entityType: "InsuranceRenewal",
      entityId: renewalId,
      metadata: { from: renewal.stage, to: "NOT_PROCEEDING" },
    });
    revalidatePath(`/adviser/schemes/${schemeId}/insurance/renewals/${renewalId}`);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to update the renewal." };
  }
}
