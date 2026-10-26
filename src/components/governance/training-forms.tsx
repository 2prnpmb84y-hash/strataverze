"use client";
/** Committee training forms: the adviser's record for a member, and a member's own completion. */
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import type { TrainingFormState } from "@/lib/actions/committee-training";

type Action = (prev: TrainingFormState, formData: FormData) => Promise<TrainingFormState>;
const input = "w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-turquoise";

function Messages({ state }: { state: TrainingFormState }) {
  if (state.error) return <p role="alert" className="text-sm text-red-700">{state.error}</p>;
  if (state.success) return <p role="status" className="text-sm text-emerald-700">{state.success}</p>;
  return null;
}

export function MemberTrainingForm({
  action,
  appointedOn,
  completedOn,
  exemption,
  note,
  today,
  exemptions,
}: {
  action: Action;
  appointedOn: string;
  completedOn: string | null;
  exemption: string | null;
  note: string | null;
  today: string;
  exemptions: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<TrainingFormState, FormData>(action, {});
  const e = state.fieldErrors ?? {};
  if (!open) {
    return (
      <Button type="button" variant="ghost" onClick={() => setOpen(true)}>
        Update
      </Button>
    );
  }
  return (
    <form action={formAction} className="mt-3 grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Messages state={state} />
      </div>
      <label className="text-sm">
        <span className="block mb-1 font-medium text-ink">Appointed on</span>
        <input name="appointedOn" type="date" max={today} defaultValue={appointedOn} required className={input} />
        {e.appointedOn && <span className="text-xs text-red-600">{e.appointedOn}</span>}
      </label>
      <label className="text-sm">
        <span className="block mb-1 font-medium text-ink">Training completed on (certificate date)</span>
        <input name="completedOn" type="date" max={today} defaultValue={completedOn ?? ""} className={input} />
        {e.completedOn && <span className="text-xs text-red-600">{e.completedOn}</span>}
      </label>
      <label className="text-sm">
        <span className="block mb-1 font-medium text-ink">Exemption</span>
        <select name="exemption" defaultValue={exemption ?? ""} className={input}>
          <option value="">None</option>
          {Object.entries(exemptions).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        {e.exemption && <span className="text-xs text-red-600">{e.exemption}</span>}
      </label>
      <label className="text-sm">
        <span className="block mb-1 font-medium text-ink">Note (evidence of an exemption)</span>
        <input name="note" defaultValue={note ?? ""} className={input} />
        {e.note && <span className="text-xs text-red-600">{e.note}</span>}
      </label>
      <div className="sm:col-span-2 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Close
        </Button>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Saving..." : "Save"}
        </Button>
      </div>
    </form>
  );
}

export function MyTrainingForm({ action, today }: { action: Action; today: string }) {
  const [state, formAction, pending] = useActionState<TrainingFormState, FormData>(action, {});
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <label className="text-sm">
        <span className="block mb-1 font-medium text-ink">Date on your certificate of completion</span>
        <input name="completedOn" type="date" max={today} required className={input} />
      </label>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Saving..." : "Record completion"}
      </Button>
      <div className="w-full">
        <Messages state={state} />
        {state.fieldErrors?.completedOn && <p className="text-xs text-red-600">{state.fieldErrors.completedOn}</p>}
      </div>
    </form>
  );
}
