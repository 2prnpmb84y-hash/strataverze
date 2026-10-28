import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getFundsForScheme } from "@/lib/queries/funds";
import { getAccountCodesForScheme } from "@/lib/queries/account-codes";
import { PageHeader } from "@/components/ui/page-header";
import { JournalEntryForm } from "../journal-entry-form";
import { connection } from "next/server";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";

export default async function NewJournalEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  const [funds, accountCodes] = await Promise.all([
    getFundsForScheme(id),
    getAccountCodesForScheme(id),
  ]);

  const accountCodeOptions = accountCodes.map((a) => ({
    value: String(a.id),
    label: `${String(a.code)} — ${String(a.name)}`,
  }));

  const fundOptions = funds.map((f) => ({
    value: String(f.id),
    label: String(f.name),
  }));

  return (
    <div>
      <PageHeader
        title="New Journal Entry"
        description="Create a double-entry journal transaction"
        backHref={`/adviser/schemes/${id}/finance/journal`}
        backLabel="Journal"
      />
      <JournalEntryForm
        schemeId={id}
        accountCodes={accountCodeOptions}
        funds={fundOptions}
        levy={rulesForState(scheme.state).rules.TERMINOLOGY.levy}
      />
    </div>
  );
}
