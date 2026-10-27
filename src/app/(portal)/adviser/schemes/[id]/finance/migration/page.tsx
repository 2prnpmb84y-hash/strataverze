import { notFound } from "next/navigation";
import { requireSchemeMembership } from "@/lib/auth/require-membership";
import { getSchemeById } from "@/lib/queries/schemes";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { MigrationClient } from "./migration-client";
import { connection } from "next/server";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";
import { separateEntitlement } from "@/lib/jurisdiction/building-data";

export default async function MigrationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  await requireSchemeMembership(id, ["ADVISER"]);

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();
  // A second lot entitlement the building's lots hold (Queensland's interest schedule, stage 2, step 10).
  const separate = separateEntitlement(rulesForState(scheme.state).rules);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data Migration"
        backHref={`/adviser/schemes/${id}/finance`}
        backLabel="Finance"
        description="Bring lots and the chart of accounts across first. Then run the cutover for opening balances, arrears, unpaid invoices, owner credits and bank balances."
        action={<Button href={`/adviser/schemes/${id}/finance/migration/cutover`}>Cutover</Button>}
      />

      <MigrationClient
        schemeId={id}
        schemeName={scheme.name}
        separateEntitlement={separate?.field ? { field: separate.field, label: separate.label } : null}
      />
    </div>
  );
}
