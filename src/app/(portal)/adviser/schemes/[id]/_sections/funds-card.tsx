import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { fundNameWords, fundTypeLabel, fundTypeWords, ledgerFundDefinition, type FundCatalogue } from "@/lib/jurisdiction/funds";

/**
 * Moved unchanged from the scheme main page so it can also back its section
 * page. `catalogue` is the building's FUND_CATALOGUE, which names its funds.
 */
export function FundsCard({
  id, funds, catalogue, className = "mb-6",
}: {
  id: string;
  funds: { id: string; name: string; fundType: string; balance: unknown }[];
  catalogue: FundCatalogue;
  className?: string;
}) {
  const admin = ledgerFundDefinition(catalogue, "ADMINISTRATIVE");
  const capital = ledgerFundDefinition(catalogue, "CAPITAL_WORKS");
  // The stored legacy types, named from the pack ("Administrative", "Capital Works");
  // every other type by the pack's label ("Administrative Fund").
  const legacyLabels: Record<string, string> = {
    ADMIN: fundTypeWords(admin),
    SINKING: fundTypeWords(capital),
    RESERVE: "Reserve",
  };
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
                    {fundTypeLabel(catalogue, fund.fundType, legacyLabels)}
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
          {`Set up ${fundNameWords(admin)} and ${fundNameWords(capital)} funds for this scheme.`}
        </p>
      )}
    </Card>
  );
}
