import { getBankAccountsForScheme } from "@/lib/queries/bank-accounts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

function maskAccountNumber(accountNumber: string): string {
  if (accountNumber.length <= 4) return accountNumber;
  return "••••" + accountNumber.slice(-4);
}

function formatBsb(bsb: string): string {
  if (bsb.length === 6) return `${bsb.slice(0, 3)}-${bsb.slice(3)}`;
  return bsb;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(amount);
}

function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

export default async function BankAccountsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const bankAccounts = await getBankAccountsForScheme(id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Bank Accounts</h2>
          <p className="text-sm text-muted-foreground">
            Manage bank accounts linked to this scheme.
          </p>
        </div>
        <Button variant="primary" href={`/adviser/schemes/${id}/finance/bank-accounts/new`}>
          Add Bank Account
        </Button>
      </div>

      {bankAccounts.length === 0 ? (
        <EmptyState
          icon="building-columns"
          title="No bank accounts"
          description="Add a bank account to start tracking finances for this scheme."
          actionLabel="Add Bank Account"
          actionHref={`/adviser/schemes/${id}/finance/bank-accounts/new`}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {bankAccounts.map((account) => (
            <Card key={account.id}>
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">
                      {account.accountName}
                    </p>
                    <p className="text-sm text-muted-foreground">{account.bankName}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {account.isOperating && (
                      <span className="bg-green-50 text-green-700 text-[10px] px-2 py-0.5 rounded-full font-medium">
                        Operating
                      </span>
                    )}
                    <span className="bg-zinc-100 text-zinc-600 text-[10px] px-2 py-0.5 rounded-full font-medium">
                      {account.accountType}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>
                    <span className="opacity-60">BSB</span>{" "}
                    {formatBsb(String(account.bsb))}
                  </span>
                  <span>
                    <span className="opacity-60">Acc</span>{" "}
                    {maskAccountNumber(String(account.accountNumber))}
                  </span>
                </div>

                <div className="flex items-center justify-between border-t border-border pt-2">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`inline-block h-1.5 w-1.5 rounded-full ${
                        account.bankFeedEnabled
                          ? "bg-green-500"
                          : "bg-zinc-300"
                      }`}
                    />
                    <span className="text-xs text-muted-foreground">
                      {account.bankFeedEnabled
                        ? "Bank feed active"
                        : "No bank feed"}
                    </span>
                  </div>

                  {account.lastReconciledDate && (
                    <p className="text-xs text-muted-foreground opacity-75">
                      Reconciled {formatDate(String(account.lastReconciledDate))}
                      {account.lastReconciledBalance != null && (
                        <> &middot; {formatCurrency(Number(account.lastReconciledBalance))}</>
                      )}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
