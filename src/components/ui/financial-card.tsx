import { Card, CardHeader } from "@/components/ui/card";

type StatRow = {
  label: string;
  value: string;
  colour?: string;
};

/**
 * FinancialCard — a dashboard widget card with a title, optional badge,
 * a placeholder chart area, and summary stats at the bottom.
 */
export function FinancialCard({
  title,
  badge,
  badgeColour = "bg-green-100 text-green-700",
  stats,
  chartPlaceholderLabel = "Chart coming soon",
  action,
}: {
  title: string;
  badge?: string;
  badgeColour?: string;
  stats?: StatRow[];
  chartPlaceholderLabel?: string;
  action?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            {title}
            {badge && (
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${badgeColour}`}
              >
                {badge}
              </span>
            )}
          </span>
        }
        action={action}
      />

      {/* Chart placeholder */}
      <div className="mx-1 mb-4 rounded-lg bg-muted/60 border border-border/50 h-36 flex items-center justify-center">
        <div className="text-center">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            className="mx-auto text-muted-foreground/30 mb-1.5"
          >
            <path
              d="M3 3v18h18"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M7 16l4-4 4 2 5-6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <p className="text-[11px] text-muted-foreground/50">
            {chartPlaceholderLabel}
          </p>
        </div>
      </div>

      {/* Stats rows */}
      {stats && stats.length > 0 && (
        <div className="flex flex-col gap-2 px-1">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="flex items-center justify-between text-sm"
            >
              <span className="flex items-center gap-2 text-muted-foreground">
                {stat.colour && (
                  <span
                    className={`w-2 h-2 rounded-full ${stat.colour}`}
                  />
                )}
                {stat.label}
              </span>
              <span className="font-semibold text-foreground">
                {stat.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
