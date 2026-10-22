import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getLevyById } from "@/lib/queries/levies";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { LevyForm } from "../levy-form";
import { DeleteLevyButton } from "./delete-levy-button";
import { IssueLevyButton } from "./issue-levy-button";
import { MarkPaidButton } from "./mark-paid-button";
import { connection } from "next/server";

export default async function LevyDetailPage({
  params,
}: {
  params: Promise<{ id: string; levyId: string }>;
}) {
  await connection();
  const { id, levyId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  const levy = await getLevyById(levyId);
  if (!levy || levy.schemeId !== id) notFound();

  const totalAmount = Number(levy.totalAmount);
  const paidTotal = levy.items.reduce(
    (sum, item) => sum + Number(item.paidAmount),
    0,
  );
  const paidCount = levy.items.filter((i) => i.status === "PAID").length;
  const dueDate = new Date(String(levy.dueDate));
  const dueDateStr = dueDate.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const statusColour: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-700",
    ISSUED: "bg-blue-100 text-blue-700",
    PAID: "bg-green-100 text-green-700",
    OVERDUE: "bg-red-100 text-red-700",
  };

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={levy.title}
        description={`${levy.levyType === "ORDINARY" ? "Ordinary" : "Special"} levy · Due ${dueDateStr}`}
        backHref={`/adviser/schemes/${id}/finance`}
        backLabel="Financials"
      />

      {/* Status and stats */}
      <div className="flex items-center gap-3 mb-6">
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${statusColour[levy.status] ?? "bg-gray-100 text-gray-700"}`}
        >
          {levy.status}
        </span>
        {levy.status === "DRAFT" && (
          <IssueLevyButton schemeId={id} levyId={levyId} />
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <StatCard
          label="Total"
          value={`$${totalAmount.toLocaleString("en-AU", { minimumFractionDigits: 2 })}`}
          accent="bg-adviser"
        />
        <StatCard
          label="Collected"
          value={`$${paidTotal.toLocaleString("en-AU", { minimumFractionDigits: 2 })}`}
          accent="bg-turquoise"
        />
        <StatCard
          label="Outstanding"
          value={`$${(totalAmount - paidTotal).toLocaleString("en-AU", { minimumFractionDigits: 2 })}`}
          accent={totalAmount - paidTotal > 0 ? "bg-red-400" : "bg-green-400"}
        />
        <StatCard
          label="Paid"
          value={`${paidCount}/${levy.items.length}`}
          accent="bg-turquoise"
        />
      </div>

      {/* Levy items by lot */}
      <Card className="mb-6">
        <CardHeader
          title="Levy Items"
          description="Amount due per lot, based on entitlement shares."
        />
        {levy.items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th scope="col" className="pb-2 font-medium text-ink-muted">Lot</th>
                  <th scope="col" className="pb-2 font-medium text-ink-muted text-right">Amount</th>
                  <th scope="col" className="pb-2 font-medium text-ink-muted text-right">Paid</th>
                  <th scope="col" className="pb-2 font-medium text-ink-muted">Status</th>
                  <th scope="col" className="pb-2 font-medium text-ink-muted"></th>
                </tr>
              </thead>
              <tbody>
                {levy.items.map((item) => {
                  const itemAmount = Number(item.amount);
                  const itemPaid = Number(item.paidAmount);
                  return (
                    <tr
                      key={item.id}
                      className="border-b border-line last:border-0"
                    >
                      <td className="py-3 font-medium text-ink">
                        {item.lot.lotNumber}
                        {item.lot.unitNumber
                          ? ` (Unit ${item.lot.unitNumber})`
                          : ""}
                      </td>
                      <td className="py-3 text-right font-variant-numeric tabular-nums">
                        ${itemAmount.toLocaleString("en-AU", {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td className="py-3 text-right font-variant-numeric tabular-nums text-ink-muted">
                        ${itemPaid.toLocaleString("en-AU", {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td className="py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            item.status === "PAID"
                              ? "bg-green-100 text-green-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {item.status === "PAID" ? "Paid" : "Unpaid"}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        {item.status !== "PAID" && levy.status === "ISSUED" && (
                          <MarkPaidButton
                            schemeId={id}
                            levyId={levyId}
                            itemId={item.id}
                            amount={itemAmount}
                            lotNumber={item.lot.lotNumber}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-ink-muted">
            No line items. Create lots first, then recreate this levy.
          </p>
        )}
      </Card>

      {/* Edit form (only for drafts) */}
      {levy.status === "DRAFT" && (
        <div className="mb-6">
          <h2 className="font-heading font-semibold text-ink mb-4">
            Edit Levy Details
          </h2>
          <LevyForm
            mode="edit"
            schemeId={id}
            levyId={levyId}
            defaults={{
              title: levy.title,
              description: levy.description,
              totalAmount: String(levy.totalAmount),
              dueDate: dueDate.toISOString().split("T")[0],
              levyType: levy.levyType,
            }}
          />
        </div>
      )}

      {/* Danger zone */}
      <Card className="border-red-200">
        <CardHeader
          title="Danger Zone"
          description="Irreversible actions for this levy."
        />
        <DeleteLevyButton
          schemeId={id}
          levyId={levyId}
          levyTitle={levy.title}
        />
      </Card>
    </div>
  );
}
