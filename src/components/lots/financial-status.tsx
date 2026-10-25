/** Financial or Unfinancial (overdue and unpaid), as a chip. Safe in server and client components. */
export function FinancialStatusChip({ financial, overdueCents, oldestOverdue }: { financial: boolean; overdueCents: number; oldestOverdue: string | null }) {
  if (financial) {
    return <span className="inline-flex items-center rounded-full bg-[#E6F7F3] px-2.5 py-0.5 text-xs font-medium text-[#1A7A63]">Financial</span>;
  }
  const amount = (overdueCents / 100).toLocaleString("en-AU", { style: "currency", currency: "AUD" });
  const since = oldestOverdue ? `${oldestOverdue.slice(8, 10)}/${oldestOverdue.slice(5, 7)}/${oldestOverdue.slice(0, 4)}` : null;
  return (
    <span
      title={`${amount} overdue${since ? `, the oldest due on ${since}` : ""}`}
      className="inline-flex items-center whitespace-nowrap rounded-full bg-[#FDECEC] px-2.5 py-0.5 text-xs font-medium text-[#B33A3A]"
    >
      Unfinancial · {amount}
    </span>
  );
}
