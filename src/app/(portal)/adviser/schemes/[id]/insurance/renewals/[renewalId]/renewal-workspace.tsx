"use client";

import { useState, useTransition } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormField, SelectField, TextareaField } from "@/components/ui/form-field";
import { StatusChip } from "@/components/ui/status-chip";
import {
  updateRenewalPrepAction,
  saveDeclarationAction,
  changeRenewalStageAction,
  addQuoteAction,
  deleteQuoteAction,
  selectQuoteAction,
  recordApprovalAction,
  completeRenewalAction,
  markNotProceedingAction,
  type RenewalFormState,
} from "../actions";
import { RENEWAL_STAGE_LABELS } from "@/lib/insurance/constants";
import { renewalProgress } from "@/lib/insurance/status";
import { formatMoney } from "@/lib/insurance/premium";

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
function dateForInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().split("T")[0];
}

export interface QuoteView {
  id: string;
  insurer: string;
  broker: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  premium: string | null;
  sumInsured: string | null;
  excesses: string | null;
  exclusions: string | null;
  materialDifferences: string | null;
  validUntil: string | null;
}

const yesNoOptions = [
  { value: "", label: "—" },
  { value: "YES", label: "Yes" },
  { value: "NO", label: "No" },
];

const DECLARATION_QUESTIONS: { key: string; label: string }[] = [
  { key: "q_rewired", label: "Rewired or replumbed in the last 20 years?" },
  { key: "q_hazards", label: "Any known hazards or defects?" },
  { key: "q_council_orders", label: "Any unresolved Council Orders?" },
  { key: "q_ncat", label: "Any outstanding NCAT or legal proceedings?" },
  { key: "q_office_bearers", label: "Any circumstances leading to an Office Bearers claim?" },
  { key: "q_commercial_change", label: "Change in commercial occupants in the past 12 months?" },
  { key: "q_asbestos_eps", label: "Remedial works, asbestos or EPS to disclose?" },
  { key: "q_declined", label: "Ever declined or had special terms imposed?" },
];

export function RenewalWorkspace({
  schemeId,
  renewalId,
  stage,
  allowedStages,
  prep,
  declaration,
  quotes,
  selectedQuoteId,
  selectionRationale,
  approval,
  selectedQuote,
  isComplete,
}: {
  schemeId: string;
  renewalId: string;
  stage: string;
  allowedStages: string[];
  prep: {
    dueDate: string;
    reminderLeadDays: string;
    declaredChanges: string;
    outstandingInfo: string;
    notes: string;
  };
  declaration: Record<string, string>;
  quotes: QuoteView[];
  selectedQuoteId: string | null;
  selectionRationale: string;
  approval: { approvedBy: string; placementInstructions: string };
  selectedQuote: QuoteView | null;
  isComplete: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rationale, setRationale] = useState(selectionRationale);
  const [notProceedReason, setNotProceedReason] = useState("");

  function run(fn: () => Promise<{ error?: string }>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  const [prepState, prepAction, prepPending] = useActionState<RenewalFormState, FormData>(
    updateRenewalPrepAction.bind(null, schemeId, renewalId),
    {},
  );
  const [declState, declAction, declPending] = useActionState<RenewalFormState, FormData>(
    saveDeclarationAction.bind(null, schemeId, renewalId),
    {},
  );
  const [quoteState, quoteAction, quotePending] = useActionState<RenewalFormState, FormData>(
    addQuoteAction.bind(null, schemeId, renewalId),
    {},
  );
  const [apprState, apprAction, apprPending] = useActionState<RenewalFormState, FormData>(
    recordApprovalAction.bind(null, schemeId, renewalId),
    {},
  );
  const [compState, compAction, compPending] = useActionState<RenewalFormState, FormData>(
    completeRenewalAction.bind(null, schemeId, renewalId),
    {},
  );

  const progress = renewalProgress(stage);

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Stage */}
      <Card>
        <CardHeader title="Renewal stage" />
        <div className="flex items-center gap-3 flex-wrap mb-3">
          <StatusChip status={RENEWAL_STAGE_LABELS[stage] ?? stage} />
        </div>
        <div className="h-1.5 w-full rounded-full bg-paper-2 mb-4 overflow-hidden">
          <div
            className="h-full bg-turquoise"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        {!isComplete && allowedStages.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {allowedStages
              .filter((s) => s !== "NOT_PROCEEDING")
              .map((to) => (
                <Button
                  key={to}
                  type="button"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => run(() => changeRenewalStageAction(schemeId, renewalId, to))}
                >
                  {RENEWAL_STAGE_LABELS[to] ?? to}
                </Button>
              ))}
          </div>
        )}
        <p className="text-xs text-ink-muted mt-3">
          Internal approval or a placement request is never treated as
          confirmation that cover is bound. Only Cover confirmed means bound.
        </p>
      </Card>

      {!isComplete && (
        <>
          {/* Preparation */}
          <Card>
            <CardHeader
              title="Preparation"
              description="Owner, due date, reminders and the information you still need."
            />
            <form action={prepAction} className="space-y-4">
              {prepState.error && <p className="text-sm text-red-600">{prepState.error}</p>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Target completion date" name="dueDate" type="date" defaultValue={prep.dueDate} />
                <FormField label="Reminder lead (days before expiry)" name="reminderLeadDays" type="number" defaultValue={prep.reminderLeadDays} />
              </div>
              <TextareaField label="Declared changes since last period" name="declaredChanges" rows={2} defaultValue={prep.declaredChanges} />
              <TextareaField label="Outstanding information" name="outstandingInfo" rows={2} defaultValue={prep.outstandingInfo} />
              <TextareaField label="Notes" name="notes" rows={2} defaultValue={prep.notes} />
              <Button type="submit" variant="primary" disabled={prepPending}>
                {prepPending ? "Saving..." : "Save preparation"}
              </Button>
            </form>
          </Card>

          {/* Pre-renewal declaration */}
          <Card>
            <CardHeader
              title="Pre-renewal declaration"
              description="Property, construction and the standard declaration questions. Saved as a snapshot against this renewal."
            />
            <form action={declAction} className="space-y-4">
              {declState.error && <p className="text-sm text-red-600">{declState.error}</p>}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <FormField label="No. of units" name="units" type="number" defaultValue={declaration.units ?? ""} />
                <FormField label="Year built" name="yearBuilt" type="number" defaultValue={declaration.yearBuilt ?? ""} />
                <FormField label="No. of storeys" name="storeys" type="number" defaultValue={declaration.storeys ?? ""} />
                <FormField label="No. of lifts" name="lifts" type="number" defaultValue={declaration.lifts ?? ""} />
                <FormField label="Residential units" name="residentialUnits" type="number" defaultValue={declaration.residentialUnits ?? ""} />
                <FormField label="Commercial units" name="commercialUnits" type="number" defaultValue={declaration.commercialUnits ?? ""} />
                <FormField label="Basements" name="basements" type="number" defaultValue={declaration.basements ?? ""} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <FormField label="Walls" name="walls" defaultValue={declaration.walls ?? ""} placeholder="e.g. Brick, concrete" />
                <FormField label="Floor" name="floor" defaultValue={declaration.floor ?? ""} placeholder="e.g. Concrete slab" />
                <FormField label="Roof" name="roof" defaultValue={declaration.roof ?? ""} placeholder="e.g. Concrete, tiles" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <SelectField label="Sprinkler system" name="sprinkler" defaultValue={declaration.sprinkler ?? ""} options={[{ value: "", label: "—" }, { value: "FULLY", label: "Fully" }, { value: "BASEMENT", label: "Basement only" }, { value: "EXTERNAL", label: "External wall" }, { value: "NONE", label: "None" }]} />
                <SelectField label="Smoke detectors" name="smokeDetectors" defaultValue={declaration.smokeDetectors ?? ""} options={yesNoOptions} />
                <SelectField label="Fire hydrant" name="hydrant" defaultValue={declaration.hydrant ?? ""} options={yesNoOptions} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                <SelectField label="EPS / aluminium composite panelling" name="eps" defaultValue={declaration.eps ?? ""} options={yesNoOptions} />
                <FormField label="If yes, type and location of cladding" name="epsDetails" defaultValue={declaration.epsDetails ?? ""} />
              </div>

              <div className="space-y-2">
                {DECLARATION_QUESTIONS.map((q) => (
                  <div key={q.key} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                    <span className="sm:col-span-6 text-sm text-ink">{q.label}</span>
                    <div className="sm:col-span-2">
                      <SelectField label="" name={q.key} defaultValue={declaration[q.key] ?? ""} options={yesNoOptions} />
                    </div>
                    <div className="sm:col-span-4">
                      <FormField label="" name={`${q.key}_comment`} defaultValue={declaration[`${q.key}_comment`] ?? ""} placeholder="Comment" />
                    </div>
                  </div>
                ))}
              </div>
              <Button type="submit" variant="primary" disabled={declPending}>
                {declPending ? "Saving..." : "Save declaration"}
              </Button>
            </form>
          </Card>

          {/* Quotes */}
          <Card>
            <CardHeader
              title="Quotes"
              description="Record and compare quotes on consistent fields. Price alone does not decide; coverage differences and missing information are shown."
            />
            {quotes.length > 0 ? (
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-ink-muted border-b border-line">
                      <th className="py-2 pr-4 font-medium">Insurer</th>
                      <th className="py-2 pr-4 font-medium">Period</th>
                      <th className="py-2 pr-4 font-medium text-right">Premium</th>
                      <th className="py-2 pr-4 font-medium text-right">Sum insured</th>
                      <th className="py-2 pr-4 font-medium">Material differences</th>
                      <th className="py-2 font-medium">Valid until</th>
                      <th className="py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotes.map((q) => (
                      <tr
                        key={q.id}
                        className={`border-b border-line/60 ${selectedQuoteId === q.id ? "bg-turquoise/5" : ""}`}
                      >
                        <td className="py-2 pr-4 text-ink">
                          {q.insurer}
                          {q.broker ? <span className="text-ink-muted"> · {q.broker}</span> : null}
                          {selectedQuoteId === q.id && (
                            <span className="ml-1 text-[10px] text-turquoise">(selected)</span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-ink-muted">
                          {fmtDate(q.periodStart)} – {fmtDate(q.periodEnd)}
                        </td>
                        <td className="py-2 pr-4 text-ink text-right tabular-nums">
                          {q.premium ? formatMoney(q.premium) : "—"}
                        </td>
                        <td className="py-2 pr-4 text-ink text-right tabular-nums">
                          {q.sumInsured ? formatMoney(q.sumInsured) : "—"}
                        </td>
                        <td className="py-2 pr-4 text-ink-muted">{q.materialDifferences ?? "—"}</td>
                        <td className="py-2 text-ink-muted">{fmtDate(q.validUntil)}</td>
                        <td className="py-2 text-right whitespace-nowrap">
                          <button
                            type="button"
                            className="text-turquoise text-xs hover:underline mr-2"
                            disabled={pending}
                            onClick={() =>
                              run(() => selectQuoteAction(schemeId, renewalId, q.id, rationale))
                            }
                          >
                            Select
                          </button>
                          <button
                            type="button"
                            className="text-red-600 text-xs hover:underline"
                            disabled={pending}
                            onClick={() => run(() => deleteQuoteAction(schemeId, renewalId, q.id))}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-ink-muted mb-4">No quotes recorded yet.</p>
            )}

            {selectedQuoteId && (
              <div className="mb-4">
                <label className="block text-xs font-medium text-ink-muted mb-1">
                  Selection rationale
                </label>
                <div className="flex gap-2">
                  <input
                    className="flex-1 rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm"
                    value={rationale}
                    onChange={(e) => setRationale(e.target.value)}
                    placeholder="Why this quote was preferred"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={pending}
                    onClick={() =>
                      run(() => selectQuoteAction(schemeId, renewalId, selectedQuoteId, rationale))
                    }
                  >
                    Save
                  </Button>
                </div>
              </div>
            )}

            <details>
              <summary className="text-sm text-turquoise cursor-pointer">Add a quote</summary>
              <form action={quoteAction} className="space-y-3 mt-3">
                {quoteState.error && <p className="text-sm text-red-600">{quoteState.error}</p>}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FormField label="Insurer" name="insurer" required error={quoteState.fieldErrors?.insurer} />
                  <FormField label="Broker" name="broker" />
                  <FormField label="Period start" name="periodStart" type="date" />
                  <FormField label="Period end" name="periodEnd" type="date" />
                  <FormField label="Premium ($)" name="premium" type="number" />
                  <FormField label="Sum insured ($)" name="sumInsured" type="number" />
                  <FormField label="Valid until" name="validUntil" type="date" />
                  <FormField label="Excesses" name="excesses" />
                </div>
                <TextareaField label="Key exclusions / conditions" name="exclusions" rows={2} />
                <TextareaField label="Material differences from current policy" name="materialDifferences" rows={2} />
                <Button type="submit" variant="primary" disabled={quotePending}>
                  {quotePending ? "Adding..." : "Add quote"}
                </Button>
              </form>
            </details>
          </Card>

          {/* Approval */}
          <Card>
            <CardHeader
              title="Approval and placement"
              description="Record who approved and any placement instructions. This is not confirmation that cover is bound."
            />
            <form action={apprAction} className="space-y-3">
              {apprState.error && <p className="text-sm text-red-600">{apprState.error}</p>}
              <FormField label="Approved by (person or body)" name="approvedBy" defaultValue={approval.approvedBy} />
              <TextareaField label="Placement instructions" name="placementInstructions" rows={2} defaultValue={approval.placementInstructions} />
              <Button type="submit" variant="primary" disabled={apprPending}>
                {apprPending ? "Saving..." : "Record approval"}
              </Button>
            </form>
          </Card>

          {/* Completion */}
          {stage === "COVER_CONFIRMED" && selectedQuote && (
            <Card className="border-turquoise/40">
              <CardHeader
                title="Complete renewal"
                description="Creates the successor policy from the accepted quote, preserves the previous policy, and flags any gap or overlap in dates."
              />
              <form action={compAction} className="space-y-3">
                {compState.error && <p className="text-sm text-red-600">{compState.error}</p>}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <FormField label="New policy number" name="newPolicyNumber" required error={compState.fieldErrors?.newPolicyNumber} />
                  <FormField label="Start date" name="startDate" type="date" required defaultValue={dateForInput(selectedQuote.periodStart)} error={compState.fieldErrors?.startDate} />
                  <FormField label="End date" name="endDate" type="date" required defaultValue={dateForInput(selectedQuote.periodEnd)} error={compState.fieldErrors?.endDate} />
                </div>
                <Button type="submit" variant="primary" disabled={compPending}>
                  {compPending ? "Completing..." : "Complete and create successor policy"}
                </Button>
              </form>
            </Card>
          )}

          {/* Not proceeding */}
          <Card className="border-red-200">
            <CardHeader title="Not proceeding" description="Close the renewal without placing cover." />
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm"
                placeholder="Reason"
                value={notProceedReason}
                onChange={(e) => setNotProceedReason(e.target.value)}
              />
              <Button
                type="button"
                variant="danger"
                disabled={pending}
                onClick={() =>
                  run(() => markNotProceedingAction(schemeId, renewalId, notProceedReason))
                }
              >
                Mark not proceeding
              </Button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
