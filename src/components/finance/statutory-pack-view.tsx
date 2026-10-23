import { formatAud } from "@/lib/billing/money";
import type { StatutoryPack } from "@/lib/finance/statutory-pack";
import { KEY_FINANCIAL_INFORMATION } from "@/config/statutory";
import { drillDownHref } from "@/lib/finance/drill-down";
import { Card, CardHeader } from "@/components/ui/card";

const Row = ({ label, cents, strong = false, href }: { label: string; cents: number; strong?: boolean; href?: string }) => (
  <tr className={strong ? "font-semibold" : undefined}>
    <td className="py-1.5 pr-4">{label}</td>
    <td className="py-1.5 text-right tabular-nums">
      {href ? (
        <a href={href} className="text-turquoise underline" title="Show the journal entries behind this amount">
          {formatAud(cents)}
        </a>
      ) : (
        formatAud(cents)
      )}
    </td>
  </tr>
);

/** The statutory statements pack, fund by fund. */
/** `reportsBase` (the portal's reports path) turns each account line into a link to its drill-down. */
export function StatutoryPackView({ pack, reportsBase }: { pack: StatutoryPack; reportsBase?: string }) {
  const rows = KEY_FINANCIAL_INFORMATION.rows;
  return (
    <div className="space-y-6">
      {pack.funds.map((f) => (
        <section key={f.fundId} className="space-y-4" aria-label={f.fundName}>
          <h2 className="text-lg font-semibold text-ink">
            {f.fundName} <span className="text-sm font-normal text-ink-muted">({f.basis === "CASH" ? "cash basis" : "accrual basis"})</span>
          </h2>

          <Card>
            <CardHeader title="Statement of key financial information" description={KEY_FINANCIAL_INFORMATION.source} />
            <table className="w-full text-sm">
              <tbody className="divide-y divide-line">
                <Row label={rows[0]} cents={f.keyInformation.balanceCarriedForwardCents} />
                <Row label={rows[1]} cents={f.keyInformation.totalIncomeReceivedCents} />
                <Row label={rows[2]} cents={f.keyInformation.totalInterestEarnedCents} />
                <Row label={rows[3]} cents={f.keyInformation.totalContributionsPaidCents} />
                <Row label={rows[4]} cents={f.keyInformation.totalUnpaidContributionsCents} />
                <Row label={rows[5]} cents={f.keyInformation.maintenanceExpenditureCents} />
                <Row label={rows[6]} cents={f.keyInformation.administrationExpenditureCents} />
                <Row label={rows[7]} cents={f.keyInformation.balanceAtEndCents} strong />
              </tbody>
            </table>
            <p className="mt-3 text-sm font-medium text-ink">{rows[8]}</p>
            {f.keyInformation.principalItemsNextPeriod.length === 0 ? (
              <p className="text-sm text-ink-muted">None recorded in next year&apos;s budget or the capital works fund plan.</p>
            ) : (
              <ul className="mt-1 space-y-1 text-sm">
                {f.keyInformation.principalItemsNextPeriod.map((i, k) => (
                  <li key={`${i.description}-${k}`} className="flex justify-between gap-2">
                    <span>{i.description}</span>
                    <span className="tabular-nums">{formatAud(i.amountCents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Income and expenditure" description={`Prior year surplus: ${formatAud(f.comparative.surplusCents)}`} />
            <table className="w-full text-sm">
              <tbody className="divide-y divide-line">
                {f.income.map((l) => (
                  <Row
                    key={`i-${l.accountId}`}
                    label={`${l.accountCode} ${l.accountName}`}
                    cents={l.amountCents}
                    href={reportsBase ? drillDownHref(reportsBase, { accountId: l.accountId, fundId: f.fundId, start: pack.start, end: pack.end, basis: f.basis }) : undefined}
                  />
                ))}
                <Row label="Total income" cents={f.totals.incomeCents} strong />
                {f.expenditure.map((l) => (
                  <Row
                    key={`e-${l.accountId}`}
                    label={`${l.accountCode} ${l.accountName}`}
                    cents={l.amountCents}
                    href={reportsBase ? drillDownHref(reportsBase, { accountId: l.accountId, fundId: f.fundId, start: pack.start, end: pack.end, basis: f.basis }) : undefined}
                  />
                ))}
                <Row label="Total expenditure" cents={f.totals.expenseCents} strong />
                <Row label="Surplus (deficit)" cents={f.totals.surplusCents} strong />
              </tbody>
            </table>
          </Card>

          <Card>
            <CardHeader title="Balance sheet at year end" />
            <table className="w-full text-sm">
              <tbody className="divide-y divide-line">
                {f.balanceSheet.assets.map((l) => (
                  <Row
                    key={`a-${l.accountCode}`}
                    label={`${l.accountCode} ${l.accountName}`}
                    cents={l.cents}
                    href={reportsBase && l.accountId ? drillDownHref(reportsBase, { accountId: l.accountId, fundId: f.fundId, end: pack.end }) : undefined}
                  />
                ))}
                {f.balanceSheet.liabilities.map((l) => (
                  <Row
                    key={`l-${l.accountCode}`}
                    label={`Less ${l.accountCode} ${l.accountName}`}
                    cents={-l.cents}
                    href={reportsBase && l.accountId ? drillDownHref(reportsBase, { accountId: l.accountId, fundId: f.fundId, end: pack.end }) : undefined}
                  />
                ))}
                <Row label="Owners' funds" cents={f.balanceSheet.ownersFundsCents} strong />
              </tbody>
            </table>
          </Card>

          <Card>
            <CardHeader title="Levy register and arrears at year end" description={`${f.levyRegister.length} notices due in the year.`} />
            {f.arrearsByLot.length === 0 ? (
              <p className="text-sm text-ink-muted">No contributions were unpaid at the end of the year.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-ink-muted">
                    <th scope="col" className="py-1.5 pr-4 font-medium">Lot</th>
                    <th scope="col" className="py-1.5 text-right font-medium">Unpaid at year end</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {f.arrearsByLot.map((a) => (
                    <Row key={a.lotNumber} label={`Lot ${a.lotNumber}`} cents={a.unpaidCents} />
                  ))}
                </tbody>
              </table>
            )}
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-turquoise">Show every notice</summary>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-ink-muted">
                      <th scope="col" className="py-1.5 pr-3 font-medium">Lot</th>
                      <th scope="col" className="py-1.5 pr-3 font-medium">Notice</th>
                      <th scope="col" className="py-1.5 pr-3 font-medium">Due</th>
                      <th scope="col" className="py-1.5 pr-3 text-right font-medium">Owed</th>
                      <th scope="col" className="py-1.5 pr-3 text-right font-medium">Paid by year end</th>
                      <th scope="col" className="py-1.5 text-right font-medium">Unpaid</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line tabular-nums">
                    {f.levyRegister.map((r) => (
                      <tr key={r.noticeNumber}>
                        <td className="py-1.5 pr-3">{r.lotNumber}</td>
                        <td className="py-1.5 pr-3">{r.noticeNumber}</td>
                        <td className="py-1.5 pr-3">{r.dueDate}</td>
                        <td className="py-1.5 pr-3 text-right">{formatAud(r.owedCents)}</td>
                        <td className="py-1.5 pr-3 text-right">{formatAud(r.paidByYearEndCents)}</td>
                        <td className="py-1.5 text-right">{formatAud(r.unpaidAtYearEndCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </Card>
        </section>
      ))}

      <Card>
        <CardHeader title="Notes" />
        <ol className="list-decimal space-y-1 pl-5 text-sm text-ink">
          {pack.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
