"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import { generateFinancialPeriodsAction } from "../../actions";

/** `schemes` are the building's kind of scheme, as its pack writes it ("NSW strata schemes", "Qld community titles schemes"). */
export function GeneratePeriodsForm({ schemeId, schemes }: { schemeId: string; schemes: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Default to Australian financial year: 1 July current year to 30 June next year
  const now = new Date();
  const fyStartYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const defaultStart = `${fyStartYear}-07-01`;
  const defaultEnd = `${fyStartYear + 1}-06-30`;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);
    const startDate = formData.get("startDate") as string;
    const endDate = formData.get("endDate") as string;

    if (!startDate || !endDate) {
      setError("Both start and end dates are required.");
      return;
    }

    if (new Date(endDate) <= new Date(startDate)) {
      setError("End date must be after start date.");
      return;
    }

    startTransition(async () => {
      const result = await generateFinancialPeriodsAction(
        schemeId,
        startDate,
        endDate,
      );
      if (result.error) {
        setError(result.error);
      } else {
        router.push(`/adviser/schemes/${schemeId}/finance/periods`);
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardHeader
        title="Financial Year"
        description="Enter the start and end dates for the financial year. Monthly periods will be generated automatically."
      />
      <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4">
        {error && (
          <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            label="Financial Year Start"
            name="startDate"
            type="date"
            required
            defaultValue={defaultStart}
            helpText={`Typically 1 July for ${schemes}`}
          />
          <FormField
            label="Financial Year End"
            name="endDate"
            type="date"
            required
            defaultValue={defaultEnd}
            helpText="Typically 30 June of the following year"
          />
        </div>

        <div className="rounded-[var(--radius-card)] bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700">
          This will create 12 monthly periods between the selected dates. Each
          period will be set to &ldquo;Open&rdquo; status, allowing journal
          entries to be posted against them.
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" variant="primary" disabled={isPending}>
            {isPending ? "Generating..." : "Generate 12 Monthly Periods"}
          </Button>
          <Button
            variant="secondary"
            href={`/adviser/schemes/${schemeId}/finance/periods`}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
