import { notFound } from "next/navigation";
import Link from "next/link";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { Card, CardHeader } from "@/components/ui/card";

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
];

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Financial Reports
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
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
