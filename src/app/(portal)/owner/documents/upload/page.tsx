import { requireCommitteeAccess } from "@/lib/queries/committee-access";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { DocumentUploadForm } from "./upload-form";

export default async function OwnerDocumentUploadPage() {
  const access = await requireCommitteeAccess();

  if (!access) {
    return (
      <div className="max-w-2xl">
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
    <div className="max-w-2xl">
      <PageHeader
        title="Upload Document"
        description="Upload a document for your scheme."
        backHref="/owner/documents"
        backLabel="Documents"
      />

      <Card>
        <div className="p-6">
          <DocumentUploadForm
            schemes={access.schemes.map((s) => ({ id: s.id, name: s.name }))}
          />
        </div>
      </Card>
    </div>
  );
}
