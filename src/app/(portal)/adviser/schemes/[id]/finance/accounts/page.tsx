import Link from "next/link";
import { getAccountCodesForScheme } from "@/lib/queries/account-codes";
import { getFundsForScheme } from "@/lib/queries/funds";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { seedChartOfAccountsAction } from "../actions";
import { connection } from "next/server";

async function handleSeedAction(formData: FormData) {
  "use server";
  const schemeId = formData.get("schemeId") as string;
  await seedChartOfAccountsAction(schemeId);
}

const ACCOUNT_TYPE_ORDER = [
  "ASSET",
  "LIABILITY",
  "EQUITY",
  "INCOME",
  "EXPENSE",
] as const;

const ACCOUNT_TYPE_COLORS: Record<string, string> = {
  ASSET: "border-emerald-500",
  LIABILITY: "border-rose-500",
  EQUITY: "border-violet-500",
  INCOME: "border-sky-500",
  EXPENSE: "border-amber-500",
};

const ACCOUNT_TYPE_BG: Record<string, string> = {
  ASSET: "bg-emerald-50 text-emerald-700",
  LIABILITY: "bg-rose-50 text-rose-700",
  EQUITY: "bg-violet-50 text-violet-700",
  INCOME: "bg-sky-50 text-sky-700",
  EXPENSE: "bg-amber-50 text-amber-700",
};

export default async function ChartOfAccountsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;

  const [accounts, funds] = await Promise.all([
    getAccountCodesForScheme(id),
    getFundsForScheme(id),
  ]);

  if (!accounts || accounts.length === 0) {
    return (
      <div className="space-y-6">
        <div className="rounded-[var(--radius-card)] bg-white border border-line border-dashed p-12 text-center">
          <h3 className="font-heading font-semibold text-ink mb-1">
            No Chart of Accounts
          </h3>
          <p className="text-sm text-ink-muted max-w-sm mx-auto mb-6">
            This scheme does not have any account codes yet. Seed the default chart of accounts to get started.
          </p>
          <form action={handleSeedAction}>
            <input type="hidden" name="schemeId" value={id} />
            <Button type="submit" variant="primary">
              Seed Default Accounts
            </Button>
          </form>
        </div>
      </div>
    );
  }

  const grouped = ACCOUNT_TYPE_ORDER.reduce(
    (acc, type) => {
      acc[type] = accounts.filter(
        (a: { accountType: string }) => a.accountType === type
      );
      return acc;
    },
    {} as Record<string, typeof accounts>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">
            Chart of Accounts
          </h2>
          <p className="text-sm text-ink-muted">
            {accounts.length} accounts across {funds.length} fund
            {funds.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <form action={handleSeedAction}>
            <input type="hidden" name="schemeId" value={id} />
            <Button type="submit" variant="secondary">
              Re-seed Defaults
            </Button>
          </form>
          <Button href={`/adviser/schemes/${id}/finance/accounts/new`}>
            + New Account
          </Button>
        </div>
      </div>

      {ACCOUNT_TYPE_ORDER.map((type) => {
        const typeAccounts = grouped[type];
        if (!typeAccounts || typeAccounts.length === 0) return null;

        return (
          <Card key={type}>
            <div
              className={`border-l-4 ${ACCOUNT_TYPE_COLORS[type]} rounded-[var(--radius-card)]`}
            >
              <div className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-ink">
                    {type}
                  </h3>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${ACCOUNT_TYPE_BG[type]}`}
                  >
                    {typeAccounts.length}
                  </span>
                </div>

                {/* Table header */}
                <div className="grid grid-cols-[80px_1fr_120px_140px_50px] gap-4 text-xs font-medium text-ink-muted uppercase tracking-wide pb-2 border-b border-line">
                  <div>Code</div>
                  <div>Name</div>
                  <div>Fund</div>
                  <div>Sub-type</div>
                  <div className="text-center">GST</div>
                </div>

                {/* Table rows */}
                <div className="divide-y divide-line">
                  {typeAccounts.map(
                    (account: {
                      id: string;
                      code: string;
                      name: string;
                      accountSubType: string | null;
                      isSystemAccount: boolean;
                      isActive: boolean;
                      gstApplicable: boolean;
                      fund: { name: string } | null;
                    }) => (
                      <Link
                        key={account.id}
                        href={`/adviser/schemes/${id}/finance/accounts/${account.id}`}
                        className={`grid grid-cols-[80px_1fr_120px_140px_50px] gap-4 py-3 items-center text-sm hover:bg-muted/50 -mx-2 px-2 rounded-[var(--radius-card)] transition-colors ${
                          !account.isActive ? "opacity-50" : ""
                        }`}
                      >
                        <div className="font-mono text-xs font-medium text-ink">
                          {account.code}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-ink">{account.name}</span>
                          {account.isSystemAccount && (
                            <span className="bg-blue-50 text-blue-600 text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                              System
                            </span>
                          )}
                          {!account.isActive && (
                            <span className="bg-gray-100 text-gray-500 text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                              Inactive
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-ink-muted truncate">
                          {account.fund?.name ?? "—"}
                        </div>
                        <div className="text-xs text-ink-muted">
                          {account.accountSubType
                            ? account.accountSubType
                                .replace(/_/g, " ")
                                .toLowerCase()
                                .replace(/\b\w/g, (c: string) => c.toUpperCase())
                            : "—"}
                        </div>
                        <div className="flex justify-center">
                          <span
                            className={`inline-block w-2 h-2 rounded-full ${
                              account.gstApplicable
                                ? "bg-green-500"
                                : "bg-gray-300"
                            }`}
                            title={
                              account.gstApplicable
                                ? "GST applicable"
                                : "No GST"
                            }
                          />
                        </div>
                      </Link>
                    )
                  )}
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
