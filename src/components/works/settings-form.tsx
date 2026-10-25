"use client";

/**
 * The committee's works settings and the building's preferred contractors
 * (works marketplace stage 1, 25 Oct 2026).
 */
import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { APPROVAL_RULES, WORKS_TRADES, type ApprovalRule } from "@/config/works";
import { removePreferredContractorAction, saveWorksSettingsAction, setPreferredContractorAction, type WorksFormState } from "@/lib/actions/works-marketplace";

const RULE_TEXT: Record<ApprovalRule, { label: string; help: string }> = {
  ONE: { label: "Any one committee member", help: "Quickest, with the least oversight." },
  TWO: { label: "Two committee members", help: "The default. One proposes and another agrees." },
  MAJORITY: { label: "A majority of the committee", help: "More than half of the current committee must agree." },
};

function Message({ state }: { state: WorksFormState }) {
  if (state.error) return <p className="text-sm text-red-600" role="alert">{state.error}</p>;
  if (state.done) return <p className="text-sm text-emerald-700" role="status">{state.done}</p>;
  return null;
}

export function WorksSettingsForm({
  schemeId,
  current,
  committeeSize,
  readOnly,
}: {
  schemeId: string;
  current: { approvalRule: ApprovalRule; urgentLimit: number | null; adviserMayDecide: boolean; adviserLimit: number | null };
  committeeSize: number;
  readOnly: boolean;
}) {
  const [delegate, setDelegate] = useState(current.adviserMayDecide);
  const [state, formAction, isPending] = useActionState<WorksFormState, FormData>(saveWorksSettingsAction.bind(null, schemeId), {});
  const money = (v: number | null) => (v == null ? "" : String(v));

  return (
    <form action={formAction} className="space-y-6">
      <fieldset className="space-y-2" disabled={readOnly}>
        <legend className="text-sm font-medium text-ink mb-1">Who must agree a works decision</legend>
        <p className="text-xs text-ink-muted mb-2">Decisions are made by vote in StrataVerze, with no meeting needed. The committee has {committeeSize} member{committeeSize === 1 ? "" : "s"}.</p>
        {(Object.keys(APPROVAL_RULES) as ApprovalRule[]).map((r) => (
          <label key={r} className="flex items-start gap-3 rounded-[var(--radius-card)] border border-line bg-white p-3">
            <input type="radio" name="approvalRule" value={r} defaultChecked={current.approvalRule === r} className="mt-1 accent-turquoise" />
            <span className="text-sm">
              <span className="font-medium text-ink">{RULE_TEXT[r].label}</span>
              <span className="block text-ink-muted mt-0.5">{RULE_TEXT[r].help}</span>
            </span>
          </label>
        ))}
        {state.fieldErrors?.approvalRule && <p className="text-xs text-red-500">{state.fieldErrors.approvalRule}</p>}
      </fieldset>

      <fieldset disabled={readOnly}>
        <FormField
          label="Urgent works spending limit (dollars)"
          name="urgentLimit"
          defaultValue={money(current.urgentLimit)}
          placeholder="e.g. 2000"
          error={state.fieldErrors?.urgentLimit}
          helpText="The most one committee member can approve for urgent works without the others. Leave blank until the committee agrees a limit."
        />
      </fieldset>

      <fieldset className="space-y-3" disabled={readOnly}>
        <label className="flex items-start gap-3 rounded-[var(--radius-card)] border border-line bg-white p-3">
          <input type="checkbox" name="adviserMayDecide" checked={delegate} onChange={(e) => setDelegate(e.target.checked)} className="mt-1 h-4 w-4 accent-turquoise" />
          <span className="text-sm">
            <span className="font-medium text-ink">Delegate works decisions to the Adviser</span>
            <span className="block text-ink-muted mt-0.5">Off by default. When on, the Adviser can decide works requests for the committee, up to the limit below. Each decision is recorded as made under this delegation.</span>
          </span>
        </label>
        {delegate && (
          <FormField
            label="Most the Adviser may approve (dollars)"
            name="adviserLimit"
            required
            defaultValue={money(current.adviserLimit)}
            placeholder="e.g. 5000"
            error={state.fieldErrors?.adviserLimit}
          />
        )}
      </fieldset>

      {!readOnly && (
        <div className="space-y-2">
          <Message state={state} />
          <Button type="submit" disabled={isPending}>{isPending ? "Saving..." : "Save settings"}</Button>
          <p className="text-xs text-ink-muted">Saving asks you to confirm with your authenticator if you have not recently.</p>
        </div>
      )}
    </form>
  );
}

export interface PreferredRow {
  trade: string;
  name: string;
  approved: boolean;
}

export function PreferredContractors({
  schemeId,
  rows,
  contractors,
  canEdit,
}: {
  schemeId: string;
  rows: PreferredRow[];
  /** Approved contractors, with the trades they list. */
  contractors: Array<{ id: string; name: string; suburb: string | null; trades: string[] }>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [trade, setTrade] = useState("");
  const [state, formAction, isPending] = useActionState<WorksFormState, FormData>(async (prev, fd) => {
    const r = await setPreferredContractorAction(schemeId, prev, fd);
    if (r.done) router.refresh();
    return r;
  }, {});
  const [removing, startRemove] = useTransition();
  const [removeMsg, setRemoveMsg] = useState<WorksFormState>({});
  const t = trade.toLowerCase();
  const options = trade
    ? contractors
        .map((c) => ({ ...c, listsTrade: c.trades.some((x) => x.toLowerCase() === t) }))
        .sort((a, b) => Number(b.listsTrade) - Number(a.listsTrade) || a.name.localeCompare(b.name))
    : [];

  return (
    <div className="space-y-5">
      {rows.length === 0 ? (
        <p className="text-sm text-ink-muted">No preferred contractors yet. For urgent works, the building needs one for each trade it may need in a hurry.</p>
      ) : (
        <ul className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-white">
          {rows.map((r) => (
            <li key={r.trade} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{r.trade}</p>
                <p className="text-sm text-ink-muted">
                  {r.name}
                  {!r.approved && <span className="ml-2 text-red-600">No longer approved: choose another</span>}
                </p>
              </div>
              {canEdit && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={removing}
                  onClick={() =>
                    startRemove(async () => {
                      const res = await removePreferredContractorAction(schemeId, r.trade);
                      setRemoveMsg(res);
                      if (res.done) router.refresh();
                    })
                  }
                >
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <Message state={removeMsg} />

      {canEdit && (
        <form action={formAction} className="space-y-3 rounded-[var(--radius-card)] border border-line bg-white p-4">
          <p className="text-sm font-medium text-ink">Set a preferred contractor</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="pc-trade" className="block text-sm text-ink mb-1.5">Trade</label>
              <select id="pc-trade" name="trade" required value={trade} onChange={(e) => setTrade(e.target.value)} className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-turquoise">
                <option value="">Choose a trade</option>
                {WORKS_TRADES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="min-w-0">
              <label htmlFor="pc-contractor" className="block text-sm text-ink mb-1.5">Contractor</label>
              <select id="pc-contractor" name="contractorBusinessId" required disabled={!trade || options.length === 0} className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-turquoise disabled:bg-muted">
                <option value="">{!trade ? "Choose a trade first" : options.length === 0 ? "No contractors are approved yet" : "Choose a contractor"}</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}{o.suburb ? `, ${o.suburb}` : ""}{o.listsTrade ? " (lists this trade)" : ""}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-ink-muted">Only contractors approved on StrataVerze can be chosen. Those who list the trade are shown first. Setting one replaces any current choice for that trade.</p>
          <Message state={state} />
          <Button type="submit" disabled={isPending || !trade || options.length === 0}>{isPending ? "Saving..." : "Save"}</Button>
        </form>
      )}
    </div>
  );
}
