import { connection } from "next/server";
import { db } from "@/prisma/db";
import { requirePlatformAdminPage } from "@/lib/auth/require-access";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { loadPriceBook } from "@/lib/billing/capture";
import { formatAud, toCents } from "@/lib/billing/money";
import { revenueSummary } from "@/lib/billing/revenue";

const TIER_LABELS: Record<string, string> = { SMALL: "Small", MEDIUM: "Medium", LARGE: "Large", ENTERPRISE: "Enterprise" };
const isoDay = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "").slice(0, 10));
const isoTime = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? ""));
const day = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "No end date";

/** StrataVerze staff: revenue at a glance. Checked here as well as in the admin layout (finding F5). */
export default async function RevenuePage() {
  await connection();
  await requirePlatformAdminPage();
  const now = new Date();
  const [subscriptions, schemes, lots, priceBook, feeEvents, invoices] = await Promise.all([
    db.orm.public.SchemeSubscription.limit(10000).all(),
    db.orm.public.Scheme.limit(10000).all(),
    db.orm.public.Lot.limit(200000).all(),
    loadPriceBook(),
    db.orm.public.PlatformFeeEvent.orderBy((e) => e.occurredAt.desc()).limit(50000).all(),
    db.orm.public.PlatformInvoice.limit(50000).all(),
  ]);
  const schemeName = new Map(schemes.map((s) => [s.id, s.name]));
  const lotCount = new Map<string, number>();
  for (const l of lots) lotCount.set(l.schemeId, (lotCount.get(l.schemeId) ?? 0) + 1);

  const summary = revenueSummary({
    subscriptions: subscriptions.map((s) => ({
      schemeId: s.schemeId,
      schemeName: schemeName.get(s.schemeId) ?? s.schemeId,
      status: s.status,
      promotionEnd: s.promotionEnd ? isoDay(s.promotionEnd) : null,
      quotedMonthlyCents: s.monthlyPrice == null ? null : toCents(String(s.monthlyPrice)),
      lotCount: lotCount.get(s.schemeId) ?? 0,
    })),
    priceBook,
    feeEvents: feeEvents.map((e) => ({
      code: e.code,
      status: e.status,
      occurredAt: isoTime(e.occurredAt),
      exGstCents: toCents(String(e.amountExGst)),
    })),
    invoices: invoices.map((i) => ({ status: i.status, totalCents: toCents(String(i.total)) })),
    now,
  });

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader title="Revenue" description="StrataVerze revenue across all schemes and contractors. Amounts exclude GST unless shown." />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Monthly recurring revenue (ex GST)" value={formatAud(summary.mrrCents)} />
        <StatCard label="Invoices outstanding (incl. GST)" value={`${formatAud(summary.outstanding.totalCents)} (${summary.outstanding.count})`} accent="bg-[#FFD18B]" />
        <StatCard label="Schemes in promotion" value={summary.promotional.length} accent="bg-[#B9F3E9]" />
      </div>

      <Card>
        <CardHeader title="Subscriptions by tier" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink-muted border-b border-line">
                <th className="py-2 pr-4 font-medium">Tier</th>
                <th className="py-2 pr-4 font-medium text-right">Paying</th>
                <th className="py-2 pr-4 font-medium text-right">Promotional</th>
                <th className="py-2 pr-4 font-medium text-right">Needs a quote</th>
                <th className="py-2 font-medium text-right">MRR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {summary.tiers.map((t) => (
                <tr key={t.tier}>
                  <td className="py-2 pr-4">{TIER_LABELS[t.tier]}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{t.payingSchemes}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{t.promotionalSchemes}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{t.needsQuote}</td>
                  <td className="py-2 text-right tabular-nums">{formatAud(t.mrrCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader title="Fee events by code" description="Schemes and contractors. Net of reversals, waived charges excluded." />
        {summary.feesByCode.length === 0 ? (
          <p className="text-sm text-ink-muted">No fee events in the last 12 months.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-ink-muted border-b border-line">
                  <th className="py-2 pr-4 font-medium">Code</th>
                  <th className="py-2 pr-4 font-medium text-right">This month</th>
                  <th className="py-2 pr-4 font-medium text-right">Last 12 months</th>
                  <th className="py-2 font-medium text-right">Count</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {summary.feesByCode.map((f) => (
                  <tr key={f.code}>
                    <td className="py-2 pr-4 font-mono text-xs">{f.code}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{formatAud(f.thisMonthCents)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{formatAud(f.last12MonthsCents)}</td>
                    <td className="py-2 text-right tabular-nums">{f.count12}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Schemes in their promotional period" />
        {summary.promotional.length === 0 ? (
          <p className="text-sm text-ink-muted">None.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {summary.promotional.map((p) => (
              <li key={p.schemeId} className="py-2 flex justify-between gap-4">
                <span>
                  {p.schemeName} <span className="text-ink-muted">({TIER_LABELS[p.tier]})</span>
                </span>
                <span className="text-ink-muted whitespace-nowrap">Ends {day(p.promotionEnd)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
