"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import type { RegulationModuleChoices } from "@/lib/jurisdiction/building-data";
import { saveRegulationModuleAction, type RegulationModuleState } from "../actions";

/**
 * The building's regulation module (QLD stage 2, step 10), for a building
 * whose rule pack has a REGULATION_MODULE selector. The label, help and
 * options come from the pack through the server page. A module StrataVerze
 * does not apply is listed but cannot be chosen. Advisers only: owners never
 * see this setting.
 */
export function RegulationModuleForm({
  schemeId,
  choices,
  current,
}: {
  schemeId: string;
  choices: RegulationModuleChoices;
  current: string | null;
}) {
  const [state, formAction, isPending] = useActionState<RegulationModuleState, FormData>(
    saveRegulationModuleAction.bind(null, schemeId),
    {},
  );
  const supported = choices.options.filter((o) => o.supported);
  const others = choices.options.filter((o) => !o.supported);

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
          <label htmlFor="regulationModule" className="block text-sm font-medium text-ink mb-1.5">
            {choices.label}
            <span className="text-red-500 ml-0.5">*</span>
          </label>
          <select
            id="regulationModule"
            name="regulationModule"
            required
            defaultValue={current ?? ""}
            className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-turquoise transition-colors"
          >
            <option value="" disabled>
              Not recorded
            </option>
            {supported.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
            {others.map((o) => (
              <option key={o.value} value={o.value} disabled>
                {o.label} (not available yet)
              </option>
            ))}
          </select>
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
