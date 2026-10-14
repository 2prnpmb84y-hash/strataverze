"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/queries/profiles";
import {
  createInsurancePolicy,
  updateInsurancePolicy,
  deleteInsurancePolicy,
} from "@/lib/queries/insurance";
import { logActivity } from "@/lib/queries/activity-log";

export type InsuranceFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

const POLICY_TYPES = [
  "BUILDING",
  "PUBLIC_LIABILITY",
  "WORKERS_COMP",
  "OFFICE_BEARERS",
  "FIDELITY_GUARANTEE",
  "MACHINERY",
  "VOLUNTARY_WORKERS",
  "OTHER",
];

const STATUSES = ["ACTIVE", "EXPIRED", "CANCELLED", "PENDING_RENEWAL"];

export async function createInsuranceAction(
  schemeId: string,
  _prev: InsuranceFormState,
  formData: FormData,
): Promise<InsuranceFormState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  const policyNumber = (formData.get("policyNumber") as string)?.trim();
  const policyType = formData.get("policyType") as string;
  const insurer = (formData.get("insurer") as string)?.trim();
  const broker = (formData.get("broker") as string)?.trim() || undefined;
  const brokerContact =
    (formData.get("brokerContact") as string)?.trim() || undefined;
  const coverageAmount = (formData.get("coverageAmount") as string)?.trim();
  const premium = (formData.get("premium") as string)?.trim();
  const excessAmount =
    (formData.get("excessAmount") as string)?.trim() || undefined;
  const startDate = (formData.get("startDate") as string)?.trim();
  const endDate = (formData.get("endDate") as string)?.trim();
  const renewalDate =
    (formData.get("renewalDate") as string)?.trim() || undefined;
  const notes = (formData.get("notes") as string)?.trim() || undefined;

  const errors: Record<string, string> = {};
  if (!policyNumber) errors.policyNumber = "Policy number is required.";
  if (!policyType || !POLICY_TYPES.includes(policyType))
    errors.policyType = "Select a valid policy type.";
  if (!insurer) errors.insurer = "Insurer name is required.";
  if (!coverageAmount || isNaN(Number(coverageAmount)))
    errors.coverageAmount = "Valid coverage amount is required.";
  if (!premium || isNaN(Number(premium)))
    errors.premium = "Valid premium amount is required.";
  if (excessAmount && isNaN(Number(excessAmount)))
    errors.excessAmount = "Excess must be a valid number.";
  if (!startDate) errors.startDate = "Start date is required.";
  if (!endDate) errors.endDate = "End date is required.";

  if (Object.keys(errors).length > 0) return { fieldErrors: errors };

  try {
    const policy = await createInsurancePolicy({
      schemeId,
      policyNumber,
      policyType,
      insurer,
      broker,
      brokerContact,
      coverageAmount: Number(coverageAmount),
      premium: Number(premium),
      excessAmount: excessAmount ? Number(excessAmount) : undefined,
      startDate: new Date(startDate).toISOString(),
      endDate: new Date(endDate).toISOString(),
      renewalDate: renewalDate
        ? new Date(renewalDate).toISOString()
        : undefined,
      notes,
    });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "INSURANCE_CREATED",
      entityType: "InsurancePolicy",
      entityId: policy.id,
      metadata: { policyNumber, policyType, insurer },
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);
    redirect(`/adviser/schemes/${schemeId}/insurance/${policy.id}`);
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "digest" in err &&
      typeof (err as { digest: unknown }).digest === "string" &&
      (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw err;
    }
    return { error: "Failed to create insurance policy. Please try again." };
  }
}

export async function updateInsuranceAction(
  schemeId: string,
  policyId: string,
  _prev: InsuranceFormState,
  formData: FormData,
): Promise<InsuranceFormState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  const policyNumber = (formData.get("policyNumber") as string)?.trim();
  const policyType = formData.get("policyType") as string;
  const insurer = (formData.get("insurer") as string)?.trim();
  const broker = (formData.get("broker") as string)?.trim() || undefined;
  const brokerContact =
    (formData.get("brokerContact") as string)?.trim() || undefined;
  const coverageAmount = (formData.get("coverageAmount") as string)?.trim();
  const premium = (formData.get("premium") as string)?.trim();
  const excessAmount =
    (formData.get("excessAmount") as string)?.trim() || undefined;
  const startDate = (formData.get("startDate") as string)?.trim();
  const endDate = (formData.get("endDate") as string)?.trim();
  const status = formData.get("status") as string;
  const renewalDate =
    (formData.get("renewalDate") as string)?.trim() || undefined;
  const notes = (formData.get("notes") as string)?.trim() || undefined;

  const errors: Record<string, string> = {};
  if (!policyNumber) errors.policyNumber = "Policy number is required.";
  if (!policyType || !POLICY_TYPES.includes(policyType))
    errors.policyType = "Select a valid policy type.";
  if (!insurer) errors.insurer = "Insurer name is required.";
  if (!coverageAmount || isNaN(Number(coverageAmount)))
    errors.coverageAmount = "Valid coverage amount is required.";
  if (!premium || isNaN(Number(premium)))
    errors.premium = "Valid premium amount is required.";
  if (excessAmount && isNaN(Number(excessAmount)))
    errors.excessAmount = "Excess must be a valid number.";
  if (!startDate) errors.startDate = "Start date is required.";
  if (!endDate) errors.endDate = "End date is required.";
  if (!status || !STATUSES.includes(status))
    errors.status = "Select a valid status.";

  if (Object.keys(errors).length > 0) return { fieldErrors: errors };

  try {
    await updateInsurancePolicy(policyId, {
      policyNumber,
      policyType,
      insurer,
      broker: broker ?? null,
      brokerContact: brokerContact ?? null,
      coverageAmount: Number(coverageAmount),
      premium: Number(premium),
      excessAmount: excessAmount ? Number(excessAmount) : null,
      startDate: new Date(startDate).toISOString(),
      endDate: new Date(endDate).toISOString(),
      status,
      renewalDate: renewalDate ? new Date(renewalDate).toISOString() : null,
      notes: notes ?? null,
    });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "INSURANCE_UPDATED",
      entityType: "InsurancePolicy",
      entityId: policyId,
      metadata: { policyNumber, policyType, status },
    });

    revalidatePath(`/adviser/schemes/${schemeId}/insurance/${policyId}`);
    return {};
  } catch {
    return { error: "Failed to update insurance policy. Please try again." };
  }
}

export async function deleteInsuranceAction(
  schemeId: string,
  policyId: string,
) {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  try {
    await deleteInsurancePolicy(policyId);
    revalidatePath(`/adviser/schemes/${schemeId}`);
    redirect(`/adviser/schemes/${schemeId}`);
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "digest" in err &&
      typeof (err as { digest: unknown }).digest === "string" &&
      (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw err;
    }
    return { error: "Failed to delete insurance policy." };
  }
}
