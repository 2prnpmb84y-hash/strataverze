import { notFound } from "next/navigation";
import Link from "next/link";
import { getSchemeById } from "@/lib/queries/schemes";
import { requireFinancialReadAccess } from "@/lib/auth/require-accountant-access";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

const reports = [
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
    key: "bank-reconciliation",
    title: "Bank Reconciliation Report",
    description:
      "Matched and unmatched transactions between bank statement and general ledger.",
    href: "/bank-reconciliation",
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
  {
    key: "audit-trail",
    title: "Audit Trail",
    description:
      "Chronological log of all financial actions including journal postings, levy changes, and bank reconciliation events.",
    href: "/audit-trail",
  },
  {
    key: "owner-statement",
    title: "Owner Statement",
    description:
      "Individual lot owner account statement showing levies raised, payments received, interest charged, and running balance.",
    href: "/owner-statement",
  },
  {
    key: "committee-pack",
    title: "Committee Reporting Pack",
    description:
      "Consolidated financial summary for committee meetings including fund balances, arrears, budget variance, and bank status.",
    href: "/committee-pack",
  },
];

export default async function AccountantReportsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireFinancialReadAccess(id);

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financial Reports"
        description={`Read-only financial reports for ${String(scheme.name)}.`}
        backHref="/accountant/schemes"
        backLabel="Schemes"
      />

      <div className="rounded-lg border border-blue-400/30 bg-blue-50/10 p-3">
        <p className="text-sm text-blue-600">
          You have read-only access to this scheme&apos;s financial data. Contact
          the strata manager to request changes.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {reports.map((report) => (
          <Link
            key={report.key}
            href={`/accountant/schemes/${id}/finance/reports${report.href}`}
            className="block group"
          >
            <Card className="h-full transition-colors group-hover:border-primary-400">
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
