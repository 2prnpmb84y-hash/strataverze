"use client";

/** A contractor's trades and the postcodes they work in (works stage 3, 25 Oct 2026). */
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { WORKS_TRADES } from "@/config/works";
import { saveServiceAreaAction, type WorksFormState } from "@/lib/actions/works-marketplace";

export function ServiceAreaForm({ businessId, trades, postcodes, otherTrades }: { businessId: string; trades: string[]; postcodes: string[]; otherTrades: string[] }) {
  const [state, formAction, pending] = useActionState<WorksFormState, FormData>(saveServiceAreaAction.bind(null, businessId), {});
  return (
    <form action={formAction} className="space-y-6">
      <fieldset>
        <legend className="text-sm font-medium text-ink mb-1">Kinds of work you do</legend>
        <p className="text-xs text-ink-muted mb-3">Buildings choose from this same list, so jobs match exactly.</p>
        {otherTrades.length > 0 && <p className="text-xs text-amber-800 mb-3">You previously typed: {otherTrades.join(", ")}. Tick the matching kinds of work below.</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          {WORKS_TRADES.map((t) => (
            <label key={t} className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="trade" value={t} defaultChecked={trades.includes(t)} className="h-4 w-4 accent-turquoise" />
              {t}
            </label>
          ))}
        </div>
        {state.fieldErrors?.trade && <p className="mt-1.5 text-xs text-red-500">{state.fieldErrors.trade}</p>}
      </fieldset>
      <div>
        <label htmlFor="postcodes" className="block text-sm font-medium text-ink mb-1">Postcodes you work in</label>
        <p className="text-xs text-ink-muted mb-2">Separate them with commas or spaces, for example 2000, 2010, 2047.</p>
        <textarea id="postcodes" name="postcodes" rows={4} defaultValue={postcodes.join(", ")} className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-turquoise" />
        {state.fieldErrors?.postcodes && <p className="mt-1.5 text-xs text-red-500">{state.fieldErrors.postcodes}</p>}
      </div>
      {state.error && <p className="text-sm text-red-600" role="alert">{state.error}</p>}
      {state.done && <p className="text-sm text-emerald-700" role="status">{state.done}</p>}
      <Button type="submit" disabled={pending}>{pending ? "Saving..." : "Save"}</Button>
    </form>
  );
}
