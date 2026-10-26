"use client";
/**
 * Payment plan forms: the request (the fields of the standard form), the
 * meeting's decision, the reply date, instalment payments and a plan that is
 * not followed. Used by the adviser pages and, for the request, the owner
 * portal.
 */
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { FeeDisclosure, useFeeConfirmation } from "@/components/billing/fee-disclosure";
import type { FeeView } from "@/lib/billing/disclosure";
import type { PaymentPlanFormState } from "@/lib/actions/payment-plans";

type Action = (prev: PaymentPlanFormState, formData: FormData) => Promise<PaymentPlanFormState>;

const input =
  "w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-turquoise";
const labelCls = "block text-sm font-medium text-ink mb-1";

function Messages({ state }: { state: PaymentPlanFormState }) {
  return (
    <>
      {state.error && (
        <p role="alert" className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="rounded-[var(--radius-card)] bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
          {state.success}
        </p>
      )}
    </>
  );
}

function Field({ label, name, error, help, children }: { label: string; name: string; error?: string; help?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={name} className={labelCls}>
        {label}
      </label>
      {children}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : help ? <p className="mt-1 text-xs text-ink-muted">{help}</p> : null}
    </div>
  );
}

const FREQUENCIES = [
  { value: "WEEKLY", label: "Weekly" },
  { value: "FORTNIGHTLY", label: "Fortnightly" },
  { value: "MONTHLY", label: "Monthly" },
];

/**
 * The request, with the fields of the standard form. `lots` is given when the
 * adviser records a request (choose the lot and the date received); the
 * owner portal passes a single lot and the date is the day it is sent.
 */
export function PaymentPlanRequestForm({
  action,
  lots,
  maxMonths,
  formName,
  today,
  defaultOwnerNames = "",
  owner = false,
  ownersCorporation,
}: {
  action: Action;
  lots?: { id: string; label: string }[];
  maxMonths: number;
  formName: string;
  today: string;
  defaultOwnerNames?: string;
  owner?: boolean;
  /** The building's term for the owners corporation (rule pack). */
  ownersCorporation: string;
}) {
  const [state, formAction, pending] = useActionState<PaymentPlanFormState, FormData>(action, {});
  const e = state.fieldErrors ?? {};
  // After an error the form is reset, so show what was entered again.
  const v = state.success ? {} : (state.values ?? {});
  return (
    <form action={formAction} className="space-y-4">
      <Messages state={state} />
      <p className="text-xs text-ink-muted">{formName}</p>
      {lots && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Lot" name="lotId" error={e.lotId}>
            <select id="lotId" name="lotId" required className={input} defaultValue={v.lotId ?? ""}>
              <option value="" disabled>
                Choose a lot
              </option>
              {lots.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date the complete request was received" name="receivedOn" error={e.receivedOn} help="The reply period runs from this date.">
            <input id="receivedOn" name="receivedOn" type="date" max={today} defaultValue={v.receivedOn ?? today} required className={input} />
          </Field>
        </div>
      )}
      <Field label={owner ? "Your name (each co-owner)" : "Owner's name, as on the form (each co-owner)"} name="ownerNames" error={e.ownerNames}>
        <input id="ownerNames" name="ownerNames" defaultValue={v.ownerNames ?? defaultOwnerNames} required className={input} />
      </Field>
      <label className="flex items-start gap-2 text-sm text-ink">
        <input type="checkbox" name="hardshipStatement" className="mt-1" required defaultChecked={v.hardshipStatement === "on"} />
        <span>
          {owner
            ? `Due to financial hardship I cannot pay the full overdue amount, and I ask the ${ownersCorporation} to approve the payment plan below.`
            : "The form includes the owner's statement that, due to financial hardship, they cannot pay the full overdue amount."}
        </span>
      </label>
      {e.hardshipStatement && <p className="text-xs text-red-600">{e.hardshipStatement}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Current debt ($)" name="currentDebt" error={e.currentDebtCents}>
          <input id="currentDebt" name="currentDebt" inputMode="decimal" className={input} placeholder="0.00" defaultValue={v.currentDebt ?? ""} />
        </Field>
        <Field label="Proposed instalment ($)" name="proposedInstalment" error={e.proposedInstalmentCents}>
          <input id="proposedInstalment" name="proposedInstalment" inputMode="decimal" className={input} placeholder="0.00" defaultValue={v.proposedInstalment ?? ""} />
        </Field>
        <Field label="Proposed frequency" name="proposedFrequency" error={e.proposedFrequency}>
          <select id="proposedFrequency" name="proposedFrequency" className={input} defaultValue={v.proposedFrequency ?? ""}>
            <option value="">Not stated</option>
            {FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Duration in months (up to ${maxMonths})`} name="proposedMonths" error={e.proposedMonths}>
          <input id="proposedMonths" name="proposedMonths" type="number" min={1} max={maxMonths} className={input} defaultValue={v.proposedMonths ?? ""} />
        </Field>
      </div>
      <label className="flex items-start gap-2 text-sm text-ink">
        <input type="checkbox" name="interestWaiverRequested" className="mt-1" defaultChecked={v.interestWaiverRequested === "on"} />
        <span>{owner ? "I also ask that interest on the overdue levies be waived." : "The owner also asks for interest on the overdue levies to be waived."}</span>
      </label>
      {!owner && (
        <Field label="Notes (optional)" name="notes">
          <textarea id="notes" name="notes" rows={2} className={input} defaultValue={v.notes ?? ""} />
        </Field>
      )}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Sending..." : owner ? "Send request" : "Record request"}
        </Button>
      </div>
    </form>
  );
}

export interface DecisionDefaults {
  today: string;
  leviesCents: number;
  interestCents: number;
  interestMethod: string;
  paymentMethods: string;
  contactDetails: string;
  maxMonths: number;
  currentLeviesFrom: string;
  decidedBy: string;
  notDecidedBy: string;
  refusalGrounds: readonly string[];
}

const dollars = (c: number) => (c / 100).toFixed(2);

/** The decision of the owners corporation or strata committee meeting. */
export function PaymentPlanDecisionForm({
  action,
  defaults,
  interestWaiverRequested,
  receivedOn,
  fee,
  feeScheduleHref,
}: {
  action: Action;
  defaults: DecisionDefaults;
  interestWaiverRequested: boolean;
  receivedOn: string;
  fee: FeeView | null;
  feeScheduleHref: string;
}) {
  const [state, formAction, pending] = useActionState<PaymentPlanFormState, FormData>(action, {});
  const [decision, setDecision] = useState("APPROVED");
  const [waiver, setWaiver] = useState("");
  const feeConfirmation = useFeeConfirmation(decision === "APPROVED" ? fee : null);
  const e = state.fieldErrors ?? {};
  // After an error the form is reset, so show what was entered again.
  const v = state.success ? {} : (state.values ?? {});
  const owing = defaults.leviesCents + (waiver === "WAIVED" ? 0 : defaults.interestCents);
  return (
    <form action={formAction} className="space-y-4">
      <Messages state={state} />
      <p className="text-sm text-ink-muted">
        Record the decision made by {defaults.decidedBy}. It cannot be made by {defaults.notDecidedBy}.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Decision" name="decision" error={e.decision}>
          <select id="decision" name="decision" className={input} value={decision} onChange={(ev) => setDecision(ev.target.value)}>
            <option value="APPROVED">Approved</option>
            <option value="REFUSED">Refused</option>
          </select>
        </Field>
        <Field label="Meeting" name="body" error={e.body}>
          <select id="body" name="body" className={input} defaultValue={v.body ?? "STRATA_COMMITTEE"}>
            <option value="STRATA_COMMITTEE">Strata committee meeting</option>
            <option value="OWNERS_CORPORATION">General meeting of the owners corporation</option>
          </select>
        </Field>
        <Field label="Meeting date" name="meetingOn" error={e.meetingOn}>
          <input id="meetingOn" name="meetingOn" type="date" min={receivedOn} max={defaults.today} required className={input} defaultValue={v.meetingOn ?? ""} />
        </Field>
      </div>
      <label className="flex items-start gap-2 text-sm text-ink">
        <input type="checkbox" name="majorityVote" className="mt-1" required defaultChecked={v.majorityVote === "on"} />
        <span>The decision was made by a majority vote at that meeting and is recorded in its minutes.</span>
      </label>
      {e.majorityVote && <p className="text-xs text-red-600">{e.majorityVote}</p>}

      {interestWaiverRequested && (
        <Field label="Interest waiver (asked for by the owner, decided separately)" name="interestWaiver" error={e.interestWaiver}>
          <select id="interestWaiver" name="interestWaiver" className={input} value={waiver} onChange={(ev) => setWaiver(ev.target.value)} required>
            <option value="" disabled>
              Choose
            </option>
            <option value="WAIVED">Interest waived</option>
            <option value="NOT_WAIVED">Interest not waived</option>
          </select>
        </Field>
      )}

      {decision === "REFUSED" ? (
        <Field label="Reasons for the refusal, and how they apply to this request" name="refusalReasons" error={e.refusalReasons}>
          <textarea id="refusalReasons" name="refusalReasons" rows={4} className={input} required defaultValue={v.refusalReasons ?? ""} />
          <ul className="mt-2 list-disc pl-5 text-xs text-ink-muted space-y-1">
            {defaults.refusalGrounds.map((g) => (
              <li key={g}>A request may be refused if {g}.</li>
            ))}
          </ul>
        </Field>
      ) : (
        <div className="space-y-4 rounded-[var(--radius-card)] border border-line p-4">
          <p className="text-sm font-semibold text-ink">Agreed terms</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Levies owing ($)" name="leviesOwing" error={e.leviesOwingCents}>
              <input id="leviesOwing" name="leviesOwing" inputMode="decimal" defaultValue={v.leviesOwing ?? dollars(defaults.leviesCents)} className={input} />
            </Field>
            <Field label="Interest owing ($)" name="interestOwing">
              <input id="interestOwing" name="interestOwing" inputMode="decimal" defaultValue={v.interestOwing ?? dollars(defaults.interestCents)} className={input} />
            </Field>
            <Field label="Amount the plan covers ($)" name="totalAmount" error={e.totalCents} help="Overdue levies, plus interest unless waived.">
              <input key={owing} id="totalAmount" name="totalAmount" inputMode="decimal" defaultValue={v.totalAmount ?? dollars(owing)} required className={input} />
            </Field>
            <Field label="Date agreed" name="agreedOn" error={e.agreedOn}>
              <input id="agreedOn" name="agreedOn" type="date" max={defaults.today} defaultValue={v.agreedOn ?? defaults.today} required className={input} />
            </Field>
            <Field label="First instalment" name="startOn" error={e.startOn}>
              <input id="startOn" name="startOn" type="date" required className={input} defaultValue={v.startOn ?? ""} />
            </Field>
            <Field label="Frequency" name="frequency" error={e.frequency}>
              <select id="frequency" name="frequency" className={input} defaultValue={v.frequency ?? "MONTHLY"}>
                {FREQUENCIES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Number of instalments" name="numberOfInstalments" error={e.numberOfInstalments} help={`The last must fall within ${defaults.maxMonths} months of agreement.`}>
              <input id="numberOfInstalments" name="numberOfInstalments" type="number" min={1} required className={input} defaultValue={v.numberOfInstalments ?? ""} />
            </Field>
          </div>
          <label className="flex items-start gap-2 text-sm text-ink">
            <input type="checkbox" name="coversCurrentLevies" className="mt-1" defaultChecked={v.coversCurrentLevies === "on"} />
            <span>The plan also covers current levies (allowed for plans agreed from {defaults.currentLeviesFrom}).</span>
          </label>
          {e.coversCurrentLevies && <p className="text-xs text-red-600">{e.coversCurrentLevies}</p>}
          <Field label="How interest is calculated" name="interestMethod" error={e.interestMethod}>
            <textarea id="interestMethod" name="interestMethod" rows={2} defaultValue={v.interestMethod ?? defaults.interestMethod} className={input} />
          </Field>
          <Field label="How the owner can pay" name="paymentMethods" error={e.paymentMethods}>
            <textarea id="paymentMethods" name="paymentMethods" rows={2} defaultValue={v.paymentMethods ?? defaults.paymentMethods} className={input} />
          </Field>
          <Field label="Contact for questions about the plan" name="contactDetails" error={e.contactDetails}>
            <input id="contactDetails" name="contactDetails" defaultValue={v.contactDetails ?? defaults.contactDetails} className={input} />
          </Field>
          <FeeDisclosure fee={fee} scheduleHref={feeScheduleHref} confirmed={feeConfirmation.confirmed} onConfirmedChange={feeConfirmation.setConfirmed} idSuffix="-plan" />
        </div>
      )}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending || (decision === "APPROVED" && !feeConfirmation.ready)}>
          {pending ? "Saving..." : "Record decision"}
        </Button>
      </div>
    </form>
  );
}

/** A small one-field form (reply date, a payment, a plan not followed). */
export function SmallActionForm({
  action,
  submitLabel,
  fields,
  hidden = {},
}: {
  action: Action;
  submitLabel: string;
  fields: { name: string; label: string; type?: "date" | "text" | "textarea" | "money"; defaultValue?: string; max?: string }[];
  hidden?: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState<PaymentPlanFormState, FormData>(action, {});
  const e = state.fieldErrors ?? {};
  const v = state.success ? {} : (state.values ?? {});
  return (
    <form action={formAction} className="space-y-3">
      <Messages state={state} />
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => (
          <Field key={f.name} label={f.label} name={f.name} error={e[f.name] ?? (f.type === "money" ? e.amount : undefined)}>
            {f.type === "textarea" ? (
              <textarea id={f.name} name={f.name} rows={2} defaultValue={v[f.name] ?? f.defaultValue} className={input} required />
            ) : (
              <input
                id={f.name}
                name={f.name}
                type={f.type === "date" ? "date" : "text"}
                inputMode={f.type === "money" ? "decimal" : undefined}
                defaultValue={v[f.name] ?? f.defaultValue}
                max={f.max}
                required
                className={input}
              />
            )}
          </Field>
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
