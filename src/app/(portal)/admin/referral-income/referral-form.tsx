"use client";

import { useActionState, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { recordReferralIncomeAction, type ReferralFormState } from "@/lib/actions/referral-income";
import { renderReferralDisclosure } from "@/lib/billing/referral";

interface SchemeOption {
  id: string;
  name: string;
  policies: { id: string; label: string }[];
}

const field =
  "w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-turquoise";

export function ReferralForm({ schemes, template }: { schemes: SchemeOption[]; template: string }) {
  const [state, formAction, pending] = useActionState<ReferralFormState, FormData>(recordReferralIncomeAction, {});
  const [schemeId, setSchemeId] = useState("");
  const [partner, setPartner] = useState("");
  const [amount, setAmount] = useState("");
  const [text, setText] = useState(template);
  const policies = schemes.find((s) => s.id === schemeId)?.policies ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const preview = useMemo(
    () =>
      renderReferralDisclosure(text, {
        partnerName: partner || "the partner",
        amountCents: Math.round((parseFloat(amount) || 0) * 100),
      }),
    [text, partner, amount],
  );

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <p role="alert" className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded-[var(--radius-card)] bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          {state.success}
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="text-sm text-ink">
          <span className="block mb-1 font-medium">Scheme</span>
          <select name="schemeId" required value={schemeId} onChange={(e) => setSchemeId(e.target.value)} className={field}>
            <option value="">Choose a scheme</option>
            {schemes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-ink">
          <span className="block mb-1 font-medium">Policy (optional)</span>
          <select name="insurancePolicyId" className={field} disabled={policies.length === 0}>
            <option value="">Not linked to one policy</option>
            {policies.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-ink">
          <span className="block mb-1 font-medium">Partner</span>
          <input name="partnerName" required value={partner} onChange={(e) => setPartner(e.target.value)} className={field} />
        </label>
        <label className="text-sm text-ink">
          <span className="block mb-1 font-medium">Amount received ($)</span>
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`${field} tabular-nums`}
          />
        </label>
        <label className="text-sm text-ink">
          <span className="block mb-1 font-medium">Date received</span>
          <input name="receivedAt" type="date" required max={today} defaultValue={today} className={field} />
        </label>
      </div>
      <label className="block text-sm text-ink">
        <span className="block mb-1 font-medium">Disclosure wording</span>
        <textarea
          name="disclosureTemplate"
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className={field}
        />
        <span className="block mt-1 text-xs text-ink-muted">
          {"{partner}"} and {"{amount}"} are filled in. Owners and the committee see the finished wording below.
        </span>
      </label>
      <div className="rounded-[var(--radius-card)] bg-muted px-4 py-3 text-sm text-ink">{preview}</div>
      <label className="block text-sm text-ink">
        <span className="block mb-1 font-medium">Internal notes (optional)</span>
        <input name="notes" className={field} />
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? "Recording..." : "Record referral income"}
      </Button>
    </form>
  );
}
