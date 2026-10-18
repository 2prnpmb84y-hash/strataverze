import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getBankAccountsForScheme } from "@/lib/queries/bank-accounts";
import { BankImportForm } from "./bank-import-form";
import { connection } from "next/server";

export default async function BankImportPage({
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

  const bankAccounts = await getBankAccountsForScheme(id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Import Bank Transactions
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Upload a CSV or OFX file from your bank to import transactions for
          reconciliation.
        </p>
      </div>

      <BankImportForm
        schemeId={id}
        bankAccounts={bankAccounts.map((ba) => ({
          id: ba.id,
          accountName: String(ba.accountName),
          bsb: String(ba.bsb),
          accountNumber: String(ba.accountNumber),
        }))}
      />
    </div>
  );
}
