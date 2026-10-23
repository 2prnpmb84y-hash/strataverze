"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createCutoverAction,
  executeCutoverAction,
  removeCutoverFileAction,
  setCutoverDateAction,
  signOffCutoverAction,
  stageCutoverFileAction,
} from "../actions";
import type { CutoverDataType, CutoverFile, Readiness, SignOff } from "@/lib/finance/migration-cutover";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormField, SelectField, TextareaField } from "@/components/ui/form-field";

export interface CutoverClientView {
  id: string;
  sourceLabel: string;
  template: { status: string; note: string; references: Array<{ title: string; url: string }> } | null;
  cutoverDate: string | null;
  status: string;
  staged: Array<{ dataType: CutoverDataType; label: string; fileName: string; sha256: string; stagedAt: string; mapping: Record<string, string> }>;
  files: CutoverFile[];
  rowProblems: Array<{ dataType: CutoverDataType; rows: Array<{ rowNumber: number; errors: string[]; warnings: string[] }> }>;
  readiness: Readiness;
  signOff: (SignOff & { signedOffByName: string | null }) | null;
  results: Record<string, unknown> | null;
  executedAt: string | null;
  executedByName: string | null;
}

type Field = { field: string; label: string; required?: boolean };

const ORDER: CutoverDataType[] = ["opening_balances", "levy_arrears", "unpaid_invoices", "owner_credits", "bank_balances"];
const HELP: Record<CutoverDataType, string> = {
  opening_balances: "Every account's balance at the cutover date: debit and credit columns, or one signed balance. It must net to zero.",
  levy_arrears: "One row per unpaid notice, with its original due date, so interest and ageing carry on correctly. Interest the old system charged is counted as already charged.",
  unpaid_invoices: "Invoices approved in the old system but not fully paid. Suppliers must be set up first.",
  owner_credits: "Levies paid in advance, by lot and fund.",
  bank_balances: "Each bank account's last reconciled statement balance and date.",
};

const aud = (cents: number) => (cents / 100).toLocaleString("en-AU", { style: "currency", currency: "AUD" });
const day = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "not set");

export function CutoverClient({
  schemeId,
  sources,
  batches,
  view,
  labels,
  fields,
  funds,
}: {
  schemeId: string;
  sources: Array<{ value: string; label: string }>;
  batches: Array<{ id: string; sourceLabel: string; cutoverDate: string | null; status: string; createdAt: string }>;
  view: CutoverClientView | null;
  labels: Record<CutoverDataType, string>;
  fields: Record<string, Field[]>;
  funds: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState(sources[0]?.value ?? "");
  const [newDate, setNewDate] = useState("");
  const [date, setDate] = useState(view?.cutoverDate ?? "");
  // Column editor for a file whose columns need choosing or changing.
  const [editing, setEditing] = useState<{ dataType: CutoverDataType; fileName: string; content: string; headers: string[]; mapping: Record<string, number>; missing: string[] } | null>(null);
  const [ack, setAck] = useState<string[]>(view?.signOff?.acknowledgedDifferences.map((a) => a.key) ?? []);
  const [note, setNote] = useState("");
  const [confirmRun, setConfirmRun] = useState(false);

  const base = `/adviser/schemes/${schemeId}/finance/migration/cutover`;
  const locked = view?.status === "EXECUTED";
  const run = (fn: () => Promise<{ error?: string; success?: boolean; data?: Record<string, unknown> }>, after?: (data?: Record<string, unknown>) => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r.error) setError(r.error);
      else {
        after?.(r.data);
        router.refresh();
      }
    });

  async function upload(dataType: CutoverDataType, file: File) {
    const content = await file.text();
    run(
      () => stageCutoverFileAction(schemeId, view!.id, dataType, file.name, content),
      (data) => {
        if (data && data.staged === false) {
          setEditing({ dataType, fileName: file.name, content, headers: data.headers as string[], mapping: data.mapping as Record<string, number>, missing: data.missing as string[] });
        } else setEditing(null);
      },
    );
  }

  return (
    <div className="space-y-6">
      {error && <div className="rounded-[var(--radius-card)] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <Card>
        <CardHeader title="Cutovers" description="Each scheme is cut over once. Start one, stage its files, check them, sign off, then run it." />
        <div className="space-y-4">
          {batches.length > 0 && (
            <ul className="divide-y divide-line text-sm">
              {batches.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <a href={`${base}?batch=${b.id}`} className={`underline ${view?.id === b.id ? "font-semibold text-ink" : "text-turquoise"}`}>
                    {b.sourceLabel}, cutover {day(b.cutoverDate)}
                  </a>
                  <span className="text-xs text-ink-muted">{b.status === "EXECUTED" ? "Executed" : b.status === "SIGNED_OFF" ? "Signed off" : "Draft"}</span>
                </li>
              ))}
            </ul>
          )}
          {!batches.some((b) => b.status === "EXECUTED") && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:items-end">
              <SelectField label="Source system" name="source" value={source} onChange={(e) => setSource(e.target.value)} options={sources} />
              <FormField label="Cutover date" name="newCutoverDate" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} helpText="The balances are as at the end of this day." />
              <Button type="button" variant="secondary" disabled={pending} onClick={() => run(() => createCutoverAction(schemeId, source, newDate), (d) => d?.id && router.push(`${base}?batch=${String(d.id)}`))}>
                Start a cutover
              </Button>
            </div>
          )}
        </div>
      </Card>

      {view && (
        <>
          <Card>
            <CardHeader title={`${view.sourceLabel} cutover`} description={locked ? `Executed ${view.executedAt ? new Date(view.executedAt).toLocaleString("en-AU") : ""}${view.executedByName ? ` by ${view.executedByName}` : ""}.` : "Changing any file or the date clears the sign-off."} />
            {view.template?.status === "UNCONFIRMED" && (
              <div className="mb-4 rounded-[var(--radius-card)] border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <p className="font-medium">Column template not yet confirmed</p>
                <p className="mt-1">{view.template.note}</p>
                {view.template.references.length > 0 && (
                  <p className="mt-1 text-xs">
                    References:{" "}
                    {view.template.references.map((r, i) => (
                      <span key={r.url}>
                        {i > 0 ? ", " : ""}
                        <a href={r.url} target="_blank" rel="noreferrer" className="underline">
                          {r.title}
                        </a>
                      </span>
                    ))}
                  </p>
                )}
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:items-end">
              <FormField label="Cutover date" name="cutoverDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              {!locked && (
                <Button type="button" variant="secondary" disabled={pending || !date || date === view.cutoverDate} onClick={() => run(() => setCutoverDateAction(schemeId, view.id, date))}>
                  Save date
                </Button>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Files" description="CSV files, parsed and checked on the server. The SHA-256 of each file is kept and signed off." />
            <div className="space-y-5">
              {ORDER.map((t) => {
                const staged = view.staged.find((s) => s.dataType === t);
                const summary = view.files.find((f) => f.dataType === t);
                const problems = view.rowProblems.find((p) => p.dataType === t)?.rows ?? [];
                return (
                  <div key={t} className="rounded-[var(--radius-card)] border border-line p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink">
                          {labels[t]}
                          {t === "opening_balances" && <span className="text-red-500"> *</span>}
                        </p>
                        <p className="text-xs text-ink-muted">{HELP[t]}</p>
                        {staged && summary && (
                          <p className="mt-1 text-xs text-ink-muted break-all">
                            {staged.fileName}: {summary.rowCount} row{summary.rowCount === 1 ? "" : "s"}
                            {summary.errorCount ? `, ${summary.errorCount} with errors` : ", no errors"}. SHA-256 {staged.sha256.slice(0, 16)}…
                          </p>
                        )}
                        {staged && (
                          <p className="mt-1 text-xs text-ink-muted">
                            Columns: {Object.entries(staged.mapping).map(([f, h]) => `${fields[t].find((x) => x.field === f)?.label ?? f} from "${h}"`).join("; ")}
                          </p>
                        )}
                      </div>
                      {!locked && (
                        <div className="flex gap-3">
                          {staged && (
                            <button type="button" className="text-xs text-ink-muted underline" disabled={pending} onClick={() => run(() => removeCutoverFileAction(schemeId, view.id, t))}>
                              Remove
                            </button>
                          )}
                          <label className="cursor-pointer">
                            <input
                              type="file"
                              accept=".csv,text/csv"
                              className="hidden"
                              disabled={pending}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) void upload(t, f);
                                e.target.value = "";
                              }}
                            />
                            <span className="inline-flex items-center rounded-[var(--radius-card)] border border-line bg-white px-3 py-1.5 text-sm font-medium text-ink">
                              {staged ? "Replace CSV" : "Choose CSV"}
                            </span>
                          </label>
                        </div>
                      )}
                    </div>

                    {editing?.dataType === t && (
                      <div className="mt-4 space-y-3 rounded-[var(--radius-card)] bg-muted p-4">
                        <p className="text-sm text-ink">
                          Choose the column for each field in {editing.fileName}.{editing.missing.length ? ` Still needed: ${editing.missing.join(", ")}.` : ""}
                        </p>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {fields[t].map((f) => (
                            <SelectField
                              key={f.field}
                              label={`${f.label}${f.required ? " *" : ""}`}
                              name={`map-${f.field}`}
                              value={editing.mapping[f.field] === undefined ? "" : String(editing.mapping[f.field])}
                              onChange={(e) => {
                                const m = { ...editing.mapping };
                                if (e.target.value === "") delete m[f.field];
                                else m[f.field] = Number(e.target.value);
                                setEditing({ ...editing, mapping: m });
                              }}
                              options={[{ value: "", label: "Not in this file" }, ...editing.headers.map((h, i) => ({ value: String(i), label: h || `Column ${i + 1}` }))]}
                            />
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            disabled={pending}
                            onClick={() =>
                              run(
                                () => stageCutoverFileAction(schemeId, view.id, t, editing.fileName, editing.content, editing.mapping),
                                (d) => (d && d.staged === false ? setEditing({ ...editing, missing: d.missing as string[] }) : setEditing(null)),
                              )
                            }
                          >
                            Stage with these columns
                          </Button>
                          <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}

                    {problems.length > 0 && (
                      <ul className="mt-3 max-h-56 space-y-1 overflow-y-auto text-xs">
                        {problems.map((p) => (
                          <li key={p.rowNumber} className={p.errors.length ? "text-red-700" : "text-amber-700"}>
                            Row {p.rowNumber}: {[...p.errors, ...p.warnings].join(" ")}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          <Card>
            <CardHeader title="Checks" description="The opening trial balance must net to zero. Each control account is compared with the detail behind it." />
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-ink-muted">Debits</p>
                  <p className="tabular-nums text-ink">{aud(view.readiness.trialBalance.debitCents)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-ink-muted">Credits</p>
                  <p className="tabular-nums text-ink">{aud(view.readiness.trialBalance.creditCents)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-ink-muted">Difference</p>
                  <p className={`tabular-nums font-semibold ${view.readiness.trialBalance.balanced ? "text-green-700" : "text-red-700"}`}>
                    {aud(view.readiness.trialBalance.differenceCents)} {view.readiness.trialBalance.balanced ? "(nets to zero)" : ""}
                  </p>
                </div>
              </div>

              {view.readiness.tieOuts.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
                        <th scope="col" className="py-2 pr-3 text-left">Control account</th>
                        <th scope="col" className="py-2 pr-3 text-right">Trial balance</th>
                        <th scope="col" className="py-2 pr-3 text-right">Detail</th>
                        <th scope="col" className="py-2 pr-3 text-right">Difference</th>
                        <th scope="col" className="py-2 text-left">Acknowledge</th>
                      </tr>
                    </thead>
                    <tbody>
                      {view.readiness.tieOuts.map((t) => (
                        <tr key={t.key} className="border-b border-line/50">
                          <td className="py-2 pr-3 text-ink">{t.control}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{aud(t.ledgerCents)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{aud(t.detailCents)}</td>
                          <td className={`py-2 pr-3 text-right tabular-nums ${t.differenceCents ? "text-amber-700" : "text-green-700"}`}>{aud(t.differenceCents)}</td>
                          <td className="py-2">
                            {t.differenceCents !== 0 && t.needsAcknowledgement ? (
                              <input
                                type="checkbox"
                                aria-label={`Acknowledge the difference on ${t.control}`}
                                checked={ack.includes(t.key)}
                                disabled={locked}
                                onChange={(e) => setAck(e.target.checked ? [...ack, t.key] : ack.filter((k) => k !== t.key))}
                                className="h-4 w-4 rounded border-line"
                              />
                            ) : t.differenceCents !== 0 ? (
                              <span className="text-xs text-ink-muted">Expected (unpresented items)</span>
                            ) : (
                              <span className="text-xs text-green-700">Agrees</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {view.readiness.problems.length > 0 && (
                <ul className="list-disc space-y-1 pl-5 text-red-700">
                  {view.readiness.problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Sign-off" description="Records who signed off, when, the source system, the cutover date, the SHA-256 of every file and each difference acknowledged." />
            {view.signOff ? (
              <div className="space-y-2 text-sm">
                <p className="text-ink">
                  Signed off by {view.signOff.signedOffByName ?? view.signOff.signedOffBy} on {new Date(view.signOff.signedOffAt).toLocaleString("en-AU")}, cutover {day(view.signOff.cutoverDate)}.
                </p>
                <ul className="space-y-0.5 text-xs text-ink-muted break-all">
                  {view.signOff.files.map((f) => (
                    <li key={f.dataType}>
                      {labels[f.dataType]}: {f.fileName}, SHA-256 {f.sha256}
                    </li>
                  ))}
                </ul>
                {view.signOff.acknowledgedDifferences.length > 0 && (
                  <p className="text-xs text-ink-muted">
                    Acknowledged: {view.signOff.acknowledgedDifferences.map((a) => `${a.control} ${aud(a.differenceCents)}`).join("; ")}
                  </p>
                )}
                {view.signOff.note && <p className="text-xs text-ink-muted">Note: {view.signOff.note}</p>}
              </div>
            ) : (
              <div className="space-y-3">
                <TextareaField label="Note (optional)" name="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: balances agreed to the StrataMax trial balance printed 1 July 2026." />
                <Button type="button" disabled={pending || !view.readiness.canSignOff} onClick={() => run(() => signOffCutoverAction(schemeId, view.id, ack, note))}>
                  Sign off the cutover
                </Button>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Run"
              description="Posts the opening trial balance and creates the brought-forward notices, invoices, owner credits and bank reconciled balances, all at once. It runs once per scheme."
            />
            {locked && view.results ? (
              <p className="text-sm text-ink">
                Done: journal entry {String(view.results.entryNumber)} with {String(view.results.openingLines)} lines, {String(view.results.notices)} levy notices, {String(view.results.invoices)} invoices,{" "}
                {String(view.results.credits)} owner credits and {String(view.results.bankAccounts)} bank accounts.
              </p>
            ) : confirmRun ? (
              <div className="space-y-3 text-sm">
                <p className="text-ink">This posts to the ledger and cannot be undone here. Run the cutover now?</p>
                <div className="flex gap-2">
                  <Button type="button" disabled={pending} onClick={() => run(() => executeCutoverAction(schemeId, view.id), () => setConfirmRun(false))}>
                    {pending ? "Running..." : "Yes, run it"}
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setConfirmRun(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button type="button" variant="primary" disabled={pending || view.status !== "SIGNED_OFF"} onClick={() => setConfirmRun(true)}>
                Run the cutover
              </Button>
            )}
            {Object.keys(funds).length === 0 && <p className="mt-2 text-xs text-red-700">This scheme has no funds yet. Set up the funds and chart of accounts first.</p>}
          </Card>
        </>
      )}
    </div>
  );
}
