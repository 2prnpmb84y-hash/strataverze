import { formatAud } from "@/lib/billing/money";
import type { ThreeWayReport } from "@/lib/finance/three-way-report";
import { Card, CardHeader } from "@/components/ui/card";

const day = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

function Items({ title, help, items }: { title: string; help: string; items: { id: string; date: string; description: string; cents: number }[] }) {
  const total = items.reduce((s, i) => s + i.cents, 0);
  return (
    <Card>
      <CardHeader title={title} description={`${help} ${items.length} item${items.length === 1 ? "" : "s"}, net ${formatAud(total)}.`} />
      {items.length === 0 ? (
        <p className="text-sm text-ink-muted">None.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-line">
              {items.slice(0, 200).map((i) => (
                <tr key={i.id}>
                  <td className="py-2 pr-4 whitespace-nowrap text-ink-muted">{day(i.date)}</td>
                  <td className="py-2 pr-4 text-ink">{i.description}</td>
                  <td className="py-2 text-right tabular-nums">{formatAud(i.cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length > 200 && <p className="mt-2 text-xs text-ink-muted">Showing the first 200.</p>}
        </div>
      )}
    </Card>
  );
}

/** Ledger, wallet and statement side by side, with every difference listed. */
export function ThreeWayReportView({ report, formAction }: { report: ThreeWayReport; formAction: string }) {
  const balanced = report.unexplainedCents === 0;
  return (
    <div className="space-y-6">
      <form action={formAction} method="get" className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-ink">
          <span className="mb-1 block font-medium">As at</span>
          <input type="date" name="asAt" defaultValue={report.asAt} className="rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm" />
        </label>
        <button type="submit" className="rounded-[var(--radius-card)] border border-line bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-zinc-50">
          Update
        </button>
      </form>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs uppercase tracking-wide text-ink-muted">Ledger (bank accounts)</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatAud(report.ledgerCents)}</p>
          <ul className="mt-2 space-y-1 text-xs text-ink-muted">
            {report.input.ledgerByFund.map((f) => (
              <li key={f.fundId} className="flex justify-between gap-2">
                <span>{f.fundName}</span>
                <span className="tabular-nums">{formatAud(f.cents)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-ink-muted">Payment provider wallet</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{report.walletCents == null ? "Not used" : formatAud(report.walletCents)}</p>
          <p className="mt-2 text-xs text-ink-muted">
            {report.walletCents == null ? "No payment provider holds money for this scheme yet." : "Money held by the payment provider."}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-ink-muted">Bank statement</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{report.statementCents == null ? "Unknown" : formatAud(report.statementCents)}</p>
          <ul className="mt-2 space-y-1 text-xs text-ink-muted">
            {report.input.statementByAccount.map((a) => (
              <li key={a.bankAccountId} className="flex justify-between gap-2">
                <span>{a.accountName}</span>
                <span className="tabular-nums">{a.cents == null ? "no balance imported" : `${formatAud(a.cents)} at ${day(a.asAt!)}`}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card>
        <CardHeader title="Reconciliation" />
        {report.adjustedStatementCents == null ? (
          <p className="text-sm text-amber-800">
            The statement balance is not known for {report.missingStatementAccounts.join(", ") || "any account"}. Import a statement
            with a balance column to complete the reconciliation.
          </p>
        ) : (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-line">
              <tr>
                <td className="py-2">Bank statement balance</td>
                <td className="py-2 text-right tabular-nums">{formatAud(report.statementCents!)}</td>
              </tr>
              <tr>
                <td className="py-2">Less bank items not yet in the ledger (unmatched or excluded)</td>
                <td className="py-2 text-right tabular-nums">{formatAud(-report.unmatchedBankCents)}</td>
              </tr>
              <tr>
                <td className="py-2">Add ledger items not yet on the statement</td>
                <td className="py-2 text-right tabular-nums">{formatAud(report.pendingLedgerCents)}</td>
              </tr>
              <tr className="font-semibold">
                <td className="py-2">Adjusted statement balance</td>
                <td className="py-2 text-right tabular-nums">{formatAud(report.adjustedStatementCents)}</td>
              </tr>
              <tr>
                <td className="py-2">Ledger balance</td>
                <td className="py-2 text-right tabular-nums">{formatAud(report.ledgerCents)}</td>
              </tr>
              <tr className={`font-semibold ${balanced ? "text-green-700" : "text-red-700"}`}>
                <td className="py-2">{balanced ? "Reconciled: no unexplained difference" : "Unexplained difference"}</td>
                <td className="py-2 text-right tabular-nums">{formatAud(report.unexplainedCents!)}</td>
              </tr>
            </tbody>
          </table>
        )}
        {report.suspenseCents !== 0 && (
          <p className="mt-3 text-sm text-amber-800">
            {formatAud(report.suspenseCents)} is in suspense. It is in the ledger but not yet identified, and must be cleared before
            the period can close.
          </p>
        )}
      </Card>

      <Items title="Bank items not in the ledger" help="Unallocated parts of bank transactions, and excluded transactions." items={report.input.unmatchedBank} />
      <Items title="Ledger items not on the statement" help="Bank entries in the ledger not yet matched to a bank transaction (pending)." items={report.input.pendingLedger} />
      <Items title="Suspense" help="Unidentified amounts posted to suspense." items={report.input.suspense} />
    </div>
  );
}
