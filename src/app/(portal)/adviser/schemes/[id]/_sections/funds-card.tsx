import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";

/** Moved unchanged from the scheme main page so it can also back its section page. */
export function FundsCard({
  id, funds, className = "mb-6",
}: {
  id: string;
  funds: { id: string; name: string; fundType: string; balance: unknown }[];
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader
        title="Funds"
        description={
          funds.length === 0
            ? "No funds set up yet."
            : `${funds.length} fund${funds.length === 1 ? "" : "s"} configured.`
        }
        action={
          <Button href={`/adviser/schemes/${id}/funds/new`} variant="secondary">
            Manage Funds
          </Button>
        }
      />
      {funds.length > 0 ? (
        <div className="flex flex-col gap-2">
          {funds.map((fund) => {
            const balance = Number(fund.balance);
            const fundTypeLabel: Record<string, string> = {
              ADMIN: "Administrative",
              SINKING: "Capital Works",
              RESERVE: "Reserve",
            };

            return (
              <Link
                key={fund.id}
                href={`/adviser/schemes/${id}/funds/${fund.id}`}
                className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted px-4 py-3 hover:bg-muted/70 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-ink">
                    {fund.name}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {fundTypeLabel[fund.fundType] ?? fund.fundType}
                  </p>
                </div>
                <span className="text-sm font-medium text-ink font-variant-numeric tabular-nums">
                  {balance.toLocaleString("en-AU", {
                    style: "currency",
                    currency: "AUD",
                  })}
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">
          Set up administrative and capital works funds for this scheme.
        </p>
      )}
    </Card>
  );
}
