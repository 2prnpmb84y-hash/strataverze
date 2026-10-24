"use client";

import { Button } from "@/components/ui/button";
import {
  auDate,
  blankLots,
  formatMoney,
  type BalancesCheck,
  type FundSheet,
  type LotBalanceInput,
  type LotBalancesCheck,
  type LotsCheck,
  type OnboardingLot,
  type OpeningBalancesInput,
} from "@/lib/onboarding/property-onboarding";

/**
 * The Add Property steps for lots and owners, the building's opening
 * balances, and each lot's opening balance (onboarding, 24 Oct). The checks
 * live in src/lib/onboarding/property-onboarding.ts and run again on the
 * server.
 */

const cell =
  "w-full min-w-0 rounded-[var(--radius-card)] border border-line bg-white px-2.5 py-2 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-turquoise";
const money = `${cell} text-right tabular-nums`;

export function StepProblems({ problems }: { problems: string[] }) {
  if (problems.length === 0) return null;
  return (
    <div role="alert" className="mb-5 rounded-[var(--radius-card)] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <ul className="list-disc space-y-1 pl-4">
        {problems.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ul>
    </div>
  );
}

/** A check that passes or fails, shown as it is typed. */
function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`flex items-start gap-2 rounded-[var(--radius-card)] border px-3 py-2 text-sm ${
        ok ? "border-turquoise/30 bg-mint-soft/50 text-ink" : "border-amber-200 bg-amber-50 text-amber-900"
      }`}
    >
      <span aria-hidden className="mt-px font-bold">
        {ok ? "✓" : "!"}
      </span>
      <span className="sr-only">{ok ? "Passes:" : "Does not match yet:"}</span>
      <span>{children}</span>
    </div>
  );
}

// ─── Lots and owners ────────────────────────────────────────────────────────

export function LotsStep({
  lots,
  onChange,
  totalLots,
  totalEntitlement,
  check,
  showErrors,
  fromRoll,
}: {
  lots: OnboardingLot[];
  onChange: (next: OnboardingLot[] | ((prev: OnboardingLot[]) => OnboardingLot[])) => void;
  totalLots: number;
  totalEntitlement: number;
  check: LotsCheck;
  showErrors: boolean;
  fromRoll: boolean;
}) {
  const set = (i: number, field: keyof OnboardingLot, value: string) =>
    onChange((prev) => prev.map((row, j) => (j === i ? { ...row, [field]: value } : row)));
  const remove = (i: number) => onChange((prev) => prev.filter((_, j) => j !== i));
  const add = () =>
    onChange((prev) => {
      const used = new Set(prev.map((l) => l.lotNumber.trim()));
      let n = prev.length + 1;
      while (used.has(String(n))) n++;
      return [...prev, { lotNumber: String(n), unitNumber: "", entitlement: "", ownerName: "" }];
    });
  const fill = () =>
    onChange((prev) => {
      const used = new Set(prev.map((l) => l.lotNumber.trim()));
      const extra = blankLots(totalLots + prev.length).filter((l) => !used.has(l.lotNumber)).slice(0, Math.max(0, totalLots - prev.length));
      return [...prev, ...extra];
    });

  const countOk = Number.isInteger(totalLots) && check.count === totalLots;
  const sumOk = Number.isInteger(totalEntitlement) && check.entitlementSum === totalEntitlement;

  return (
    <div>
      <h2 className="font-heading font-semibold text-ink mb-1">Lots and Owners</h2>
      <p className="text-sm text-ink-muted mb-5">
        Enter every lot with its unit entitlement, and each owner&apos;s name exactly as it appears on the strata roll (for example joint owners, or a
        company with its ACN).
        {fromRoll && <span className="block mt-1 text-turquoise font-medium">Filled in from the strata roll. Check each row against the roll.</span>}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
        <Check ok={countOk}>
          Lots: {check.count} entered of {Number.isInteger(totalLots) ? totalLots : "?"} on the building
        </Check>
        <Check ok={sumOk}>
          Unit entitlement: {check.entitlementSum.toLocaleString("en-AU")} entered of{" "}
          {Number.isInteger(totalEntitlement) ? totalEntitlement.toLocaleString("en-AU") : "?"} total
        </Check>
      </div>

      {showErrors && <StepProblems problems={check.errors} />}

      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="bg-muted/50 text-left">
              <th scope="col" className="px-3 py-2 font-medium text-ink-muted w-24">Lot</th>
              <th scope="col" className="px-3 py-2 font-medium text-ink-muted w-24">Unit No.</th>
              <th scope="col" className="px-3 py-2 font-medium text-ink-muted w-32">Unit Entitlement</th>
              <th scope="col" className="px-3 py-2 font-medium text-ink-muted">Owner name (as on the strata roll)</th>
              <th scope="col" className="px-3 py-2 w-12">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {lots.map((lot, i) => {
              const problems = showErrors ? check.rowErrors[i] : undefined;
              return (
                <tr key={i} className="border-t border-line/60 align-top">
                  <td className="px-3 py-2">
                    <input aria-label={`Lot number, row ${i + 1}`} className={cell} value={lot.lotNumber} onChange={(e) => set(i, "lotNumber", e.target.value)} />
                  </td>
                  <td className="px-3 py-2">
                    <input aria-label={`Unit number, row ${i + 1}`} className={cell} value={lot.unitNumber} onChange={(e) => set(i, "unitNumber", e.target.value)} />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      aria-label={`Unit entitlement, row ${i + 1}`}
                      inputMode="numeric"
                      className={money}
                      value={lot.entitlement}
                      onChange={(e) => set(i, "entitlement", e.target.value)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      aria-label={`Owner name as on the strata roll, row ${i + 1}`}
                      className={cell}
                      value={lot.ownerName}
                      maxLength={500}
                      onChange={(e) => set(i, "ownerName", e.target.value)}
                    />
                    {problems && <p className="mt-1 text-xs text-red-600">{problems.join(" ")}</p>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => remove(i)}
                      className="rounded px-2 py-1.5 text-ink-muted hover:bg-muted hover:text-ink"
                      aria-label={`Remove row ${i + 1}`}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
            {lots.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-ink-muted">
                  No lots yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        <Button type="button" variant="secondary" onClick={add}>
          Add lot
        </Button>
        {Number.isInteger(totalLots) && lots.length < totalLots && (
          <Button type="button" variant="secondary" onClick={fill}>
            Add {totalLots - lots.length} blank {totalLots - lots.length === 1 ? "row" : "rows"} to make {totalLots}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Building opening balances ──────────────────────────────────────────────

function MoneyRow({
  id,
  label,
  value,
  onChange,
  error,
  sign,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  sign?: "plus" | "less";
}) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <label htmlFor={id} className="flex-1 text-sm text-ink">
          {sign === "less" ? <span className="text-ink-muted">less </span> : null}
          {label}
        </label>
        <input id={id} inputMode="decimal" placeholder="0.00" className={`${money} max-w-[11rem]`} value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
      {error && <p className="mt-1 text-right text-xs text-red-600">{error}</p>}
    </div>
  );
}

function FundSheetCard({
  which,
  title,
  sheet,
  onChange,
  check,
  showErrors,
}: {
  which: "admin" | "capitalWorks";
  title: string;
  sheet: FundSheet;
  onChange: (field: keyof FundSheet, value: string) => void;
  check: BalancesCheck;
  showErrors: boolean;
}) {
  const err = (f: keyof FundSheet) => (showErrors ? check.fieldErrors[`${which}.${f}`] : undefined);
  const fund = check[which];
  const net = check.netAssets[which];
  return (
    <div className="rounded-[var(--radius-card)] border border-line p-4">
      <h3 className="text-sm font-semibold text-ink mb-3">{title}</h3>
      <div className="space-y-3">
        <MoneyRow id={`${which}-cash`} label="Cash at bank" value={sheet.cashAtBank} onChange={(v) => onChange("cashAtBank", v)} error={err("cashAtBank")} />
        <MoneyRow
          id={`${which}-receivable`}
          label="Levies receivable (including interest)"
          value={sheet.leviesReceivable}
          onChange={(v) => onChange("leviesReceivable", v)}
          error={err("leviesReceivable")}
        />
        {which === "admin" && (
          <MoneyRow
            id={`${which}-advance`}
            label="Levies paid in advance"
            sign="less"
            value={sheet.leviesInAdvance}
            onChange={(v) => onChange("leviesInAdvance", v)}
            error={err("leviesInAdvance")}
          />
        )}
        <MoneyRow id={`${which}-creditors`} label="Creditors" sign="less" value={sheet.creditors} onChange={(v) => onChange("creditors", v)} error={err("creditors")} />
        <div className="flex items-center justify-between border-t border-line pt-3 text-sm">
          <span className="text-ink-muted">Balance sheet comes to</span>
          <span className="font-medium tabular-nums text-ink">{formatMoney(net)}</span>
        </div>
        <MoneyRow
          id={`${which}-balance`}
          label="Fund opening balance"
          value={sheet.fundBalance}
          onChange={(v) => onChange("fundBalance", v)}
          error={err("fundBalance")}
        />
        <Check ok={net === fund.fundBalance}>
          {net === fund.fundBalance ? "Reconciles with the balance sheet" : `Difference ${formatMoney(net - fund.fundBalance)}`}
        </Check>
      </div>
    </div>
  );
}

export function BalancesStep({
  value,
  onChange,
  check,
  yearEnd,
  showErrors,
}: {
  value: OpeningBalancesInput;
  onChange: (next: OpeningBalancesInput) => void;
  check: BalancesCheck;
  yearEnd: string;
  showErrors: boolean;
}) {
  const setFund = (which: "admin" | "capitalWorks") => (field: keyof FundSheet, v: string) =>
    onChange({ ...value, [which]: { ...value[which], [field]: v } });
  const sum = check.admin.fundBalance + check.capitalWorks.fundBalance;
  return (
    <div>
      <h2 className="font-heading font-semibold text-ink mb-1">Opening Balances</h2>
      <p className="text-sm text-ink-muted mb-5">
        The building&apos;s balances at the takeover date, from the previous manager&apos;s balance sheet. Each fund&apos;s balance sheet must come to
        its opening balance, and the total must equal the two funds. Enter zero for a new building with no balances.
      </p>

      {showErrors && <StepProblems problems={check.errors} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-5 mb-6">
        <div>
          <label htmlFor="takeoverDate" className="block text-sm font-medium text-ink mb-1.5">
            Takeover date<span className="text-red-500 ml-0.5">*</span>
          </label>
          <input
            id="takeoverDate"
            type="date"
            className={cell + " py-2.5"}
            value={value.takeoverDate}
            onChange={(e) => onChange({ ...value, takeoverDate: e.target.value })}
          />
          {showErrors && check.fieldErrors.takeoverDate ? (
            <p className="mt-1.5 text-xs text-red-600">{check.fieldErrors.takeoverDate}</p>
          ) : (
            <p className="mt-1.5 text-xs text-ink-muted">
              The date the balances are struck at{yearEnd ? `, in the year ending ${auDate(yearEnd)}` : ""}.
            </p>
          )}
        </div>
        <div>
          <label htmlFor="totalBalance" className="block text-sm font-medium text-ink mb-1.5">
            Total opening balance<span className="text-red-500 ml-0.5">*</span>
          </label>
          <input
            id="totalBalance"
            inputMode="decimal"
            placeholder="0.00"
            className={money + " py-2.5"}
            value={value.totalBalance}
            onChange={(e) => onChange({ ...value, totalBalance: e.target.value })}
          />
          {showErrors && check.fieldErrors.totalBalance && <p className="mt-1.5 text-xs text-red-600">{check.fieldErrors.totalBalance}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FundSheetCard which="admin" title="Administrative fund" sheet={value.admin} onChange={setFund("admin")} check={check} showErrors={showErrors} />
        <FundSheetCard
          which="capitalWorks"
          title="Capital works fund"
          sheet={value.capitalWorks}
          onChange={setFund("capitalWorks")}
          check={check}
          showErrors={showErrors}
        />
      </div>

      <div className="mt-4">
        <Check ok={check.total === sum}>
          Total {formatMoney(check.total)} {check.total === sum ? "equals" : "should equal"} administrative {formatMoney(check.admin.fundBalance)} plus
          capital works {formatMoney(check.capitalWorks.fundBalance)} ({formatMoney(sum)})
        </Check>
      </div>
      <p className="mt-3 text-xs text-ink-muted">
        Other balances (investments, prepayments, GST) are not entered here. If the building has them, load the full trial balance in Finance, under
        Data Migration, before signing off the cutover.
      </p>
    </div>
  );
}

// ─── Lot opening balances ───────────────────────────────────────────────────

export function LotBalancesStep({
  rows,
  ownerNames,
  onChange,
  check,
  sheet,
  showErrors,
}: {
  rows: LotBalanceInput[];
  ownerNames: Record<string, string>;
  onChange: (next: LotBalanceInput[] | ((prev: LotBalanceInput[]) => LotBalanceInput[])) => void;
  check: LotBalancesCheck;
  sheet: BalancesCheck;
  showErrors: boolean;
}) {
  const set = (i: number, field: keyof LotBalanceInput, value: string) =>
    onChange((prev) => prev.map((row, j) => (j === i ? { ...row, [field]: value } : row)));
  const t = check.totals;
  return (
    <div>
      <h2 className="font-heading font-semibold text-ink mb-1">Lot Opening Balances</h2>
      <p className="text-sm text-ink-muted mb-5">
        What each owner owes at the takeover date, by fund, plus interest owing. Unallocated is money an owner has paid that is not yet applied to a
        levy: it is held as a credit in the administrative fund. Interest is shared between the funds in proportion to the lot&apos;s arrears in each.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <Check ok={t.receivableAdmin === sheet.admin.leviesReceivable}>
          Admin levies and interest {formatMoney(t.receivableAdmin)} of {formatMoney(sheet.admin.leviesReceivable)} receivable
        </Check>
        <Check ok={t.receivableCapitalWorks === sheet.capitalWorks.leviesReceivable}>
          Capital works levies and interest {formatMoney(t.receivableCapitalWorks)} of {formatMoney(sheet.capitalWorks.leviesReceivable)} receivable
        </Check>
        <Check ok={t.unallocated === sheet.admin.leviesInAdvance}>
          Unallocated {formatMoney(t.unallocated)} of {formatMoney(sheet.admin.leviesInAdvance)} paid in advance
        </Check>
      </div>

      {showErrors && <StepProblems problems={check.errors} />}

      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="bg-muted/50 text-left">
              <th scope="col" className="px-3 py-2 font-medium text-ink-muted w-20">Lot</th>
              <th scope="col" className="px-3 py-2 font-medium text-ink-muted">Owner</th>
              <th scope="col" className="px-3 py-2 font-medium text-ink-muted text-right w-36">Administrative fund</th>
              <th scope="col" className="px-3 py-2 font-medium text-ink-muted text-right w-36">Capital works fund</th>
              <th scope="col" className="px-3 py-2 font-medium text-ink-muted text-right w-32">Interest</th>
              <th scope="col" className="px-3 py-2 font-medium text-ink-muted text-right w-32">Unallocated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const problems = showErrors ? check.rowErrors[i] : undefined;
              const label = `lot ${row.lotNumber}`;
              return (
                <tr key={row.lotNumber + ":" + i} className="border-t border-line/60 align-top">
                  <td className="px-3 py-2 pt-4 font-medium text-ink">{row.lotNumber}</td>
                  <td className="px-3 py-2 pt-4 text-ink-muted">
                    {ownerNames[row.lotNumber] || "—"}
                    {problems && <p className="mt-1 text-xs text-red-600">{problems.join(" ")}</p>}
                  </td>
                  {(["admin", "capitalWorks", "interest", "unallocated"] as const).map((f) => (
                    <td key={f} className="px-3 py-2">
                      <input
                        aria-label={`${{ admin: "Administrative fund", capitalWorks: "Capital works fund", interest: "Interest", unallocated: "Unallocated" }[f]}, ${label}`}
                        inputMode="decimal"
                        placeholder="0.00"
                        className={money}
                        value={row[f]}
                        onChange={(e) => set(i, f, e.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-line bg-muted/30 font-medium">
              <td className="px-3 py-2 text-ink" colSpan={2}>
                Total
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{formatMoney(t.admin)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatMoney(t.capitalWorks)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatMoney(t.interest)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatMoney(t.unallocated)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
