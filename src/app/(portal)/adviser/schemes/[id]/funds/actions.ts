"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AuthorisationError } from "@/lib/auth/require-membership";
import { requireSchemeAccess } from "@/lib/auth/require-access";
import { assertInScheme } from "@/lib/auth/scheme-scope";
import { createFund, updateFund, deleteFund, getFundById } from "@/lib/queries/funds";
import { logActivity } from "@/lib/queries/activity-log";

export type FundFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

const FUND_TYPES = ["ADMINISTRATIVE", "CAPITAL_WORKS", "SPECIAL"];

function validateFundForm(formData: FormData) {
  const errors: Record<string, string> = {};

  const name = formData.get("name") as string | null;
  const fundType = formData.get("fundType") as string | null;

  if (!name?.trim()) errors.name = "Fund name is required.";
  if (!fundType || !FUND_TYPES.includes(fundType))
    errors.fundType = "Select a valid fund type.";

  return {
    errors,
    isValid: Object.keys(errors).length === 0,
    data: {
      name: name?.trim() ?? "",
      fundType: fundType ?? "ADMINISTRATIVE",
    },
  };
}

export async function createFundAction(
  schemeId: string,
  _prev: FundFormState,
  formData: FormData,
): Promise<FundFormState> {
  try {
    const { profile } = await requireSchemeAccess(schemeId, "finance.write");

    const { errors, isValid, data } = validateFundForm(formData);
    if (!isValid) return { fieldErrors: errors };

    const fund = await createFund({ ...data, schemeId });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "FUND_CREATED",
      entityType: "Fund",
      entityId: fund.id,
      metadata: { name: data.name, fundType: data.fundType },
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);
    redirect(`/adviser/schemes/${schemeId}/funds/${fund.id}`);
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    if (
      err &&
      typeof err === "object" &&
      "digest" in err &&
      typeof (err as { digest: unknown }).digest === "string" &&
      (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw err;
    }
    return { error: "Failed to create fund. Please try again." };
  }
}

export async function updateFundAction(
  schemeId: string,
  fundId: string,
  _prev: FundFormState,
  formData: FormData,
): Promise<FundFormState> {
  try {
    await requireSchemeAccess(schemeId, "finance.write");

    const { errors, isValid, data } = validateFundForm(formData);
    if (!isValid) return { fieldErrors: errors };

    assertInScheme(await getFundById(fundId), schemeId, "Fund");
    // The balance comes from the ledger: only the name can be changed (review B2).
    await updateFund(schemeId, fundId, { name: data.name });
    revalidatePath(`/adviser/schemes/${schemeId}/funds/${fundId}`);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to update fund. Please try again." };
  }
}

export async function deleteFundAction(schemeId: string, fundId: string) {
  try {
    await requireSchemeAccess(schemeId, "finance.write");

    assertInScheme(await getFundById(fundId), schemeId, "Fund");
    await deleteFund(schemeId, fundId);
    revalidatePath(`/adviser/schemes/${schemeId}`);
    redirect(`/adviser/schemes/${schemeId}/finance`);
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    if (
      err &&
      typeof err === "object" &&
      "digest" in err &&
      typeof (err as { digest: unknown }).digest === "string" &&
      (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw err;
    }
    return { error: "Failed to delete fund." };
  }
}
