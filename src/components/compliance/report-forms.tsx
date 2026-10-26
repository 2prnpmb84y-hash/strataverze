"use client";
/** Strata Hub forms: an AGM held outside StrataVerze, and the report made. */
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { ReportFormState } from "@/lib/actions/annual-report";

type Action = (prev: ReportFormState, formData: FormData) => Promise<ReportFormState>;
const input = "w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-turquoise";

export function ReportForm({
  action,
  submitLabel,
  fields,
}: {
  action: Action;
  submitLabel: string;
  fields: { name: string; label: string; type: "date" | "text" | "select"; defaultValue?: string; max?: string; options?: string[]; required?: boolean }[];
}) {
  const [state, formAction, pending] = useActionState<ReportFormState, FormData>(action, {});
  const v = state.success ? {} : (state.values ?? {});
  const e = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="space-y-3">
      {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      {state.success && <p role="status" className="text-sm text-emerald-700">{state.success}</p>}
      <div className="grid gap-3 sm:grid-cols-3">
        {fields.map((f) => (
          <label key={f.name} className="text-sm">
            <span className="block mb-1 font-medium text-ink">{f.label}</span>
            {f.type === "select" ? (
              <select key={v[f.name] ?? f.defaultValue} name={f.name} defaultValue={v[f.name] ?? f.defaultValue} className={input} required={f.required !== false}>
                {(f.options ?? []).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input name={f.name} type={f.type} max={f.max} defaultValue={v[f.name] ?? f.defaultValue} className={input} required={f.required !== false} />
            )}
            {e[f.name] && <span className="text-xs text-red-600">{e[f.name]}</span>}
          </label>
        ))}
      </div>
      <div className="flex justify-end">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Saving..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}
