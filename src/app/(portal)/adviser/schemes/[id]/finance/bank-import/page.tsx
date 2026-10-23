import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getBankAccountsForScheme } from "@/lib/queries/bank-accounts";
import { BankImportForm } from "./bank-import-form";
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import { toCents } from "@/lib/billing/money";
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
  // The latest imported balance per account, to check a new file starts where the last one ended.
  const lastBalances: Record<string, { cents: number; date: string } | null> = {};
  for (const ba of bankAccounts) {
    const last = await db.orm.public.BankTransaction
      .where((t) => and(t.bankAccountId.eq(ba.id), t.balance.isNotNull(), t.isDuplicate.eq(false)))
      .orderBy([(t) => t.transactionDate.desc(), (t) => t.importedAt.desc()])
      .first();
    lastBalances[ba.id] = last ? { cents: toCents(String(last.balance)), date: String(last.transactionDate).slice(0, 10) } : null;
  }

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
        savedMappings={Object.fromEntries(bankAccounts.map((ba) => [ba.id, ba.csvMapping ?? null]))}
        lastBalances={lastBalances}
      />
    </div>
  );
}
