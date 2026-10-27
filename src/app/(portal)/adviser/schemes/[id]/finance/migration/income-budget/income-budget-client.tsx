"use client";

import Link from "next/link";
import { useActionState, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { auDate, formatMoney, parseMoney } from "@/lib/onboarding/property-onboarding";
import {
  LEVY_FREQUENCIES,
  checkIncomeBudget,
  instalments,
  yearLabel,
  longDate,
  type ContextFund,
  type IncomeBudgetContext,
  type IncomeBudgetInput,
  type IncomeBudgetRowInput,
  type LineType,
} from "@/lib/onboarding/income-budget";
import type { IncomeStatement } from "@/lib/onboarding/read-income-statement";
import { FREQUENCY_LABELS, INSTALMENTS_PER_YEAR, addMonths, type LevyFrequency } from "@/lib/levies/notice-plan";

/** Paid in advance: each instalment falls due on the first day of its period. */
function dueDatesFor(yearStart: string, frequency: string): string[] {
  const n = INSTALMENTS_PER_YEAR[frequency as LevyFrequency] ?? 4;
  return Array.from({ length: n }, (_, k) => addMonths(yearStart, (k * 12) / n));
}
import { readIncomeStatementAction, saveIncomeBudgetAction, type SaveIncomeBudgetState } from "./actions";

/**
 * Onboarding: last year's income and expenditure, this year's budget and the
 * year's levies, in one form (24 Oct). The checks are the server's own
 * (src/lib/onboarding/income-budget.ts) and run again when it is saved.
 */

const cell =
  "w-full min-w-0 rounded-[var(--radius-card)] border border-line bg-white px-2.5 py-2 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-turquoise";
const money = `${cell} text-right tabular-nums`;

type Row = IncomeBudgetRowInput & { key: string };
type FundState = { fundId: string; openingBalance: string; rows: Row[] };

let counter = 0;
const newKey = () => `r${++counter}`;
const blankRow = (accountType: LineType): Row => ({ key: newKey(), accountId: "", newAccountName: "", accountType, actual: "", budget: "" });

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex items-start gap-2 rounded-[var(--radius-card)] border px-3 py-2 text-sm ${ok ? "border-turquoise/30 bg-mint-soft/50 text-ink" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
      <span aria-hidden className="mt-px font-bold">
        {ok ? "✓" : "!"}
      </span>
      <span className="sr-only">{ok ? "Passes:" : "Does not match yet:"}</span>
      <span>{children}</span>
    </div>
  );
}

function Problems({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div role="alert" className="rounded-[var(--radius-card)] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <ul className="list-disc space-y-1 pl-4">
        {items.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ul>
    </div>
  );
}

const LEVY_NAME = /^levy (fees?|income|contributions?)\b/i;

/** Rows from the statement, matched to the fund's accounts by name; budgets typed so far are kept. */
function rowsFromStatement(fund: ContextFund, s: IncomeStatement["funds"][number], previous: Row[]): Row[] {
  const byName = new Map(fund.accounts.map((a) => [a.name.trim().toLowerCase(), a]));
  const budgetFor = (accountId: string, name: string) =>
    previous.find((r) => (accountId && r.accountId === accountId) || (!accountId && r.newAccountName.trim().toLowerCase() === name.toLowerCase()))?.budget ?? "";
  let levyUsed = false;
  const make = (type: LineType) => (l: { name: string; actualCents: number }): Row => {
    let account = byName.get(l.name.trim().toLowerCase());
    if (!account && type === "INCOME" && !levyUsed && LEVY_NAME.test(l.name) && fund.levyIncomeAccountId) {
      account = fund.accounts.find((a) => a.id === fund.levyIncomeAccountId);
      levyUsed = true;
    }
    const accountId = account?.id ?? "";
    return { key: newKey(), accountId, newAccountName: account ? "" : l.name, accountType: type, actual: (l.actualCents / 100).toFixed(2), budget: budgetFor(accountId, l.name) };
  };
  const rows = [...s.income.map(make("INCOME")), ...s.expenditure.map(make("EXPENSE"))];
  // Keep budget-only rows typed before the statement was read.
  for (const r of previous) {
    const already = rows.some((x) => (r.accountId && x.accountId === r.accountId) || (!r.accountId && x.newAccountName.trim().toLowerCase() === r.newAccountName.trim().toLowerCase()));
    if (!already && r.budget.trim()) rows.push({ ...r, actual: "" });
  }
  return rows;
}

export function IncomeBudgetClient({
  schemeId,
  ctx,
  saved,
  locks,
  cutoverHref,
  noticeLead,
  words,
}: {
  schemeId: string;
  ctx: IncomeBudgetContext;
  saved: IncomeBudgetInput;
  locks: { budget: Record<string, string>; levies: Record<string, string> };
  cutoverHref: string;
  /** How long before the due date a notice goes out, from the building's rule ("5 weeks"). */
  noticeLead: string;
  /**
   * The building's words, from its rule pack through the server page: a levy,
   * levies, and how they are shared between the lots (levySharedBy).
   */
  words: { levy: string; levies: string; sharedBy: string };
}) {
  const Levies = words.levies[0].toUpperCase() + words.levies.slice(1);
  const { lastYear, budgetYear, takeoverAtYearEnd } = ctx.years;
  const [funds, setFunds] = useState<FundState[]>(() =>
    ctx.funds.map((f) => {
      const s = saved.funds.find((x) => x.fundId === f.id);
      const rows = (s?.rows ?? []).map((r) => ({ ...r, key: newKey() }));
      if (!rows.length) {
        rows.push(
          f.levyIncomeAccountId ? { ...blankRow("INCOME"), accountId: f.levyIncomeAccountId } : blankRow("INCOME"),
          blankRow("EXPENSE"),
        );
      }
      return { fundId: f.id, openingBalance: s?.openingBalance ?? "", rows };
    }),
  );
  const [adoption, setAdoption] = useState(saved.adoption);
  const [levies, setLevies] = useState(saved.levies);
  const [showErrors, setShowErrors] = useState(false);
  const [statement, setStatement] = useState<{ fileName: string; issues: string[]; period: string | null } | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [reading, startReading] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  // A new account named in a row may exist by now (it was created when the
  // form was saved): send it as that account, so saving again works.
  const input: IncomeBudgetInput = useMemo(
    () => ({
      funds: funds.map((f) => {
        const fund = ctx.funds.find((x) => x.id === f.fundId);
        const byName = new Map((fund?.accounts ?? []).map((a) => [a.name.trim().toLowerCase(), a]));
        return {
          fundId: f.fundId,
          openingBalance: f.openingBalance,
          rows: f.rows.map(({ key: _k, ...r }) => {
            const a = !r.accountId && r.newAccountName.trim() ? byName.get(r.newAccountName.trim().replace(/\s+/g, " ").toLowerCase()) : undefined;
            return a && a.accountType === r.accountType ? { ...r, accountId: a.id, newAccountName: "" } : r;
          }),
        };
      }),
      adoption,
      levies,
    }),
    [funds, adoption, levies, ctx],
  );
  const check = useMemo(() => checkIncomeBudget(input, ctx), [input, ctx]);
  const [state, formAction, saving] = useActionState<SaveIncomeBudgetState, FormData>(saveIncomeBudgetAction.bind(null, schemeId), {});
  const [, startSaving] = useTransition();
  const locked = Object.keys(locks.budget).length + Object.keys(locks.levies).length > 0;

  const setFund = (fundId: string, fn: (f: FundState) => FundState) => setFunds((prev) => prev.map((f) => (f.fundId === fundId ? fn(f) : f)));
  const setRow = (fundId: string, key: string, patch: Partial<Row>) =>
    setFund(fundId, (f) => ({ ...f, rows: f.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)) }));

  function readStatement(file: File) {
    setReadError(null);
    const fd = new FormData();
    fd.set("statement", file);
    startReading(async () => {
      const res = await readIncomeStatementAction(schemeId, fd);
      if (!res.ok) {
        setReadError(res.error);
        return;
      }
      const s = res.statement;
      const issues = [...s.issues];
      if (s.period && (s.period.start !== lastYear.start || s.period.end !== lastYear.end)) {
        issues.unshift(`This statement is for ${yearLabel(s.period)}, but last year here is ${yearLabel(lastYear)}. Check you chose the right statement.`);
      }
      const next = funds.map((f) => {
        const fund = ctx.funds.find((x) => x.id === f.fundId)!;
        const sf = s.funds.find((x) => x.fundType === fund.fundType);
        if (!sf) {
          issues.push(`No statement was found for the ${fund.name}.`);
          return f;
        }
        return {
          ...f,
          openingBalance: sf.openingBalanceCents !== null ? (sf.openingBalanceCents / 100).toFixed(2) : f.openingBalance,
          rows: rowsFromStatement(fund, sf, f.rows),
        };
      });
      setFunds(next);
      setStatement({ fileName: file.name, issues, period: s.period ? yearLabel(s.period) : null });
    });
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setShowErrors(true);
    // The server runs the same checks; only send what can be saved.
    if (!check.parsed) return;
    const fd = new FormData();
    fd.set("input", JSON.stringify(input));
    startSaving(() => formAction(fd));
  }

  const serverFundProblems = (id: string) => (state.check && !state.saved ? state.check.fundProblems[id] ?? [] : []);
  const allProblems = [...check.problems, ...Object.values(check.fundProblems).flat()];

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <section className="rounded-[var(--radius-card)] border border-line bg-white p-4 sm:p-5 space-y-3">
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-ink-muted">Takeover date</dt>
            <dd className="font-medium text-ink">{auDate(ctx.takeoverDate)}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Last year (actuals)</dt>
            <dd className="font-medium text-ink">{yearLabel(lastYear)}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">This year (budget and {words.levies})</dt>
            <dd className="font-medium text-ink">{yearLabel(budgetYear)}</dd>
          </div>
        </dl>
        <p className="text-sm text-ink-muted">
          Last year&apos;s actuals are kept as comparatives for this year&apos;s financial statements and budget. They are not posted: the fund balances in the
          opening balances already include last year&apos;s result. {takeoverAtYearEnd ? "Each fund must reconcile with its opening balance." : ""}
        </p>
        {check.notes.map((n, i) => (
          <p key={i} className="rounded-[var(--radius-card)] border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {n}
          </p>
        ))}
      </section>

      {locked && (
        <div className="rounded-[var(--radius-card)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <ul className="list-disc space-y-1 pl-4">
            {[...Object.values(locks.budget), ...Object.values(locks.levies)].map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="rounded-[var(--radius-card)] border border-line bg-white p-4 sm:p-5 space-y-3">
        <h2 className="font-heading font-semibold text-ink">Fill from the annual financial statement</h2>
        <p className="text-sm text-ink-muted">
          Choose the previous manager&apos;s annual financial statement for {yearLabel(lastYear)} (PDF). Each fund&apos;s income and expenditure lines and
          opening balance are read into the tables below, for you to check. Accounts are matched by name, and the {words.levy} line goes to {words.levy} income; any other
          line becomes a new account with the statement&apos;s name. Budgets you have typed are kept.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            aria-label="Annual financial statement PDF"
            className="text-sm"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) readStatement(f);
            }}
          />
          {reading && <span className="text-sm text-ink-muted">Reading…</span>}
        </div>
        {readError && <Problems items={[readError]} />}
        {statement && (
          <div className="rounded-[var(--radius-card)] border border-line bg-mint-soft/40 px-3 py-2 text-sm text-ink space-y-1">
            <p>
              Read {statement.fileName}
              {statement.period ? `, for ${statement.period}` : ""}. Check every line against the statement before saving.
            </p>
            {statement.issues.length > 0 && (
              <ul className="list-disc pl-4 text-amber-900">
                {statement.issues.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {ctx.funds.map((fund) => {
        const f = funds.find((x) => x.fundId === fund.id)!;
        const parsed = check.parsed?.funds.find((x) => x.fundId === fund.id);
        const sum = (type: LineType, k: "actual" | "budget") =>
          f.rows.reduce((s, r) => {
            const t = r.accountId ? fund.accounts.find((a) => a.id === r.accountId)?.accountType : r.accountType;
            return t === type ? s + (parseMoney(r[k], { allowNegative: k === "actual" }) ?? 0) : s;
          }, 0);
        const inc = parsed?.actualIncomeCents ?? sum("INCOME", "actual");
        const exp = parsed?.actualExpenseCents ?? sum("EXPENSE", "actual");
        const binc = sum("INCOME", "budget");
        const bexp = sum("EXPENSE", "budget");
        const opening = parseMoney(f.openingBalance, { allowNegative: true });
        const closing = opening !== null && f.openingBalance.trim() ? opening + inc - exp : null;
        const problems = showErrors ? [...(check.fundProblems[fund.id] ?? []), ...serverFundProblems(fund.id)] : [];
        const usedIds = new Set(f.rows.map((r) => r.accountId).filter(Boolean));
        return (
          <section key={fund.id} className="rounded-[var(--radius-card)] border border-line bg-white p-4 sm:p-5 space-y-4">
            <h2 className="font-heading font-semibold text-ink">{fund.name}</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-ink-muted">Fund balance at {auDate(lastYear.start)} (opening balance in last year&apos;s statements)</span>
                <input
                  className={`${money} mt-1`}
                  inputMode="decimal"
                  placeholder="0.00"
                  value={f.openingBalance}
                  onChange={(e) => setFund(fund.id, (x) => ({ ...x, openingBalance: e.target.value }))}
                />
              </label>
              {takeoverAtYearEnd && fund.balanceAtTakeoverCents !== null && (
                <div className="self-end">
                  <Check ok={closing !== null && closing === fund.balanceAtTakeoverCents}>
                    {closing === null
                      ? `Enter the opening balance. The fund must come to ${formatMoney(fund.balanceAtTakeoverCents)} at ${auDate(ctx.takeoverDate)}.`
                      : `${formatMoney(opening!)} + ${formatMoney(inc)} − ${formatMoney(exp)} = ${formatMoney(closing)}, against ${formatMoney(fund.balanceAtTakeoverCents)} in the opening balances`}
                  </Check>
                </div>
              )}
            </div>

            <Problems items={problems} />

            <div className="relative overflow-x-auto rounded-[var(--radius-card)] border border-line">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="bg-muted/50 text-left">
                    <th scope="col" className="px-3 py-2 font-medium text-ink-muted">Account</th>
                    <th scope="col" className="px-3 py-2 font-medium text-ink-muted w-36">Type</th>
                    <th scope="col" className="px-3 py-2 font-medium text-ink-muted text-right w-36">Last year</th>
                    <th scope="col" className="px-3 py-2 font-medium text-ink-muted text-right w-36">Budget</th>
                    <th scope="col" className="px-3 py-2 w-10">
                      <span className="sr-only">Remove</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {f.rows.map((r, i) => {
                    const account = fund.accounts.find((a) => a.id === r.accountId);
                    const isLevy = !!account && account.id === fund.levyIncomeAccountId;
                    return (
                      <tr key={r.key} className="border-t border-line/60 align-top">
                        <td className="px-3 py-2 space-y-2">
                          <select
                            aria-label={`Account, ${fund.name} row ${i + 1}`}
                            className={cell}
                            value={r.accountId || "__new"}
                            onChange={(e) => setRow(fund.id, r.key, { accountId: e.target.value === "__new" ? "" : e.target.value })}
                          >
                            <option value="__new">New account…</option>
                            {(["INCOME", "EXPENSE"] as const).map((t) => (
                              <optgroup key={t} label={t === "INCOME" ? "Income" : "Expenditure"}>
                                {fund.accounts
                                  .filter((a) => a.accountType === t && (a.id === r.accountId || !usedIds.has(a.id)))
                                  .map((a) => (
                                    <option key={a.id} value={a.id}>
                                      {a.code} {a.name}
                                    </option>
                                  ))}
                              </optgroup>
                            ))}
                          </select>
                          {!r.accountId && (
                            <input
                              aria-label={`New account name, ${fund.name} row ${i + 1}`}
                              className={cell}
                              placeholder="Account name, as in the statements"
                              value={r.newAccountName}
                              onChange={(e) => setRow(fund.id, r.key, { newAccountName: e.target.value })}
                            />
                          )}
                          {isLevy && <p className="text-xs text-ink-muted">The budget on this line is the {words.levies} to raise for the year.</p>}
                        </td>
                        <td className="px-3 py-2">
                          {account ? (
                            <span className="inline-block pt-2 text-ink-muted">{account.accountType === "INCOME" ? "Income" : "Expenditure"}</span>
                          ) : (
                            <select
                              aria-label={`Income or expenditure, ${fund.name} row ${i + 1}`}
                              className={cell}
                              value={r.accountType}
                              onChange={(e) => setRow(fund.id, r.key, { accountType: e.target.value as LineType })}
                            >
                              <option value="INCOME">Income</option>
                              <option value="EXPENSE">Expenditure</option>
                            </select>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            aria-label={`Last year, ${fund.name} row ${i + 1}`}
                            inputMode="decimal"
                            placeholder="0.00"
                            className={money}
                            value={r.actual}
                            onChange={(e) => setRow(fund.id, r.key, { actual: e.target.value })}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            aria-label={`Budget, ${fund.name} row ${i + 1}`}
                            inputMode="decimal"
                            placeholder="0.00"
                            className={money}
                            value={r.budget}
                            onChange={(e) => setRow(fund.id, r.key, { budget: e.target.value })}
                          />
                        </td>
                        <td className="px-3 py-2 pt-3">
                          <button
                            type="button"
                            aria-label={`Remove ${fund.name} row ${i + 1}`}
                            className="rounded px-2 py-1 text-ink-muted hover:bg-muted hover:text-ink"
                            onClick={() => setFund(fund.id, (x) => ({ ...x, rows: x.rows.filter((y) => y.key !== r.key) }))}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="tabular-nums">
                  <tr className="border-t border-line bg-muted/30">
                    <td className="px-3 py-2 text-ink" colSpan={2}>
                      Income
                    </td>
                    <td className="px-3 py-2 text-right">{formatMoney(inc)}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(binc)}</td>
                    <td />
                  </tr>
                  <tr className="bg-muted/30">
                    <td className="px-3 py-2 text-ink" colSpan={2}>
                      Expenditure
                    </td>
                    <td className="px-3 py-2 text-right">{formatMoney(exp)}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(bexp)}</td>
                    <td />
                  </tr>
                  <tr className="bg-muted/30 font-medium">
                    <td className="px-3 py-2 text-ink" colSpan={2}>
                      Surplus (deficit)
                    </td>
                    <td className="px-3 py-2 text-right">{formatMoney(inc - exp)}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(binc - bexp)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => setFund(fund.id, (x) => ({ ...x, rows: [...x.rows, blankRow("INCOME")] }))}>
                Add income line
              </Button>
              <Button type="button" variant="secondary" onClick={() => setFund(fund.id, (x) => ({ ...x, rows: [...x.rows, blankRow("EXPENSE")] }))}>
                Add expenditure line
              </Button>
            </div>
          </section>
        );
      })}

      <section className="rounded-[var(--radius-card)] border border-line bg-white p-4 sm:p-5 space-y-3">
        <h2 className="font-heading font-semibold text-ink">Budget adoption</h2>
        <fieldset className="space-y-2 text-sm">
          <legend className="sr-only">Was the budget adopted before the takeover?</legend>
          <label className="flex items-start gap-2">
            <input type="radio" name="adoption" checked={adoption.kind === "before_takeover"} onChange={() => setAdoption({ kind: "before_takeover", meetingDate: adoption.meetingDate })} className="mt-1" />
            <span>
              Adopted at a general meeting held before StrataVerze took over. The budget is recorded as adopted at that meeting, and the {words.levies} as approved
              on that date.
            </span>
          </label>
          {adoption.kind === "before_takeover" && (
            <label className="ml-6 block max-w-xs">
              <span className="text-ink-muted">Date of the meeting</span>
              <input type="date" className={`${cell} mt-1`} value={adoption.meetingDate} max={ctx.takeoverDate} onChange={(e) => setAdoption({ kind: "before_takeover", meetingDate: e.target.value })} />
            </label>
          )}
          <label className="flex items-start gap-2">
            <input type="radio" name="adoption" checked={adoption.kind === "draft"} onChange={() => setAdoption({ kind: "draft", meetingDate: "" })} className="mt-1" />
            <span>Not adopted yet. Keep the budget as a draft for adoption at the first general meeting held in StrataVerze; the {words.levies} wait for it.</span>
          </label>
        </fieldset>
      </section>

      <section className="rounded-[var(--radius-card)] border border-line bg-white p-4 sm:p-5 space-y-3">
        <h2 className="font-heading font-semibold text-ink">{Levies} for {yearLabel(budgetYear)}</h2>
        <p className="text-sm text-ink-muted">
          Each fund&apos;s {words.levies} are the budget on its {words.levy} income line, shared between the lots by {words.sharedBy} when the notices are generated. The
          notices are generated on the {Levies} page once the cutover has been run.
        </p>
        <fieldset className="space-y-2 text-sm">
          <legend className="text-ink">Did the previous manager raise the {words.levies} for {yearLabel(budgetYear)} before the takeover?</legend>
          <label className="flex items-start gap-2">
            <input type="radio" name="raised" checked={levies.raisedBeforeTakeover === "none"} onChange={() => setLevies({ ...levies, raisedBeforeTakeover: "none" })} className="mt-1" />
            <span>No, they were not raised. Make the {words.levy} schedules for the whole year.</span>
          </label>
          <label className="flex items-start gap-2">
            <input type="radio" name="raised" checked={levies.raisedBeforeTakeover === "some"} onChange={() => setLevies({ ...levies, raisedBeforeTakeover: "some" })} className="mt-1" />
            <span>Yes, some or all of them. Tick those raised: they are not raised again, and their unpaid notices come across in the cutover.</span>
          </label>
          {levies.raisedBeforeTakeover === "some" && (
            <div className="ml-6 space-y-1">
              {Array.from({ length: INSTALMENTS_PER_YEAR[levies.frequency as LevyFrequency] ?? 4 }, (_, i) => i + 1).map((k) => {
                const months = 12 / (INSTALMENTS_PER_YEAR[levies.frequency as LevyFrequency] ?? 4);
                const due = addMonths(budgetYear.start, (k - 1) * months);
                const ticked = (levies.raisedInstalments ?? []).includes(k);
                return (
                  <label key={k} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={ticked}
                      onChange={(e) => {
                        const set = new Set(levies.raisedInstalments ?? []);
                        if (e.target.checked) set.add(k);
                        else set.delete(k);
                        setLevies({ ...levies, raisedInstalments: [...set].sort((a, b) => a - b) });
                      }}
                    />
                    <span>
                      Instalment {k}, due {due.split("-").reverse().join("/")}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl text-sm">
          <label className="block">
            <span className="text-ink-muted">How often</span>
            <select className={`${cell} mt-1`} value={levies.frequency} onChange={(e) => setLevies({ ...levies, frequency: e.target.value })}>
              {LEVY_FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {FREQUENCY_LABELS[f]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-sm text-ink-muted">
          {Levies} are paid in advance, so each instalment falls due on the first day of its period:{" "}
          {dueDatesFor(budgetYear.start, levies.frequency).map((d) => longDate(d)).join(", ")}. Each notice goes out {noticeLead} before it falls due.
        </p>
        <ul className="text-sm text-ink space-y-1">
          {ctx.funds.map((fund) => {
            const f = funds.find((x) => x.fundId === fund.id)!;
            const levy = parseMoney(f.rows.find((r) => r.accountId && r.accountId === fund.levyIncomeAccountId)?.budget ?? "") ?? 0;
            const freq = LEVY_FREQUENCIES.find((x) => x === levies.frequency);
            const parts = levy > 0 && freq ? instalments(levy, freq) : [];
            return (
              <li key={fund.id}>
                {fund.name}: {formatMoney(levy)} for the year
                {parts.length > 1 ? `, ${parts.length} instalments of ${formatMoney(parts[0])}${parts.at(-1) !== parts[0] ? ` (the last ${formatMoney(parts.at(-1)!)})` : ""}` : ""}
              </li>
            );
          })}
        </ul>
      </section>

      {showErrors && <Problems items={check.problems} />}
      {state.error && <Problems items={[state.error]} />}
      {state.saved && (
        <div role="status" className="rounded-[var(--radius-card)] border border-turquoise/30 bg-mint-soft/50 px-4 py-3 text-sm text-ink">
          Saved. Last year&apos;s figures, the budget and the {words.levy} schedules are in place.{" "}
          <Link href={cutoverHref} className="font-medium text-turquoise underline">
            Continue to the cutover
          </Link>{" "}
          to sign off and post the opening balances.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={saving || locked}>
          {saving ? "Saving…" : "Save"}
        </Button>
        {!showErrors && allProblems.length > 0 && <span className="text-sm text-ink-muted">{allProblems.length} thing(s) to complete before saving.</span>}
        <Link href={cutoverHref} className="text-sm text-ink-muted underline">
          Back to the cutover
        </Link>
      </div>
    </form>
  );
}
