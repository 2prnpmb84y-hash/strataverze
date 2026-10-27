"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import type { PlanFormatChoices } from "@/lib/jurisdiction/building-data";
import { savePlanFormatAction, type PlanFormatState } from "../actions";

/**
 * The building's plan format (QLD go-live gap, insurance in contributions),
 * for a building whose rule pack has a PLAN_FORMAT selector. The label, help,
 * options and notes come from the pack through the server page. Every format
 * can be recorded. One StrataVerze does not support yet is marked, with the
 * pack's note shown once it is chosen. Advisers only: owners never see this
 * setting.
 */
export function PlanFormatForm({
  schemeId,
  choices,
  current,
}: {
  schemeId: string;
  choices: PlanFormatChoices;
  current: string | null;
}) {
  const [state, formAction, isPending] = useActionState<PlanFormatState, FormData>(savePlanFormatAction.bind(null, schemeId), {});
  const chosen = choices.options.find((o) => o.value === current);

  return (
    <Card className="mb-6">
      <CardHeader title={choices.label} description={choices.help} />
      <form action={formAction} className="space-y-4">
        {state.error && (
          <div role="alert" className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {state.error}
          </div>
        )}
        {state.success && (
          <div role="status" className="rounded-[var(--radius-card)] bg-mint-soft px-4 py-3 text-sm text-ink">
            Saved.
          </div>
        )}
        <div>
          <label htmlFor="planFormat" className="block text-sm font-medium text-ink mb-1.5">
            {choices.label}
            <span className="text-red-500 ml-0.5">*</span>
          </label>
          <select
            id="planFormat"
            name="planFormat"
            required
            defaultValue={current ?? ""}
            className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-turquoise transition-colors"
          >
            <option value="" disabled>
              Not recorded
            </option>
            {choices.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.supported ? o.label : `${o.label} (not supported yet)`}
              </option>
            ))}
          </select>
          {chosen && !chosen.supported && chosen.note && <p className="mt-1.5 text-xs text-ink-muted">{chosen.note}</p>}
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
