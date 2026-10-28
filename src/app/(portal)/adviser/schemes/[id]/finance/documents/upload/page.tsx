import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemeById } from "@/lib/queries/schemes";
import { Card, CardHeader } from "@/components/ui/card";
import { FinancialDocumentUploadForm } from "../upload-form";
import { connection } from "next/server";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";

export default async function UploadFinancialDocumentPage({
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
    <div className="space-y-6">
      <h2 className="text-xl font-semibold tracking-tight">
        Upload Financial Document
      </h2>

      <Card>
        <CardHeader
          title="Document Details"
          description="Upload a receipt, invoice, bank statement, or other financial document."
        />
        <div className="px-6 pb-6">
          <FinancialDocumentUploadForm schemeId={id} levy={rulesForState(scheme.state).rules.TERMINOLOGY.levy} />
        </div>
      </Card>
    </div>
  );
}
