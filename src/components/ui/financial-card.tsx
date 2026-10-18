import { Card, CardHeader } from "@/components/ui/card";

type StatRow = {
  label: string;
  value: string;
  colour?: string;
};

type ChartBar = {
  label: string;
  value: number;
  colour?: string;
};

/**
 * FinancialCard — a dashboard widget card with a title, optional badge,
 * a mini bar chart (or horizontal summary bars), and summary stats at the bottom.
 */
export function FinancialCard({
  title,
  badge,
  badgeColour = "bg-green-100 text-green-700",
  stats,
  chartBars,
  action,
}: {
  title: string;
  badge?: string;
  badgeColour?: string;
  stats?: StatRow[];
  chartBars?: ChartBar[];
  action?: React.ReactNode;
}) {
  const maxValue = chartBars
    ? Math.max(...chartBars.map((b) => b.value), 1)
    : 0;

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

      {/* Chart area — sits directly in the card, no grey inner panel */}
      {chartBars && chartBars.length > 0 ? (
        <div className="mb-4">
          <div className="flex flex-col">
            {/* Bar chart */}
            <div className="flex items-end gap-1.5 h-32">
              {chartBars.map((bar, i) => {
                const heightPct = maxValue > 0 ? (bar.value / maxValue) * 100 : 0;
                const barColour = bar.colour ?? "bg-turquoise";

                return (
                  <div
                    key={`${bar.label}-${i}`}
                    className="flex-1 flex flex-col items-center justify-end h-full"
                  >
                    <div
                      className={`w-full rounded-t ${barColour} min-h-[2px] transition-all`}
                      style={{ height: `${Math.max(heightPct, 2)}%` }}
                    />
                  </div>
                );
              })}
            </div>
            {/* Labels */}
            <div className="flex gap-1.5 mt-1.5">
              {chartBars.map((bar, i) => (
                <div
                  key={`label-${bar.label}-${i}`}
                  className="flex-1 text-center"
                >
                  <p className="text-[9px] text-ink-muted truncate leading-tight">
                    {bar.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        stats && stats.length > 0 && !chartBars && (
          <div className="mb-4">
            <HorizontalSummary stats={stats} />
          </div>
        )
      )}

      {/* Stats rows */}
      {stats && stats.length > 0 && (
        <div className="flex flex-col gap-2 px-1">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="flex items-center justify-between text-sm"
            >
              <span className="flex items-center gap-2 text-ink-muted">
                {stat.colour && (
                  <span
                    className={`w-2 h-2 rounded-full ${stat.colour}`}
                  />
                )}
                {stat.label}
              </span>
              <span className="font-semibold text-ink">
                {stat.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/**
 * When no explicit chartBars are passed, render horizontal proportion bars
 * derived from the stats values (parsing dollar amounts).
 */
function HorizontalSummary({ stats }: { stats?: StatRow[] }) {
  if (!stats || stats.length === 0) {
    return (
      <div className="text-center flex flex-col items-center justify-center h-full">
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          className="mx-auto text-ink-muted/30 mb-1.5"
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
        <p className="text-[11px] text-ink-muted/50">No data yet</p>
      </div>
    );
  }

  // Parse numeric values from stat value strings (e.g. "$1,234.00" -> 1234)
  const parsed = stats.map((s) => {
    const num = parseFloat(s.value.replace(/[^0-9.-]/g, ""));
    return isNaN(num) ? 0 : Math.abs(num);
  });
  const maxVal = Math.max(...parsed, 1);

  return (
    <div className="w-full h-full flex flex-col justify-center gap-2.5 px-1">
      {stats.map((stat, i) => {
        const widthPct = maxVal > 0 ? (parsed[i] / maxVal) * 100 : 0;
        const barColour = stat.colour ?? "bg-primary-400";

        return (
          <div key={stat.label} className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-ink-muted">
                {stat.label}
              </span>
              <span className="text-[10px] font-semibold text-ink">
                {stat.value}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${barColour} transition-all`}
                style={{ width: `${Math.max(widthPct, 2)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
