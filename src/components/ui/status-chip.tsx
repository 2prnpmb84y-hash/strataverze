type ChipStatus = "default" | "success" | "warning" | "danger";

const statusStyles: Record<ChipStatus, string> = {
  default: "bg-[#F1F5F9] text-ink-muted",
  success: "bg-[#DCFCE7] text-[#166534]",
  warning: "bg-[#FEF3C7] text-[#92400E]",
  danger: "bg-[#FEE2E2] text-[#991B1B]",
};

/** Map common status strings to chip variants */
const statusMap: Record<string, ChipStatus> = {
  active: "success",
  approved: "success",
  completed: "success",
  paid: "success",
  reconciled: "success",
  open: "success",
  pending: "default",
  scheduled: "default",
  draft: "default",
  finished: "default",
  closed: "default",
  "in progress": "warning",
  "in-progress": "warning",
  review: "warning",
  due: "warning",
  overdue: "danger",
  rejected: "danger",
  cancelled: "danger",
  failed: "danger",
  expired: "danger",
};

export function StatusChip({
  status,
  variant,
  className = "",
}: {
  status: string;
  variant?: ChipStatus;
  className?: string;
}) {
  const resolved =
    variant ?? statusMap[status.toLowerCase()] ?? "default";

  return (
    <span
      className={`inline-flex items-center rounded-full h-[22px] px-2.5 text-[11px] font-medium whitespace-nowrap ${statusStyles[resolved]} ${className}`}
    >
      {status}
    </span>
  );
}
