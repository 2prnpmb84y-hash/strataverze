"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import type { BuildingRulesView } from "@/lib/jurisdiction/building-selectors";
import { saveBuildingRulesAction, type BuildingRulesState } from "../actions";

const SELECT =
  "w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-turquoise transition-colors";

/**
 * The building rules (VIC, ACT and WA stage 2, PR 2), for a building whose
 * rule pack lists building selectors. Every label, help text, option and
 * fact word comes from the pack through the server page (buildingRulesView).
 * Recorded selectors and facts are chosen here. Values worked out from the
 * building's facts are shown read only, with the facts they came from, or
 * with what is missing. Advisers only: owners never see this section.
 */
export function BuildingRulesForm({ schemeId, view }: { schemeId: string; view: BuildingRulesView }) {
  const [state, formAction, isPending] = useActionState<BuildingRulesState, FormData>(saveBuildingRulesAction.bind(null, schemeId), {});

  return (
    <Card className="mb-6">
      <CardHeader title="Building rules" description="The settings that decide which of this building's rules apply. Some are worked out from the building's facts." />
      <form action={formAction} className="space-y-5">
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

        {view.recorded.map((s) => {
          const chosen = s.options.find((o) => o.value === s.current);
          return (
            <div key={s.key}>
              <label htmlFor={`selector-${s.key}`} className="block text-sm font-medium text-ink mb-1.5">
                {s.label}
              </label>
              <select id={`selector-${s.key}`} name={`selector:${s.key}`} defaultValue={s.current ?? ""} className={SELECT}>
                <option value="">Not recorded</option>
                {s.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.supported ? o.label : `${o.label} (not supported yet)`}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-ink-muted">{s.help}</p>
              {chosen && !chosen.supported && chosen.note && <p className="mt-1 text-xs text-ink-muted">{chosen.note}</p>}
            </div>
          );
        })}

        {view.servicesOnly && (
          <div>
            <label htmlFor="servicesOnly" className="block text-sm font-medium text-ink mb-1.5">
              {view.servicesOnly.label}
            </label>
            <select id="servicesOnly" name="servicesOnly" defaultValue={view.servicesOnly.current == null ? "" : view.servicesOnly.current ? "YES" : "NO"} className={SELECT}>
              <option value="">Not recorded</option>
              <option value="YES">{view.servicesOnly.yesLabel}</option>
              <option value="NO">{view.servicesOnly.noLabel}</option>
            </select>
            <p className="mt-1.5 text-xs text-ink-muted">{view.servicesOnly.help}</p>
          </div>
        )}

        {view.replacementCost && (
          <div>
            <label htmlFor="replacementCost" className="block text-sm font-medium text-ink mb-1.5">
              {view.replacementCost.label}
            </label>
            <input id="replacementCost" name="replacementCost" inputMode="decimal" defaultValue={view.replacementCost.current ?? ""} className={SELECT} />
            <p className="mt-1.5 text-xs text-ink-muted">{view.replacementCost.help}</p>
          </div>
        )}

        {view.lotOccupiable && (
          <fieldset>
            <legend className="block text-sm font-medium text-ink mb-1.5">{view.lotOccupiable.label}</legend>
            <p className="mb-2 text-xs text-ink-muted">{view.lotOccupiable.help}</p>
            {view.lotOccupiable.lots.length === 0 ? (
              <p className="text-sm text-ink-muted">No {view.lotsWord} are recorded yet.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {view.lotOccupiable.lots.map((lot) => (
                  <label key={lot.id} className="flex items-center gap-2 text-sm text-ink">
                    <span className="w-16 shrink-0">
                      {view.lotWord} {lot.lotNumber}
                    </span>
                    <select
                      name={`occupiable:${lot.id}`}
                      aria-label={`${view.lotWord} ${lot.lotNumber}`}
                      defaultValue={lot.current == null ? "" : lot.current ? "YES" : "NO"}
                      className={SELECT}
                    >
                      <option value="">Not recorded</option>
                      <option value="YES">{view.lotOccupiable!.yesLabel}</option>
                      <option value="NO">{view.lotOccupiable!.noLabel}</option>
                    </select>
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        )}

        {view.derived.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-ink mb-2">Worked out from the building&apos;s facts</h3>
            <dl className="space-y-3">
              {view.derived.map((d) => (
                <div key={d.key} className="rounded-[var(--radius-card)] border border-line px-4 py-3">
                  <dt className="text-sm font-medium text-ink">{d.label}</dt>
                  <dd className="mt-1 text-sm text-ink">
                    {d.value ?? <span className="text-red-700">Not worked out</span>}
                    {d.note && <span className="block text-xs text-ink-muted">{d.note}</span>}
                    {d.problem && <span className="block text-xs text-red-700">{d.problem}</span>}
                    <span className="mt-1 block text-xs text-ink-muted">{d.help}</span>
                    {d.facts.length > 0 && (
                      <span className="mt-1 block text-xs text-ink-muted">
                        From: {d.facts.map((f) => `${f.label}: ${f.value}`).join(", ")}
                      </span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
