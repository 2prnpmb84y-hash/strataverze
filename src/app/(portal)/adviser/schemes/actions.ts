"use server";

import { recordSecurityEvent } from "@/lib/audit/security-audit";
import { redirect } from "next/navigation";
import { requireRecentMfa } from "@/lib/auth/mfa-enforcement";
import { revalidatePath } from "next/cache";
import { requireSchemeMembership, requirePlatformAdmin, AuthorisationError } from "@/lib/auth/require-membership";
import {
  createScheme,
  updateScheme,
  deleteScheme,
} from "@/lib/queries/schemes";
import { logActivity } from "@/lib/queries/activity-log";
import {
  parseStrataRollPDF,
  type ParsedStrataRoll,
} from "@/lib/parse-strata-roll";

export type SchemeFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

export type StrataRollParseResult = {
  success: boolean;
  error?: string;
  data?: ParsedStrataRoll;
};

const AUSTRALIAN_STATES = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT"];

function validateSchemeForm(formData: FormData) {
  const errors: Record<string, string> = {};

  const name = formData.get("name") as string | null;
  const planNumber = formData.get("planNumber") as string | null;
  const address = formData.get("address") as string | null;
  const suburb = formData.get("suburb") as string | null;
  const state = formData.get("state") as string | null;
  const postcode = formData.get("postcode") as string | null;
  const totalLots = formData.get("totalLots") as string | null;
  const totalEntitlement = formData.get("totalEntitlement") as string | null;

  if (!name?.trim()) errors.name = "Scheme name is required.";
  if (!planNumber?.trim()) errors.planNumber = "Plan number is required.";
  if (!address?.trim()) errors.address = "Address is required.";
  if (!suburb?.trim()) errors.suburb = "Suburb is required.";
  if (!state || !AUSTRALIAN_STATES.includes(state))
    errors.state = "Select a valid state.";
  if (!postcode?.trim() || !/^\d{4}$/.test(postcode.trim()))
    errors.postcode = "Enter a valid 4-digit postcode.";
  if (!totalLots || Number(totalLots) < 1)
    errors.totalLots = "Must have at least 1 lot.";
  if (!totalEntitlement || Number(totalEntitlement) < 1)
    errors.totalEntitlement = "Total entitlement must be at least 1.";

  return {
    errors,
    isValid: Object.keys(errors).length === 0,
    data: {
      name: name?.trim() ?? "",
      planNumber: planNumber?.trim() ?? "",
      address: address?.trim() ?? "",
      suburb: suburb?.trim() ?? "",
      state: state ?? "VIC",
      postcode: postcode?.trim() ?? "",
      totalLots: Number(totalLots),
      totalEntitlement: Number(totalEntitlement),
      financialYearEnd: (formData.get("financialYearEnd") as string) || "06-30",
      abnNumber: (formData.get("abnNumber") as string)?.trim() || undefined,
      buildingType: (formData.get("buildingType") as string)?.trim() || undefined,
      buildingClass: (formData.get("buildingClass") as string)?.trim() || undefined,
      buildingSubType: (formData.get("buildingSubType") as string)?.trim() || undefined,
      folio: (formData.get("folio") as string)?.trim() || undefined,
      isActive: formData.get("isActive") !== "false",
      allInclusiveFees: formData.get("allInclusiveFees") === "true",
      paymentPlan: (formData.get("paymentPlan") as string)?.trim() || undefined,
      debtCollection: formData.get("debtCollection") === "true",
    },
  };
}

export async function createSchemeAction(
  _prev: SchemeFormState,
  formData: FormData,
): Promise<SchemeFormState> {
  const { errors, isValid, data } = validateSchemeForm(formData);
  if (!isValid) return { fieldErrors: errors };

  try {
    // Buildings are onboarded by StrataVerze administrators only (SEC-002).
    const profile = await requirePlatformAdmin();

    const scheme = await createScheme(data, profile.id);
    await recordSecurityEvent({
      action: "scheme.created",
      outcome: "allowed",
      actorProfileId: profile.id,
      actorRole: "platform_admin",
      schemeId: scheme.id,
      resourceType: "Scheme",
      resourceId: scheme.id,
    });
    redirect(`/adviser/schemes/${scheme.id}`);
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    // redirect() throws a NEXT_REDIRECT error — rethrow it
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    // Also check for the Next.js redirect digest
    if (
      err &&
      typeof err === "object" &&
      "digest" in err &&
      typeof (err as { digest: unknown }).digest === "string" &&
      (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw err;
    }
    console.error("createSchemeAction error:", err);
    return { error: "Failed to create scheme. Please try again." };
  }
}

export async function updateSchemeAction(
  schemeId: string,
  _prev: SchemeFormState,
  formData: FormData,
): Promise<SchemeFormState> {
  const { errors, isValid, data } = validateSchemeForm(formData);
  if (!isValid) return { fieldErrors: errors };

  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    await updateScheme(schemeId, data);

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "SCHEME_UPDATED",
      entityType: "Scheme",
      entityId: schemeId,
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);
    revalidatePath("/adviser/schemes");
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to update scheme. Please try again." };
  }
}

export async function deleteSchemeAction(schemeId: string) {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    // A sensitive operation: needs an authenticator check in the last 15 minutes.
    await requireRecentMfa();

    await deleteScheme(schemeId);
    // The building's activity log goes with it; this record stays.
    await recordSecurityEvent({
      action: "scheme.deleted",
      outcome: "allowed",
      actorProfileId: profile.id,
      actorRole: "ADVISER",
      schemeId,
      resourceType: "Scheme",
      resourceId: schemeId,
    });
    revalidatePath("/adviser/schemes");
    redirect("/adviser/schemes");
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    if (
      err &&
      typeof err === "object" &&
      "digest" in err &&
      typeof (err as { digest: unknown }).digest === "string" &&
      (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw err;
    }
    return { error: "Failed to delete scheme." };
  }
}

/**
 * Parse an uploaded strata roll PDF and extract scheme + lot data.
 */
export async function parseStrataRollAction(
  formData: FormData,
): Promise<StrataRollParseResult> {

  try {
    // Part of building onboarding, which only StrataVerze administrators do.
    await requirePlatformAdmin();
  } catch (err) {
    if (err instanceof AuthorisationError) return { success: false, error: err.message };
    throw err;
  }

  const file = formData.get("strataRoll") as File | null;
  if (!file || file.size === 0) {
    return { success: false, error: "Please select a file to upload." };
  }

  // Validate file type
  const allowedTypes = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!allowedTypes.includes(file.type) && ext !== "pdf" && ext !== "docx") {
    return {
      success: false,
      error: "Only .pdf and .docx files are supported.",
    };
  }

  // Validate file size (30MB max)
  if (file.size > 30 * 1024 * 1024) {
    return { success: false, error: "File must be smaller than 30 MB." };
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (ext === "docx" || file.type.includes("wordprocessingml")) {
      return {
        success: false,
        error:
          "DOCX parsing is not yet supported. Please convert to PDF and try again.",
      };
    }

    const data = await parseStrataRollPDF(buffer);

    // Check how many scheme fields were actually extracted
    const s = data.scheme;
    const fieldsFound = [
      s.name,
      s.planNumber,
      s.address,
      s.suburb,
      s.state,
      s.postcode,
      s.abnNumber,
      s.totalLots,
      s.totalEntitlement,
    ].filter((v) => v != null).length;

    if (fieldsFound === 0 && data.lots.length === 0) {
      // Nothing could be extracted — return debug info
      console.warn(
        "parseStrataRollAction: no fields extracted. Raw text preview:",
        data.rawTextPreview?.slice(0, 500),
      );
      return {
        success: false,
        error:
          "The document was read but no scheme data could be extracted. " +
          "Please check that the file is a strata roll (not a levy notice or meeting minutes) " +
          "and try again, or skip to enter details manually.",
      };
    }

    return { success: true, data };
  } catch (err) {
    console.error("parseStrataRollAction error:", err);
    return {
      success: false,
      error: "Failed to parse the strata roll. Please check the file and try again.",
    };
  }
}
