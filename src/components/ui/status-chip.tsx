type ChipStatus = "default" | "success" | "warning" | "danger";

const statusStyles: Record<ChipStatus, string> = {
  default: "bg-[#F1F5F9] text-ink-muted",
  success: "bg-[#E6F7F3] text-[#1A7A63]",
  warning: "bg-[#FFF3E0] text-[#A16207]",
  danger: "bg-[#FDECEC] text-[#B33A3A]",
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
