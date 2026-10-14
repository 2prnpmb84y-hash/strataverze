import { requireCommitteeAccess } from "@/lib/queries/committee-access";
import { getLeviesForSchemes } from "@/lib/queries/levies";
import { getFundsForSchemes } from "@/lib/queries/funds";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";

const statusStyle: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  ISSUED: "bg-blue-100 text-blue-700",
  PAID: "bg-green-100 text-green-700",
  OVERDUE: "bg-red-100 text-red-700",
};

export default async function OwnerFinancePage() {
  const access = await requireCommitteeAccess();
  if (!access) {
    return (
      <div className="max-w-2xl">
        <PageHeader title="Finance" description="You do not have committee access to view this page." />
      </div>
    );
  }

  const { schemes, schemeIds } = access;
  const [levies, funds] = await Promise.all([
    schemeIds.length > 0 ? getLeviesForSchemes(schemeIds) : [],
    schemeIds.length > 0 ? getFundsForSchemes(schemeIds) : [],
  ]);

  const schemeNames = new Map(schemes.map((s) => [s.id, s.name]));

  const totalLevied = levies.reduce(
    (sum, l) => sum + Number(l.totalAmount),
    0,
  );
  const totalCollected = levies.reduce(
    (sum, l) =>
      sum + l.items.reduce((s, item) => s + Number(item.paidAmount), 0),
    0,
  );
  const outstanding = totalLevied - totalCollected;

  const issuedLevies = levies.filter((l) => l.status === "ISSUED" || l.status === "OVERDUE");
  const completedLevies = levies.filter((l) => l.status === "PAID");
  const draftLevies = levies.filter((l) => l.status === "DRAFT");

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Finance"
        description="Levy collections and fund balances for your schemes."
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        <StatCard
          label="Total Levied"
          value={`$${totalLevied.toLocaleString("en-AU", { minimumFractionDigits: 2 })}`}
          accent="bg-owner"
        />
        <StatCard
          label="Collected"
          value={`$${totalCollected.toLocaleString("en-AU", { minimumFractionDigits: 2 })}`}
          accent="bg-green-500"
        />
        <StatCard
          label="Outstanding"
          value={`$${outstanding.toLocaleString("en-AU", { minimumFractionDigits: 2 })}`}
          accent="bg-red-500"
        />
      </div>

      {/* Fund Balances */}
      {funds.length > 0 && (
        <Card className="mb-6">
          <CardHeader
            title="Fund Balances"
            description="Current balances across your scheme funds."
          />
          <div className="flex flex-col gap-2">
            {funds.map((fund) => {
              const balance = Number(fund.balance);
              return (
                <div
                  key={fund.id}
                  className="flex items-center justify-between rounded-lg bg-muted px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {fund.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {schemeNames.get(fund.schemeId) ?? ""}
                      {" · "}
                      {fund.fundType.replace("_", " ")}
                    </p>
                  </div>
                  <span className={`text-sm font-semibold ${balance >= 0 ? "text-green-700" : "text-red-700"}`}>
                    ${balance.toLocaleString("en-AU", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {levies.length === 0 ? (
        <Card>
          <div className="p-6 text-center">
            <p className="text-sm text-muted-foreground">
              No levies have been created for your schemes yet. Your strata
              manager will create levy notices when contributions are due.
            </p>
          </div>
        </Card>
      ) : (
        <>
          {/* Active levies */}
          {issuedLevies.length > 0 && (
            <Card className="mb-6">
              <CardHeader
                title="Active Levies"
                description={`${issuedLevies.length} lev${issuedLevies.length === 1 ? "y" : "ies"} currently issued.`}
              />
              <div className="flex flex-col gap-2">
                {issuedLevies.map((levy) => {
                  const total = Number(levy.totalAmount);
                  const paid = levy.items.reduce(
                    (sum, item) => sum + Number(item.paidAmount),
                    0,
                  );
                  const dueDate = new Date(String(levy.dueDate));

                  return (
                    <div
                      key={levy.id}
                      className="rounded-lg bg-muted px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3 mb-1">
                        <p className="text-sm font-medium text-foreground">
                          {levy.title}
                        </p>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle[levy.status]}`}
                        >
                          {levy.status}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {schemeNames.get(levy.schemeId) ?? ""}
                        {" · Due "}
                        {dueDate.toLocaleDateString("en-AU", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                        {" · "}
                        ${total.toLocaleString("en-AU", { minimumFractionDigits: 2 })}
                      </p>
                      {paid > 0 && (
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                            <span>{Math.round((paid / total) * 100)}% collected</span>
                            <span>
                              ${paid.toLocaleString("en-AU", { minimumFractionDigits: 2 })} of $
                              {total.toLocaleString("en-AU", { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-border overflow-hidden">
                            <div
                              className="h-full rounded-full bg-green-500"
                              style={{ width: `${Math.min(100, (paid / total) * 100)}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Draft levies */}
          {draftLevies.length > 0 && (
            <Card className="mb-6">
              <CardHeader
                title="Draft Levies"
                description={`${draftLevies.length} lev${draftLevies.length === 1 ? "y" : "ies"} not yet issued.`}
              />
              <div className="flex flex-col gap-2">
                {draftLevies.map((levy) => (
                  <div
                    key={levy.id}
                    className="flex items-center justify-between rounded-lg bg-muted px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {levy.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {schemeNames.get(levy.schemeId) ?? ""}
                        {" · "}
                        ${Number(levy.totalAmount).toLocaleString("en-AU", { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                      Draft
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Completed levies */}
          {completedLevies.length > 0 && (
            <Card>
              <CardHeader
                title="Fully Paid"
                description={`${completedLevies.length} lev${completedLevies.length === 1 ? "y" : "ies"} fully collected.`}
              />
              <div className="flex flex-col gap-2">
                {completedLevies.map((levy) => (
                  <div
                    key={levy.id}
                    className="flex items-center justify-between rounded-lg bg-muted px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {levy.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {schemeNames.get(levy.schemeId) ?? ""}
                        {" · "}
                        ${Number(levy.totalAmount).toLocaleString("en-AU", { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                      Paid
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
