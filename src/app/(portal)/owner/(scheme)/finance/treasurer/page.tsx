import Link from "next/link";
import { connection } from "next/server";
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import { getSelectedSchemeId } from "@/lib/actions/scheme-selection";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getTreasurerMonth } from "@/lib/finance/treasurer-home-data";
import { formatAud } from "@/lib/billing/money";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";

const day = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
const PERIOD_STYLE: Record<string, string> = {
  OPEN: "bg-green-100 text-green-700",
  CLOSED: "bg-zinc-100 text-zinc-700",
  LOCKED: "bg-zinc-200 text-zinc-800",
};

function Section({ title, description, href, linkLabel, children }: { title: string; description: string; href?: string; linkLabel?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader
        title={title}
        description={description}
        action={
          href ? (
            <Link href={href} className="text-sm text-turquoise underline">
              {linkLabel}
            </Link>
          ) : undefined
        }
      />
      {children}
    </Card>
  );
}

function Rows({ rows, empty }: { rows: Array<{ key: string; left: string; sub?: string; right: string }>; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-ink-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line">
      {rows.map((r) => (
        <li key={r.key} className="flex items-start justify-between gap-4 py-2 text-sm">
          <div className="min-w-0">
            <p className="text-ink break-words">{r.left}</p>
            {r.sub && <p className="text-xs text-ink-muted">{r.sub}</p>}
          </div>
          <span className="shrink-0 tabular-nums text-ink">{r.right}</span>
        </li>
      ))}
    </ul>
  );
}

/** The treasurer's "this month" view: what needs doing across the scheme's finances. */
export default async function TreasurerHomePage() {
  await connection();
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const schemeId = await getSelectedSchemeId();
  const header = (
    <PageHeader
      title="Treasurer"
      description="This month at a glance: what is unmatched, waiting, overdue or held in suspense."
      backHref="/owner/finance"
      backLabel="Finance"
    />
  );
  const isTreasurer = schemeId
    ? (
        await db.orm.public.SchemeMembership
          .where((m) => and(m.schemeId.eq(schemeId), m.profileId.eq(profile.id), m.isActive.eq(true), m.role.eq("COMMITTEE")))
          .limit(5)
          .all()
      ).some((m) => m.isTreasurer)
    : false;
  if (!schemeId || !isTreasurer) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState title="Not available" description="This page is for the treasurer of the selected scheme." />
      </div>
    );
  }

  const m = await getTreasurerMonth(schemeId);
  const more = (shown: number, count: number) => (count > shown ? ` Showing the first ${shown} of ${count}.` : "");

  return (
    <div className="space-y-6">
      {header}

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold text-ink">{m.month.label}</h2>
        <p className="text-sm text-ink-muted">
          {m.attention === 0 ? "Nothing needs your attention." : `${m.attention} area${m.attention === 1 ? " needs" : "s need"} attention.`}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Unmatched" value={m.unmatched.count} accent={m.unmatched.count ? "bg-amber-500" : "bg-green-500"} />
        <StatCard label="Awaiting approval" value={m.approvals.count} accent={m.approvals.count ? "bg-amber-500" : "bg-green-500"} />
        <StatCard label="Overdue levies" value={formatAud(m.overdue.totalCents)} accent={m.overdue.count ? "bg-red-500" : "bg-green-500"} />
        <StatCard label="In suspense" value={formatAud(m.suspense.netCents)} accent={m.suspense.count ? "bg-amber-500" : "bg-green-500"} />
        <StatCard
          label="This period"
          value={m.periods.current ? m.periods.current.status.charAt(0) + m.periods.current.status.slice(1).toLowerCase() : "Not set up"}
          accent={m.periods.endedOpen.length ? "bg-amber-500" : "bg-green-500"}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section
          title="Unmatched bank transactions"
          description={
            m.unmatched.count
              ? `${m.unmatched.count} not matched to the ledger (${m.unmatched.thisMonth} this month): ${formatAud(m.unmatched.receiptsCents)} in, ${formatAud(m.unmatched.paymentsCents)} out.${m.unmatched.oldestDate ? ` Oldest ${day(m.unmatched.oldestDate)}.` : ""}${more(m.unmatched.items.length, m.unmatched.count)}`
              : "Every imported transaction is matched."
          }
          href="/owner/finance/reconciliation"
          linkLabel="Reconciliation"
        >
          <Rows
            empty="Nothing to match."
            rows={m.unmatched.items.map((t) => ({ key: t.id, left: t.description, sub: day(t.date), right: formatAud(t.amountCents) }))}
          />
        </Section>

        <Section
          title="Waiting for approval"
          description={
            m.approvals.count
              ? `${m.approvals.count} payment${m.approvals.count === 1 ? "" : "s"} totalling ${formatAud(m.approvals.totalCents)}${m.approvals.overdueCount ? `, ${m.approvals.overdueCount} past their due date` : ""}.${more(m.approvals.items.length, m.approvals.count)}`
              : "No invoices or refunds are waiting."
          }
          href="/owner/finance/approvals"
          linkLabel="Payment approvals"
        >
          <Rows
            empty="Nothing waiting."
            rows={m.approvals.items.map((a) => ({ key: a.id, left: a.label, sub: a.dueDate ? `Due ${day(a.dueDate)}` : undefined, right: formatAud(a.amountCents) }))}
          />
        </Section>

        <Section
          title="Overdue levies"
          description={
            m.overdue.count
              ? `${m.overdue.count} notice${m.overdue.count === 1 ? "" : "s"} across ${m.overdue.lots} lot${m.overdue.lots === 1 ? "" : "s"}, longest overdue first.${more(m.overdue.items.length, m.overdue.count)}`
              : "No levies are overdue."
          }
        >
          <Rows
            empty="Every issued levy is paid or not yet due."
            rows={m.overdue.items.map((n) => ({
              key: n.id,
              left: `Lot ${n.lotNumber}, notice ${n.noticeNumber}`,
              sub: `Due ${day(n.dueDate)}, ${n.daysOverdue} day${n.daysOverdue === 1 ? "" : "s"} overdue`,
              right: formatAud(n.balanceCents),
            }))}
          />
        </Section>

        <Section
          title="Held in suspense"
          description={
            m.suspense.count
              ? `${m.suspense.count} bank transaction${m.suspense.count === 1 ? "" : "s"} the strata manager could not identify yet. A period cannot close while one from that period is open.`
              : "Nothing is held in suspense."
          }
          href="/owner/finance/reconciliation"
          linkLabel="Reconciliation"
        >
          <Rows
            empty="Nothing in suspense."
            rows={m.suspense.items.map((s) => ({ key: s.id, left: s.description, sub: day(s.transactionDate), right: formatAud(s.amountCents) }))}
          />
        </Section>
      </div>

      <Section
        title="Financial periods"
        description={
          m.periods.current
            ? `${m.periods.current.name} is ${m.periods.current.status.toLowerCase()}.`
            : "No financial period covers today. The strata manager sets up periods."
        }
      >
        {m.periods.endedOpen.length === 0 ? (
          <p className="text-sm text-ink-muted">Every period that has ended is closed.</p>
        ) : (
          <ul className="divide-y divide-line">
            {m.periods.endedOpen.map((p) => (
              <li key={p.name} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="text-ink">
                  {p.name} ended {day(p.endDate)} and is still open
                  {p.suspenseBlocking ? `. ${p.suspenseBlocking} suspense item${p.suspenseBlocking === 1 ? "" : "s"} must be cleared before it can close.` : "."}
                </span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${PERIOD_STYLE.OPEN}`}>Open</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
