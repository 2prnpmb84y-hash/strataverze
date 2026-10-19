import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getAccountCodeById } from "@/lib/queries/account-codes";
import { getFundsForScheme } from "@/lib/queries/funds";
import { PageHeader } from "@/components/ui/page-header";
import { AccountCodeEditForm } from "./account-code-edit-form";
import { connection } from "next/server";

export default async function EditAccountCodePage({
  params,
}: {
  params: Promise<{ id: string; accountId: string }>;
}) {
  await connection();
  const { id, accountId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  const account = await getAccountCodeById(accountId);
  if (!account) notFound();

  const funds = await getFundsForScheme(id);

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Edit Account Code"
        backHref={`/adviser/schemes/${id}/finance/accounts`}
        backLabel="Chart of Accounts"
      />
      <AccountCodeEditForm
        schemeId={id}
        accountCodeId={accountId}
        funds={funds.map((f) => ({ id: String(f.id), name: String(f.name) }))}
        defaultValues={{
          code: String(account.code),
          name: String(account.name),
          accountType: String(account.accountType),
          accountSubType: account.accountSubType
            ? String(account.accountSubType)
            : "",
          fundId: account.fundId ? String(account.fundId) : "",
          gstApplicable: account.gstApplicable ?? false,
          description: account.description
            ? String(account.description)
            : "",
          isSystemAccount: account.isSystemAccount ?? false,
        }}
      />
    </div>
  );
}
