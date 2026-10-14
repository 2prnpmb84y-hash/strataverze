"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { createLevy } from "@/lib/queries/levies";

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
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

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
    for (const period of periods) {
      await createLevy({
        schemeId,
        title: period.title,
        description: `Auto-generated ${frequency!.toLowerCase().replace("_", "-")} levy`,
        totalAmount: period.amount,
        dueDate: period.dueDate,
        levyType: type,
      });
    }

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
    return { error: "Failed to generate levies. Please try again." };
  }
}

function buildPeriods(
  frequency: string,
  startDate: Date,
  annualBudget: number,
  prefix: string,
) {
  const year = startDate.getFullYear();
  const endYear = year + 1;
  const fyLabel = `FY${String(endYear).slice(2)}`;

  switch (frequency) {
    case "QUARTERLY": {
      const quarterAmount = Math.round((annualBudget / 4) * 100) / 100;
      // Adjust last quarter for rounding
      const lastQuarterAmount =
        Math.round((annualBudget - quarterAmount * 3) * 100) / 100;

      const quarters = [
        { label: "Q1", monthsOffset: 0 },
        { label: "Q2", monthsOffset: 3 },
        { label: "Q3", monthsOffset: 6 },
        { label: "Q4", monthsOffset: 9 },
      ];

      return quarters.map((q, i) => {
        const dueDate = new Date(startDate);
        dueDate.setMonth(dueDate.getMonth() + q.monthsOffset);

        const titleParts = [prefix, q.label, fyLabel].filter(Boolean);
        return {
          title: titleParts.join(" "),
          amount: i === 3 ? lastQuarterAmount : quarterAmount,
          dueDate: dueDate.toISOString(),
        };
      });
    }
    case "HALF_YEARLY": {
      const halfAmount = Math.round((annualBudget / 2) * 100) / 100;
      const lastHalfAmount =
        Math.round((annualBudget - halfAmount) * 100) / 100;

      return [
        {
          title: [prefix, "H1", fyLabel].filter(Boolean).join(" "),
          amount: halfAmount,
          dueDate: startDate.toISOString(),
        },
        {
          title: [prefix, "H2", fyLabel].filter(Boolean).join(" "),
          amount: lastHalfAmount,
          dueDate: new Date(
            startDate.getFullYear(),
            startDate.getMonth() + 6,
            startDate.getDate(),
          ).toISOString(),
        },
      ];
    }
    case "ANNUALLY":
    default: {
      return [
        {
          title: [prefix, "Annual Levy", fyLabel].filter(Boolean).join(" "),
          amount: annualBudget,
          dueDate: startDate.toISOString(),
        },
      ];
    }
  }
}
