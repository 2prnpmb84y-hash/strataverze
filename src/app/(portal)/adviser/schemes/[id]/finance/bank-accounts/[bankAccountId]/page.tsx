import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getBankAccountById } from "@/lib/queries/bank-accounts";
import { PageHeader } from "@/components/ui/page-header";
import { BankAccountEditForm } from "./bank-account-edit-form";
import { connection } from "next/server";

export default async function EditBankAccountPage({
  params,
}: {
  params: Promise<{ id: string; bankAccountId: string }>;
}) {
  await connection();
  const { id, bankAccountId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  const bankAccount = await getBankAccountById(bankAccountId);
  if (!bankAccount || bankAccount.schemeId !== id) notFound();

  const defaultValues = {
    bankName: String(bankAccount.bankName ?? ""),
    accountName: String(bankAccount.accountName ?? ""),
    bsb: String(bankAccount.bsb ?? ""),
    accountNumber: String(bankAccount.accountNumber ?? ""),
    accountType: String(bankAccount.accountType ?? ""),
    isOperating: bankAccount.isOperating ?? false,
  };

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Edit Bank Account"
        backHref={`/adviser/schemes/${id}/finance/bank-accounts`}
        backLabel="Bank Accounts"
      />
      <BankAccountEditForm
        schemeId={id}
        bankAccountId={bankAccountId}
        defaultValues={defaultValues}
      />
    </div>
  );
}
