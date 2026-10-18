import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getFundById } from "@/lib/queries/funds";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { FundForm } from "../fund-form";
import { DeleteFundButton } from "./delete-button";
import { connection } from "next/server";

const fundTypeLabels: Record<string, string> = {
  ADMIN: "Administrative Fund",
  SINKING: "Capital Works Fund",
  RESERVE: "Reserve Fund",
};

export default async function FundDetailPage({
  params,
}: {
  params: Promise<{ id: string; fundId: string }>;
}) {
  await connection();
  const { id, fundId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  const fund = await getFundById(fundId);
  if (!fund || fund.schemeId !== id) notFound();

  const createdDate = new Date(String(fund.createdAt));
  const balance = Number(fund.balance);

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={fund.name}
        description={`${fundTypeLabels[fund.fundType] ?? fund.fundType} · Created ${createdDate.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`}
        backHref={`/adviser/schemes/${id}`}
        backLabel="Scheme"
      />

      {/* Fund details */}
      <Card className="mb-6">
        <CardHeader title="Fund Details" />
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted px-4 py-3">
            <p className="text-sm text-ink-muted">Fund Type</p>
            <p className="text-sm font-medium text-ink">
              {fundTypeLabels[fund.fundType] ?? fund.fundType}
            </p>
          </div>
          <div className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted px-4 py-3">
            <p className="text-sm text-ink-muted">Current Balance</p>
            <p className="text-sm font-medium text-ink font-variant-numeric tabular-nums">
              {balance.toLocaleString("en-AU", {
                style: "currency",
                currency: "AUD",
              })}
            </p>
          </div>
        </div>
      </Card>

      {/* Edit form */}
      <div className="mb-6">
        <h2 className="font-heading font-semibold text-ink mb-4">
          Edit Fund
        </h2>
        <FundForm
          schemeId={id}
          mode="edit"
          fundId={fundId}
          defaults={{
            name: fund.name,
            fundType: fund.fundType,
            balance,
          }}
        />
      </div>

      {/* Danger zone */}
      <Card className="border-red-200">
        <CardHeader
          title="Danger Zone"
          description="Irreversible actions for this fund."
        />
        <DeleteFundButton
          schemeId={id}
          fundId={fundId}
          fundName={fund.name}
        />
      </Card>
    </div>
  );
}
