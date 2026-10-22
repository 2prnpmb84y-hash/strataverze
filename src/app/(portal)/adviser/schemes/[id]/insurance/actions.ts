"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSchemeMembership, AuthorisationError } from "@/lib/auth/require-membership";
import {
  createInsurancePolicy,
  updateInsurancePolicy,
  deleteInsurancePolicy,
  replaceCoverageItems,
  replacePremiumLineItems,
  type CoverageItemInput,
  type PremiumLineItemInput,
  type PolicyDetailFields,
} from "@/lib/queries/insurance";
import { logActivity } from "@/lib/queries/activity-log";
import { POLICY_TYPES, POLICY_STATUSES } from "@/lib/insurance/constants";
import { premiumTotal } from "@/lib/insurance/premium";

export type InsuranceFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

const POLICY_TYPE_SET = new Set<string>(POLICY_TYPES);
const STATUS_SET = new Set<string>(POLICY_STATUSES);

function str(formData: FormData, key: string): string {
  return ((formData.get(key) as string) ?? "").trim();
}

function optStr(formData: FormData, key: string): string | null {
  const v = str(formData, key);
  return v === "" ? null : v;
}

function isoOrNull(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Parse a JSON array field, tolerating absence or malformed input. */
function parseJsonArray(formData: FormData, key: string): unknown[] {
  const raw = formData.get(key);
  if (typeof raw !== "string" || raw.trim() === "") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseCoverageItems(formData: FormData): CoverageItemInput[] {
  return parseJsonArray(formData, "coverageItemsJson")
    .map((row) => (typeof row === "object" && row ? (row as Record<string, unknown>) : {}))
    .filter((r) => typeof r.category === "string" && r.category)
    .map((r) => ({
      category: String(r.category),
      description: r.description ? String(r.description) : null,
      sumInsured:
        r.sumInsured != null && r.sumInsured !== "" && !isNaN(Number(r.sumInsured))
          ? Number(r.sumInsured)
          : null,
      excess:
        r.excess != null && r.excess !== "" && !isNaN(Number(r.excess))
          ? Number(r.excess)
          : null,
      conditions: r.conditions ? String(r.conditions) : null,
    }));
}

function parsePremiumLineItems(formData: FormData): PremiumLineItemInput[] {
  return parseJsonArray(formData, "premiumLineItemsJson")
    .map((row) => (typeof row === "object" && row ? (row as Record<string, unknown>) : {}))
    .filter((r) => typeof r.label === "string" && r.label && r.amount != null && !isNaN(Number(r.amount)))
    .map((r) => ({
      label: String(r.label),
      kind: typeof r.kind === "string" && r.kind ? String(r.kind) : "OTHER",
      amount: Number(r.amount),
    }));
}

function detailFromForm(formData: FormData): PolicyDetailFields {
  return {
    insuredEntityName: optStr(formData, "insuredEntityName"),
    insuredAddress: optStr(formData, "insuredAddress"),
    additionalInsured: optStr(formData, "additionalInsured"),
    contactPerson: optStr(formData, "contactPerson"),
    contactEmail: optStr(formData, "contactEmail"),
    contactPhone: optStr(formData, "contactPhone"),
    claimsContact: optStr(formData, "claimsContact"),
    referenceNumbers: optStr(formData, "referenceNumbers"),
    coverageSummary: optStr(formData, "coverageSummary"),
    exclusions: optStr(formData, "exclusions"),
    conditions: optStr(formData, "conditions"),
    endorsements: optStr(formData, "endorsements"),
    currency: optStr(formData, "currency") ?? "AUD",
    paymentDueDate: isoOrNull(str(formData, "paymentDueDate")),
    paymentStatus: optStr(formData, "paymentStatus"),
    paymentDate: isoOrNull(str(formData, "paymentDate")),
    paymentReference: optStr(formData, "paymentReference"),
  };
}

function validateCore(
  formData: FormData,
  opts: { requireStatus: boolean },
): { errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  if (!str(formData, "policyNumber")) errors.policyNumber = "Policy number is required.";
  if (!POLICY_TYPE_SET.has(str(formData, "policyType")))
    errors.policyType = "Select a valid policy type.";
  if (!str(formData, "insurer")) errors.insurer = "Insurer name is required.";
  const coverage = str(formData, "coverageAmount");
  if (!coverage || isNaN(Number(coverage)))
    errors.coverageAmount = "Valid sum insured is required.";
  const premium = str(formData, "premium");
  if (!premium || isNaN(Number(premium)))
    errors.premium = "Valid base premium is required.";
  const excess = str(formData, "excessAmount");
  if (excess && isNaN(Number(excess))) errors.excessAmount = "Excess must be a number.";
  if (!str(formData, "startDate")) errors.startDate = "Start date is required.";
  if (!str(formData, "endDate")) errors.endDate = "End date is required.";
  if (
    str(formData, "startDate") &&
    str(formData, "endDate") &&
    new Date(str(formData, "endDate")) <= new Date(str(formData, "startDate"))
  )
    errors.endDate = "End date must be after the start date.";
  if (opts.requireStatus && !STATUS_SET.has(str(formData, "status")))
    errors.status = "Select a valid status.";
  return { errors };
}

export async function createInsuranceAction(
  schemeId: string,
  _prev: InsuranceFormState,
  formData: FormData,
): Promise<InsuranceFormState> {
  const { errors } = validateCore(formData, { requireStatus: false });
  if (Object.keys(errors).length > 0) return { fieldErrors: errors };

  const coverageItems = parseCoverageItems(formData);
  const premiumItems = parsePremiumLineItems(formData);
  const detail = detailFromForm(formData);
  const status = STATUS_SET.has(str(formData, "status"))
    ? str(formData, "status")
    : "ACTIVE";

  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    const policy = await createInsurancePolicy({
      schemeId,
      policyNumber: str(formData, "policyNumber"),
      policyType: str(formData, "policyType"),
      insurer: str(formData, "insurer"),
      broker: optStr(formData, "broker"),
      brokerContact: optStr(formData, "brokerContact"),
      coverageAmount: Number(str(formData, "coverageAmount")),
      premium: Number(str(formData, "premium")),
      excessAmount: str(formData, "excessAmount")
        ? Number(str(formData, "excessAmount"))
        : null,
      startDate: new Date(str(formData, "startDate")).toISOString(),
      endDate: new Date(str(formData, "endDate")).toISOString(),
      status,
      renewalDate: isoOrNull(str(formData, "renewalDate")),
      notes: optStr(formData, "notes"),
      ...detail,
      totalPremium: premiumItems.length > 0 ? premiumTotal(premiumItems) : null,
    });

    if (coverageItems.length > 0) await replaceCoverageItems(policy.id, coverageItems);
    if (premiumItems.length > 0) await replacePremiumLineItems(policy.id, premiumItems);

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "INSURANCE_CREATED",
      entityType: "InsurancePolicy",
      entityId: policy.id,
      metadata: {
        policyNumber: str(formData, "policyNumber"),
        policyType: str(formData, "policyType"),
        insurer: str(formData, "insurer"),
      },
    });

    revalidatePath(`/adviser/schemes/${schemeId}/insurance`);
    revalidatePath(`/adviser/schemes/${schemeId}`);
    redirect(`/adviser/schemes/${schemeId}/insurance/${policy.id}`);
  } catch (err) {
    if (isRedirect(err)) throw err;
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to create insurance policy. Please try again." };
  }
}

export async function updateInsuranceAction(
  schemeId: string,
  policyId: string,
  _prev: InsuranceFormState,
  formData: FormData,
): Promise<InsuranceFormState> {
  const { errors } = validateCore(formData, { requireStatus: true });
  if (Object.keys(errors).length > 0) return { fieldErrors: errors };

  const coverageItems = parseCoverageItems(formData);
  const premiumItems = parsePremiumLineItems(formData);
  const detail = detailFromForm(formData);

  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    await updateInsurancePolicy(policyId, {
      policyNumber: str(formData, "policyNumber"),
      policyType: str(formData, "policyType"),
      insurer: str(formData, "insurer"),
      broker: optStr(formData, "broker"),
      brokerContact: optStr(formData, "brokerContact"),
      coverageAmount: Number(str(formData, "coverageAmount")),
      premium: Number(str(formData, "premium")),
      excessAmount: str(formData, "excessAmount")
        ? Number(str(formData, "excessAmount"))
        : null,
      startDate: new Date(str(formData, "startDate")).toISOString(),
      endDate: new Date(str(formData, "endDate")).toISOString(),
      status: str(formData, "status"),
      renewalDate: isoOrNull(str(formData, "renewalDate")),
      notes: optStr(formData, "notes"),
      ...detail,
      totalPremium: premiumItems.length > 0 ? premiumTotal(premiumItems) : null,
    });

    await replaceCoverageItems(policyId, coverageItems);
    await replacePremiumLineItems(policyId, premiumItems);

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "INSURANCE_UPDATED",
      entityType: "InsurancePolicy",
      entityId: policyId,
      metadata: {
        policyNumber: str(formData, "policyNumber"),
        policyType: str(formData, "policyType"),
        status: str(formData, "status"),
      },
    });

    revalidatePath(`/adviser/schemes/${schemeId}/insurance/${policyId}`);
    revalidatePath(`/adviser/schemes/${schemeId}/insurance`);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to update insurance policy. Please try again." };
  }
}

export async function deleteInsuranceAction(
  schemeId: string,
  policyId: string,
) {
  try {
    await requireSchemeMembership(schemeId, ["ADVISER"]);
    await deleteInsurancePolicy(policyId);
    revalidatePath(`/adviser/schemes/${schemeId}/insurance`);
    revalidatePath(`/adviser/schemes/${schemeId}`);
    redirect(`/adviser/schemes/${schemeId}/insurance`);
  } catch (err) {
    if (isRedirect(err)) throw err;
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to delete insurance policy." };
  }
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
