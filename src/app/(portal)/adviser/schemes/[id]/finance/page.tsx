import Link from "next/link";
import { getFundsForScheme } from "@/lib/queries/funds";
import { getBankAccountsForScheme } from "@/lib/queries/bank-accounts";
import { getAccountCodesForScheme } from "@/lib/queries/account-codes";
import { getLevySchedulesForScheme } from "@/lib/queries/levy-schedules";
import { getSupplierInvoicesForScheme } from "@/lib/queries/supplier-invoices";
import { getJournalEntriesForScheme } from "@/lib/queries/journal-entries";
import { getOverdueLevyNotices } from "@/lib/queries/levy-schedules";
import { getOverdueInvoices } from "@/lib/queries/supplier-invoices";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { connection } from "next/server";
import { FundsCard } from "../_sections/funds-card";
import { LeviesCard } from "../_sections/levies-card";

function formatCurrency(value: number | string | null): string {
  const num = Number(value ?? 0);
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(num);
}

export default async function FinanceDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;

  const [
    funds,
    bankAccounts,
    accountCodes,
    levySchedules,
    invoices,
    journalEntries,
    overdueLevies,
    overdueInvoices,
  ] = await Promise.all([
    getFundsForScheme(id),
    getBankAccountsForScheme(id),
    getAccountCodesForScheme(id),
    getLevySchedulesForScheme(id),
    getSupplierInvoicesForScheme(id),
    getJournalEntriesForScheme(id, undefined, 10),
    getOverdueLevyNotices(id, 100),
    getOverdueInvoices(id),
  ]);

  const adminFund = funds.find((f) => f.fundType === "ADMINISTRATIVE");
  const capitalFund = funds.find((f) => f.fundType === "CAPITAL_WORKS");
  const hasChartOfAccounts = accountCodes.length > 0;

  const totalOverdueLevyAmount = overdueLevies.reduce(
    (sum, n) => sum + Number(n.balanceOutstanding ?? 0),
    0,
  );

  const totalOverdueInvoiceAmount = overdueInvoices.reduce(
    (sum, inv) => sum + Number(inv.balanceOutstanding ?? 0),
    0,
  );

  const pendingInvoices = invoices.filter(
    (inv) => inv.status === "AWAITING_APPROVAL",
  );

  return (
    <div className="space-y-6">
      {/* Fund balances */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Admin Fund"
          value={formatCurrency(adminFund?.balance ?? 0)}
          accent="bg-blue-500"
        />
        <StatCard
          label="Capital Works Fund"
          value={formatCurrency(capitalFund?.balance ?? 0)}
          accent="bg-emerald-500"
        />
        <StatCard
          label="Overdue Levies"
          value={overdueLevies.length > 0 ? formatCurrency(totalOverdueLevyAmount) : "$0.00"}
          accent={overdueLevies.length > 0 ? "bg-amber-500" : "bg-zinc-300"}
        />
        <StatCard
          label="Overdue Invoices"
          value={overdueInvoices.length > 0 ? formatCurrency(totalOverdueInvoiceAmount) : "$0.00"}
          accent={overdueInvoices.length > 0 ? "bg-red-500" : "bg-zinc-300"}
        />
      </div>

      {/* Funds (moved here from the scheme main page so Financials covers them) */}
      <FundsCard id={id} funds={funds} className="" />

      {/* Levies (nested under Financials) */}
      <LeviesCard id={id} schedules={levySchedules} className="" />

      {/* Setup checklist — shown if chart of accounts is not yet seeded */}
      {!hasChartOfAccounts && (
        <Card>
          <CardHeader
            title="Get started"
            description="Complete these steps to set up financial management for this scheme."
          />
          <div className="space-y-3">
            <SetupStep
              number={1}
              label="Seed chart of accounts"
              description="Create the default NSW strata account codes"
              href={`/adviser/schemes/${id}/finance/accounts`}
              done={hasChartOfAccounts}
            />
            <SetupStep
              number={2}
              label="Link bank account"
              description="Add the scheme's operating bank account"
              href={`/adviser/schemes/${id}/finance/bank-accounts`}
              done={bankAccounts.length > 0}
            />
            <SetupStep
              number={3}
              label="Create levy schedule"
              description="Set up the first quarterly or annual levy schedule"
              href={`/adviser/schemes/${id}/finance/levies`}
              done={levySchedules.length > 0}
            />
          </div>
        </Card>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <QuickActionCard
          title="Chart of Accounts"
          description={`${accountCodes.length} active accounts`}
          href={`/adviser/schemes/${id}/finance/accounts`}
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16v16H4z" />
              <path d="M4 10h16M10 4v16" />
            </svg>
          }
        />
        <QuickActionCard
          title="Bank Accounts"
          description={`${bankAccounts.length} active account${bankAccounts.length !== 1 ? "s" : ""}`}
          href={`/adviser/schemes/${id}/finance/bank-accounts`}
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3" />
            </svg>
          }
        />
        <QuickActionCard
          title="Levy Schedules"
          description={`${levySchedules.length} schedule${levySchedules.length !== 1 ? "s" : ""}`}
          href={`/adviser/schemes/${id}/finance/levies`}
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          }
        />
        <QuickActionCard
          title="Supplier Invoices"
          description={`${invoices.length} invoice${invoices.length !== 1 ? "s" : ""}${pendingInvoices.length > 0 ? ` · ${pendingInvoices.length} pending` : ""}`}
          href={`/adviser/schemes/${id}/finance/invoices`}
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          }
        />
        <QuickActionCard
          title="Journal Entries"
          description={`${journalEntries.length} recent entries`}
          href={`/adviser/schemes/${id}/finance/journal`}
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          }
        />
        <QuickActionCard
          title="Budget Management"
          description="Set and track annual budgets"
          href={`/adviser/schemes/${id}/finance/budget`}
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          }
        />
        <QuickActionCard
          title="Interest"
          description={`${overdueLevies.length} overdue – charge interest`}
          href={`/adviser/schemes/${id}/finance/interest`}
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              <circle cx="19" cy="5" r="3" />
            </svg>
          }
        />
        <QuickActionCard
          title="Financial Reports"
          description="Trial balance, fund summary and more"
          href={`/adviser/schemes/${id}/finance/reports`}
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          }
        />
      </div>

      {/* Recent journal entries */}
      {journalEntries.length > 0 && (
        <Card>
          <CardHeader
            title="Recent Journal Entries"
            action={
              <Button variant="ghost" href={`/adviser/schemes/${id}/finance/journal`}>
                View all
              </Button>
            }
          />
          <div className="divide-y divide-line">
            {journalEntries.slice(0, 5).map((entry) => {
              const totalDebit = entry.lines.reduce(
                (sum, l) => sum + Number(l.debit ?? 0),
                0,
              );
              return (
                <div
                  key={entry.id}
                  className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink truncate">
                      {entry.entryNumber} — {entry.description}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {new Date(String(entry.transactionDate)).toLocaleDateString("en-AU")} · {entry.entryType}
                    </p>
                  </div>
                  <div className="ml-4 text-right shrink-0">
                    <p className="text-sm font-semibold text-ink">
                      {formatCurrency(totalDebit)}
                    </p>
                    <StatusBadge status={entry.status} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Overdue levies */}
      {overdueLevies.length > 0 && (
        <Card>
          <CardHeader
            title={`Overdue Levies (${overdueLevies.length})`}
            action={
              <Button variant="ghost" href={`/adviser/schemes/${id}/finance/levies`}>
                View all
              </Button>
            }
          />
          <div className="divide-y divide-line">
            {overdueLevies.slice(0, 5).map((notice) => (
              <div
                key={notice.id}
                className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink truncate">
                    {notice.noticeNumber} — Lot {notice.lot?.lotNumber ?? "—"}
                  </p>
                  <p className="text-xs text-ink-muted">
                    Due {new Date(String(notice.dueDate)).toLocaleDateString("en-AU")} · {notice.fund?.name ?? "—"}
                  </p>
                </div>
                <div className="ml-4 text-right shrink-0">
                  <p className="text-sm font-semibold text-red-600">
                    {formatCurrency(notice.balanceOutstanding)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

/* ── Helper components ────────────────────────────────────────── */

function SetupStep({
  number,
  label,
  description,
  href,
  done,
}: {
  number: number;
  label: string;
  description: string;
  href: string;
  done: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 rounded-[var(--radius-card)] px-3 py-3 hover:bg-muted/50 transition-colors"
    >
      <span
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
          done
            ? "bg-green-100 text-green-700"
            : "bg-muted text-ink-muted"
        }`}
      >
        {done ? "✓" : number}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${done ? "text-ink-muted line-through" : "text-ink"}`}>
          {label}
        </p>
        <p className="text-xs text-ink-muted">{description}</p>
      </div>
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        className="shrink-0 text-ink-muted"
      >
        <path
          d="M6 4L10 8L6 12"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Link>
  );
}

function QuickActionCard({
  title,
  description,
  href,
  icon,
}: {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group rounded-[var(--radius-card)] bg-white border border-line p-5 hover:border-mint hover:shadow-sm transition-all"
    >
      <div className="text-ink-muted group-hover:text-turquoise transition-colors mb-3">
        {icon}
      </div>
      <p className="text-sm font-semibold text-ink mb-0.5">{title}</p>
      <p className="text-xs text-ink-muted">{description}</p>
    </Link>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    DRAFT: "bg-zinc-100 text-zinc-600",
    POSTED: "bg-green-100 text-green-700",
    REVERSED: "bg-red-100 text-red-700",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
        styles[status] ?? "bg-zinc-100 text-zinc-600"
      }`}
    >
      {status}
    </span>
  );
}
