"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSchemeMembership, AuthorisationError } from "@/lib/auth/require-membership";
import { createLeviesBatch } from "@/lib/queries/levies";
import { logActivity } from "@/lib/queries/activity-log";
import { buildPeriods } from "@/lib/levy-periods";

export type GenerateFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

/**
 * Generate multiple levies for a scheme in bulk.
 * Creates quarterly or annual levies as DRAFT status.
 */
export async function generateLeviesAction(
  schemeId: string,
  _prev: GenerateFormState,
  formData: FormData,
): Promise<GenerateFormState> {
  const errors: Record<string, string> = {};

  const annualBudget = formData.get("annualBudget") as string | null;
  const frequency = formData.get("frequency") as string | null;
  const financialYearStart = formData.get("financialYearStart") as string | null;
  const levyType = formData.get("levyType") as string | null;
  const titlePrefix = formData.get("titlePrefix") as string | null;

  if (!annualBudget || Number(annualBudget) <= 0)
    errors.annualBudget = "Annual budget must be greater than zero.";
  if (!frequency || !["QUARTERLY", "HALF_YEARLY", "ANNUALLY"].includes(frequency))
    errors.frequency = "Select a valid frequency.";
  if (!financialYearStart)
    errors.financialYearStart = "Financial year start date is required.";
  if (levyType && !["ORDINARY", "SPECIAL"].includes(levyType))
    errors.levyType = "Select a valid levy type.";

  if (Object.keys(errors).length > 0) return { fieldErrors: errors };

  const budget = Number(annualBudget);
  const prefix = titlePrefix?.trim() || "";
  const type = levyType ?? "ORDINARY";
  const startDate = new Date(financialYearStart!);

  // Calculate periods based on frequency
  const periods = buildPeriods(frequency!, startDate, budget, prefix);

  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    const levyData = periods.map((period) => ({
      schemeId,
      title: period.title,
      description: `Auto-generated ${frequency!.toLowerCase().replace("_", "-")} levy`,
      totalAmount: period.amount,
      dueDate: period.dueDate,
      levyType: type,
    }));

    const createdLevies = await createLeviesBatch(levyData);
    const createdIds = createdLevies.map((l) => l.id);

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "LEVIES_GENERATED",
      entityType: "Levy",
      metadata: {
        count: periods.length,
        frequency: frequency!,
        annualBudget: budget,
        levyIds: createdIds,
      },
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);
    redirect(`/adviser/schemes/${schemeId}/levies`);
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
    return { error: "Failed to generate levies. Please try again." };
  }
}

