import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForCommittee } from "@/lib/queries/schemes";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { CommitteeDocumentUploadForm } from "./upload-form";

export default async function CommitteeDocumentUploadPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const schemes = await getSchemesForCommittee(profile.id);
  if (schemes.length === 0) notFound();

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Upload Document"
        description="Upload a document for your scheme."
        backHref="/committee/documents"
        backLabel="Documents"
      />

      <Card>
        <div className="p-6">
          <CommitteeDocumentUploadForm
            schemes={schemes.map((s) => ({ id: s.id, name: s.name }))}
          />
        </div>
      </Card>
    </div>
  );
}
