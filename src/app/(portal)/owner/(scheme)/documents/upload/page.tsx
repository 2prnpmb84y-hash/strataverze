import { requireCommitteeAccess } from "@/lib/queries/committee-access";
import { getVerifiedSelectedSchemeId } from "@/lib/owner/selected-scheme";
import { scopeToSelectedScheme } from "@/lib/owner/scheme-scope";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { DocumentUploadForm } from "./upload-form";
import { connection } from "next/server";

export default async function OwnerDocumentUploadPage() {
  await connection();
  const access = await requireCommitteeAccess();

  // Committee schemes only, narrowed to the (verified) selected scheme.
  const schemes = access
    ? scopeToSelectedScheme(access.schemes, await getVerifiedSelectedSchemeId())
    : [];

  if (!access || schemes.length === 0) {
    return (
      <div className="max-w-3xl">
        <PageHeader
          title="Upload Document"
          description="You must be a committee member to upload documents."
          backHref="/owner/documents"
          backLabel="Documents"
        />
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Upload Document"
        description="Upload a document for your scheme."
        backHref="/owner/documents"
        backLabel="Documents"
      />

      <Card>
        <div className="p-6">
          <DocumentUploadForm
            schemes={schemes.map((s) => ({ id: s.id, name: s.name }))}
          />
        </div>
      </Card>
    </div>
  );
}
