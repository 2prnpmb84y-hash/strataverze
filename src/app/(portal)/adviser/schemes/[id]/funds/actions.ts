"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSchemeMembership, AuthorisationError } from "@/lib/auth/require-membership";
import { createFund, updateFund, deleteFund } from "@/lib/queries/funds";
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
  const balance = formData.get("balance") as string | null;

  if (!name?.trim()) errors.name = "Fund name is required.";
  if (!fundType || !FUND_TYPES.includes(fundType))
    errors.fundType = "Select a valid fund type.";
  if (balance !== null && balance !== "" && isNaN(Number(balance)))
    errors.balance = "Balance must be a valid number.";

  return {
    errors,
    isValid: Object.keys(errors).length === 0,
    data: {
      name: name?.trim() ?? "",
      fundType: fundType ?? "ADMINISTRATIVE",
      balance: balance ? Number(balance) : 0,
    },
  };
}

export async function createFundAction(
  schemeId: string,
  _prev: FundFormState,
  formData: FormData,
): Promise<FundFormState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

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
    await requireSchemeMembership(schemeId, ["ADVISER"]);

    const { errors, isValid, data } = validateFundForm(formData);
    if (!isValid) return { fieldErrors: errors };

    await updateFund(fundId, { name: data.name, balance: data.balance });
    revalidatePath(`/adviser/schemes/${schemeId}/funds/${fundId}`);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to update fund. Please try again." };
  }
}

export async function deleteFundAction(schemeId: string, fundId: string) {
  try {
    await requireSchemeMembership(schemeId, ["ADVISER"]);

    await deleteFund(fundId);
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
