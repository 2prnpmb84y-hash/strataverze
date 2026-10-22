import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { StatusChip, type ChipStatus } from "@/components/ui/status-chip";
import { formatAud, splitGst } from "@/lib/billing/money";
import { groupFeeSchedule } from "@/lib/billing/fee-schedule";
import { PAYER_LABELS } from "@/lib/billing/disclosure";
import type { PlatformFeesData } from "@/lib/queries/platform-billing";

const TIER_LABELS: Record<string, string> = {
  SMALL: "Small",
  MEDIUM: "Medium",
  LARGE: "Large",
  ENTERPRISE: "Enterprise",
};

const SOURCE_LABELS: Record<string, string> = {
  LevyPayment: "Levy payment",
  SupplierInvoicePayment: "Supplier payment",
  Meeting: "Meeting",
  MeetingAdjournmentNotice: "Adjourned meeting",
  ElectronicBallot: "Ballot",
  DebtRecoveryStep: "Debt recovery",
  PaymentPlan: "Payment plan",
  InsuranceClaim: "Insurance claim",
  WorksContract: "Works contract",
  WorksVariation: "Contract variation",
  AccountantSeatMonth: "Accountant access",
  YearEndPack: "Year-end pack",
};

const EVENT_STATUS: Record<string, { label: string; variant: ChipStatus }> = {
  ACCRUED: { label: "Not yet invoiced", variant: "default" },
  INVOICED: { label: "Invoiced", variant: "success" },
  EXTRACTED: { label: "Collected", variant: "success" },
  WAIVED: { label: "Waived", variant: "warning" },
  REVERSED: { label: "Reversal", variant: "warning" },
};

const dateFmt = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric" });
const day = (iso: string) => (iso ? dateFmt.format(new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)) : "");

/**
 * The scheme's StrataVerze fees: subscription, charges so far, invoices and
 * the full published fee schedule. Shown to advisers, committee and owners
 * alike, because every StrataVerze charge is visible to owners.
 */
export function PlatformFeesView({ data }: { data: PlatformFeesData }) {
  const { subscription, uninvoiced, events, invoices, schedule, captureEnabled } = data;
  const price = subscription.price;
  const monthly = price.monthlyCents == null ? null : splitGst(price.monthlyCents, price.gstInclusive);
  const groups = groupFeeSchedule(schedule);

  let subscriptionValue = "Quote on request";
  if (subscription.promotional) subscriptionValue = "Free (promotion)";
  else if (monthly) subscriptionValue = `${formatAud(monthly.totalCents)} / month`;

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="font-heading font-semibold text-base text-ink mb-2">How StrataVerze charges</h2>
        <ul className="text-sm text-ink-muted space-y-1 list-disc pl-5">
          <li>Every charge is a flat amount from the schedule below. StrataVerze never charges a percentage.</li>
          <li>Each charge is shown, including GST, to the person taking the action before they confirm it.</li>
          <li>StrataVerze takes no commission from strata managers and earns no interest on scheme money.</li>
          <li>Moving money between the scheme&apos;s own funds is never charged.</li>
        </ul>
        {!captureEnabled && (
          <p className="mt-3 text-sm rounded-lg bg-[var(--color-pill-peach-soft)] text-ink px-3 py-2">
            Charging has not started yet. No StrataVerze fees are being recorded for this scheme.
          </p>
        )}
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label={`Subscription, ${TIER_LABELS[price.tier] ?? price.tier} (${subscription.lotCount} lots)`}
          value={subscriptionValue}
        />
        <StatCard label="Charges not yet invoiced" value={formatAud(uninvoiced.totalCents)} accent="bg-[#FFD18B]" />
        <StatCard label="StrataVerze invoices" value={invoices.length} accent="bg-[#B9F3E9]" />
      </div>
      {subscription.promotional && subscription.promotionEnd && (
        <p className="text-sm text-ink-muted -mt-3">
          The promotional period ends on {day(subscription.promotionEnd)}.
          {monthly && ` After that the subscription is ${formatAud(monthly.totalCents)} a month including GST.`}
        </p>
      )}

      <Card>
        <CardHeader
          title="Charges"
          description="Every StrataVerze charge for this scheme, newest first. Amounts include GST."
        />
        {events.length === 0 ? (
          <p className="text-sm text-ink-muted">No charges have been recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-ink-muted border-b border-line">
                  <th className="py-2 pr-4 font-medium">Date</th>
                  <th className="py-2 pr-4 font-medium">Charge</th>
                  <th className="py-2 pr-4 font-medium">From</th>
                  <th className="py-2 pr-4 font-medium">Payer</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {events.slice(0, 100).map((e) => {
                  const status = EVENT_STATUS[e.status] ?? { label: e.status, variant: "default" as ChipStatus };
                  return (
                    <tr key={e.id}>
                      <td className="py-2 pr-4 whitespace-nowrap">{day(e.occurredAt)}</td>
                      <td className="py-2 pr-4">{e.description}</td>
                      <td className="py-2 pr-4 text-ink-muted">{SOURCE_LABELS[e.sourceType] ?? e.sourceType}</td>
                      <td className="py-2 pr-4 text-ink-muted">
                        {e.recoverableFromOwner ? "Owners corporation, recoverable from owner" : PAYER_LABELS[e.payerType]?.replace(/^Charged to |^Paid by /, "") ?? e.payerType}
                      </td>
                      <td className="py-2 pr-4">
                        <StatusChip status={status.label} variant={status.variant} />
                      </td>
                      <td className="py-2 text-right tabular-nums whitespace-nowrap">{formatAud(e.totalCents)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          title="StrataVerze invoices"
          description="One invoice a month, billed in advance for the subscription and due on issue. Each is entered in the scheme's accounts as a supplier invoice. Select a number for the PDF."
        />
        {invoices.length === 0 ? (
          <p className="text-sm text-ink-muted">No invoices have been issued.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-ink-muted border-b border-line">
                  <th className="py-2 pr-4 font-medium">Invoice</th>
                  <th className="py-2 pr-4 font-medium">Period</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {invoices.map((i) => (
                  <tr key={i.id}>
                    <td className="py-2 pr-4">
                      <a
                        href={`/api/platform-invoices/${i.id}/pdf`}
                        target="_blank"
                        rel="noopener"
                        className="text-turquoise hover:underline"
                      >
                        {i.invoiceNumber}
                      </a>
                    </td>
                    <td className="py-2 pr-4">
                      {day(i.periodStart)} to {day(i.periodEnd)}
                    </td>
                    <td className="py-2 pr-4">
                      <StatusChip status={i.status.charAt(0) + i.status.slice(1).toLowerCase()} />
                    </td>
                    <td className="py-2 text-right tabular-nums">{formatAud(i.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <div id="fee-schedule" className="scroll-mt-24" />
        <CardHeader
          title="Fee schedule"
          description={`The prices in force on ${day(data.today)}. Prices exclude GST unless shown otherwise.`}
        />
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.group}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-2">{g.group}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-ink-muted border-b border-line">
                      <th className="py-2 pr-4 font-medium">Item</th>
                      <th className="py-2 pr-4 font-medium">Payer</th>
                      <th className="py-2 pr-4 font-medium text-right">Ex GST</th>
                      <th className="py-2 pr-4 font-medium text-right">GST</th>
                      <th className="py-2 font-medium text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {g.rows.map((r) => (
                      <tr key={`${r.code}-${r.variant ?? ""}-${r.bandMin ?? ""}`}>
                        <td className="py-2 pr-4">
                          {r.description}
                          <span className="text-ink-muted">, {r.unitLabel}</span>
                        </td>
                        <td className="py-2 pr-4 text-ink-muted">{r.payerLabel}</td>
                        <td className="py-2 pr-4 text-right tabular-nums whitespace-nowrap">
                          {r.exGstCents == null ? "Quote" : formatAud(r.exGstCents)}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums whitespace-nowrap">
                          {r.gstCents == null ? "" : formatAud(r.gstCents)}
                        </td>
                        <td className="py-2 text-right tabular-nums whitespace-nowrap">
                          {r.totalCents == null ? "" : formatAud(r.totalCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
          {price.tier === "ENTERPRISE" || groups.length === 0 ? null : (
            <p className="text-xs text-ink-muted">Schemes with more than 150 lots are quoted individually.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
