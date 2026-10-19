import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { PageHeader } from "@/components/ui/page-header";
import { BankAccountForm } from "../bank-account-form";
import { connection } from "next/server";

export default async function NewBankAccountPage({
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

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="New Bank Account"
        backHref={`/adviser/schemes/${id}/finance/bank-accounts`}
        backLabel="Bank Accounts"
      />
      <BankAccountForm schemeId={id} />
    </div>
  );
}
