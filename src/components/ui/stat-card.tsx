export function StatCard({
  label,
  value,
  accent = "bg-primary-400",
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <div className="rounded-[var(--radius-card)] bg-white border border-line p-5">
      <div className={`w-2.5 h-2.5 rounded-full ${accent} mb-3`} />
      <p className="text-xs text-ink-muted font-medium uppercase tracking-wide mb-1">
        {label}
      </p>
      <p className="text-2xl font-bold font-heading text-ink">
        {value}
      </p>
    </div>
  );
}
