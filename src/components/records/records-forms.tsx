"use client";
/** Forms for information certificates (s 184) and records inspections (s 182). */
import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { RecordsFormState } from "@/lib/actions/records";

type Action = (prev: RecordsFormState, formData: FormData) => Promise<RecordsFormState>;
const input = "w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-turquoise";

function Messages({ state }: { state: RecordsFormState }) {
  if (state.error) return <p role="alert" className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{state.error}</p>;
  if (state.success) return <p role="status" className="rounded-[var(--radius-card)] bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">{state.success}</p>;
  return null;
}

export type FieldSpec = {
  name: string;
  label: string;
  type: "text" | "date" | "datetime-local" | "number" | "textarea" | "select" | "checkbox";
  defaultValue?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
  max?: string;
  wide?: boolean;
  help?: string;
};

function Field({ f, v, error }: { f: FieldSpec; v: Record<string, string>; error?: string }) {
  const value = v[f.name] ?? f.defaultValue ?? "";
  const required = f.required !== false && f.type !== "checkbox";
  return (
    <label className={`text-sm ${f.wide ? "sm:col-span-2" : ""}`}>
      {f.type === "checkbox" ? (
        <span className="flex items-start gap-2">
          <input type="checkbox" name={f.name} defaultChecked={v[f.name] === "on" || f.defaultValue === "on"} className="mt-1" />
          <span className="text-ink">{f.label}</span>
        </span>
      ) : (
        <>
          <span className="block mb-1 font-medium text-ink">{f.label}</span>
          {f.type === "textarea" ? (
            <textarea name={f.name} rows={3} defaultValue={value} className={input} required={required} />
          ) : f.type === "select" ? (
            <select key={value} name={f.name} defaultValue={value} className={input} required={required}>
              {!required && <option value="">None</option>}
              {(f.options ?? []).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input name={f.name} type={f.type} max={f.max} defaultValue={value} className={input} required={required} min={f.type === "number" ? 1 : undefined} />
          )}
        </>
      )}
      {error ? <span className="text-xs text-red-600">{error}</span> : f.help ? <span className="text-xs text-ink-muted">{f.help}</span> : null}
    </label>
  );
}

/** A form of fields; after an error it shows what was entered again. */
export function RecordsForm({ action, fields, submitLabel, doneHrefPrefix }: { action: Action; fields: FieldSpec[]; submitLabel: string; /** On success with an id, go to this prefix plus the id. */ doneHrefPrefix?: string }) {
  const [state, formAction, pending] = useActionState<RecordsFormState, FormData>(action, {});
  const router = useRouter();
  const v = state.success ? {} : (state.values ?? {});
  useEffect(() => {
    if (state.success && state.id && doneHrefPrefix) router.push(`${doneHrefPrefix}${state.id}`);
  }, [state, doneHrefPrefix, router]);
  return (
    <form action={formAction} className="space-y-3">
      <Messages state={state} />
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => (
          <Field key={f.name} f={f} v={v} error={state.fieldErrors?.[f.name]} />
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

/** The certificate editor: the request details and each item's text. */
export function CertificateEditor({
  action,
  requesterFields,
  items,
}: {
  action: Action;
  requesterFields: FieldSpec[];
  items: { no: string; title: string; text: string }[];
}) {
  const [state, formAction, pending] = useActionState<RecordsFormState, FormData>(action, {});
  const v = state.success ? {} : (state.values ?? {});
  const e = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="space-y-4">
      <Messages state={state} />
      <div className="grid gap-3 sm:grid-cols-2">
        {requesterFields.map((f) => (
          <Field key={f.name} f={f} v={v} error={e[f.name]} />
        ))}
      </div>
      <div className="space-y-3">
        {items.map((i) => {
          const needs = /check and complete/i.test(v[`item_${i.no}`] ?? i.text);
          return (
            <label key={i.no} className="block text-sm">
              <span className="block mb-1 font-medium text-ink">
                {i.no}. {i.title}
                {needs && <span className="ml-2 text-xs font-normal text-amber-700">To complete</span>}
              </span>
              <textarea name={`item_${i.no}`} rows={Math.min(8, Math.max(2, i.text.split("\n").length + 1))} defaultValue={v[`item_${i.no}`] ?? i.text} className={input} />
              {e[`item_${i.no}`] && <span className="text-xs text-red-600">{e[`item_${i.no}`]}</span>}
            </label>
          );
        })}
      </div>
      <div className="flex justify-end">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Saving..." : "Save draft"}
        </Button>
      </div>
    </form>
  );
}

/** A button that asks for confirmation on the page before it acts. */
export function ConfirmButton({ label, confirmText, act }: { label: string; confirmText: string; act: () => Promise<RecordsFormState> }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!confirming)
    return (
      <Button variant="ghost" type="button" onClick={() => setConfirming(true)}>
        {label}
      </Button>
    );
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span>{confirmText}</span>
      <Button
        variant="secondary"
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await act();
            if (r.error) setError(r.error);
            else router.refresh();
          })
        }
      >
        Yes
      </Button>
      <Button variant="ghost" type="button" onClick={() => setConfirming(false)}>
        No
      </Button>
      {error && <span className="text-red-600">{error}</span>}
    </div>
  );
}
