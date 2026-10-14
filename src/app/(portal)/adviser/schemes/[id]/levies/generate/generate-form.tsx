"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormField, SelectField } from "@/components/ui/form-field";
import { Card, CardHeader } from "@/components/ui/card";
import { generateLeviesAction, type GenerateFormState } from "./actions";

export function GenerateForm({
  schemeId,
  financialYearEnd,
}: {
  schemeId: string;
  financialYearEnd: string;
}) {
  const action = generateLeviesAction.bind(null, schemeId);
  const [state, formAction, isPending] = useActionState<GenerateFormState, FormData>(
    action,
    {},
  );

  // Parse MM-DD to build a sensible default start date
  const [monthStr, dayStr] = financialYearEnd.split("-");
  const fyEndMonth = parseInt(monthStr, 10);
  // Financial year start is the day after FY end the previous year
  const now = new Date();
  const currentYear = now.getFullYear();
  // If we're past the FY end, the next FY starts this year; otherwise it started last year
  const fyEndThisYear = new Date(currentYear, fyEndMonth - 1, parseInt(dayStr, 10));
  const fyStartYear = now > fyEndThisYear ? currentYear : currentYear - 1;
  const fyStartDate = new Date(fyStartYear, fyEndMonth, 1); // month after FY end
  const defaultStartDate = fyStartDate.toISOString().split("T")[0];

  const [frequency, setFrequency] = useState("QUARTERLY");
  const [annualBudget, setAnnualBudget] = useState("");

  const budget = Number(annualBudget) || 0;

  // Preview calculation
  const preview = buildPreview(frequency, budget);

  return (
    <form action={formAction} className="space-y-6">
      {state.error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3">
          <p className="text-sm text-red-700">{state.error}</p>
        </div>
      )}

      <FormField
        label="Title Prefix"
        name="titlePrefix"
        defaultValue="Ordinary Levy"
        placeholder="Ordinary Levy"
        helpText="Prepended to each levy title, for example 'Ordinary Levy Q1 FY26'."
        error={state.fieldErrors?.titlePrefix}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField
          label="Annual Budget ($)"
          name="annualBudget"
          type="number"
          required
          placeholder="40000.00"
          helpText="Total amount to levy across all periods for the year."
          error={state.fieldErrors?.annualBudget}
          value={annualBudget}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setAnnualBudget(e.target.value)
          }
        />

        <FormField
          label="Financial Year Start"
          name="financialYearStart"
          type="date"
          required
          defaultValue={defaultStartDate}
          helpText={`Based on your scheme's FY end of ${financialYearEnd}.`}
          error={state.fieldErrors?.financialYearStart}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SelectField
          label="Frequency"
          name="frequency"
          required
          value={frequency}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
            setFrequency(e.target.value)
          }
          options={[
            { value: "QUARTERLY", label: "Quarterly (4 levies)" },
            { value: "HALF_YEARLY", label: "Half-Yearly (2 levies)" },
            { value: "ANNUALLY", label: "Annually (1 levy)" },
          ]}
          error={state.fieldErrors?.frequency}
        />

        <SelectField
          label="Levy Type"
          name="levyType"
          required
          defaultValue="ORDINARY"
          options={[
            { value: "ORDINARY", label: "Ordinary" },
            { value: "SPECIAL", label: "Special" },
          ]}
          error={state.fieldErrors?.levyType}
        />
      </div>

      {/* Preview */}
      {budget > 0 && (
        <Card>
          <CardHeader
            title="Preview"
            description={`${preview.length} lev${preview.length === 1 ? "y" : "ies"} will be generated as drafts.`}
          />
          <div className="flex flex-col gap-2">
            {preview.map((p, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg bg-muted px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {p.label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Due at start of period
                  </p>
                </div>
                <span className="text-sm font-medium text-foreground tabular-nums">
                  {p.amount.toLocaleString("en-AU", {
                    style: "currency",
                    currency: "AUD",
                  })}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between px-4 py-2 border-t border-border">
              <span className="text-sm font-medium text-foreground">Total</span>
              <span className="text-sm font-semibold text-foreground tabular-nums">
                {budget.toLocaleString("en-AU", {
                  style: "currency",
                  currency: "AUD",
                })}
              </span>
            </div>
          </div>
        </Card>
      )}

      <Button type="submit" disabled={isPending || budget <= 0}>
        {isPending ? "Generating..." : "Generate Levies"}
      </Button>
    </form>
  );
}

function buildPreview(frequency: string, budget: number) {
  if (budget <= 0) return [];

  switch (frequency) {
    case "QUARTERLY": {
      const q = Math.round((budget / 4) * 100) / 100;
      const last = Math.round((budget - q * 3) * 100) / 100;
      return [
        { label: "Q1", amount: q },
        { label: "Q2", amount: q },
        { label: "Q3", amount: q },
        { label: "Q4", amount: last },
      ];
    }
    case "HALF_YEARLY": {
      const h = Math.round((budget / 2) * 100) / 100;
      const lastH = Math.round((budget - h) * 100) / 100;
      return [
        { label: "H1", amount: h },
        { label: "H2", amount: lastH },
      ];
    }
    case "ANNUALLY":
    default:
      return [{ label: "Annual", amount: budget }];
  }
}
