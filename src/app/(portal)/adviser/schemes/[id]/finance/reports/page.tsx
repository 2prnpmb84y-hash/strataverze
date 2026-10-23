import { notFound } from "next/navigation";
import Link from "next/link";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { Card, CardHeader } from "@/components/ui/card";
import { connection } from "next/server";

const reports = [
  {
    key: "platform-charges",
    title: "Platform Charges",
    description:
      "StrataVerze charges by fee type and month, StrataVerze invoices and their status, and the scheme's cost per lot per year.",
    href: "/platform-charges",
  },
  {
    key: "levy-register",
    title: "Levy Register",
    description:
      "All levy notices by lot with payment status, grouped by fund and period.",
    href: "/levy-register",
  },
  {
    key: "income-expenditure",
    title: "Income & Expenditure Statement",
    description:
      "Profit and loss showing income versus expenses for each fund over a selected period.",
    href: "/income-expenditure",
  },
  {
    key: "aged-arrears",
    title: "Aged Arrears",
    description:
      "Outstanding levy balances grouped by age bracket (current, 30, 60, 90, 90+ days).",
    href: "/aged-arrears",
  },
  {
    key: "owner-statement",
    title: "Owner Statement",
    description:
      "Individual owner's levy history, payments received, and running balance.",
    href: "/owner-statement",
  },
  {
    key: "bank-reconciliation",
    title: "Bank Reconciliation Report",
    description:
      "Matched and unmatched transactions between bank statement and general ledger.",
    href: "/bank-reconciliation",
  },
  {
    key: "three-way-reconciliation",
    title: "Three-way Reconciliation",
    description: "Ledger bank balance by fund, payment provider wallet and bank statement, with unmatched, pending and suspense items listed.",
    href: "/three-way-reconciliation",
  },
  {
    key: "trial-balance",
    title: "Trial Balance",
    description:
      "Debit and credit balances for all accounts as at a selected date, verifying the ledger is in balance.",
    href: "/trial-balance",
  },
  {
    key: "fund-summary",
    title: "Fund Summary",
    description:
      "Opening and closing balances, income, expenses, and levy collection status for each fund.",
    href: "/fund-summary",
  },
  {
    key: "audit-trail",
    title: "Audit Trail",
    description:
      "Comprehensive log of all financial actions with filtering by date, user, and entity type. Export to CSV.",
    href: "/audit-trail",
  },
  {
    key: "committee-pack",
    title: "Committee Reporting Pack",
    description:
      "Consolidated financial summary for committee meetings: fund balances, arrears, budget vs actual, bank status, and recent activity.",
    href: "/committee-pack",
  },
  {
    key: "cash-flow",
    title: "Cash Flow Forecast",
    description:
      "Projected cash inflows and outflows over the coming months based on levy notices, supplier invoices, and budget estimates.",
    href: "/cash-flow",
  },
  {
    key: "fund-projections",
    title: "Fund Balance Projections",
    description:
      "Multi-year fund balance trajectory based on current levy schedules and budget. Helps plan capital works funding.",
    href: "/fund-projections",
  },
  {
    key: "gst-summary",
    title: "GST Summary (BAS-Ready)",
    description:
      "Quarterly GST summary aligned to ATO BAS labels. Shows GST on sales, GST on purchases, and net GST payable.",
    href: "/gst-summary",
  },
];

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          Financial Reports
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Generate and view financial reports for {String(scheme.name)}.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {reports.map((report) => (
          <Link
            key={report.key}
            href={`/adviser/schemes/${id}/finance/reports${report.href}`}
            className="block group"
          >
            <Card className="h-full transition-colors group-hover:border-turquoise">
              <CardHeader
                title={report.title}
                description={report.description}
              />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
